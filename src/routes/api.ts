import express from "express";
const router = express.Router();

import * as authHandler   from "./auth-handler";
import * as showFinder    from "../show-finder";
import * as dbHelpers     from "../helpers/db-helpers";
import * as constants     from "../helpers/constants";
import * as helpers       from "../helpers/helpers";
import * as spotifyHelper from "../helpers/spotify-helper";

export function setRoutes(routerDependencies) {
    const db           = routerDependencies.db;
    const staticAppDir = routerDependencies.baseStaticDir;

    router.post("/logout", (req, res) => authHandler.logout(req, res));
    router.post("/token-auth", async (req, res) => authHandler.tokenAuth(db, req, res));

    router.post("/local-lineup/playlists", async (req, res) => {
        const spotifyToken = req.userObj.SpotifyAccessToken;
        let playlists      = await spotifyHelper.getPlaylists(spotifyToken, req.userObj, db);
        if (playlists.ok !== undefined && !playlists.ok) {
            console.log(`Call to get users playlists failed with status ${playlists.status}`);
            return res.status(playlists.status).json(playlists);
        }

        res.send(playlists);
    });

    router.get("/local-lineup/artists", async (req, res) => {
        if (!req.query.playlistId) {
            return res.status(400).send("Did not include playlistId query param in request to '/local-lineup/artists/");
        }

        const spotifyToken = req.userObj.SpotifyAccessToken;

        // Special case if we're using their liked tracks, otherwise use the regular playlists endpoint
        let artists = [];
        if (req.query.playlistId === constants.user_library_playlist_id) {
            artists = await spotifyHelper.getLikedSongsArtists(spotifyToken, req.userObj, db);
        } else {
            artists = await spotifyHelper.getArtistsFromPlaylist(spotifyToken, req.query.playlistId, req.userObj, db);
        }

        res.json(artists);
    });

    router.get("/local-lineup/venues", async (req, res) => {
        if (req.query.city === undefined) {
            res.status(400).send();
        }

        let venues = await showFinder.getVenues(req.query.city, db);
        if (venues === undefined) {
            console.log(`Call to get venues for ${req.query.city} failed`);
            return res.status(500).json(venues);
        }

        res.json(venues);
    });

    router.post("/local-lineup/save-venues", async (req, res) => {
        if (!req.body) {
            console.log("Did not receive any venue IDs or info in POST body");
            return res.status(400);
        }

        let venueIds = req.body.venueIds;
        let upsertSql =
            `
        INSERT INTO VenueLists (UserUid, VenueIds, Location, SongsPerArtist, IncludeOpeners)
        VALUES (?, ?, ?, ?, ?);
        `;

        const upsertVenueList: DbVenueList = {
            UserUid : req.userObj.Uid,
            VenueIds : venueIds.join(","),
            Location : req.body.location,
            SongsPerArtist : parseInt(req.body.songsPerArtist, 10),
            IncludeOpeners : req.body.includeOpeners as boolean
        };

        let upsert;
        try {
            upsert = await db.runAsync(upsertSql, [
                upsertVenueList.UserUid,
                upsertVenueList.VenueIds,
                upsertVenueList.Location,
                upsertVenueList.SongsPerArtist,
                upsertVenueList.IncludeOpeners,
            ]);
        } catch (e) {
            console.log(e);
            return res.status(500);
        }

        return res.status(204).send();
    });

    // TODO :: BT unsub success screen
    router.get("/local-lineup/delete-venues", async (req, res) => {
        if (req.query.uid === undefined) {
            console.log("Did not receive any user uid for venue-deletion in the query param");
            return res.status(400);
        }

        // Can't pull userObj from req object here like we normally do since this is an unauthed endpoint to allow unsub
        // from email
        let userObj: DbUser = await db.getAsync(`SELECT * FROM Users WHERE Uid=?`, req.query.uid);
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

    router.post("/local-lineup/shows", async (req, res) => {
        if (req.body.selectedVenues) {
            // Error handled internally, lists will just be empty if there was failure
            const showDatesByService = await showFinder.getShowsForVenues(req.body.selectedVenues);
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

    // Retrieve logged-in user's previously-saved venue list from the db. Can be called with no location, in which the
    // first existing venue id list will be returned, or with a location to retrieve specific venue ids. If none exist
    // or none match passed in location, will simply return an empty object
    router.get("/local-lineup/user-venues", async (req, res) => {
        // Support querying for a specific location for this user if they have multiple
        // Allows us to keep populating their different venue lists as they switch locations
        let dbVenueListObj: DbVenueList = null;
        if (req.query.location) {
            dbVenueListObj = await db.getAsync(
                `SELECT VenueIds, Location, SongsPerArtist, IncludeOpeners FROM VenueLists WHERE UserUid=? AND Location=?`,
                [ req.userObj.Uid, req.query.location ]);
        } else {
            dbVenueListObj = await db.getAsync(
                `SELECT VenueIds, Location, SongsPerArtist, IncludeOpeners FROM VenueLists WHERE UserUid=?`,
                [ req.userObj.Uid ]);
        }

        if (dbVenueListObj === undefined) {
            return res.json({});
        }

        // Convert comma-delimeted DB list into real one
        // Note: NOT stringified - built manually in client js by joining w/ commas
        const venueListObj: any = {...dbVenueListObj};
        if (dbVenueListObj.VenueIds) {
            venueListObj.VenueIds = dbVenueListObj.VenueIds.split(",");
        }

        res.json(venueListObj);
    });

    // Retrieve previously selected venue ids stored in cookie for logged out user. Can be called with no location, in
    // which the first existing saved location will be returned, or with a location to retrieve specific venue ids. If
    // none exist or none match passed in location, will simply return empty object
    router.get("/local-lineup/selected-venues", async (req, res) => {
        const token  = authHandler.parseToken(req.sessionToken);
        let location = req.query.location as string;
        if (!token.selectedVenues) {
            return res.json({});
        } else {
            let venueIds = null;
            if (location) {
                venueIds = token.selectedVenues[location];
            } else {
                // Check to see if we have any for first page load, not picky on location
                if (token.selectedVenues && Object.keys(token.selectedVenues).length > 0) {
                    location = Object.keys(token.selectedVenues)[0];
                    venueIds = token.selectedVenues[location];
                }
            }

            if (venueIds) {
                // Return in DB format since that's how /user-venues api route returns db-saved logged in user venues
                return res.json({
                    Location : location,
                    VenueIds : venueIds,
                });
            } else {
                return res.json({});
            }
        }
    });

    // Used to store selected venues per city in a cooke so when users select venues, sign in, then return through
    // spotify auth callback redirect, they still have the full venue list. Once a user is logged in the react code
    // only uses the DB venue list
    router.post("/local-lineup/selected-venues", async (req, res) => {
        const location = req.body.location;
        const venueIds = req.body.venueIds;

        if (!location || !venueIds) {
            return res.status(400).send();
        }

        const token        = authHandler.parseToken(req.sessionToken);
        let selectedVenues = {};
        if (token.selectedVenues) {
            token.selectedVenues[location] = venueIds;
            selectedVenues                 = token.selectedVenues;
        } else {
            selectedVenues = {
                [location] : venueIds,
            };
        }

        authHandler.updateTokenField(token, "selectedVenues", selectedVenues, res);
        return res.status(200).send();
    });

    return router;
}
