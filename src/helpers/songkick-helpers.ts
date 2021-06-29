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
