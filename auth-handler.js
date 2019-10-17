const crypto = require('crypto');
const express = require('express');
const sqlite = require('sqlite3');
const uuid = require('uuid/v4');

// interface HashInfo {
//     hash: string;
//     salt: string;
//     iterations: number;
// }

// const loggedOutPaths: string[] = [
//     "/pari/login",
//     "/v0/login",
//     "/pari/register",
//     "/v0/register",
//     "/pari"
// ];

async function authenticate(userDb, req, res, next) {
    console.log(req.path);
    if (req.path === "/" || req.path.startsWith("/static") || req.path === "/login" || req.path === "/spotify-auth") {
        return next();
    }

    // const loggedOutPath = loggedOutPaths.indexOf(req.path) > 0;

    // if ((!req.cookies || !req.cookies.token) && !loggedOutPath) {
    if (!req.cookies || !req.cookies.token) {
        return res.status(401).redirect("/");
    }

    // TODO :: sanitize?
    const reqToken = req.cookies.token;
    const tokenObj = await userDb.getAsync(`SELECT CurrentToken FROM Users WHERE CurrentToken=?`, [reqToken]);

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
    // return tokenObj === undefined || tokenObj.CurrentToken !== reqToken ? res.status(403).redirect("/pari") : next();
}

// async function login(userDb, req, res, next) {
//     const { email, password } = req.body;
//     const userAndHashInfo = await userDb.getAsync(`SELECT Uid, Hash, Salt, Iterations FROM Users WHERE Email=?`, [email]);

//     if (!userAndHashInfo) {
//         console.log(`No user found for email '${email}'`);
//         return res.status(401).send("User not found");
//     }

//     const attemptHashInfo = await getHashInfo(password, userAndHashInfo.Salt, userAndHashInfo.Iterations);
//     if (attemptHashInfo.hash !== userAndHashInfo.Hash) {
//         return res.status(403).send("Incorrect login details");
//     }

//     // Give them a new token regardless since re-login should refresh session
//     const token = await new Promise((resolve, reject) => crypto.randomBytes(32, (err, buf) => errOrResolveObject(resolve, reject, err, buf.toString("hex"))));
//     await userDb.runAsync(`UPDATE Users SET CurrentToken=? WHERE Uid=?`, [token, userAndHashInfo.Uid]);

//     return res.cookie("token", token, { maxAge: 1000 * 60 * 60 /* 1 hr */ }).redirect(301, "/pari/bets");
// }

// export async function register(userDb, req, res, next) {
//     const { email, password } = req.body;
//     const hashInfo = await getHashInfo(password);

//     const user = await userDb.getAsync(`SELECT * FROM Users WHERE Email=?`, [email]);

//     if (user) {
//         return res.status(400).send("User already exists");
//     }

//     try {
//         await userDb.runAsync(`INSERT INTO Users (Uid, Email, Hash, Salt, Iterations) VALUES (?, ?, ?, ?, ?)`, [uuid(), email, hashInfo.hash, hashInfo.salt, hashInfo.iterations]);
//     } catch (e) {
//         console.log(e);
//         return res.status(503).send("Failed to register user, try again");
//     }

//     return await login(userDb, req, res, next);
// }

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
