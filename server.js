const express = require('express');
const bodyParser = require('body-parser');
const showFinder = require('./show-finder');
const app = express();
const port = process.env.PORT || 5000;

var spotifyToken;

app.use(bodyParser.json());

app.get('/hello', (req, res) => {
	res.send({ data: 'carne asuh' });
});

app.post('/show-finder/playlists', async (req, res) => {
	console.log(req.body);
	spotifyToken = await showFinder.getSpotifyToken();
	let playlists = await showFinder.getPlaylists(spotifyToken, 'bteamer');	// TODO :: BT replace with entry
	console.log(playlists);
	res.send(playlists);
});

app.get('/show-finder/artists', async (req, res) => {
	console.log(req.body);
	console.log('Query param: ' + req.query.playlistId);
	let artists = await showFinder.getArtists(spotifyToken, req.query.playlistId);
	res.json(artists);
});

app.post('/show-finder/shows', async (req, res) => {
	if (req.query.service) {
		console.log('Query param: ' + req.query.service);
		switch (req.query.service.toLowerCase()) {
			case 'bandsintown':
			let bandsInTownResponse = await showFinder.getBandsInTownShows(req.body.selectedArtists);
			res.json(bandsInTownResponse);
			return;
			case 'songkick':
			let songkickResponse = await showFinder.getSongkickShows(req.body.selectedArtists);
			res.json(songkickResponse);
			return;
		}
	}

	// No query param, need to group artist by id to be
	// able to bundle and serve consolidated response
	let i = 0;
	let artists = req.body.selectedArtists.map(x => ({ id: i++, name: x }));
	let allServicesResponse = await showFinder.getAllShows(artists);
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