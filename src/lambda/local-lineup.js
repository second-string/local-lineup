const helpers = require("./helpers.js");
const bandsInTownHelpers = require("./bandsintown-helpers.js");

// artists param is list of { id, name }, location is lowercased basic city string
async function getAllShows(artists, location) {
    // Eventual return value (ish). Object with key of artist ID (int) and value of a list of { date: DateTime, show:
    // string }
    let showsByArtistId     = {};
    let showServiceRequests = [];
    showServiceRequests.push(bandsInTownHelpers.getBandsInTownShows(artists, location, showsByArtistId));
    /*
    showServiceRequests.push(songkickHelpers.getSongkickShows(artists, location, showsByArtistId));
    showServiceRequests.push(seatgeekHelpers.getSeatGeekShowsForArtists(artists, location, showsByArtistId));

    if (location === "san francisco") {
        showServiceRequests.push(foopeeHelpers.getFoopeeShows(artists, location, showsByArtistId));
    }
    */

    await Promise.all(showServiceRequests);
    helpers.dedupeShows(showsByArtistId);

    // Set each value of the artist ID key to just the list of shows from the previous list of show/date objects
    Object.keys(showsByArtistId).forEach(x => (showsByArtistId[x] = showsByArtistId[x].map(y => y.show)));

    return showsByArtistId;
}

module.exports = {
    getAllShows,
}
