import fs from 'fs';

import * as constants from "../helpers/constants";
import * as dbHelpers from "../helpers/db-helpers";
import * as helpers   from "../helpers/helpers";

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

const defaultLocations = [
    "san francisco", "los angeles", "washington", "new york",     "denver",    "chicago",   "boston",
    "austin",        "houston",     "charlotte",  "philadelphia", "seattle",   "baltimore", "munich",
    "amsterdam",     "paris",       "manchester", "madrid",       "barcelona", "berlin",
];

const seatGeekAuth = () => "Basic " + Buffer.from(`${constants.seatGeekClientId}:`).toString("base64");

async function getVenues(city) {
    let getOptions = {method : "GET", headers : {"Content-type" : "application/json", Authorization : seatGeekAuth()}};

    let encodedCity = encodeURIComponent(city);
    let venueList   = [];
    let page        = 1;
    let perPage     = 100;
    let total       = 0;
    let totalMillis = 0;
    do {
        let {success, response} = await helpers.instrumentCall(
            `https://api.seatgeek.com/2/venues?city=${encodedCity}&per_page=${perPage}&page=${page++}`,
            getOptions,
            false);

        if (!success) {
            return response;
        }

        venueList = venueList.concat(response.venues);
        total     = response.meta.total;
        totalMillis += response.meta.took;
    } while (page * perPage <= total);

    console.log(`Took ${totalMillis} milliseconds to get ${total} venues`);

    // De-dupe venues cause they send some repeats
    let hasSeen = {};
    return venueList.filter(x => (hasSeen.hasOwnProperty(x.id) ? false : (hasSeen[x.id] = true)));
}

async function saveVenues(location, venues, db) {
    console.log(`Saving ${venues.length} ${location} venues to db...`);

    await db.runAsync("BEGIN TRANSACTION");
    for (const venue of venues) {
        const venueParams = [ venue.id, location, venue.name, venue.url ];

        await db.runAsync("INSERT OR REPLACE INTO Venues (Id, Location, Name, TicketUrl) VALUES (?, ?, ?, ?);",
                          venueParams);
    }

    await db.runAsync("COMMIT");
}

async function run() {
    if (!constants.seatGeekClientId) {
        console.log("No seatgeek auth set up, source setup_env.sh");
        process.exit(-1);
    }

    const dbPath = "./user_venues.db";
    if (!fs.existsSync(dbPath)) {
        console.error(`Didn't find db file in expected location (${dbPath}), exiting script`);
        return;
    }

    const db = dbHelpers.openDb(dbPath);

    let locations = [];
    if (process.argv.length > 2) {
        for (const location of process.argv.slice(2)) {
            if (!defaultLocations.includes(location)) {
                console.error(`Supplied location of ${location} not found in default location list, exiting`);
                process.exit(-1);
            }

            locations.push(location);
        }
    } else {
        locations = defaultLocations;
    }

    for (const location of locations) {
        console.log(`Syncing venues for ${location}`);
        const venues = await getVenues(location);
        // Out of ~2k sf venues, 106 have non-zero scores (value is between 0.0 and 1.0). Filter to improve perf + cut
        // out fake dupes
        const nonZeroScoreVenues = venues.filter(x => x.score > 0);
        await saveVenues(location, nonZeroScoreVenues, db);
        console.log(`Successfully saved ${location} venues`);
    }
}

run().catch(e => { throw e; });
