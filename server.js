const express = require('express');
const bodyParser = require('body-parser');
const showFinder = require('./show-finder');
const app = express();
const port = process.env.PORT || 5000;

// TODO :: BT have token passed in header in the future, rather than func call?
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
	console.log(artists);
	res.json(artists);
});

app.post('/show-finder/shows', async (req, res) => {
	console.log(req.body);
	console.log('Query param: ' + req.query.service);

	switch (req.query.service.toLowerCase()) {
		case 'bandsintown':
			console.log('skipping BIT query');
			res.send('');
			return;
		case 'songkick':
			let songkickResponse = await showFinder.getSongkickShows(req.body.selectedArtists);
			res.json(songkickResponse);
			return;
	}
})

app.listen(port, () => console.log('Express backend listening on ' + port));