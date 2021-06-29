import * as sqlite3 from "sqlite3";

import * as constants from "./constants";
import * as helpers   from "./helpers";

export async function getPlaylists(spotifyToken, spotifyUserId, userUid, db: sqlite3.Database) {
    console.log("Getting playlists...");
    let {success, response} =
        await helpers.autoRetrySpotifyCall(spotifyToken,
                                           `https://api.spotify.com/v1/users/${spotifyUserId}/playlists`,
                                           "GET",
                                           userUid,
                                           db,
                                           false);
    if (!success) {
        return response;
    }

    let playlistNamesById = {};
    response.items.forEach(x => (playlistNamesById[x.id] = x.name));

    // Shove a fake playlist in there for the users liked songs
    playlistNamesById[constants.user_library_playlist_id.toString()] = "All Liked Songs";

    return playlistNamesById;
}

export async function getArtistsFromPlaylist(spotifyToken, playlistId, userUid, db: sqlite3.Database) {
    let page: any = {};
    let artists   = [];
    console.log("Getting artists...");
    do {
        let {success, response} =
            await helpers.autoRetrySpotifyCall(spotifyToken,
                                               page.next || `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
                                               "GET",
                                               userUid,
                                               db,
                                               false);
        if (!success) {
            return response;
        }

        page = response;

        // Amalgamates a list of lists, where each top-level list is one endpoint page
        artists.push(page.items.map(x => x.track)
                         .map(x => x.artists)
                         .map(x => x[0])                          // each artist is a list of a single object (ew)
                         .map(x => encodeURIComponent(x.name)));  // encode to URL-safe characters
    } while (page.next != null);

    // Filter out duplicates
    let hasSeen = {};
    return artists.reduce((x, y) => x.concat(y)).filter(x => (hasSeen.hasOwnProperty(x) ? false : (hasSeen[x] = true)));
}

export async function getArtists(artists, userObj, spotifyToken, userUid, db: sqlite3.Database) {
    let artistPromises = [];
    for (let artist of artists) {
        let artistPromise = new Promise(async (resolve, reject) => {
            let artistResponse = await helpers.autoRetrySpotifyCall(
                spotifyToken,
                `https://api.spotify.com/v1/search?q="${encodeURIComponent(artist)}"&type=artist`,
                "GET",
                userUid,
                db,
                false);

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
    artistObjs     = artistObjs.filter(x => x !== null);

    console.log(`Received ${artistObjs.length} artists`);
    return artistObjs;
}

export async function getLikedSongsArtists(spotifyToken, userUid, db: sqlite3.Database) {
    let page: any = {};
    let songs     = [];
    console.log("Getting all liked tracks to parse out artists from...");
    do {
        let {success, response} =
            await helpers.autoRetrySpotifyCall(spotifyToken,
                                               page.next || `https://api.spotify.com/v1/me/tracks`,
                                               "GET",
                                               userUid,
                                               db,
                                               false);
        if (!success) {
            return response;
        }

        page = response;

        // Amalgamates a list of lists, where each top-level list is one endpoint page
        songs.push(page.items.map(x => x.track)
                       .map(x => x.artists)
                       .map(x => x[0])                          // each artist is a list of a single object (ew)
                       .map(x => encodeURIComponent(x.name)));  // encode to URL-safe characters
    } while (page.next != null);

    // Filter out duplicates
    let hasSeen = {};
    return songs.reduce((x, y) => x.concat(y)).filter(x => (hasSeen.hasOwnProperty(x) ? false : (hasSeen[x] = true)));
}

export async function getTrackUris(songsPerArtist, artistObjs, spotifyToken, userUid, db: sqlite3.Database) {
    let trackPromises = [];
    for (let artistObj of artistObjs) {
        let trackPromise = new Promise(async (resolve, reject) => {
            let tracksResponse = await helpers.autoRetrySpotifyCall(
                spotifyToken,
                `https://api.spotify.com/v1/artists/${artistObj.id}/top-tracks?country=US`,
                "GET",
                userUid,
                db,
                false);

            if (tracksResponse.success === undefined || !tracksResponse.success) {
                console.log(`Error getting tracks for artist '${artistObj.name}'`);
                return reject(tracksResponse.success === undefined ? tracksResponse : tracksResponse.response);
            }

            resolve(tracksResponse.response.tracks.slice(0, songsPerArtist).map(x => x.uri));
        });

        trackPromises.push(trackPromise);
    }

    let trackUris = await Promise.all(trackPromises);
    trackUris     = trackUris.reduce((list, trackUriList) => {
        list = list.concat(trackUriList);
        return list;
    }, []);

    console.log(`Received ${trackUris.length} tracks`);
    return trackUris;
}

export async function getOrCreatePlaylist(userObj, spotifyToken, userUid, db: sqlite3.Database) {
    let getOptions = helpers.baseSpotifyHeaders("GET", spotifyToken);

    // Page through getting playlists 50 at a time
    let playlists = [];
    let url       = "https://api.spotify.com/v1/me/playlists?limit=50";
    let hasNext   = false;
    do {
        let currentPlaylistsResponse = await helpers.autoRetrySpotifyCall(spotifyToken, url, "GET", userUid, db, false);
        if (currentPlaylistsResponse.success === undefined || !currentPlaylistsResponse.success) {
            console.log(`Error getting playlist for current user`);
            console.log(currentPlaylistsResponse.response);
            throw new Error();
        }

        playlists = playlists.concat(currentPlaylistsResponse.response.items);
        url       = currentPlaylistsResponse.response.next;
        hasNext   = url !== null;
    } while (hasNext);

    let playlistObj = playlists.find(x => x.name === "Show Finder" && x.owner.id === userObj.SpotifyUsername);
    if (playlistObj === undefined) {
        // They don't have their own showfinder playlist yet, create it
        let postOptions  = helpers.baseSpotifyHeaders("POST", spotifyToken);
        postOptions.body = {name : "Show Finder", public : false, description : "helloaf"};

        console.log("Creating playlist since we didn't find it in their list of existing playlists");
        let       createPlaylistResponse =
            await helpers.instrumentCall(`https://api.spotify.com/v1/users/${userObj.SpotifyUsername}/playlists`,
                                         postOptions,
                                         false);
        if (createPlaylistResponse === undefined || !createPlaylistResponse.success) {
            console.log(`Error creating playlist`);
            console.log(createPlaylistResponse.response);
            throw new Error();
        }

        playlistObj = createPlaylistResponse.response;
    }

    return playlistObj;
}

export async function addTracksToPlaylist(playlistObj, trackUris, spotifyToken, userUid, db: sqlite3.Database) {
    // PUT overwrites all other tracks in the playlist
    let putOptions = helpers.baseSpotifyHeaders("PUT", spotifyToken);

    for (let i = 0; i <= Math.floor(trackUris.length / 100); i++) {
        putOptions.body = {uris : trackUris.slice(i * 100, i * 100 + 99)};

        // This response gives us an object with a single 'snapshot_id' element, who cares
        let       addTracksResponse =
            await helpers.instrumentCall(`https://api.spotify.com/v1/playlists/${playlistObj.id}/tracks`,
                                         putOptions,
                                         false);
        // await helpers.autoRetrySpotifyCall(spotifyToken,
        //                                    `https://api.spotify.com/v1/playlists/${playlistObj.id}/tracks`,
        //                                    "PUT",
        //                                    userUid,
        //                                    db,
        //                                    false);
        if (addTracksResponse.success === undefined || !addTracksResponse.success) {
            console.log("Error adding tracks to playlist");
            console.log(addTracksResponse.response);
            throw new Error();
        }

        console.log(`Added a page of tracks to playlist: ${i * 100} to ${i * 100 + 99}`);
    }
}
