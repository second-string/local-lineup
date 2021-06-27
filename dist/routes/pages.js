var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const path = require("path");
const express = require("express");
const router = express.Router();
const authHandler = require("./auth-handler");
function setRoutes(routerDependencies) {
    const db = routerDependencies.db;
    const baseStaticDir = routerDependencies.baseStaticDir;
    // auth-centric routes
    router.get("/login", (req, res) => authHandler.login(req, res));
    router.get("/spotify-auth", (req, res) => __awaiter(this, void 0, void 0, function* () { return authHandler.spotifyLoginCallback(db, req, res); }));
    router.get("/show-finder/spotify-search", (req, res) => res.sendFile("spotify-search.html", { root: baseStaticDir }));
    router.get("/show-finder/venue-search", (req, res) => res.sendFile("venue-search.html", { root: baseStaticDir }));
    return router;
}
module.exports = setRoutes;
