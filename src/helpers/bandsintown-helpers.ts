import * as constants from "./constants";
import * as helpers   from "./helpers";
import * as parsers   from "./response-parsers";

export async function getBandsInTownShows(artists, location, showsByArtistId) {
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
