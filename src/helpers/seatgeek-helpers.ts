import * as constants from "./constants";
import * as helpers   from "./helpers";
import * as parsers   from "./response-parsers";

var seatGeekAuth = () => 'Basic ' + Buffer.from(`${constants.seatGeekClientId}:`).toString('base64');

export async function getSeatGeekShowsForArtists(artists, location, showsByArtistId) {
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

export async function getSeatGeekShowsForVenues(venuesById) {
    let getOptions = {
        method : 'GET',
        headers : {'Content-type' : 'application/json', 'Authorization' : seatGeekAuth()}
    }

    let showList    = [];
    let venueString = Object.keys(venuesById).join(',');
    let page        = 1;
    let perPage     = 50;
    let total       = 0;
    let totalMillis = 0;
    console.log(`Getting shows for venues...`);
    do {
        let {success, response} = await helpers.instrumentCall(
            `https://api.seatgeek.com/2/events?venue.id=${venueString}&per_page=${perPage}&page=${page++}`,
            getOptions,
            false);

        if (!success) {
            return {success, response};
        }

        // Filter out all sports events and whatnot
        showList = showList.concat(
            response.events.filter(x => x.type.toLowerCase() === "concert" || x.type.toLowerCase() === "festival"));
        total = response.meta.total;
        totalMillis += response.meta.took
    } while (page * perPage <= total);
    console.log(`Took ${totalMillis} milliseconds to get ${total} shows from ${Object.keys(venuesById).length} venues`);

    let showsByDate = {};
    for (let show of showList) {
        const showDate       = new Date(show.datetime_local);
        const showDateString = showDate.toISOString();
        showDate.setHours(0);
        showDate.setMinutes(0);
        showDate.setSeconds(0);
        if (showsByDate[showDateString]) {
            showsByDate[showDateString] = showsByDate[showDateString].concat(show);
        } else {
            showsByDate[showDateString] = [ show ];
        }
    }

    return {success : true, response : showsByDate};
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
