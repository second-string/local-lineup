const localLineup = require("./local-lineup.js");

exports.handler = async (event) => {
    const artists = event["artists"];
    const location = event["location"];

    if (!artists || !location) {
        return {
            statusCode: 400,
            body: JSON.stringify("Must supply valid query params"),
        }
    }

    const showsByArtistId = await localLineup.getAllShows(artists, location);

    return response = {
        statusCode: 200,
        body: JSON.stringify({ showsByArtistId }),
    };
};
