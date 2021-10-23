import express from "express";
import path from "path";

const router = express.Router();

import * as authHandler from "./auth-handler";

export function setRoutes(routerDependencies) {
    const db            = routerDependencies.db;
    const baseStaticDir = routerDependencies.baseStaticDir;

    // auth-centric routes
    router.get("/login", (req, res) => authHandler.login(req, res));
    router.get("/spotify-auth", async (req, res) => authHandler.spotifyLoginCallback(db, req, res));

    router.get("/local-lineup/shows-by-artist",
               (req, res) => res.sendFile("shows-by-artist.html", {root : baseStaticDir}));
    router.get("/local-lineup/shows-by-venue",
               (req, res) => res.sendFile("shows-by-venue.html", {root : baseStaticDir}));

    return router;
}
