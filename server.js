const express = require('express');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const showFinder = require('./show-finder');

const app = express();
const port = process.env.PORT || 5000;

var spotifyToken;

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
	app.get('*', (req, res) => res.sendFile('index.html', { root: production_app_dir }));
}

app.post('/show-finder/playlists', async (req, res) => {
	console.log(req.body);
	spotifyToken = await showFinder.getSpotifyToken();
	if (spotifyToken.statusCode) {
		console.log(`Call to get spotify token failed with status ${spotifyToken.statusCode}`);
		return res.status(spotifyToken.statusCode)
			.json(spotifyToken);
	}

	let playlists = await showFinder.getPlaylists(spotifyToken, 'bteamer');	// TODO :: BT replace with entry
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

app.listen(port, () => console.log('Express backend listening on ' + port));