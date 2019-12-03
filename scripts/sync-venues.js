const helpers = require("../helpers/helpers");
const dbHelpers = require("../helpers/db-helpers");
const constants = require("../helpers/constants");

/*
Sample venue object
{
    "links": [],
    "metro_code": 807,
    "postal_code": "94107",
    "timezone": "America/Los_Angeles",
    "has_upcoming_events": true,
    "id": 22,
    "city": "San Francisco",
    "stats": {
        "event_count": 153
    },
    "extended_address": "San Francisco, CA 94107",
    "display_location": "San Francisco, CA",
    "state": "CA",
    "score": 0.90359527,
    "location": {
        "lat": 37.7782,
        "lon": -122.391
    },
    "access_method": {
        "employee_only": false,
        "created_at": "2015-06-25T00:00:00Z",
        "method": "PDF417"
    },
    "num_upcoming_events": 153,
    "address": "24 Willie Mays Plaza",
    "capacity": 41503,
    "slug": "oracle-park",
    "name": "Oracle Park",
    "url": "https://seatgeek.com/venues/oracle-park/tickets",
    "country": "US",
    "popularity": 0,
    "name_v2": "Oracle Park"
},
*/

const locations = ["san francisco", "los angeles", "washington", "new york", "chicago", "houston", "philadelphia"];

const seatGeekAuth = () => "Basic " + Buffer.from(`${constants.seatGeekClientId}:`).toString("base64");

async function getVenues(city) {
    let getOptions = {
        method: "GET",
        headers: {
            "Content-type": "application/json",
            Authorization: seatGeekAuth()
        }
    };

    let encodedCity = encodeURIComponent(city);
    let venueList = [];
    let page = 1;
    let perPage = 100;
    let total = 0;
    let totalMillis = 0;
    do {
        let { success, response } = await helpers.instrumentCall(
            `https://api.seatgeek.com/2/venues?city=${encodedCity}&per_page=${perPage}&page=${page++}`,
            getOptions,
            false
        );

        if (!success) {
            return response;
        }

        venueList = venueList.concat(response.venues);
        total = response.meta.total;
        totalMillis += response.meta.took;
    } while (page * perPage <= total);

    console.log(`Took ${totalMillis} milliseconds to get ${total} venues`);

    // De-dupe venues cause they send a ton of repeats
    let hasSeen = {};
    return venueList.filter(x => (hasSeen.hasOwnProperty(x.id) ? false : (hasSeen[x.id] = true)));
}

async function saveVenues(location, venues, db) {
    await db.runAsync("BEGIN TRANSACTION");
    for (const venue of venues) {
        const venueParams = [venue.id, location, venue.name, venue.url];

        await db.runAsync("INSERT OR REPLACE INTO Venues (Id, Location, Name, TicketUrl) VALUES (?, ?, ?, ?);", venueParams);
    }

    await db.runAsync("COMMIT");
}

async function run() {
    if (!constants.seatGeekClientId) {
        console.log("No seatgeek auth set up, source setup_env.sh");
        process.exit(-1);
    }

    const db = dbHelpers.openDb("../user_venues.db");

    for (const location of locations) {
        console.log(`Syncing venues for ${location}`);
        const venues = await getVenues(location);
        await saveVenues(location, venues, db);
        console.log(`Successfully saved ${location} venues`);
    }
}

run().catch(e => {
    throw e;
});
