const sqlite = require('sqlite3');
const fetch = require('node-fetch');

const venueShowSearch = require('../venue-show-finder');
const showFinder = require('../show-finder');
const dbHelpers = require('../helpers/db-helpers');
const helpers = require('../helpers/helpers');

async function buildPlaylist(db, userObj, shows) {
    if (userObj === null || userObj === undefined || shows === null || shows === undefined) {
        console.log('Must provide userObj and shows list to build spotify playlist');
        return -1;
    }

    let spotifyToken = userObj.SpotifyAccessToken;

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

    console.log(`Refreshing token. Value before: ${spotifyToken.slice(0, 10)}...`);
    spotifyToken = await refreshSpotifyToken(db, userObj);
    console.log(`Value after: ${spotifyToken.slice(0, 10)}...`);

    try {
        let artistObjs = await getArtistObjs(db, artists, userObj, spotifyToken);
        let trackUris = await getTrackUris(artistObjs, spotifyToken);
        let playlistObj = await getOrCreatePlaylist(userObj, spotifyToken);
        await addTracksToPlaylist(playlistObj, trackUris, spotifyToken);
    } catch (e) {
        console.log(e.message);
        return -1;
    }
}

async function getArtistObjs(db, artists, userObj, spotifyToken) {
    let artistPromises = [];
    for (let artist of artists) {
        let artistPromise = new Promise(async (resolve, reject) => {
            let getOptions = baseSpotifyHeaders('GET', spotifyToken);
            let artistResponse = await helpers.instrumentCall(`https://api.spotify.com/v1/search?q="${encodeURIComponent(artist)}"&type=artist`, getOptions, false);

            if (artistResponse.response.artists && artistResponse.response.artists.items.length > 0) {
                // Take the first one, it's almost always correct
                resolve(artistResponse.response.artists.items[0]);
            } else {
                console.log(`No artists found for search term '${artist}'`);
                resolve(null);
            }
        });

        artistPromises.push(artistPromise);
    }

    let artistObjs = await Promise.all(artistPromises);
    artistObjs = artistObjs.filter(x => x !== null);

    console.log(`Received ${artistObjs.length} artists`);
    return artistObjs;
}

async function getTrackUris(artistObjs, spotifyToken) {
    let trackPromises = [];
    for (let artistObj of artistObjs) {
        let getOptions = baseSpotifyHeaders('GET', spotifyToken);

        let trackPromise = new Promise(async (resolve, reject) => {
            let tracksResponse = await helpers.instrumentCall(`https://api.spotify.com/v1/artists/${artistObj.id}/top-tracks?country=US`, getOptions, false);

            if (tracksResponse.success === undefined || !tracksResponse.success) {
                console.log(`Error getting tracks for artist '${artistObj.name}'`);
                reject(tracksResponse.response);
            }

            resolve(tracksResponse.response.tracks.slice(0, 2).map(x => x.uri));
        });

        trackPromises.push(trackPromise);
    }

    let trackUris = await Promise.all(trackPromises);
    trackUris = trackUris.reduce((list, trackUriList) => {
        list = list.concat(trackUriList);
        return list;
    }, []);

    console.log(`Received ${trackUris.length} tracks`);
    return trackUris;
}

async function getOrCreatePlaylist(userObj, spotifyToken) {
    let getOptions = baseSpotifyHeaders('GET', spotifyToken);

    // Page through getting playlists 50 at a time
    let playlists = [];
    let url = 'https://api.spotify.com/v1/me/playlists?limit=50';
    let hasNext = false;
    do {
        let currentPlaylistsResponse = await helpers.instrumentCall(url, getOptions, false);
        if (currentPlaylistsResponse.success === undefined || !currentPlaylistsResponse.success) {
            console.log(`Error getting playlist for current user`);
            console.log(currentPlaylistsResponse.response);
            throw new Error(-1);
        }

        playlists = playlists.concat(currentPlaylistsResponse.response.items);
        url = currentPlaylistsResponse.response.next;
        hasNext = url !== null;
    } while (hasNext);

    let playlistObj = playlists.find(x => x.name === 'Show Finder' && x.owner.id === userObj.SpotifyUsername);
    if (playlistObj === undefined) {
        // They don't have their own showfinder playlist yet, create it
        let postOptions = baseSpotifyHeaders('POST', spotifyToken);
        postOptions.body = {
            name: 'Show Finder',
            public: false,
            description: 'helloaf'
        };

        console.log('Creating playlist since we didn\'t find it in their list of existing playlists');
        let createPlaylistResponse = await helpers.instrumentCall(`https://api.spotify.com/v1/users/${userObj.SpotifyUsername}/playlists`, postOptions, false);
        if (createPlaylistResponse === undefined || !createPlaylistResponse.success) {
            console.log(`Error creating playlist`);
            console.log(createPlaylistResponse.response);
            throw new Error(-1);
        }

        playlistObj = createPlaylistResponse.response;
    }

    return playlistObj;
}

async function addTracksToPlaylist(playlistObj, trackUris, spotifyToken) {
    // PUT overwrites all other tracks in the playlist
    let putOptions = baseSpotifyHeaders('PUT', spotifyToken);

    for (let i = 0; i <= Math.floor(trackUris.length / 100); i++) {
        putOptions.body = {
            "uris": trackUris.slice(i * 100, i * 100 + 99)
        };

        // This response gives us an object with a single 'snapshot_id' element, who cares
        let addTracksResponse = await helpers.instrumentCall(`https://api.spotify.com/v1/playlists/${playlistObj.id}/tracks`, putOptions, false);
        if (addTracksResponse.success === undefined || !addTracksResponse.success) {
            console.log('Error adding tracks to playlist');
            console.log(addTracksResponse.response);
            throw new Error(-1);
        }

        console.log(`Added a page of tracks to playlist: ${i * 100} to ${i * 100 + 99}`);
    }
}

async function refreshSpotifyToken(db, userObj) {
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

function baseSpotifyHeaders(method, spotifyToken) {
    return {
        method: method,
        headers: {
            'Content-type': 'application/json',
            'Authorization': 'Bearer ' + spotifyToken
        }
    }
}

module.exports = { buildPlaylist };