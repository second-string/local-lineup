var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const express = require("express");
const router = express.Router();
const authHandler = require("./auth-handler");
const showFinder = require("../show-finder");
const venueShowSearch = require("../venue-show-finder");
const dbHelpers = require("../helpers/db-helpers");
const constants = require("../helpers/constants");
const helpers = require("../helpers/helpers");
const spotifyHelper = require("../helpers/spotify-helper");
// import * as spotifyHelper from "../helpers/spotify-helper";
function setRoutes(routerDependencies) {
    const db = routerDependencies.db;
    router.post("/logout", (req, res) => authHandler.logout(req, res));
    router.post("/token-auth", (req, res) => __awaiter(this, void 0, void 0, function* () { return authHandler.tokenAuth(db, req, res); }));
    router.post("/show-finder/playlists", (req, res) => __awaiter(this, void 0, void 0, function* () {
        const spotifyToken = req.userObj.SpotifyAccessToken;
        let playlists = yield showFinder.getPlaylists(spotifyToken, req.userObj.SpotifyUsername, req.userObj.Uid);
        // let playlists      = await spotifyHelper.getPlaylists(spotifyToken, req.userObj.SpotifyUsername, req.userObj.Uid);
        if (playlists.ok !== undefined && !playlists.ok) {
            console.log(`Call to get users playlists failed with status ${playlists.status}`);
            return res.status(playlists.status).json(playlists);
        }
        res.send(playlists);
    }));
    router.get("/show-finder/artists", (req, res) => __awaiter(this, void 0, void 0, function* () {
        if (!req.query.playlistId) {
            return res.status(400).send("Did not include playlistId query param in request to '/show-finder/artists/");
        }
        const spotifyToken = req.userObj.SpotifyAccessToken;
        // Special case if we're using their liked tracks, otherwise use the regular playlists endpoint
        let artists = [];
        if (parseInt(req.query.playlistId, 10) === constants.user_library_playlist_id) {
            artists = yield showFinder.getLikedSongsArtists(spotifyToken, req.userObj.Uid);
        }
        else {
            artists = yield showFinder.getArtists(spotifyToken, req.query.playlistId, req.userObj.Uid);
        }
        if (artists.ok !== undefined && !artists.ok) {
            console.log(`Call to get artists for playlist failed with status ${artists.status}`);
            return res.status(artists.status).json(artists);
        }
        res.json(artists);
    }));
    router.get("/show-finder/venues", (req, res) => __awaiter(this, void 0, void 0, function* () {
        if (req.query.city === undefined) {
            res.status(400).send();
        }
        let venues = yield venueShowSearch.getVenues(req.query.city, db);
        if (venues.ok !== undefined && !venues.ok) {
            console.log(`Call to get venues for ${req.query.city} failed with status ${venues.status}`);
            return res.status(venues.status).json(venues);
        }
        res.json(venues);
    }));
    router.post("/show-finder/save-venues", (req, res) => __awaiter(this, void 0, void 0, function* () {
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
            upsert = yield db.runAsync(upsertSql, [
                req.userUid,
                venueIds.join(","),
                req.body.location,
                req.body.songsPerArtist,
                req.body.includeOpeners
            ]);
        }
        catch (e) {
            console.log(e);
            return res.status(500);
        }
        return res.status(204).send();
    }));
    // TODO :: BT unsub success screen
    router.get("/show-finder/delete-venues", (req, res) => __awaiter(this, void 0, void 0, function* () {
        if (req.query.uid === undefined) {
            console.log("Did not receive any user uid for venue-deletion in the query param");
            return res.status(400);
        }
        // Can't pull userObj from req object here like we normally do since this is an unauthed endpoint to allow unsub
        // from email
        let userObj = yield db.getAsync(`SELECT * FROM Users WHERE Uid=?`, req.query.uid);
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
            deleteOp = yield db.runAsync(deleteSql);
        }
        catch (e) {
            console.log(e);
            return res.status(500).send("Error unsubscribing user");
        }
        return res.sendFile("email-delete-success.html", { root: static_app_dir });
    }));
    router.post("/show-finder/shows", (req, res) => __awaiter(this, void 0, void 0, function* () {
        if (req.body.selectedVenues) {
            // Error handled internally, lists will just be empty if there was failure
            const showDatesByService = yield venueShowSearch.getShowsForVenues(req.body.selectedVenues);
            return res.json(showDatesByService);
        }
        else if (req.body.selectedArtists) {
            // No venues specified, get all shows for all artists supplied in body
            // Need to group artist by arbitrary id to be able to bundle and serve consolidated response
            let i = 0;
            let artists = req.body.selectedArtists.map(x => ({ id: i++, name: x }));
            let allServicesResponse = yield showFinder.getAllShows(artists, req.body.location);
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
        }
        else {
            return res.status(400).json("Missing required body params");
        }
    }));
    router.get("/show-finder/user-venues", (req, res) => __awaiter(this, void 0, void 0, function* () {
        // Support querying for a specific location for this user if they have multiple
        // Allows us to keep populating their different venue lists as they switch locations
        let venueListObj = null;
        if (req.query.location) {
            venueListObj = yield db.getAsync(`SELECT VenueIds, Location, SongsPerArtist, IncludeOpeners FROM VenueLists WHERE UserUid=? AND Location=?`, [req.userUid, req.query.location]);
        }
        else {
            venueListObj = yield db.getAsync(`SELECT VenueIds, Location, SongsPerArtist, IncludeOpeners FROM VenueLists WHERE UserUid=?`, [req.userUid]);
        }
        if (venueListObj === undefined) {
            return res.json({});
        }
        res.json(venueListObj);
    }));
    return router;
}
module.exports = setRoutes;
