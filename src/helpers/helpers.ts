import formurlencoded from "form-urlencoded";
import fetch from "node-fetch";
import sqlite3 from "sqlite3";

import * as constants from "./constants";

export var spotifyAuth = () =>
    "Basic " + Buffer.from(`${constants.clientId}:${constants.clientSecret}`).toString("base64");
export var seatGeekAuth = () => "Basic " + Buffer.from(`${constants.seatGeekClientId}:`).toString("base64");

// function requestError(response, exception = null) {
//     console.log("REQUEST ERROR");
//     if (response) {
//         console.log(`RESPONSE STATUS CODE: ${response.statusCode}`);
//         console.log(response.body);
//     }

//     if (exception) {
//         console.log(exception);
//     }

//     return response;
// }

export function baseSpotifyHeaders(method, spotifyToken): {method: string, headers: any, family: number, body?: any} {
    return {
        method,
        headers : {
            "Content-type" : "application/json",
            Authorization : "Bearer " + spotifyToken,
        },
        family : 4
    };
}

// Not exported, only used within autoRetrySpotifyCall
async function refreshSpotifyToken() {
    const postOptions = {
        method : "POST",
        body : {grant_type : "client_credentials"},
        headers : {"Content-type" : "application/x-www-form-urlencoded", Authorization : spotifyAuth()}
    };

    console.log("Getting spotify API token...");
    const {success, response} = await instrumentCall("https://accounts.spotify.com/api/token", postOptions, false);
    console.log(response);
    return success ? response.access_token : response;
}

// Enables other logic to get spotify information without having to store and handle refreshing the token themselves
export async function
autoRetrySpotifyCall(spotifyToken, url, method, userUid, db?: sqlite3.Database, logCurl?: boolean) {
    let options = baseSpotifyHeaders(method, spotifyToken);

    let {success, response} = await instrumentCall(url, options, true);
    if (!success) {
        // This could probably be refined with error codes, but give it a refresh and retry for any failure for now
        console.log(`Failed a spotify request to ${url} with status ${response.status}, refreshing token and retrying`);
        spotifyToken = await refreshSpotifyToken();

        // Shove our new token into the existing headers. Don't rebuild fully with baseSpotifyHeaders in case they
        // customized
        options.headers.Authorization = "Bearer " + spotifyToken;

        ({success, response} = await instrumentCall(url, options, true));
        //
        // Save the newly refreshed access token here if the request was successful. Don't await the call so we don't
        // block on the DB insert
        // TODO HACK check for null - this shouldn't be an optional param in the future but need it for reverse compat
        // right now
        if (db) {
            db!.runAsync("UPDATE Users set SpotifyAccessToken='?' where Uid='?';", [ spotifyToken, userUid ]);
        }
    }

    return {success, response};
}

// Not exported, for use in deconstructing logic in instrumentCall. Allows for retries within instrumentCall based on
// certain error types. NOTE: does NOT handle exceptions thrown by node-fetch or failure status codes - that's the
// caller's responsibility.
//
// params: url to fetch, options to fetch with, timeout in seconds to wait on request before aborting returns:
// unparsedRes from node-fetch. Will either be Response object or timeout object of {ok,message} (matches Response keys)
async function fetchWithBackoffAndTimeout(url, options, timeout) {
    // Build X second timeout to chop our requests that are hanging. 'Real' responses from fetch, successful or
    // otherwise, will include an `ok` field as well. Using the same key here allows us to combine a success check for
    // an actual unsuccessful response vs. timeout into a single if-check
    const requestTimeout = sleep(timeout * 1000, {ok : false, message : "Request timed out"});

    let unparsedRes = null;
    let backoff     = true;
    while (backoff) {
        const requestPromise = fetch(url, options, true);
        unparsedRes          = await Promise.race([ requestPromise, requestTimeout ]);

        // No need to error check 'real' response or timeout `ok` here since status won't be 429, so we'll break the
        // while loop and fall to the below error checking block regardless
        if (unparsedRes.status === 429) {
            backoff         = true;
            let backoffTime = Number(unparsedRes.headers.get('Retry-after'));
            if (!backoffTime || backoffTime === 0) {
                // We got a 429 but failed parsing the Retry-after (or it wasn't included)
                // Default to 1 second
                backoffTime = 1;
            }

            console.log(`Got a 429, backing off for ${backoffTime} seconds`);
            await sleep(backoffTime * 1000);
        } else {
            backoff = false;
        }
    }

    return unparsedRes;
}

export async function instrumentCall(url, options, logCurl): Promise<{success : boolean, response : any}> {
    let parsedRes;
    let error       = null;
    let encodedBody = "";
    let unparsedRes = null;

    // Default value of true
    logCurl = logCurl === undefined ? true : logCurl;

    try {
        if (options.body) {
            switch (options.headers["Content-type"]) {
                case "application/json":
                    encodedBody = JSON.stringify(options.body);
                    break;
                case "application/x-www-form-urlencoded":
                    encodedBody = formurlencoded(options.body);
                    break;
                default:
                    throw new Error(`Need to supply a data encoded for ${JSON.stringify(options.body, null, 2)}`);
            }

            options.body = encodedBody;
        }

        unparsedRes = await fetchWithBackoffAndTimeout(url, options, 8);
        if (unparsedRes && !unparsedRes.ok) {
            error = unparsedRes;
        } else {
            parsedRes = await unparsedRes.json();
        }
    } catch (e) {
        const errorObject = {message : "Threw but didn't assign anything to unparsedRes yet", exception : e};

        // TODO here is where we could add socket or sleep(short) and retry logic for ECONNRESET issues
        console.error(
            "Exception thrown in instrumentCall, logging out reponse fields to see how we can debug and retry ECONNRESET:");
        console.error(e.errno);
        console.error(e.code);
        console.error(e.stack);
        console.error(e.info);
        error = unparsedRes === null ? errorObject : unparsedRes;
    } finally {
        // Log out a curl for every call we instrument.
        if (logCurl && process.env.DEPLOY_STAGE !== "PROD") {
            let curl = [ "curl" ];

            // -s: don't show progress ascii
            // -D -: output headers to file, '-' uses stdout as file
            // You can also use -v for a full dump
            curl.push("-sD -");
            curl.push(`\'${url}\'`);
            curl.push(`-X ${options.method}`);
            for (let header of Object.keys(options.headers)) {
                curl.push(`-H \'${header}: ${options.headers[header]}\'`);
            }

            if (encodedBody) {
                curl.push(`-d \'${encodedBody}\'`);
            }

            curl.push("--compressed");
            console.log(curl.join(" "));
        }
    }

    let success  = error === null;
    let response = error || parsedRes;
    return {success, response};
}

// Compare dates agnostic of times
export function datesEqual(dateString1, dateString2) {
    // The date will come as ms since epoch from foopee scrape but a datetime string from the other two
    let date1 = new Date(dateString1);
    let date2 = new Date(dateString2);
    return date1.getUTCFullYear() === date2.getUTCFullYear() && date1.getUTCMonth() === date2.getUTCMonth() &&
           date1.getUTCDate() === date2.getUTCDate();
}

export function getUTCDate(inputDate) {
    let date = new Date(inputDate);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0);
}

function addDedupedShows(previouslyAddedShows, newArtistShowList) {
    // If you set this to previouslyAddedShows directly does js do a shallow copy or are we dealing with pointers?
    let dedupedShows = [].concat(previouslyAddedShows);
    for (const i in newArtistShowList) {
        let dupeDate = false;
        for (const j in previouslyAddedShows) {
            if (datesEqual(newArtistShowList[i].date, previouslyAddedShows[j].date)) {
                dupeDate = true;
                break;
            }
        }

        if (!dupeDate) {
            dedupedShows.push(newArtistShowList[i]);
        }
    }

    return dedupedShows;
}

// adapted from perf solution of this answer https://stackoverflow.com/a/9229821.
// Does not remove shows in-place from list but reassigns new list after deduping
export function dedupeShows(showsByArtistId) {
    for (let key of Object.keys(showsByArtistId)) {
        let showList        = showsByArtistId[key];
        let dedupedShowList = [];

        // 'set' used for hash lookups on dates to dedupe
        let dates = {};
        for (const showObj of showList) {
            let standardDate = getUTCDate(showObj.date);
            if (dates[standardDate] !== 1) {
                dates[standardDate] = 1;
                dedupedShowList.push(showObj);
            }
        }

        showsByArtistId[key] = dedupedShowList;
    }
}

async function sleep(ms, timeoutValue?: any) {
    return new Promise((resolve) => setTimeout(() => resolve(timeoutValue || null), ms));
}
