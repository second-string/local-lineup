const path = require("path");
const express = require("express");
const router = express.Router();

const authHandler = require("./auth-handler");

function setRoutes(routerDependencies) {
    const db = routerDependencies.db;
    const baseStaticDir = routerDependencies.baseStaticDir;

    // auth-centric routes
    router.get("/login", (req, res) => authHandler.login(req, res));
    router.get("/spotify-auth", async (req, res) => authHandler.spotifyLoginCallback(db, req, res));

    router.get("/show-finder/spotify-search", (req, res) => res.sendFile("spotify-search.html", { root: baseStaticDir }));
    router.get("/show-finder/venue-search", (req, res) => res.sendFile("venue-search.html", { root: baseStaticDir }));
    router.get("*", (req, res) => res.sendFile("index.html", { root: baseStaticDir }));

    return router;
}

module.exports = setRoutes;
