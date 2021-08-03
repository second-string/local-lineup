import fs from "fs";
import * as sqlite3 from "sqlite3";

import * as bandsInTownHelpers from "./helpers/bandsintown-helpers";
import * as foopeeHelpers      from "./helpers/foopee-helpers";
import * as helpers            from "./helpers/helpers";
import * as seatgeekHelpers    from "./helpers/seatgeek-helpers";
import * as songkickHelpers    from "./helpers/songkick-helpers";
import * as spotifyHelpers     from "./helpers/spotify-helper";

// artists param is list of { id, name }, location is lowercased basic city string
export async function getAllShows(artists, location) {
    // Eventual return value (ish). Object with key of artist ID (int) and value of a list of { date: DateTime, show:
    // string }
    let showsByArtistId     = {};
    let showServiceRequests = [];
    showServiceRequests.push(bandsInTownHelpers.getBandsInTownShows(artists, location, showsByArtistId));
    showServiceRequests.push(songkickHelpers.getSongkickShows(artists, location, showsByArtistId));
    showServiceRequests.push(seatgeekHelpers.getSeatGeekShowsForArtists(artists, location, showsByArtistId));

    if (location === "san francisco") {
        showServiceRequests.push(foopeeHelpers.getFoopeeShows(artists, location, showsByArtistId));
    }

    await Promise.all(showServiceRequests);
    helpers.dedupeShows(showsByArtistId);

    // Set each value of the artist ID key to just the list of shows from the previous list of show/date objects
    Object.keys(showsByArtistId).forEach(x => (showsByArtistId[x] = showsByArtistId[x].map(y => y.show)));

    return showsByArtistId;
}

export async function getVenues(location, db) {
    const venueObjs: DbVenue[] = await db.allAsync('SELECT * FROM Venues WHERE Location=?', [ location ]);
    if (!venueObjs) {
        return {};
    }

    // Map to api lowercase values. Should probably refactor the react code to use DB column names at some point
    return venueObjs.map(x => ({id : x.Id, name : x.Name, ticketUrl : x.TicketUrl}));
}

/*
  param is object with service name keys mapped to object holding venue names by ID
  {
    "seatgeek": {
        "12": "Fox Theater",
        "354": "The Independent"
    },
    "songkick": {
        ...
    }
  }
*/
export async function getShowsForVenues(venues) {
    let showsByVenueId = {};
    if (venues.seatgeek) {
        const resObj = await seatgeekHelpers.getSeatGeekShowsForVenues(venues.seatgeek);
        if (resObj.success) {
            showsByVenueId['seatgeek'] = resObj.response;
        } else {
            console.error(
                "Failure getting shows for seatgeek, returning empty list for showsByVenueId['seatgeek']. Error: ");
            showsByVenueId['seatgeek'] = [];
        }
    }

    return showsByVenueId;
}

export async function
buildPlaylist(userObj, shows, songsPerArtist, includeOpeners, location: string, db: sqlite3.Database): Promise<number> {
    if (userObj === null || userObj === undefined || shows === null || shows === undefined) {
        console.log("Must provide userObj and shows list to build spotify playlist");
        return -1;
    }

    if (shows.length === 0) {
        console.log("Called buildPlaylist with zero shows, returning immediately");
        return 0;
    }

    let spotifyToken = userObj.SpotifyAccessToken;

    let artists = [];
    for (let show of shows) {
        let addedAnArtist = false;
        for (let performer of show.performers) {
            if (includeOpeners) {
                artists.push(performer.name);
                addedAnArtist = true;
            } else if (show.title.toLowerCase().includes(performer.name.toLowerCase())) {
                // If the show title contains the artist name, include them. We only take the first one because tons of
                // the shows are listed as 'ArtistX with ArtistY', so checking each performer would include openers for
                // most. From what I can tell the main act is always first in the performer list, but there's no other
                // indication of who the main act is in the show object so this is all we got.
                artists.push(performer.name);
                addedAnArtist = true;
                break;
            }
        }

        // If we've gone through every performer and none have matched the show title, stick the first one in anyway
        if (!addedAnArtist && show.performers.length > 0) {
            console.log(`Found no matching artists for show name '${show.title}', adding first performer '${
                show.performers[0]}' anyway`);
            artists.push(show.performers[0].name);
        }
    }

    try {
        let artistObjs  = await spotifyHelpers.getArtists(spotifyToken, artists, userObj, db);
        let trackUris   = await spotifyHelpers.getTrackUris(spotifyToken, songsPerArtist, artistObjs, userObj, db);
        let playlistObj = await spotifyHelpers.getOrCreatePlaylist(spotifyToken, userObj, location, db);
        await spotifyHelpers.addTracksToPlaylist(spotifyToken, playlistObj, trackUris, userObj.Uid, db);
        return 0;
    } catch (e) {
        console.error(e.message);
        console.error(e.stack);
        return -1;
    }
}
