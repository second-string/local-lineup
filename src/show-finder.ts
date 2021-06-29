import fs from "fs";

import * as constants from "./helpers/constants";
import * as helpers   from "./helpers/helpers";
import * as parsers   from "./helpers/response-parsers";
import * as foopee    from "./scripts/foopee-scrape";

export async function getPlaylists(spotifyToken, userUid) {
    console.log("Getting playlists...");
    let {success, response} =
        await helpers.autoRetrySpotifyCall(spotifyToken,
                                           `https://api.spotify.com/v1/users/${userUid}/playlists`,
                                           "GET",
                                           userUid,
                                           null,
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

export async function getArtists(spotifyToken, playlistId, userUid) {
    let page: any = {};
    let artists   = [];
    console.log("Getting artists...");
    do {
        let {success, response} =
            await helpers.autoRetrySpotifyCall(spotifyToken,
                                               page.next || `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
                                               "GET",
                                               userUid,
                                               null,
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

export async function getLikedSongsArtists(spotifyToken, userUid) {
    let page: any = {};
    let songs     = [];
    console.log("Getting all liked tracks to parse out artists from...");
    do {
        let {success, response} =
            await helpers.autoRetrySpotifyCall(spotifyToken,
                                               page.next || `https://api.spotify.com/v1/me/tracks`,
                                               "GET",
                                               userUid,
                                               null,
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

// artists param is list of { id, name }, location is lowercased basic city string
export async function getAllShows(artists, location) {
    // Eventual return value (ish). Object with key of artist ID (int) and value of a list of { date: DateTime, show:
    // string }
    let showsByArtistId     = {};
    let showServiceRequests = [];
    showServiceRequests.push(getBandsInTownShows(artists, location, showsByArtistId));
    showServiceRequests.push(getSongkickShows(artists, location, showsByArtistId));
    showServiceRequests.push(getSeatGeekShows(artists, location, showsByArtistId));

    if (location === "san francisco") {
        showServiceRequests.push(getFoopeeShows(artists, location, showsByArtistId));
    }

    await Promise.all(showServiceRequests);
    helpers.dedupeShows(showsByArtistId);

    // Set each value of the artist ID key to just the list of shows from the previous list of show/date objects
    Object.keys(showsByArtistId).forEach(x => (showsByArtistId[x] = showsByArtistId[x].map(y => y.show)));

    return showsByArtistId;
}

async function getBandsInTownShows(artists, location, showsByArtistId) {
    // List of { artistId, query } objects
    let bandsInTownQueries = [];
    artists.forEach(x => bandsInTownQueries.push(buildBandsInTownArtistQuery(x.id, x.name)));
    console.log("Getting BandsInTown artist shows...");

    let bandsInTownResponseObjects                               = await Promise.all(bandsInTownQueries);
    let                                    bandsInTownShowsFound = 0;
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
            } else {
                showsByArtistId[promiseObject.artistId] = cleanedShowObjects;
            }
        }
    }

    console.log(`Added shows for ${bandsInTownShowsFound} artists from BandsInTown`);
}

async function getSongkickShows(artists, location, showsByArtistId) {
    // Both are list of { artistId, query } objects
    let songkickArtistIdQueries = [];
    let songkickArtistQueries   = [];

    // First get artist IDs from within songkick to be able to query artist directly
    artists.forEach(x => songkickArtistIdQueries.push(buildSongkickArtistIdQuery(x.id, x.name)));
    console.log("Getting Songkick artist IDs...");
    let songkickArtistIdResponseObjects = await Promise.all(songkickArtistIdQueries);
    let songkickArtistObjects           = parsers.parseSongkickArtistsResponse(songkickArtistIdResponseObjects);

    // Build and send queries for actual shows for each artist
    songkickArtistObjects.forEach(x => songkickArtistQueries.push(buildSongkickArtistQuery(x.artistId, x.songkickId)));
    console.log("Getting Songkick artist shows...");
    let songkickResponseObjects = await Promise.all(songkickArtistQueries);

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
            } else {
                showsByArtistId[promiseObject.artistId] = cleanedShowObjects;
            }
        }
    }

    console.log(`Added or appended shows for ${songkickShowsFound} artists from Songkick`);
}

async function getSeatGeekShows(artists, location, showsByArtistId) {
    let seatGeekArtistIdQueries = [];
    let seatGeekArtistQueries   = [];

    artists.forEach(x => seatGeekArtistIdQueries.push(buildSeatGeekArtistIdQuery(x.id, x.name)));
    console.log("Getting SeatGeek artist IDs...");
    let seatGeekArtistIdResponseObjects = await Promise.all(seatGeekArtistIdQueries);
    let seatGeekArtistObjects           = parsers.parseSeatGeekArtistsResponse(seatGeekArtistIdResponseObjects);

    console.log("Getting SeatGeek artist shows...");
    // TODO :: BT paginate
    seatGeekArtistObjects.forEach(x => seatGeekArtistQueries.push(buildSeatGeekArtistQuery(x.artistId, x.seatGeekId)));
    let seatGeekResponseObjects = await Promise.all(seatGeekArtistQueries);

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
            } else {
                showsByArtistId[promiseObject.artistId] = cleanedShowObjects;
            }
        }
    }

    console.log(`Added or appended shows for ${seatGeekShowsFound} artists from SeatGeek`);
}

// Assuming location-checking for location of SF is done beforehand
async function getFoopeeShows(artists, location, showsByArtistId) {
    console.log("Getting foopee artist shows...");
    let foopeeShows = await foopee.getFoopeeShows(artists);
    for (const foopeeObject of foopeeShows) {
        if (showsByArtistId[foopeeObject.id]) {
            showsByArtistId[foopeeObject.id] = showsByArtistId[foopeeObject.id].concat(foopeeObject.showObjects);
        } else {
            showsByArtistId[foopeeObject.id] = foopeeObject.showObjects;
        }
    }
    console.log(`Added or appended shows for ${Object.keys(foopeeShows).length} artists from Foopee`);
}

function buildBandsInTownArtistQuery(artistId, artist) {
    let getOptions = {method : "GET", headers : {"Content-type" : "application/json"}};

    return new Promise(async (resolve, reject) => {
        let response = await helpers.instrumentCall(
            `https://rest.bandsintown.com/artists/${artist}/events?app_id=${constants.bandsInTownSecret}`,
            getOptions,
            false);
        resolve({artistId : artistId, queryResponse : response});
    });
}

function buildSongkickArtistIdQuery(artistId, artist) {
    let getOptions = {method : "GET", headers : {"Content-type" : "application/json"}};

    return new Promise(async (resolve, reject) => {
        let response = await helpers.instrumentCall(
            `https://api.songkick.com/api/3.0/search/artists.json?apikey=${constants.songkickSecret}&query=${artist}`,
            getOptions,
            false);
        resolve({artistId : artistId, queryResponse : response});
    });
}

function buildSongkickArtistQuery(artistId, songkickArtistId) {
    let getOptions = {method : "GET", headers : {"Content-type" : "application/json"}};

    return new Promise(async (resolve, reject) => {
        let       response =
            await helpers.instrumentCall(`https://api.songkick.com/api/3.0/artists/${
                                             songkickArtistId}/calendar.json?apikey=${constants.songkickSecret}`,
                                         getOptions,
                                         false);
        resolve({artistId : artistId, queryResponse : response});
    });
}

function buildSeatGeekArtistIdQuery(artistId, artist) {
    let getOptions = {
        method : "GET",
        headers : {"Content-type" : "application/json", Authorization : helpers.seatGeekAuth()}
    };

    return new Promise(async (resolve, reject) => {
        let       response =
            await helpers.instrumentCall(`https://api.seatgeek.com/2/performers?q=${artist}`, getOptions, false);
        resolve({artistId : artistId, queryResponse : response});
    });
}

function buildSeatGeekArtistQuery(artistId, seatGeekArtistId) {
    let getOptions = {
        method : "GET",
        headers : {"Content-type" : "application/json", Authorization : helpers.seatGeekAuth()}
    };

    return new Promise(async (resolve, reject) => {
        let resultCount = 0;
        let page        = 1;
        let total       = 0;
        let perPage     = 25;
        let response: {success: boolean, response: any};
        let responseBody: any = {};
        let fullEventsList    = [];

        // Normal pagination logic while building the fullEventsList list
        do {
            response = await helpers.instrumentCall(`https://api.seatgeek.com/2/events?performers.id=${
                                                        seatGeekArtistId}&per_page=${perPage}&page=${page++}`,
                                                    getOptions,
                                                    false);

            if (!response.success) {
                console.log("Failed paginated call to get seatgeek artist");
                console.log(response.response);
                continue;
            }
            responseBody   = response.response;
            fullEventsList = fullEventsList.concat(responseBody.events);
            total          = responseBody.meta.total;
        } while (perPage * page <= total);

        // This is where it gets hacky - our parser is conditioned to check the success field of a single response, and
        // then pull the events list out of its body. Here we rip open the final response from the last page request,
        // shove the full events list in there, and then stringify it all back up and act like nothing happened
        responseBody.events = fullEventsList;
        response.response   = responseBody;
        resolve({artistId : artistId, queryResponse : response});
    });
}
