const express      = require("express");
const http         = require("http");
const https        = require("https");
const morgan       = require("morgan");
const path         = require("path");
const fs           = require("fs");
const bodyParser   = require("body-parser");
const sqlite       = require("sqlite3");
const uuid         = require("uuid/v4");
const cookieParser = require("cookie-parser");

const authHandler = require("./routes/auth-handler");
const constants   = require("./helpers/constants");
const dbHelpers   = require("./helpers/db-helpers");
const pageRouter  = require("./routes/pages");
const apiRouter   = require("./routes/api");

const app  = express();
const port = process.env.DEPLOY_STAGE === "PROD" ? 8443 : 443;

let db = dbHelpers.openDb("user_venues.db");

// Logging setup
fs.mkdir("logs", err => {
    if (err && err.code != "EEXIST") {
        throw err;
    }
});
let requestLogStream = fs.createWriteStream(path.join(__dirname, "logs", "requests.log"), {flags : "a"});
app.use(morgan(
    '[:date[clf]] - ":method :url" | Remote addr - :remote-addr | Status - :status | Response length/time - :res[content-length] bytes/:response-time ms | User-Agent - :user-agent',
    {stream : requestLogStream}));

app.use(bodyParser.json());
app.use(cookieParser());

let baseStaticDir = "";
if (process.env.DEPLOY_STAGE === "PROD") {
    baseStaticDir = path.join(__dirname, "client/build");
} else {
    // webpack dev server
    baseStaticDir = path.join(__dirname, "client/devBuild");
}

const static = path.join(baseStaticDir, "static");
const img    = path.join(static, "img");

let static_app_dirs = [ baseStaticDir, static, img ];
console.log(`Routing to static files in ${static_app_dirs}...`);

for (const dir of static_app_dirs) {
    app.use(express.static(dir));
}

// Route everything through the auth function
app.use((req, res, next) => authHandler.authenticate(db, req, res, next));

const routerDependencies = {
    db,
    baseStaticDir
};
app.use(apiRouter(routerDependencies));
app.use(pageRouter(routerDependencies));

// Forward any http to https (might be irrelevant with the nginx reverse proxy)
app.use((req, res, next) => {
    // https://expressjs.com/en/api.html#req.secure
    if (req.headers["x-forwarded-proto"] === "http" || !req.secure) {
        let path =
            req.route === undefined ? "" : req.route.path;  // https redirection working, but not the rebuild of the url
        return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    }

    return next();
});

// HTTPS certs
var creds = {};
if (process.env.DEPLOY_STAGE === "PROD") {
    if (!process.env.PROD_SSL_KEY_PATH || !process.env.PROD_SSL_CERT_PATH || !process.env.PROD_SSL_CA_CERT_PATH) {
        console.log("SSL cert env variables not set. Run the setup_env.sh script");
        process.exit(1);
    }

    var key  = fs.readFileSync(process.env.PROD_SSL_KEY_PATH);
    var cert = fs.readFileSync(process.env.PROD_SSL_CERT_PATH);
    var ca   = fs.readFileSync(process.env.PROD_SSL_CA_CERT_PATH);
    creds    = {key : key, cert : cert, ca : ca};
} else {
    console.log("Running server locally using local self-signed cert");
    var key  = fs.readFileSync(__dirname + "/showfinder-selfsigned-key.pem", "utf-8");
    var cert = fs.readFileSync(__dirname + "/showfinder-selfsigned-cert.pem", "utf-8");
    creds    = {key : key, cert : cert};
}

var httpServer  = http.createServer(app);
var httpsServer = https.createServer(creds, app);

httpServer.on("error", e => console.log(e));
httpsServer.on("error", e => console.log(e));

if (process.env.DEPLOY_STAGE === "PROD") {
    httpServer.listen(8080);
    httpsServer.listen(port, () => console.log(`http redirecting from 8080 to 8443, https listening on ${port}...`));
} else {
    httpServer.listen(80);
    httpsServer.listen(port, () => console.log(`http redirecting from 80 to 443, https listening on ${port}...`));
}
