const express = require('express');
const http = require('http');
const https = require('https');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const showFinder = require('./show-finder');
const venueShowSearch = require('./venue-show-finder');

const app = express();
const port = parseInt(process.env.PORT, 10) || process.env.DEPLOY_STAGE === 'PROD' ? 8443 : 443;

// Poor man's in-mem cache
var spotifyToken;

// Logging setup
fs.mkdir('logs', err => {
	if (err && err.code != 'EEXIST') {
		throw(err);
	}
});
let requestLogStream = fs.createWriteStream(path.join(__dirname, 'logs', 'requests.log'), { flags: 'a' });
app.use(morgan('[:date[clf]] - ":method :url" | Remote addr - :remote-addr | Status - :status | Response length/time - :res[content-length] bytes/:response-time ms | User-Agent - :user-agent', { stream: requestLogStream }));

app.use(bodyParser.json());

app.post('/show-finder/playlists', async (req, res) => {
	// If we have a token cached, give it a shot to see if it's still valid
	if (spotifyToken) {
		let cachedAttempt = await showFinder.getPlaylists(spotifyToken, process.env.DEPLOY_STAGE === 'PROD' ? req.body.username : 'bteamer');

		// If we have no status, that means we got our playlist json object back (success). If we have a code,
		// instrumentCall returned our full failed response to us, so refresh the token and continue.
		if (cachedAttempt.ok === undefined) {
			console.log('Using cached spotify token...')
			return res.send(cachedAttempt);
		}

		console.log('Attempt to use cached spotify token failed, refreshing');
	}

	spotifyToken = await showFinder.getSpotifyToken();

	if (spotifyToken.ok !== undefined && !spotifyToken.ok) {
		console.log(`Call to get spotify token failed with status ${spotifyToken.status}`);
		return res.status(spotifyToken.status)
			.json(spotifyToken);
	}

	let playlists = await showFinder.getPlaylists(spotifyToken, process.env.DEPLOY_STAGE === 'PROD' ? req.body.username : 'bteamer');
	if (plalists.ok !== undefined && !playlists.ok) {
		console.log(`Call to get users playlists failed with status ${playlists.status}`);
		return res.status(playlists.status)
			.json(playlists);
	}

	res.send(playlists);
});

app.get('/show-finder/artists', async (req, res) => {
	let artists = await showFinder.getArtists(spotifyToken, req.query.playlistId);
	if (artists.ok !== undefined && !artists.ok) {
		console.log(`Call to get artists for playlist failed with status ${artists.status}`);
		return res.status(artists.status)
			.json(artists);
	}

	res.json(artists);
});

app.get('/show-finder/venues', async (req, res) => {
	let venues = await venueShowSearch.getVenues(req.query.city);
	if (venues.ok !== undefined && !venues.ok) {
		console.log(`Call to get venues for ${req.query.city} failed with status ${venues.status}`);
		return res.status(venues.status)
			.json(venues);
	}

	res.json(venues);
});

app.post('/show-finder/shows', async (req, res) => {
	/*
	refactor these back again when we support individual service querying for the api

	if (req.query.service) {
		console.log('Query param: ' + req.query.service);
		let request;
		switch (req.query.service.toLowerCase()) {
			case 'bandsintown':
			request = showFinder.getBandsInTownShows(req.body.selectedArtists);
			break;
			case 'songkick':
			request = await showFinder.getSongkickShows(req.body.selectedArtists);
			break;
		}

		let response = await request;
		if (response.statusCode) {
			console.log(`Call to get shows from service ${req.query.service} failed with status ${spotifyToken.statusCode}`);
			return res.status(response.statusCode)
				.json(response);
		}

		return res.json(response);
	}
	*/

	// No query param, need to group artist by id to be
	// able to bundle and serve consolidated response
	let i = 0;
	let artists = req.body.selectedArtists.map(x => ({ id: i++, name: x }));
	let allServicesResponse = await showFinder.getAllShows(artists, req.body.location);
	if (allServicesResponse.statusCode) {
		console.log(`Call to get shows for all artists failed with status ${allServicesResponse.statusCode}`);
		return res.status(allServicesResponse.statusCode)
			.json(allServicesResponse);
	}

	let mappedArtistsToShows = Object.keys(allServicesResponse)
		.filter(x => artists.find(y => y.id === parseInt(x)) !== undefined)
		.map(x => ({
			artistName: decodeURIComponent(artists.find(y => y.id === parseInt(x)).name).toString(),
			shows: allServicesResponse[x]
		}));

	console.log(`Successfully fetched and bundled shows for ${Object.keys(mappedArtistsToShows).length} total artists`);
	res.json(mappedArtistsToShows);
});

app.use((req, res, next) => {
	// https://expressjs.com/en/api.html#req.secure
	if (req.headers['x-forwarded-proto'] === 'http' || !req.secure) {
		let path = req.route === undefined ? '' : req.route.path;	// https redirection working, but not the rebuild of the url
		console.log('!!!!!!!!!!!!! FORWARDING HTTP TO HTTPS !!!!!!!!!!!!!');
		console.log(req.originalUrl);
		return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`)
	}

	return next();
});

// No static file routing for dev env because the react webpack server will handle it for us
let static_app_dir = '';
if (process.env.DEPLOY_STAGE === 'PROD') {
	static_app_dir = path.join(__dirname, 'client/build');
	console.log(`Routing to static files in ${static_app_dir}...`);
} else {
	//webpack dev server
	static_app_dir = path.join(__dirname, 'client/devBuild')
}

app.use(express.static(static_app_dir));
app.get('/show-finder/spotify-search', (req, res) => res.sendFile('spotify-search.html', { root: static_app_dir }));
app.get('/show-finder/venue-search', (req, res) => res.sendFile('venue-search.html', { root: static_app_dir }));
app.get('/show-finder/', (req, res) => res.sendFile('show-finder.html', { root: static_app_dir }));
app.get('*', (req, res) => res.sendFile('index.html', { root: static_app_dir }));

// HTTPS certs
var creds = {};
if (process.env.DEPLOY_STAGE === 'PROD') {
	if (!process.env.PROD_SSL_KEY_PATH || !process.env.PROD_SSL_CERT_PATH || !process.env.PROD_SSL_CA_CERT_PATH) {
		console.log("SSL cert env variables not set. Run the setup_env.sh script");
		process.exit(1);
	}

	var key = fs.readFileSync(process.env.PROD_SSL_KEY_PATH);
	var cert = fs.readFileSync(process.env.PROD_SSL_CERT_PATH);
	var ca = fs.readFileSync(process.env.PROD_SSL_CA_CERT_PATH);
	creds = {
		key: key,
		cert: cert,
		ca: ca
	};
} else {
	console.log('Running server locally using local self-signed cert');
	var key = fs.readFileSync(__dirname + '/showfinder-selfsigned-key.pem', 'utf-8');
	var cert = fs.readFileSync(__dirname + '/showfinder-selfsigned-cert.pem', 'utf-8');
	creds = {
		key: key,
		cert: cert
	};
}

var httpServer = http.createServer(app);
var httpsServer = https.createServer(creds, app);

httpServer.on('error', e => console.log(e));
httpsServer.on('error', e => console.log(e));

if (process.env.DEPLOY_STAGE === 'PROD') {
	httpServer.listen(8080);
	httpsServer.listen(port, () => console.log(`http redirecting from 8080 to 8443, https listening on ${port}...`))
} else {
	httpServer.listen(80);
	httpsServer.listen(port, () => console.log(`http redirecting from 80 to 443, https listening on ${port}...`))
}
