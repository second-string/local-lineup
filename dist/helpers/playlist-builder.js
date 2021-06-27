var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const sqlite = require("sqlite3");
const fetch = require("node-fetch");
const venueShowSearch = require("../venue-show-finder");
const showFinder = require("../show-finder");
const dbHelpers = require("../helpers/db-helpers");
const helpers = require("../helpers/helpers");
function buildPlaylist(db, userObj, shows, songsPerArtist, includeOpeners) {
    return __awaiter(this, void 0, void 0, function* () {
        if (userObj === null || userObj === undefined || shows === null || shows === undefined) {
            console.log("Must provide userObj and shows list to build spotify playlist");
            return -1;
        }
        let spotifyToken = userObj.SpotifyAccessToken;
        let artists = [];
        for (let show of shows) {
            let addedAnArtist = false;
            for (let performer of show.performers) {
                if (includeOpeners) {
                    artists.push(performer.name);
                    addedAnArtist = true;
                }
                else if (show.title.toLowerCase().includes(performer.name.toLowerCase())) {
                    // If the show title contains the artist name, include them. We only take the first one because tons of
                    // the shows are listed as 'ArtistX with ArtistY', so checking each performer would include openers for
                    // most. From what I can tell the main act is always first in the performer list, but there's no other
                    // indication of who the main act is in the show object so this is all we got.
                    artists.push(performer.name);
                    addedAnArtist = true;
                    break;
                }
            }
            // If we've gone through every performer and none have matched the show title, stick the first one in anyway
            if (!addedAnArtist && show.performers.length > 0) {
                console.log(`Found no matching artists for show name '${show.title}', adding first performer '${show.performers[0]}' anyway`);
                artists.push(show.performers[0].name);
            }
        }
        console.log(`Refreshing token. Value before: ${spotifyToken.slice(0, 10)}...`);
        spotifyToken = yield refreshSpotifyToken(db, userObj);
        console.log(`Value after: ${spotifyToken.slice(0, 10)}...`);
        try {
            let artistObjs = yield getArtistObjs(db, artists, userObj, spotifyToken);
            let trackUris = yield getTrackUris(songsPerArtist, artistObjs, spotifyToken);
            let playlistObj = yield getOrCreatePlaylist(userObj, spotifyToken);
            yield addTracksToPlaylist(playlistObj, trackUris, spotifyToken);
        }
        catch (e) {
            console.log(e.message);
            return -1;
        }
    });
}
function getArtistObjs(db, artists, userObj, spotifyToken) {
    return __awaiter(this, void 0, void 0, function* () {
        let artistPromises = [];
        for (let artist of artists) {
            let artistPromise = new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                let getOptions = baseSpotifyHeaders("GET", spotifyToken);
                let artistResponse = yield helpers.instrumentCall(`https://api.spotify.com/v1/search?q="${encodeURIComponent(artist)}"&type=artist`, getOptions, false);
                if (artistResponse.response.artists && artistResponse.response.artists.items.length > 0) {
                    // Take the first one, it's almost always correct
                    resolve(artistResponse.response.artists.items[0]);
                }
                else {
                    console.log(`No artists found for search term '${artist}'`);
                    resolve(null);
                }
            }));
            artistPromises.push(artistPromise);
        }
        let artistObjs = yield Promise.all(artistPromises);
        artistObjs = artistObjs.filter(x => x !== null);
        console.log(`Received ${artistObjs.length} artists`);
        return artistObjs;
    });
}
function getTrackUris(songsPerArtist, artistObjs, spotifyToken) {
    return __awaiter(this, void 0, void 0, function* () {
        let trackPromises = [];
        for (let artistObj of artistObjs) {
            let getOptions = baseSpotifyHeaders("GET", spotifyToken);
            let trackPromise = new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                let tracksResponse = yield helpers.instrumentCall(`https://api.spotify.com/v1/artists/${artistObj.id}/top-tracks?country=US`, getOptions, false);
                if (tracksResponse.success === undefined || !tracksResponse.success) {
                    console.log(`Error getting tracks for artist '${artistObj.name}'`);
                    return reject(tracksResponse.success === undefined ? tracksResponse : tracksResponse.response);
                }
                resolve(tracksResponse.response.tracks.slice(0, songsPerArtist).map(x => x.uri));
            }));
            trackPromises.push(trackPromise);
        }
        let trackUris = yield Promise.all(trackPromises);
        trackUris = trackUris.reduce((list, trackUriList) => {
            list = list.concat(trackUriList);
            return list;
        }, []);
        console.log(`Received ${trackUris.length} tracks`);
        return trackUris;
    });
}
function getOrCreatePlaylist(userObj, spotifyToken) {
    return __awaiter(this, void 0, void 0, function* () {
        let getOptions = baseSpotifyHeaders("GET", spotifyToken);
        // Page through getting playlists 50 at a time
        let playlists = [];
        let url = "https://api.spotify.com/v1/me/playlists?limit=50";
        let hasNext = false;
        do {
            let currentPlaylistsResponse = yield helpers.instrumentCall(url, getOptions, false);
            if (currentPlaylistsResponse.success === undefined || !currentPlaylistsResponse.success) {
                console.log(`Error getting playlist for current user`);
                console.log(currentPlaylistsResponse.response);
                throw new Error(-1);
            }
            playlists = playlists.concat(currentPlaylistsResponse.response.items);
            url = currentPlaylistsResponse.response.next;
            hasNext = url !== null;
        } while (hasNext);
        let playlistObj = playlists.find(x => x.name === "Show Finder" && x.owner.id === userObj.SpotifyUsername);
        if (playlistObj === undefined) {
            // They don't have their own showfinder playlist yet, create it
            let postOptions = baseSpotifyHeaders("POST", spotifyToken);
            postOptions.body = { name: "Show Finder", public: false, description: "helloaf" };
            console.log("Creating playlist since we didn't find it in their list of existing playlists");
            let createPlaylistResponse = yield helpers.instrumentCall(`https://api.spotify.com/v1/users/${userObj.SpotifyUsername}/playlists`, postOptions, false);
            if (createPlaylistResponse === undefined || !createPlaylistResponse.success) {
                console.log(`Error creating playlist`);
                console.log(createPlaylistResponse.response);
                throw new Error(-1);
            }
            playlistObj = createPlaylistResponse.response;
        }
        return playlistObj;
    });
}
function addTracksToPlaylist(playlistObj, trackUris, spotifyToken) {
    return __awaiter(this, void 0, void 0, function* () {
        // PUT overwrites all other tracks in the playlist
        let putOptions = baseSpotifyHeaders("PUT", spotifyToken);
        for (let i = 0; i <= Math.floor(trackUris.length / 100); i++) {
            putOptions.body = { uris: trackUris.slice(i * 100, i * 100 + 99) };
            // This response gives us an object with a single 'snapshot_id' element, who cares
            let addTracksResponse = yield helpers.instrumentCall(`https://api.spotify.com/v1/playlists/${playlistObj.id}/tracks`, putOptions, false);
            if (addTracksResponse.success === undefined || !addTracksResponse.success) {
                console.log("Error adding tracks to playlist");
                console.log(addTracksResponse.response);
                throw new Error(-1);
            }
            console.log(`Added a page of tracks to playlist: ${i * 100} to ${i * 100 + 99}`);
        }
    });
}
function refreshSpotifyToken(db, userObj) {
    return __awaiter(this, void 0, void 0, function* () {
        let postOptions = {
            method: "POST",
            headers: { "Content-type": "application/x-www-form-urlencoded", Authorization: showFinder.spotifyAuth() },
            body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(userObj.SpotifyRefreshToken)}`
        };
        let responseJson = yield fetch("https://accounts.spotify.com/api/token", postOptions);
        let response = yield responseJson.json();
        yield db.runAsync("UPDATE Users SET SpotifyAccessToken=? WHERE Email=?", [response.access_token, userObj.Email]);
        return response.access_token;
    });
}
function baseSpotifyHeaders(method, spotifyToken) {
    return { method: method, headers: { "Content-type": "application/json", Authorization: "Bearer " + spotifyToken } };
}
module.exports = { buildPlaylist };
