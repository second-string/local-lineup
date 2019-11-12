const crypto = require('crypto');
const express = require('express');
const sqlite = require('sqlite3');
const uuid = require('uuid/v4');

const loggedOutPaths = [
    "/",
    "/login",
    "/spotify-auth",
    "/token-auth"
];

async function authenticate(userDb, req, res, next) {
    if (loggedOutPaths.filter(x => req.path === x).length > 0 || req.path.startsWith("/static")) {
        return next();
    }

    if (!req.cookies || !req.cookies['show-finder-token']) {
        return res.redirect(401, "/");
    }

    // TODO :: sanitize?
    // TODO :: index on this token
    const reqToken = req.cookies['show-finder-token'];
    const tokenObj = await userDb.getAsync(`SELECT SessionToken FROM Users WHERE SessionToken=?`, [reqToken]);

    // TODO :: LOGIC ISN"T WORKING
    // TODO :: this logic really needs to be looked into, the second check of this OR is totally redundant
    // woof this is beat and needs to be handled better badly
    // if (loggedOutPath) {
    //     if (tokenObj === undefined) {
    //         return next();
    //     } else {
    //         return res.redirect(301, "/pari/bets");
    //     }
    // } else {
    //     if (tokenObj === undefined) {
    //         return res.status(403).redirect("/pari");
    //     } else {
    //         return next();
    //     }
    // }

    if (tokenObj === undefined) {
        return res.status(403).redirect("/");
    }

    return next();
    // return tokenObj === undefined || tokenObj.CurrentToken !== reqToken ? res.status(403).redirect("/pari") : next();
}

async function logout(userDb, req, res, next) {
    // Make the assumption since it passed auth
    const reqToken = req.cookies.token;

    try {
        await userDb.runAsync(`UPDATE Users SET CurrentToken='' WHERE CurrentToken=?`, [reqToken]);
    } catch (e) {
        console.log(e);
        res.status(500).send("Error try again");
    }

    res.cookie("token", "", { maxAge: 0 }).redirect(200, "/");
}

async function getHashInfo(password, salt, iterations) {
    return new Promise((resolve, reject) => {
        salt = salt || crypto.randomBytes(64).toString("hex");
        iterations = iterations || 10000;
        crypto.pbkdf2(password, salt, iterations, 64, "sha512", (err, derivedKey) => {
            if (err) {
                console.log(err);
                reject(err);
            }

            resolve({
                hash: derivedKey.toString("hex"),
                salt,
                iterations
            });
        });
    });
}

module.exports = {
    authenticate,
    logout
}
