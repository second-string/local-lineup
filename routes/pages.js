const path = require("path");
const express = require("express");
const router = express.Router();

const authHandler = require("./auth-handler");

function setRoutes(routerDependencies) {
    const db = routerDependencies.db;

    // auth-centric routes
    router.get("/login", (req, res) => authHandler.login(req, res));
    router.get("/spotify-auth", async (req, res) => authHandler.spotifyLoginCallback(db, req, res));

    // No static file routing for dev env because the react webpack server will handle it for us
    let static_app_dir = "";
    if (process.env.DEPLOY_STAGE === "PROD") {
        static_app_dir = path.join(path.resolve(__dirname, ".."), "client/build");
    } else {
        //webpack dev server
        static_app_dir = path.join(path.resolve(__dirname, ".."), "client/devBuild");
    }

    console.log(`Routing to static files in ${static_app_dir}...`);

    router.use(express.static(static_app_dir));
    router.get("/show-finder/spotify-search", (req, res) => res.sendFile("spotify-search.html", { root: static_app_dir }));
    router.get("/show-finder/venue-search", (req, res) => res.sendFile("venue-search.html", { root: static_app_dir }));
    router.get("*", (req, res) => res.sendFile("index.html", { root: static_app_dir }));

    return router;
}

module.exports = setRoutes;
