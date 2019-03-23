const express = require('express');
const http = require('http');
const https = require('https');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const showFinder = require('./show-finder');

const app = express();
const port = process.env.PORT || 443;

// Poor man's in-mem cache
var spotifyToken;

// Logging setup
fs.mkdir('logs', err => {
	if (err && err.code != 'EEXIST') {
		throw(err);
	}
});
let requestLogStream = fs.createWriteStream(path.join(__dirname, 'logs', 'requests.log'), { flags: 'a' });
app.use(morgan('[:date[clf]] - ":method :url" | Status - :status | Response length/time - :res[content-length] bytes/:response-time ms', { stream: requestLogStream }));

app.use(bodyParser.json());

// No static file routing for dev env because the react webpack server will handle it for us
if (process.env.DEPLOY_STAGE === 'PROD') {
	let production_app_dir = path.join(__dirname, 'client/build');
	app.use(express.static(production_app_dir));
	app.get('*', (req, res) => res.sendFile('index.html', { root: production_app_dir }));
}

app.post('/show-finder/playlists', async (req, res) => {
	// If we have a token cached, give it a shot to see if it's still valid
	if (spotifyToken) {
		let cachedAttempt = await showFinder.getPlaylists(spotifyToken, process.env.DEPLOY_STAGE === 'PROD' ? req.query.username : 'bteamer');

		// If we have no status, that means we got our playlist json object back (success). If we have a code,
		// instrumentCall returned our full failed response to us, so refresh the token and continue.
		if (cachedAttempt.statusCode === undefined) {
			return res.send(cachedAttempt);
		}
	}

	spotifyToken = await showFinder.getSpotifyToken();

	if (spotifyToken.statusCode) {
		console.log(`Call to get spotify token failed with status ${spotifyToken.statusCode}`);
		return res.status(spotifyToken.statusCode)
			.json(spotifyToken);
	}

	let playlists = await showFinder.getPlaylists(spotifyToken, process.env.DEPLOY_STAGE === 'PROD' ? req.query.username : 'bteamer');
	if (playlists.statusCode) {
		console.log(`Call to get users playlists failed with status ${playlists.statusCode}`);
		return res.status(playlists.statusCode)
			.json(playlists);
	}

	res.send(playlists);
});

app.get('/show-finder/artists', async (req, res) => {
	console.log(req.body);
	console.log('Query param: ' + req.query.playlistId);
	let artists = await showFinder.getArtists(spotifyToken, req.query.playlistId);
	if (artists.statusCode) {
		console.log(`Call to get artists for playlist failed with status ${artists.statusCode}`);
		return res.status(artists.statusCode)
			.json(artists);
	}

	res.json(artists);
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
			artistName: decodeURI(artists.find(y => y.id === parseInt(x)).name).toString(),
			shows: allServicesResponse[x]
		}));

	console.log(`Successfully fetch and bundled shows for ${Object.keys(mappedArtistsToShows).length} total artists`);
	res.json(mappedArtistsToShows);
});

app.use((req, res, next) => {
	// https://expressjs.com/en/api.html#req.secure
	if (req.headers['x-forwarded-proto'] === 'http' || !req.secure) {
		let path = req.route === undefined ? '' : req.route.path;	// https redirection working, but not the rebuild of the url
		console.log(req.originalUrl);
		return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`)
	}

	return next();
});

var key = fs.readFileSync(__dirname + '/showfinder-selfsigned.key');
var cert = fs.readFileSync(__dirname + '/showfinder-selfsigned.crt');
var creds = {
	key: key,
	cert: cert
};

var httpServer = http.createServer(app);
var httpsServer = https.createServer(creds, app);
httpServer.listen(80);
httpsServer.listen(port, () => console.log('http redirecting from 80 to 443, https listening on 443...'));
