import bodyParser from "body-parser";
import express from "express";
import fs from "fs";
import https from "https";
import morgan from "morgan";
import path from "path";
import sqlite = require("sqlite3");
import {v4 as uuid} from "uuid";
import cookieParser from "cookie-parser";

import * as authHandler from "./routes/auth-handler";
import * as constants   from "./helpers/constants";
import * as dbHelpers   from "./helpers/db-helpers";
import * as pageRouter  from "./routes/pages";
import * as apiRouter   from "./routes/api";

const app  = express();
const port = process.env.DEPLOY_STAGE === "PROD" ? 8443 : 443;

let db = dbHelpers.openDb("user_venues.db");

// Logging setup
fs.mkdir("logs", err => {
    if (err && err.code != "EEXIST") {
        throw err;
    }
});
let requestLogStream = fs.createWriteStream(path.join(__dirname, "..", "logs", "requests.log"), {flags : "a"});
app.use(morgan(
    '[:date[clf]] - ":method :url" | Remote addr - :remote-addr | Status - :status | Response length/time - :res[content-length] bytes/:response-time ms | User-Agent - :user-agent',
    {stream : requestLogStream}));

app.use(bodyParser.json());
app.use(cookieParser());

let baseStaticDir = "";
if (process.env.DEPLOY_STAGE === "PROD") {
    baseStaticDir = path.join(__dirname, "..", "client", "build");
} else {
    // webpack dev server
    baseStaticDir = path.join(__dirname, "..", "client", "devBuild");
}

const staticPath = path.join(baseStaticDir, "static");
const img        = path.join(staticPath, "img");

let static_app_dirs = [ baseStaticDir, staticPath, img ];
console.log(`Routing to static files in ${static_app_dirs}...`);

for (const dir of static_app_dirs) {
    app.use(express.static(dir));
}

// Route everything through the session management function
app.use((req, res, next) => authHandler.session(db, req, res, next));

const routerDependencies = {
    db,
    baseStaticDir
};

app.use(apiRouter.setRoutes(routerDependencies));
app.use(pageRouter.setRoutes(routerDependencies));

// HTTPS certs
var creds = {};
if (process.env.DEPLOY_STAGE === "PROD") {
    if (!process.env.PROD_SSL_KEY_PATH || !process.env.PROD_SSL_CERT_PATH || !process.env.PROD_SSL_CA_CERT_PATH) {
        console.log("SSL cert env variables not set. Source the setup_env.sh script");
        process.exit(1);
    }

    if (process.env.GENERATE_SOURCEMAP || process.env.GENERATE_SOURCEMAP === undefined || !process.env.NODE_OPTIONS) {
        console.log(
            "Must set env vars GENERATE_SOURCEMAP=false and NODE_OPTIONS=--max-old-space-size=4096 to compile on small droplet!");
        process.exit(1);
    }

    var key  = fs.readFileSync(process.env.PROD_SSL_KEY_PATH, "utf-8");
    var cert = fs.readFileSync(process.env.PROD_SSL_CERT_PATH, "utf-8");
    var ca   = fs.readFileSync(process.env.PROD_SSL_CA_CERT_PATH, "utf-8");
    creds    = {key : key, cert : cert, ca : ca};
} else {
    if (process.env.GENERATE_SOURCEMAP !== "false" || process.env.GENERATE_SOURCEMAP === undefined ||
        !process.env.NODE_OPTIONS) {
        console.log(
            "Must set env vars GENERATE_SOURCEMAP=false and NODE_OPTIONS=--max-old-space-size=4096 to compile on small droplet!");
        process.exit(1);
    }
    console.log("Running server locally using local self-signed cert");
    var key  = fs.readFileSync(__dirname + "/../showfinder-selfsigned-key.pem", "utf-8");
    var cert = fs.readFileSync(__dirname + "/../showfinder-selfsigned-cert.pem", "utf-8");
    creds    = {key : key, cert : cert};
}

var httpsServer = https.createServer(creds, app);

httpsServer.on("error", e => console.error(e));

if (process.env.DEPLOY_STAGE === "PROD") {
    httpsServer.listen(port, () => console.log(`https listening on ${port}...`));
} else {
    httpsServer.listen(port, () => console.log(`https listening on ${port}...`));
}
