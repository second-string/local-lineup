const crypto      = require("crypto");
const express     = require("express");
const sqlite      = require("sqlite3");
const uuid        = require("uuid/v4");
const jwt         = require("jsonwebtoken");
const querystring = require("querystring");

const constants  = require("../helpers/constants");
const showFinder = require("../show-finder");
const helpers    = require("../helpers/helpers");

const loggedOutPaths = [ "/", "/login", "/spotify-auth", "/token-auth", "/show-finder/delete-venues" ];

async function authenticate(userDb, req, res, next) {
    if (loggedOutPaths.filter(x => req.path === x).length > 0 || req.path.startsWith("/static")) {
        return next();
    }

    if (!req.cookies || !req.cookies["show-finder-token"]) {
        return res.redirect(401, "/");
    }

    const reqToken = req.cookies["show-finder-token"];
    let token      = null;
    try {
        token = jwt.verify(reqToken, constants.jwtSigningSecret);
    } catch (e) {
        console.log("Error decoding JWT!");
        console.log("req.cookies.token:");
        console.log(reqToken);
        console.log("Exception:");
        console.log(e);

        return res.redirect(401, "/");
    }

    const userObj = await userDb.getAsync(`SELECT * FROM Users WHERE Uid=?`, [ token.userUid ]);

    if (userObj === undefined) {
        console.log(`Got no user obj from db from jwt decoded token ${token.userUid}, redirecting to /`);
        return res.redirect(403, "/");
    } else {
        // Save user obj in req object for potential use in requests rather than doubling up on the users table lookup
        // (most common use currently is grabbing user's spoot access token)
        req.userObj = userObj;
        return next();
    }
}

async function login(req, res) {
    const rootHost    = process.env.DEPLOY_STAGE === "PROD" ? "showfinder.brianteam.dev" : "localhost";
    const redirectUri = `https://${rootHost}/spotify-auth`;
    const scopes      = "user-read-email user-library-read playlist-read-private playlist-modify-private";

    res.redirect("https://accounts.spotify.com/authorize?" + querystring.stringify({
        response_type : "code",
        client_id : constants.clientId,
        scope : scopes,
        redirect_uri : redirectUri,
        state : "test_state_token"
    }));
}

async function logout(req, res) {
    res.cookie("show-finder-token", "", {maxAge : 0}).redirect("/");
}

// Function called from our react code to handle showing different page states for logged-in users. Only necessary
// for pages shown to non-logged-in users that you want to display differently for logged-in (i.e. hiding a login
// button)
async function tokenAuth(db, req, res) {
    // Just 'token' key because it's what we're manually sending from inside our react homepage
    let reqToken = req.body.token;

    if (reqToken === undefined || reqToken === null) {
        return res.json({isLoggedIn : false});
    }

    let token = null;
    try {
        token = jwt.verify(reqToken, constants.jwtSigningSecret);
    } catch (e) {
        console.log("Error decoding JWT!");
        console.log("req.cookies.token:");
        console.log(reqToken);
        console.log("Exception:");
        console.log(e);

        return res.json({isLoggedIn : false});
    }

    let dbUser = await db.getAsync("SELECT * FROM Users WHERE Uid=?", [ token.userUid ]);

    // If user exists, send back logged in, if not, they somehow have a jwt-valid token with a user that doesn't
    // exist...?
    if (dbUser) {
        return res.json({isLoggedIn : true});
    } else {
        return res.json({isLoggedIn : false});
    }
}

// Redirect function passed to spotify.com's auth to handle getting the access/refresh tokens and storing them
async function spotifyLoginCallback(db, req, res) {
    let code  = req.query.code;
    let state = req.query.state;
    if (code === undefined && req.query.error) {
        throw new Error(`Error getting preliminary auth code from spoot: ${req.query.error}`);
    } else if (code === undefined) {
        throw new Error("Shit is borked - no error nor code from spoot prelim auth");
    }

    if (state !== "test_state_token") {
        throw new Error(`State is borked. Looking for '${"test_state_token"}' got '${state}'`);
    }

    const rootHost  = process.env.DEPLOY_STAGE === "PROD" ? "showfinder.brianteam.dev" : "localhost";
    let postOptions = {
        method : "POST",
        body : {
            grant_type : "authorization_code",
            redirect_uri :
                `https://${rootHost}/spotify-auth`,  // Doesn't matter, just needs to match what we sent previously
            code : code
        },
        headers : {"Content-type" : "application/x-www-form-urlencoded", Authorization : helpers.spotifyAuth()}
    };

    console.log("Getting spotify access and refresh tokens ...");
    let {success, response} =
        await helpers.instrumentCall("https://accounts.spotify.com/api/token", postOptions, false);
    if (!success) {
        console.error(response);
        throw new Error(`something went wrong with request for access/refresh spoot tokens`);
    }

    const access  = response.access_token;
    const refresh = response.refresh_token;

    console.log("Getting user email from spotify using access token...");
    let getOptions = {
        method : "GET",
        headers : {"Content-type" : "application/json", Authorization : "Bearer " + access}
    };

    ({success, response} = await helpers.instrumentCall("https://api.spotify.com/v1/me", getOptions));
    if (!success) {
        console.error(response);
        throw new Error("Error getting user account using access token");
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

    let signedToken = jwt.sign({userUid : userUid}, constants.jwtSigningSecret, {expiresIn : "1h"});
    res.cookie("show-finder-token", signedToken, {maxAge : 1000 * 60 * 60 /* 1hr */}).redirect("/");
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

module.exports = {
    authenticate,
    login,
    logout,
    tokenAuth,
    spotifyLoginCallback
};
