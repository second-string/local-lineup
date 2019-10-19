const sqlite = require('sqlite3');
const fetch = require('node-fetch');
const venueShowSearch = require('./venue-show-finder');
const showFinder = require('./show-finder');
const dbHelpers = require('./db-helpers');
// const constants = require('./constants');
const helpers = require('./helpers');

// var spotifyAuth = () => 'Basic ' + Buffer.from(`${constants.clientId}:${constants.clientSecret}`).toString('base64');
    const db = dbHelpers.openDb(process.env.DEPLOY_STAGE === 'PROD' ? '/home/pi/Show-Finder/USER_VENUES.db' : 'USER_VENUES.db');

async function buildPlaylist(email) {
    if (email === null || email === undefined) {
        console.log('Must provide email to retrieve selected venues and send upcoming shows');
        return -1;
    }

    // This is copy+pasted verbatim from show-emailer.js. The show-getting logic needs to be combined
    // within the main, calling function and then this and sendShowsEmail get email + list of shows
    const tableName = 'VenueLists';
    const venueColumn = 'VenueIds';
    let sql = `SELECT ${venueColumn} FROM ${tableName} WHERE Email=?;`;
    let venueIdObject = await db.getAsync(sql, [email]);
    let venueIds = venueIdObject.VenueIds.split(',');

    let userObj = await db.getAsync('SELECT * FROM Users WHERE Email=?', [email]);
    let spotifyToken = userObj.SpotifyAccessToken;

    let venues = {
        'seatgeek': venueIds.reduce((obj, item) => {
            obj[parseInt(item)] = null;
            return obj;
        }, {})
    };

    let services = await venueShowSearch.getShowsForVenues(venues);
    if (services === undefined || services.status >= 300) {
        console.log(`Call to get shows for selected venues failed with status ${services.status}`);
    }

    // This function gives us a showsByDate dict (for use in the emailer) so we flatten it into a shows array
    // TODO :: use the code in show-emailer to filter this by only upcoming shows for the week range
    let shows = Object.keys(services.seatgeek).flatMap(x => services.seatgeek[x]);
    let artists = [];
    for (let show of shows) {
        // If the show title contains the artist name, include them. This might result in some openers being included,
        // like for shows with the title 'ArtistX with ArtistY' but oh whale. We don't want to include all performers
        // since that will clutter the playlist with a bunch of openers (which could be an option to include in the future)
        for (let performer of show.performers) {
            if (show.title.includes(performer.name)) {
                artists.push(performer.name);
            }
        }
    }

    // Search each artist with the spotify api to get their ID
    let artistObjs = [];
    for (let artist of artists) {
        let getOptions = {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + spotifyToken
            }
        };

        let responseJson = await fetch(`https://api.spotify.com/v1/search?q="${encodeURIComponent(artist)}"&type=artist`, getOptions, false);
        let response = await responseJson.json();
        if (response.error) {
            console.log(`Refreshing token. Value before: ${spotifyToken}`);

            spotifyToken = await refreshSpotifyToken(userObj);
            console.log(`Value after: ${spotifyToken}`);

            getOptions = {
            method: 'GET',
            headers: {
                    'Authorization': 'Bearer ' + spotifyToken
                }
            };

            // Wrap artist name in quotes to force exact matching of order of terms (not exact on terms themselves though)
            // Also manuall fetch instead of using instrumentCall so we can handle need to refresh token
            responseJson = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(`"${artist}"`)}&type=artist`, getOptions, false);
            response = await responseJson.json();

            if (response.error) {
                throw new Error(response.error);
            }
        }

        // Take the first one, it's almost always correct
        // let artist = response.artists.items[0];
        if (response.artists.items.length > 0) {
            artistObjs.push(response.artists.items[0]);
        } else {
            console.log(`No artists found for search term '${artist}'`);
        }
        // TODO :: parallelize each artist call, then parallelize each artist songs call
    }

    console.log(`Saved ${artistObjs.length} artists`);

    let trackUris = [];
    let x = true;
    console.log(`Getting top tracks for ${artistObjs.length} artists`);
    for (let artistObj of artistObjs) {
        // Request artist songs
        let getOptions = {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + spotifyToken
            }
        };

        response = await helpers.instrumentCall(`https://api.spotify.com/v1/artists/${artistObj.id}/top-tracks?country=US`, getOptions, false);

        if (response.success === undefined || !response.success) {
            console.log(`Error getting tracks for artist '${artistObj.name}'`);
            throw new Error(response);
        }

        trackUris = trackUris.concat(response.response.tracks.slice(0, 2).map(x => x.uri));
    }

    let getOptions = {
        method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + spotifyToken
        }
    };

// TODO :: this only gets 50 playlist, we need to page response to check them all if > 50
    let currentPlaylistsResponse = await helpers.instrumentCall('https://api.spotify.com/v1/me/playlists', getOptions, false);
    if (currentPlaylistsResponse.success === undefined || !currentPlaylistsResponse.success) {
            console.log(`Error getting playlist for current user`);
            throw new Error(response);
    }

// TODO :: we need to check to make sure we only find showfinder playlist they own (<playlistobj>.owner.id    )
    let playlistObj = currentPlaylistsResponse.response.items.find(x => x.name === 'Show Finder');
    if (playlistObj === undefined) {
        // They don't have a showfinder playlist yet, create it
        let postOptions = {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + spotifyToken,
                'Content-type': 'application/json'
            },
            body: {
                name: 'Show Finder',
                public: false,
                description: 'helloaf'
            }
        };

        console.log('Creating playlist since we didn\'t find it in their list of existing playlists');
        let createPlaylistResponse = await helpers.instrumentCall(`https://api.spotify.com/v1/users/${userObj.SpotifyUsername}/playlists`, postOptions, false);
        if (createPlaylistResponse === undefined || !createPlaylistResponse.success) {
            console.log(`Error creating playlist`);
            throw new Error(createPlaylistResponse.response);
        }

        playlistObj = createPlaylistResponse.response;
    }

/*
    // If it has tracks already, yeet em
    if (playlistObj.tracks.items.length > 0) {
        console.log('Deleting all tracks from playlist first');

        let deleteOptions = {
            method: 'DELETE',
            headers: {
                'Content-type': 'application/json',
                'Authorization': 'Bearer ' + spotifyToken
            },
            data: {
                "tracks": playlistObj.tracks.items.map(x => ({
                    "uri": x.uri
                }))
            }
        };

        let deleteTracksResponse = await helpers.instrumentCall(`https://api.spotify.com/v1/playlists/${playlistObj.id}/tracks`, deleteOptions);
        if (deleteTracksResponse.success === undefined || !deleteTracksResponse.success) {
            console.log('Error deleting all tracks from playlist');
            throw new Error(deleteTracksResponse.response);
        }

        console.log(deleteTracksResponse);
        // console.log(`Sucessfully deleted ${deleteTracksResponse.response.tracks} tracks`);
    }
*/

    // Note that this is a different format for the URIs list than the DELETE call. This is a single "uris" key with a list of the URIs,
    // while the DELETE one is a "tracks" key with a value of a list of { "uri": uriValue }  objects.
    // Disregard that ^, PUTting overwrites all tracks in playlist
    let putOptions = {
        method: 'PUT',
        headers: {
            'Authorization': 'Bearer ' + spotifyToken,
            'Content-type': 'application/json'
        },
        body: {
            "uris": trackUris.slice(0, 100)
        }
    };

    console.log(`Adding ${trackUris.length} tracks to playlist`);

    // This response gives us an object with a single 'snapshot_id' element, who cares
    let addTracksResponse = await helpers.instrumentCall(`https://api.spotify.com/v1/playlists/${playlistObj.id}/tracks`, putOptions, false);
    if (addTracksResponse.success === undefined || !addTracksResponse.success) {
        console.log('Error adding tracks to playlist');
        throw new Error(addTracksResponse.response);
    }
}

async function refreshSpotifyToken(userObj) {
    let postOptions = {
        method: 'POST',
        headers: {
            'Content-type': 'application/x-www-form-urlencoded',
            'Authorization': showFinder.spotifyAuth()
        },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(userObj.SpotifyRefreshToken)}`
    };

    let responseJson = await fetch('https://accounts.spotify.com/api/token', postOptions);
    let response = await responseJson.json();

    await db.runAsync('UPDATE Users SET SpotifyAccessToken=? WHERE Email=?', [response.access_token, userObj.Email]);
    return response.access_token;
}

module.exports = { buildPlaylist };