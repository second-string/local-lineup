import express from "express";
const router = express.Router();

import * as authHandler     from "./auth-handler";
import * as showFinder      from "../show-finder";
import * as venueShowSearch from "../venue-show-finder";
import * as dbHelpers       from "../helpers/db-helpers";
import * as constants       from "../helpers/constants";
import * as helpers         from "../helpers/helpers";
import * as spotifyHelper   from "../helpers/spotify-helper";

export function setRoutes(routerDependencies) {
    const db           = routerDependencies.db;
    const staticAppDir = routerDependencies.baseStaticDir;

    router.post("/logout", (req, res) => authHandler.logout(req, res));
    router.post("/token-auth", async (req, res) => authHandler.tokenAuth(db, req, res));

    router.post("/show-finder/playlists", async (req, res) => {
        const spotifyToken = req.userObj.SpotifyAccessToken;
        let playlists      = await showFinder.getPlaylists(spotifyToken, req.userObj.Uid);
        // let playlists      = await spotifyHelper.getPlaylists(spotifyToken, req.userObj.SpotifyUsername,
        // req.userObj.Uid);
        if (playlists.ok !== undefined && !playlists.ok) {
            console.log(`Call to get users playlists failed with status ${playlists.status}`);
            return res.status(playlists.status).json(playlists);
        }

        res.send(playlists);
    });

    router.get("/show-finder/artists", async (req, res) => {
        if (!req.query.playlistId) {
            return res.status(400).send("Did not include playlistId query param in request to '/show-finder/artists/");
        }

        const spotifyToken = req.userObj.SpotifyAccessToken;

        // Special case if we're using their liked tracks, otherwise use the regular playlists endpoint
        let artists = [];
        if (parseInt(req.query.playlistId, 10) === constants.user_library_playlist_id) {
            artists = await showFinder.getLikedSongsArtists(spotifyToken, req.userObj.Uid);
        } else {
            artists = await showFinder.getArtists(spotifyToken, req.query.playlistId, req.userObj.Uid);
        }

        // if (artists.ok !== undefined && !artists.ok) {
        //     console.log(`Call to get artists for playlist failed with status ${artists.status}`);
        //     return res.status(artists.status).json(artists);
        // }

        res.json(artists);
    });

    router.get("/show-finder/venues", async (req, res) => {
        if (req.query.city === undefined) {
            res.status(400).send();
        }

        let venues = await venueShowSearch.getVenues(req.query.city, db);
        if (venues.ok !== undefined && !venues.ok) {
            console.log(`Call to get venues for ${req.query.city} failed with status ${venues.status}`);
            return res.status(venues.status).json(venues);
        }

        res.json(venues);
    });

    router.post("/show-finder/save-venues", async (req, res) => {
        if (!req.body) {
            console.log("Did not receive any venue IDs or info in POST body");
            return res.status(400);
        }

        let venueIds       = req.body.venueIds;
        let tableName      = "VenueLists";
        let userUidColumn  = "UserUid";
        let venueIdsColumn = "VenueIds";
        let locationColumn = "Location";

        let upsertSql =
            `
        INSERT INTO VenueLists (UserUid, VenueIds, Location, SongsPerArtist, IncludeOpeners)
        VALUES (?, ?, ?, ?, ?);
        `;

        let upsert;
        try {
            upsert = await db.runAsync(upsertSql, [
                req.userUid,
                venueIds.join(","),
                req.body.location,
                req.body.songsPerArtist,
                req.body.includeOpeners
            ]);
        } catch (e) {
            console.log(e);
            return res.status(500);
        }

        return res.status(204).send();
    });

    // TODO :: BT unsub success screen
    router.get("/show-finder/delete-venues", async (req, res) => {
        if (req.query.uid === undefined) {
            console.log("Did not receive any user uid for venue-deletion in the query param");
            return res.status(400);
        }

        // Can't pull userObj from req object here like we normally do since this is an unauthed endpoint to allow unsub
        // from email
        let userObj = await db.getAsync(`SELECT * FROM Users WHERE Uid=?`, req.query.uid);
        if (userObj === undefined) {
            return res.status(404).send("User not found");
        }

        let tableName     = "VenueLists";
        let userUidColumn = "UserUid";

        let deleteSql = `
        DELETE FROM ${tableName}
        WHERE ${userUidColumn}='${userObj.Uid}';
        `;

        let deleteOp;
        try {
            deleteOp = await db.runAsync(deleteSql);
        } catch (e) {
            console.log(e);
            return res.status(500).send("Error unsubscribing user");
        }

        return res.sendFile("email-delete-success.html", {root : staticAppDir});
    });

    router.post("/show-finder/shows", async (req, res) => {
        if (req.body.selectedVenues) {
            // Error handled internally, lists will just be empty if there was failure
            const showDatesByService = await venueShowSearch.getShowsForVenues(req.body.selectedVenues);
            return res.json(showDatesByService);
        } else if (req.body.selectedArtists) {
            // No venues specified, get all shows for all artists supplied in body
            // Need to group artist by arbitrary id to be able to bundle and serve consolidated response
            let i                        = 0;
            let artists                  = req.body.selectedArtists.map(x => ({id : i++, name : x}));
            let allServicesResponse: any = await showFinder.getAllShows(artists, req.body.location);
            if (allServicesResponse.statusCode) {
                console.log(`Call to get shows for all artists failed with status ${allServicesResponse.statusCode}`);
                return res.status(allServicesResponse.statusCode).json(allServicesResponse);
            }

            let mappedArtistsToShows =
                Object.keys(allServicesResponse)
                    .filter(x => artists.find(y => y.id === parseInt(x)) !== undefined)
                    .map(x => ({
                             artistName : decodeURIComponent(artists.find(y => y.id === parseInt(x)).name).toString(),
                             shows : allServicesResponse[x]
                         }));

            console.log(
                `Successfully fetched and bundled shows for ${Object.keys(mappedArtistsToShows).length} total artists`);
            res.json(mappedArtistsToShows);
        } else {
            return res.status(400).json("Missing required body params");
        }
    });

    router.get("/show-finder/user-venues", async (req, res) => {
        // Support querying for a specific location for this user if they have multiple
        // Allows us to keep populating their different venue lists as they switch locations
        let venueListObj = null;
        if (req.query.location) {
            venueListObj = await db.getAsync(
                `SELECT VenueIds, Location, SongsPerArtist, IncludeOpeners FROM VenueLists WHERE UserUid=? AND Location=?`,
                [ req.userUid, req.query.location ]);
        } else {
            venueListObj = await db.getAsync(
                `SELECT VenueIds, Location, SongsPerArtist, IncludeOpeners FROM VenueLists WHERE UserUid=?`,
                [ req.userUid ]);
        }

        if (venueListObj === undefined) {
            return res.json({});
        }

        res.json(venueListObj);
    });

    return router;
}
