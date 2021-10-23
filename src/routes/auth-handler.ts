import crypto from "crypto";
import express from "express";
import jwt from "jsonwebtoken";
import querystring from "querystring";
import uuid from "uuid/v4";

import * as constants   from "../helpers/constants";
import * as helpers     from "../helpers/helpers";
import * as localLineup from "../local-lineup";

// API routes that require user to be logged in
const restrictedPaths = [
    "/local-lineup/playlists",
    "/local-lineup/artists",
    "/local-lineup/save-venues",
    "/local-lineup/user-venues",
];

export async function session(userDb, req, res, next) {
    let sessionToken: string = req.cookies["local-lineup-token"];
    let token                = null;
    if (sessionToken) {
        // If token cookie exists, try to parse it
        token = parseToken(sessionToken);
    }

    if (token === null) {
        // If no token exists this is most likely first page load for the user. We also might have failed token parsing
        // above either due to expired token or something going weirdly wrong. Whatever it is, create a new valid one
        token        = {userUid : null};
        sessionToken = jwt.sign(token, constants.jwtSigningSecret, {expiresIn : "3h"});
        res.cookie("local-lineup-token", sessionToken, {maxAge : 1000 * 60 * 60 * 3 /* 3hrs */});
    }

    // Regardless of existing or newly created, set on the req object so all remaining routes have access to it
    req.sessionToken = sessionToken;

    // Only try to go get user from DB if we're hitting a restricted api route that needs user info
    if (restrictedPaths.filter(x => req.path === x).length === 0 || req.path.startsWith("/static")) {
        return next();
    }

    // If this token has a user associated with it, save user obj in req object for potential use in requests rather
    // than doubling up on the users table lookup (most common use currently is grabbing user's spoot access token)
    const userObj: DbUser = await userDb.getAsync(`SELECT * FROM Users WHERE Uid=?`, [ token.userUid ]);
    if (userObj === undefined) {
        console.log(`Got no user obj from db from jwt decoded token ${token.userUid}, redirecting to /`);
        return res.redirect(403, "/");
    } else {
        req.userObj = userObj;
        return next();
    }
}

export async function login(req, res) {
    const rootHost    = process.env.DEPLOY_STAGE === "PROD" ? "locallineup.live" : "localhost";
    const redirectUri = `https://${rootHost}/spotify-auth`;

    // Include redirect path to return to correct location post-auth if necessary. If not included, will return home.
    let state = {redirect : "/"};
    if (req.query.redirect && (req.query.redirect == "/local-lineup/shows-by-artist" ||
                               req.query.redirect == "/local-lineup/shows-by-venue")) {
        state.redirect = req.query.redirect;
    }

    // Encode redirect info in state variable so we know where to return to when spotify calls auth callback
    const stateStr     = JSON.stringify(state);
    const stateEncoded = Buffer.from(stateStr).toString("base64");

    const scopes =
        "user-read-email user-library-read playlist-read-private playlist-modify-private playlist-modify-public";

    res.redirect("https://accounts.spotify.com/authorize?" + querystring.stringify({
        response_type : "code",
        client_id : constants.clientId,
        scope : scopes,
        redirect_uri : redirectUri,
        state : stateEncoded
    }));
}

export async function logout(req, res) {
    res.cookie("local-lineup-token", "", {maxAge : 0}).redirect("/");
}

// Function called from our react code to handle showing different page states for logged-in users. Only necessary
// for pages shown to non-logged-in users that you want to display differently for logged-in (i.e. hiding a login
// button)
export async function tokenAuth(db, req, res) {
    // Just 'token' key because it's what we're manually sending from inside our react code
    let reqToken = req.body.token;

    if (reqToken === undefined || reqToken === null) {
        return res.json({isLoggedIn : false});
    }

    const token = parseToken(reqToken);
    if (token === null) {
        return res.json({isLoggedIn : false});
    }

    let dbUser = await db.getAsync("SELECT * FROM Users WHERE Uid=?", [ token.userUid ]);

    // If user exists, send back logged in, if not, they somehow have a jwt-valid token with a user that doesn't
    // exist...?
    if (dbUser) {
        return res.json({isLoggedIn : true, email : dbUser.Email});
    } else {
        return res.json({isLoggedIn : false});
    }
}

// Redirect function passed to spotify.com's auth to handle getting the access/refresh tokens and storing them
export async function spotifyLoginCallback(db, req, res) {
    const token = parseToken(req.sessionToken);
    if (token === null) {
        return res.redirect(500, "/");
    }

    let code     = req.query.code;
    let stateStr = req.query.state;
    if (code === undefined && req.query.error) {
        console.error(`Error getting preliminary auth code from spoot: ${req.query.error}`)
        return res.status(500).send("Error authorizing with Spotify. Please return home and try again");
    } else if (code === undefined) {
        console.error("Shit is borked - no error nor code from spoot prelim auth")
        return res.status(500).send("Error authorizing with Spotify. Please return home and try again");
    }

    if (!stateStr) {
        console.error(`State is borked. Got no state. Returning user to home page`)
        return res.status(500).send("Error authorizing with Spotify. Please return home and try again");
    }

    const stateDecoded = Buffer.from(stateStr, "base64").toString("utf-8");
    let state          = {redirect : "/"};
    try {
        state = JSON.parse(stateDecoded);
    } catch {
        console.error(`Error parsing json state out of b64 decoded string. Decoded state string: ${stateDecoded}`);
        return res.status(500).send("Error authorizing with Spotify. Please return home and try again");
    }

    const rootHost  = process.env.DEPLOY_STAGE === "PROD" ? "locallineup.live" : "localhost";
    let postOptions = {
        method : "POST",
        body : {
            grant_type : "authorization_code",
            redirect_uri : `https://${rootHost}/spotify-auth`,  // Not used, just needs to match what we sent previously
            code : code
        },
        headers : {"Content-type" : "application/x-www-form-urlencoded", Authorization : helpers.spotifyAuth()}
    };

    console.log("Getting spotify access and refresh tokens ...");
    let {success, response} =
        await helpers.instrumentCall("https://accounts.spotify.com/api/token", postOptions, false);
    if (!success) {
        console.error(response);
        console.error("something went wrong with request for access/refresh spoot tokens");
        return res.status(500).send("Error authorizing with Spotify. Please return home and try again");
    }

    const access  = response.access_token;
    const refresh = response.refresh_token;

    console.log("Getting user email from spotify using access token...");
    let getOptions = {
        method : "GET",
        headers : {"Content-type" : "application/json", Authorization : "Bearer " + access}
    };

    ({success, response} = await helpers.instrumentCall("https://api.spotify.com/v1/me", getOptions, false));
    if (!success) {
        console.error(response);
        console.error("Error getting user account using access token");
        return res.status(500).send("Error authorizing with Spotify. Please return home and try again");
    }

    // Lookup email in DB to see if they have an account
    let userObj                 = await db.getAsync(`SELECT * FROM Users WHERE Email=?`, [ response.email ]);
    let                 userUid = null;
    if (userObj === undefined) {
        // New user, new uid
        userUid = uuid();
        console.log(`new user with email ${response.email}, giving them uid '${userUid}'`);
    } else {
        userUid = userObj.Uid;
        console.log(`existing user with uid '${userUid}'' and email ${response.email}`);
    }

    await db.runAsync(
        "INSERT OR REPLACE INTO Users(Uid, Email, SpotifyUsername, FullName, SpotifyAccessToken, SpotifyRefreshToken) VALUES (?, ?, ?, ?, ?, ?)",
        [ userUid, response.email, response.id, response.display_name, access, refresh ]);

    updateUnparsedTokenField(req.sessionToken, "userUid", userUid, res);
    res.redirect(state.redirect ? state.redirect : "/");
}

async function getHashInfo(password, salt, iterations) {
    return new Promise((resolve, reject) => {
        salt       = salt || crypto.randomBytes(64).toString("hex");
        iterations = iterations || 10000;
        crypto.pbkdf2(password, salt, iterations, 64, "sha512", (err, derivedKey) => {
            if (err) {
                console.log(err);
                reject(err);
            }

            resolve({hash : derivedKey.toString("hex"), salt, iterations});
        });
    });
}

export function parseToken(tokenStr) {
    let token = null;
    try {
        token = jwt.verify(tokenStr, constants.jwtSigningSecret);
    } catch (e) {
        if (!(e instanceof jwt.TokenExpiredError)) {
            console.log("Error decoding JWT!");
            console.log("req.sessionToken:");
            console.log(tokenStr ? tokenStr : "undefined or null");
            console.log("Exception:");
            console.log(e);
        }
    }

    return token;
}

// For use when caller only has unparsed token and doesn't need to see inside
export function updateUnparsedTokenField(sessionToken, field, value, res) {
    const parsedToken = parseToken(sessionToken);
    return updateTokenField(parsedToken, field, value, res);
}

// For use when caller has already parsed token b/c new token depends on value(s) in previous token
export function updateTokenField(parsedToken, field, value, res) {
    parsedToken[field] = value;
    delete parsedToken.exp;
    const signedToken = jwt.sign(parsedToken, constants.jwtSigningSecret, {expiresIn : "3h"});
    res.cookie("local-lineup-token", signedToken, {maxAge : 1000 * 60 * 60 * 3 /* 3hrs */});
}
