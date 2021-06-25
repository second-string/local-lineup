const express = require("express");
const router = express.Router();

const authHandler = require("./auth-handler");
const showFinder = require("../show-finder");
const venueShowSearch = require("../venue-show-finder");
const dbHelpers = require("../helpers/db-helpers");
const constants = require("../helpers/constants");
const helpers = require("../helpers/helpers");

function setRoutes(routerDependencies) {
    const db = routerDependencies.db;

    router.post("/logout", (req, res) => authHandler.logout(req, res));
    router.post("/token-auth", async (req, res) => authHandler.tokenAuth(db, req, res));

    router.post("/show-finder/playlists", async (req, res) => {
        /*
        // If we have a token cached, give it a shot to see if it's still valid
        if (spotifyToken) {
            let cachedAttempt = await showFinder.getPlaylists(spotifyToken, userObj.SpotifyUsername);

            // If we have no status, that means we got our playlist json object back (success). If we have a code,
            // instrumentCall returned our full failed response to us, so refresh the token and continue.
            if (cachedAttempt.ok === undefined) {
                console.log("Using cached spotify token...");
                return res.send(cachedAttempt);
            }

            console.log("Attempt to use cached spotify token failed, refreshing");
        }

        spotifyToken = await showFinder.getSpotifyToken(userObj.Uid);

        if (spotifyToken.ok !== undefined && !spotifyToken.ok) {
            console.log(`Call to get spotify token failed with status ${spotifyToken.status}`);
            return res.status(spotifyToken.status).json(spotifyToken);
        }
        */
        
        // This token stuff is all borked right now. Ideally here we want to call our wrapper function that uses the user access token and refreshes and tries again if it fails.
        // Right now we assume it won't fail
        const spotifyToken = "Bearer " + req.userObj.SpotifyAccessToken;

        let playlists = await showFinder.getPlaylists(spotifyToken, req.userObj.SpotifyUsername);
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

        const spotifyToken = "Bearer " + req.userObj.SpotifyAccessToken;

        // if (spotifyToken.ok !== undefined && !spotifyToken.ok) {
        //     console.log(`Call to get spotify token failed with status ${spotifyToken.status}`);
        //     return res.status(spotifyToken.status).json(spotifyToken);
        // }

        // Special case if we're using their liked tracks, otherwise use the regular playlists endpoint
        let artists = [];
        if (parseInt(req.query.playlistId, 10) === constants.user_library_playlist_id) {
            artists = await showFinder.getLikedSongsArtists(spotifyToken);
        } else {
            artists = await showFinder.getArtists(spotifyToken, req.query.playlistId);
        }

        if (artists.ok !== undefined && !artists.ok) {
            console.log(`Call to get artists for playlist failed with status ${artists.status}`);
            return res.status(artists.status).json(artists);
        }

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

        let venueIds = req.body.venueIds;
        let tableName = "VenueLists";
        let userUidColumn = "UserUid";
        let venueIdsColumn = "VenueIds";
        let locationColumn = "Location";

        let upsertSql = `
        INSERT INTO VenueLists (UserUid, VenueIds, Location, SongsPerArtist, IncludeOpeners)
        VALUES (?, ?, ?, ?, ?);
        `;

        let upsert;
        try {
            upsert = await db.runAsync(upsertSql, [req.userUid, venueIds.join(","), req.body.location, req.body.songsPerArtist, req.body.includeOpeners]);
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

        // Can't pull userObj from req object here like we normally do since this is an unauthed endpoint to allow unsub from email
        let userObj = await db.getAsync(`SELECT * FROM Users WHERE Uid=?`, req.query.uid);
        if (userObj === undefined) {
            return res.status(404).send("User not found");
        }

        let tableName = "VenueLists";
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

        return res.sendFile("email-delete-success.html", { root: static_app_dir });
    });

    router.post("/show-finder/shows", async (req, res) => {
        /*
        refactor these back again when we support individual service querying for the api

        if (req.query.service) {
            console.log('Query param: ' + req.query.service);
            let request;
            switch (req.query.service.toLowerCase()) {
                case 'bandsintown':
                request = showFinder.getBandsInTownShows(req.body.selectedArtists);
                break;
                case 'songkick':
                request = await showFinder.getSongkickShows(req.body.selectedArtists);
                break;
            }

            let response = await request;
            if (response.statusCode) {
                console.log(`Call to get shows from service ${req.query.service} failed with status ${spotifyToken.statusCode}`);
                return res.status(response.statusCode)
                    .json(response);
            }

            return res.json(response);
        }
        */
        if (req.body.selectedVenues) {
            let showsByDate = await venueShowSearch.getShowsForVenues(req.body.selectedVenues);
            if (showsByDate.ok !== undefined && !showsByDate.ok) {
                console.log(`Call to get shows for selected venues failed with status ${showsByDate.status}`);
                return res.status(showsByDate.status).json(showsByDate);
            }

            return res.json(showsByDate);
        }

        // No query param, need to group artist by id to be
        // able to bundle and serve consolidated response
        let i = 0;
        let artists = req.body.selectedArtists.map(x => ({ id: i++, name: x }));
        let allServicesResponse = await showFinder.getAllShows(artists, req.body.location);
        if (allServicesResponse.statusCode) {
            console.log(`Call to get shows for all artists failed with status ${allServicesResponse.statusCode}`);
            return res.status(allServicesResponse.statusCode).json(allServicesResponse);
        }

        let mappedArtistsToShows = Object.keys(allServicesResponse)
            .filter(x => artists.find(y => y.id === parseInt(x)) !== undefined)
            .map(x => ({
                artistName: decodeURIComponent(artists.find(y => y.id === parseInt(x)).name).toString(),
                shows: allServicesResponse[x]
            }));

        console.log(`Successfully fetched and bundled shows for ${Object.keys(mappedArtistsToShows).length} total artists`);
        res.json(mappedArtistsToShows);
    });

    router.get("/show-finder/user-venues", async (req, res) => {
        // Support querying for a specific location for this user if they have multiple
        // Allows us to keep populating their different venue lists as they switch locations
        let venueListObj = null;
        if (req.query.location) {
            venueListObj = await db.getAsync(`SELECT VenueIds, Location, SongsPerArtist, IncludeOpeners FROM VenueLists WHERE UserUid=? AND Location=?`, [
                req.userUid,
                req.query.location
            ]);
        } else {
            venueListObj = await db.getAsync(`SELECT VenueIds, Location, SongsPerArtist, IncludeOpeners FROM VenueLists WHERE UserUid=?`, [req.userUid]);
        }

        if (venueListObj === undefined) {
            return res.json({});
        }

        res.json(venueListObj);
    });

    return router;
}

module.exports = setRoutes;
