import * as constants from "./constants";
import * as helpers   from "./helpers";
import * as parsers   from "./response-parsers";

export async function getBandsInTownShows(artists, location, showsByArtistId) {
    // List of { artistId, query } objects
    let bandsInTownQueries = [];
    artists.forEach(x => bandsInTownQueries.push(buildBandsInTownArtistQuery(x.id, x.name)));
    console.log("Getting BandsInTown artist shows...");

    let bandsInTownResponseObjects = await Promise.all(bandsInTownQueries);

    let bandsInTownShowsFound = 0;
    for (let promiseObject of bandsInTownResponseObjects) {
        let responseObject = promiseObject.queryResponse;
        if (!responseObject.success) {
            if (responseObject.response && responseObject.response.status == 404) {
                console.log("BIT 404");
            } else if (responseObject.response && responseObject.response.message &&
                       responseObject.response.message.includes("getaddrinfo ENOTFOUND")) {
                console.log("BIT ENOTFOUND");
            } else if (!responseObject.success && responseObject.response.message &&
                       responseObject.response.message.includes("AbortController")) {
                console.log("BIT timout");
            } else {
                console.log(`Failed query in BandsInTown requests:`);
                console.log(responseObject);
            }

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

async function buildBandsInTownArtistQuery(artistId, artist) {
    const getOptions = {method : "GET", headers : {"Content-type" : "application/json"}};

    // Fun (read: not fun) fact: BIT api can't fathom &s or .s, even encoded. 404s every time. We have to manually
    // replace the encoded value (%26 for &, straight . for .) with 'and'
    artist = artist.replace("%26", "and");
    artist = artist.replace(".", "");

    const response = await helpers.instrumentCall(
        `https://rest.bandsintown.com/artists/${artist}/events?app_id=${constants.bandsInTownSecret}`,
        getOptions,
        false);
    return {artistId : artistId, queryResponse : response};
}
