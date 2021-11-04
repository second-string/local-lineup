import * as constants from "./constants";
import * as helpers   from "./helpers";
import * as parsers   from "./response-parsers";

export async function getSongkickShows(artists, location, showsByArtistId) {
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
            if (responseObject.response && responseObject.response.status == 404) {
                console.log("SK artist 404");
            } else if (responseObject.response && responseObject.response.message &&
                       responseObject.response.message.includes("getaddrinfo ENOTFOUND")) {
                console.log("SK artist ENOTFOUND");
            } else if (!responseObject.success && responseObject.response.message &&
                       responseObject.response.message.includes("AbortController")) {
                console.log("SK timout");
            } else {
                console.log(`Failed query in Songkick artist show requests:`);
                console.log(responseObject);
            }

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

async function buildSongkickArtistIdQuery(artistId, artist) {
    const getOptions = {method : "GET", headers : {"Content-type" : "application/json"}};

    const response = await helpers.instrumentCall(
        `https://api.songkick.com/api/3.0/search/artists.json?apikey=${constants.songkickSecret}&query=${artist}`,
        getOptions,
        false);

    return {artistId : artistId, queryResponse : response};
}

async function buildSongkickArtistQuery(artistId, songkickArtistId) {
    const getOptions = {method : "GET", headers : {"Content-type" : "application/json"}};

    const response = await helpers.instrumentCall(
        `https://api.songkick.com/api/3.0/artists/${songkickArtistId}/calendar.json?apikey=${constants.songkickSecret}`,
        getOptions,
        false);

    return {artistId : artistId, queryResponse : response};
}
