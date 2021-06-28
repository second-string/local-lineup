const express      = require("express");
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
let requestLogStream = fs.createWriteStream(path.join(__dirname,  "..", "logs", "requests.log"), {flags : "a"});
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

app.use(apiRouter.setRoutes(routerDependencies));
app.use(pageRouter.setRoutes(routerDependencies));

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
