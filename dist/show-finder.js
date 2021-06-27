var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var fs = require("fs");
var inquirer = require("inquirer");
var constants = require("./helpers/constants");
var helpers = require("./helpers/helpers");
var parsers = require("./helpers/response-parsers");
var foopee = require("./scripts/foopee-scrape");
function getArtists(spotifyToken, playlistId, userUid) {
    return __awaiter(this, void 0, void 0, function* () {
        let page = {};
        let artists = [];
        console.log("Getting artists...");
        do {
            let { success, response } = yield helpers.autoRetrySpotifyCall(spotifyToken, page.next || `https://api.spotify.com/v1/playlists/${playlistId}/tracks`, "GET", userUid, false);
            if (!success) {
                return response;
            }
            page = response;
            // Amalgamates a list of lists, where each top-level list is one endpoint page
            artists.push(page.items.map(x => x.track)
                .map(x => x.artists)
                .map(x => x[0]) // each artist is a list of a single object (ew)
                .map(x => encodeURIComponent(x.name))); // encode to URL-safe characters
        } while (page.next != null);
        // Filter out duplicates
        hasSeen = {};
        return artists.reduce((x, y) => x.concat(y)).filter(x => (hasSeen.hasOwnProperty(x) ? false : (hasSeen[x] = true)));
    });
}
function getLikedSongsArtists(spotifyToken, userUid) {
    return __awaiter(this, void 0, void 0, function* () {
        let page = {};
        let songs = [];
        console.log("Getting all liked tracks to parse out artists from...");
        do {
            let { success, response } = yield helpers.autoRetrySpotifyCall(spotifyToken, page.next || `https://api.spotify.com/v1/me/tracks`, "GET", userUid, false);
            if (!success) {
                return response;
            }
            page = response;
            // Amalgamates a list of lists, where each top-level list is one endpoint page
            songs.push(page.items.map(x => x.track)
                .map(x => x.artists)
                .map(x => x[0]) // each artist is a list of a single object (ew)
                .map(x => encodeURIComponent(x.name))); // encode to URL-safe characters
        } while (page.next != null);
        // Filter out duplicates
        hasSeen = {};
        return songs.reduce((x, y) => x.concat(y)).filter(x => (hasSeen.hasOwnProperty(x) ? false : (hasSeen[x] = true)));
    });
}
// artists param is list of { id, name }, location is lowercased basic city string
function getShows(artists, location) {
    return __awaiter(this, void 0, void 0, function* () {
        // Eventual return value (ish). Object with key of artist ID (int) and value of a list of { date: DateTime, show:
        // string }
        let showsByArtistId = {};
        let showServiceRequests = [];
        showServiceRequests.push(getBandsInTownShows(artists, location, showsByArtistId));
        showServiceRequests.push(getSongkickShows(artists, location, showsByArtistId));
        showServiceRequests.push(getSeatGeekShows(artists, location, showsByArtistId));
        if (location === "san francisco") {
            showServiceRequests.push(getFoopeeShows(artists, location, showsByArtistId));
        }
        yield Promise.all(showServiceRequests);
        helpers.dedupeShows(showsByArtistId);
        // Set each value of the artist ID key to just the list of shows from the previous list of show/date objects
        Object.keys(showsByArtistId).forEach(x => (showsByArtistId[x] = showsByArtistId[x].map(y => y.show)));
        return showsByArtistId;
    });
}
function getBandsInTownShows(artists, location, showsByArtistId) {
    return __awaiter(this, void 0, void 0, function* () {
        // List of { artistId, query } objects
        let bandsInTownQueries = [];
        artists.forEach(x => bandsInTownQueries.push(buildBandsInTownArtistQuery(x.id, x.name)));
        console.log("Getting BandsInTown artist shows...");
        let bandsInTownResponseObjects = yield Promise.all(bandsInTownQueries);
        let bandsInTownShowsFound = 0;
        for (let promiseObject of bandsInTownResponseObjects) {
            let responseObject = promiseObject.queryResponse;
            if (!responseObject.success) {
                console.log(`Failed query in BandsInTown requests:`);
                console.log(responseObject.response);
                continue;
            }
            let cleanedShowObjects = parsers.parseBandsInTownResponse(responseObject.response, location);
            if (cleanedShowObjects !== null && cleanedShowObjects !== undefined) {
                bandsInTownShowsFound++;
                if (showsByArtistId[promiseObject.artistId]) {
                    showsByArtistId[promiseObject.artistId] =
                        showsByArtistId[promiseObject.artistId].concat(cleanedShowObjects);
                }
                else {
                    showsByArtistId[promiseObject.artistId] = cleanedShowObjects;
                }
            }
        }
        console.log(`Added shows for ${bandsInTownShowsFound} artists from BandsInTown`);
    });
}
function getSongkickShows(artists, location, showsByArtistId) {
    return __awaiter(this, void 0, void 0, function* () {
        // Both are list of { artistId, query } objects
        let songkickArtistIdQueries = [];
        let songkickArtistQueries = [];
        // First get artist IDs from within songkick to be able to query artist directly
        artists.forEach(x => songkickArtistIdQueries.push(buildSongkickArtistIdQuery(x.id, x.name)));
        console.log("Getting Songkick artist IDs...");
        let songkickArtistIdResponseObjects = yield Promise.all(songkickArtistIdQueries);
        let songkickArtistObjects = parsers.parseSongkickArtistsResponse(songkickArtistIdResponseObjects);
        // Build and send queries for actual shows for each artist
        songkickArtistObjects.forEach(x => songkickArtistQueries.push(buildSongkickArtistQuery(x.artistId, x.songkickId)));
        console.log("Getting Songkick artist shows...");
        let songkickResponseObjects = yield Promise.all(songkickArtistQueries);
        let songkickShowsFound = 0;
        for (let promiseObject of songkickResponseObjects) {
            let responseObject = promiseObject.queryResponse;
            if (!responseObject.success) {
                console.log(`Failed query in Songkick artist show requests:`);
                console.log(responseObject.response);
                continue;
            }
            let cleanedShowObjects = parsers.parseSongkickResponse(responseObject.response, location);
            if (cleanedShowObjects !== null && cleanedShowObjects !== undefined) {
                songkickShowsFound++;
                if (showsByArtistId[promiseObject.artistId]) {
                    showsByArtistId[promiseObject.artistId] =
                        showsByArtistId[promiseObject.artistId].concat(cleanedShowObjects);
                }
                else {
                    showsByArtistId[promiseObject.artistId] = cleanedShowObjects;
                }
            }
        }
        console.log(`Added or appended shows for ${songkickShowsFound} artists from Songkick`);
    });
}
function getSeatGeekShows(artists, location, showsByArtistId) {
    return __awaiter(this, void 0, void 0, function* () {
        let seatGeekArtistIdQueries = [];
        let seatGeekArtistQueries = [];
        artists.forEach(x => seatGeekArtistIdQueries.push(buildSeatGeekArtistIdQuery(x.id, x.name)));
        console.log("Getting SeatGeek artist IDs...");
        let seatGeekArtistIdResponseObjects = yield Promise.all(seatGeekArtistIdQueries);
        let seatGeekArtistObjects = parsers.parseSeatGeekArtistsResponse(seatGeekArtistIdResponseObjects);
        console.log("Getting SeatGeek artist shows...");
        // TODO :: BT paginate
        seatGeekArtistObjects.forEach(x => seatGeekArtistQueries.push(buildSeatGeekArtistQuery(x.artistId, x.seatGeekId)));
        let seatGeekResponseObjects = yield Promise.all(seatGeekArtistQueries);
        let seatGeekShowsFound = 0;
        for (let promiseObject of seatGeekResponseObjects) {
            let responseObject = promiseObject.queryResponse;
            if (!responseObject.success) {
                console.log(`Failed query in SeatGeek artist show requests:`);
                console.log(responseObject.response);
                continue;
            }
            let cleanedShowObjects = parsers.parseSeatGeekResponse(responseObject.response, location);
            if (cleanedShowObjects !== null && cleanedShowObjects !== undefined) {
                seatGeekShowsFound++;
                if (showsByArtistId[promiseObject.artistId]) {
                    showsByArtistId[promiseObject.artistId] =
                        showsByArtistId[promiseObject.artistId].concat(cleanedShowObjects);
                }
                else {
                    showsByArtistId[promiseObject.artistId] = cleanedShowObjects;
                }
            }
        }
        console.log(`Added or appended shows for ${seatGeekShowsFound} artists from SeatGeek`);
    });
}
// Assuming location-checking for location of SF is done beforehand
function getFoopeeShows(artists, location, showsByArtistId) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Getting foopee artist shows...");
        let foopeeShows = yield foopee.getFoopeeShows(artists);
        for (foopeeObject of foopeeShows) {
            if (showsByArtistId[foopeeObject.id]) {
                showsByArtistId[foopeeObject.id] = showsByArtistId[foopeeObject.id].concat(foopeeObject.showObjects);
            }
            else {
                showsByArtistId[foopeeObject.id] = foopeeObject.showObjects;
            }
        }
        console.log(`Added or appended shows for ${Object.keys(foopeeShows).length} artists from Foopee`);
    });
}
/*
refactor these back again when we support individual service querying for the api

// Keeping to support legacy but all calls should be refactored to use the other
function getSongkickArtistIdsFromJsonOLD(responseList) {
    // Keep this returned object as a list of artist objects instead of just
    // an object with { id : artist } KVPs to retain ordering so we can index
    // into the initial 'artists' list when combining artists results across services
    let artistsObjects = [];
    for (responseIndex in responseList) {
        let responseBody = JSON.parse(responseList[responseIndex].body || responseList[responseIndex].query.body);
        let singleArtistList = responseBody.resultsPage.results.artist;
        if (singleArtistList === undefined) {
            continue;
        }
        // Each query for a single artist name will return a list of all artists fuzzy matched.
        // We're only going to pull the first one for now, since more often than not the related
        // artists don't apply (unfortunate in the case of The XX and getting Jamie xx back, etc. but eh)
        artistsObjects.push({ songkickId: singleArtistList[0].id, name: singleArtistList[0].displayName });
    }

    return artistsObjects;
}

async function getSongkickShows(artistList) {
    let songkickArtistIdQueries = [];
    let songkickArtistQueries = [];

    // First get artist IDs from within songkick to be able to query artist directly
    artistList.forEach(x => songkickArtistIdQueries.push(buildSongkickArtistIdQuery(x)));
    let songkickArtistIdResponseJson = await Promise.all(songkickArtistIdQueries);
    let songkickArtistObjects = getSongkickArtistIdsFromJsonOLD(songkickArtistIdResponseJson);

    // Build and send queries for actual shows for each artist
    songkickArtistObjects.forEach(x => songkickArtistQueries.push(buildSongkickArtistQuery(x.songkickId)));
    console.log('Getting Songkick artist shows...');
    songkickResponse = await Promise.all(songkickArtistQueries);

    let showsByArtistName = {};
    for (index in songkickArtistObjects) {
        showsByArtistName[songkickArtistObjects[index].name] = songkickResponse[index].body;
    }

    return prettifySongkickShows(showsByArtistName);
}

async function getBandsInTownShows(artistList) {
    let bandsInTownArtistQueries = [];
    artistList.forEach(x => bandsInTownArtistQueries.push(buildBandsInTownArtistQuery(x)));
    let bandsInTownResponses = await Promise.all(bandsInTownArtistQueries);

    let showsByArtistName = {};
    for (index in bandsInTownResponses) {
        // Can loop responses and index into artistList b/c we're guaranteed a response for each req,
        // even if body is an empty list (no shows) or `{warn=Not found}` (artist not found)
        showsByArtistName[decodeURI(artistList[index])] = bandsInTownResponses[index].body;
    }

    return prettifyBandsInTownShows(showsByArtistName);
}
*/
function buildBandsInTownArtistQuery(artistId, artist) {
    let getOptions = { method: "GET", headers: { "Content-type": "application/json" } };
    return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
        let response = yield helpers.instrumentCall(`https://rest.bandsintown.com/artists/${artist}/events?app_id=${constants.bandsInTownSecret}`, getOptions, false);
        resolve({ artistId: artistId, queryResponse: response });
    }));
}
function buildSongkickArtistIdQuery(artistId, artist) {
    let getOptions = { method: "GET", headers: { "Content-type": "application/json" } };
    return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
        let response = yield helpers.instrumentCall(`https://api.songkick.com/api/3.0/search/artists.json?apikey=${constants.songkickSecret}&query=${artist}`, getOptions, false);
        resolve({ artistId: artistId, queryResponse: response });
    }));
}
function buildSongkickArtistQuery(artistId, songkickArtistId) {
    let getOptions = { method: "GET", headers: { "Content-type": "application/json" } };
    return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
        let response = yield helpers.instrumentCall(`https://api.songkick.com/api/3.0/artists/${songkickArtistId}/calendar.json?apikey=${constants.songkickSecret}`, getOptions, false);
        resolve({ artistId: artistId, queryResponse: response });
    }));
}
function buildSeatGeekArtistIdQuery(artistId, artist) {
    let getOptions = {
        method: "GET",
        headers: { "Content-type": "application/json", Authorization: helpers.seatGeekAuth() }
    };
    return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
        let response = yield helpers.instrumentCall(`https://api.seatgeek.com/2/performers?q=${artist}`, getOptions, false);
        resolve({ artistId: artistId, queryResponse: response });
    }));
}
function buildSeatGeekArtistQuery(artistId, seatGeekArtistId) {
    let getOptions = {
        method: "GET",
        headers: { "Content-type": "application/json", Authorization: helpers.seatGeekAuth() }
    };
    return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
        let resultCount = 0;
        let page = 1;
        let total = 0;
        let perPage = 25;
        let response = {};
        let responseBody = {};
        let fullEventsList = [];
        // Normal pagination logic while building the fullEventsList list
        do {
            response = yield helpers.instrumentCall(`https://api.seatgeek.com/2/events?performers.id=${seatGeekArtistId}&per_page=${perPage}&page=${page++}`, getOptions, false);
            if (!response.success) {
                console.log("Failed paginated call to get seatgeek artist");
                console.log(response.response);
                continue;
            }
            responseBody = response.response;
            fullEventsList = fullEventsList.concat(responseBody.events);
            total = responseBody.meta.total;
        } while (perPage * page <= total);
        // This is where it gets hacky - our parser is conditioned to check the success field of a single response, and
        // then pull the events list out of its body. Here we rip open the final response from the last page request,
        // shove the full events list in there, and then stringify it all back up and act like nothing happened
        responseBody.events = fullEventsList;
        response.response = responseBody;
        resolve({ artistId: artistId, queryResponse: response });
    }));
}
module.exports = {
    getArtists: getArtists,
    getLikedSongsArtists: getLikedSongsArtists,
    // getSongkickShows: getSongkickShows,
    // getBandsInTownShows: getBandsInTownShows,
    getShows: getShows,
};
