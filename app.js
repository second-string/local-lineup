// TODO :: API call to server to pull in songkick and BIT creds for app use by others
// TODO :: enable spotify login and token retrieval for arbitrary users

var request = require('async-request');
var inquirer = require('inquirer');
var constants = require('./constants');
var fs = require('fs');

var spotifyToken;

// TODO :: Helper function/class
function instrumentCall() {

}

function requestError(response, exception = null) {
	console.log('REQUEST ERROR');
	console.log(`RESPONSE STATUS CODE: ${response.statusCode}`);
	console.log(response.body);
	if (exception) {
		console.log(exception);
	}
	process.exit(2);
}


var spotifyAuth = () => 'Basic ' + Buffer.from(`${constants.clientId}:${constants.clientSecret}`).toString('base64');

async function getSpotifyToken() {
	let postOptions = {
		method: 'POST',
		data: {
			'grant_type': 'client_credentials'
		},
		headers: {
			'Content-type': 'application/x-www-form-urlencoded',
			'Authorization': spotifyAuth()
		}
	};

	console.log('Getting spotify API token...');
	let response;
	try {
		response = await request('https://accounts.spotify.com/api/token', postOptions);
	} catch (e) {
		requestError(response, e);
	}
	if (!response.statusCode) {
		requestError(response);
	} else {
		// TODO :: not actually reusing cached token. Will also have to handle invalid tokens retrieved from cache
		spotifyToken = `Bearer ${JSON.parse(response.body).access_token}`;
		if (fs.existsSync('.env')) {
			var envFile = fs.readFileSync('.env', 'utf8', error => console.log(error));
			if (envFile.indexOf('SPOTIFY_TOKEN') === -1) {
				fs.appendFile('.env', 'SPOTIFY_TOKEN=' + spotifyToken, error => console.log('Error writing token to env file: ' + error));
			}
		}
	}
}

/*
async function getSpotifyToken() {
	let getOptions = {
		method: 'GET',
		headers: {
			'Content-type': 'application/json'
		}
	};

	let response;
	try {
		response = await request('PI IP + PORT HERE', getOptions);
	}

	console.log(response);
	process.exit(0);
}
*/

async function getSpotifyUserId() {
	let answer = await inquirer
		.prompt([
		{
			type: 'entry',
			name: 'username',
			message: 'Enter your spotify username:'
		}]);

	return answer['username'];
}

async function getPlaylists(userId) {
	let getOptions = {
		method: 'GET',
		headers: {
			'Content-type': 'application/json',
			'Authorization': spotifyToken
		}
	};

	console.log('Getting playlists...');
	let response;
	try {
		response = await request(`https://api.spotify.com/v1/users/${userId}/playlists`, getOptions);
	} catch (e) {
		requestError(response, e);
	}

	if (!response.statusCode) {
		requestError(response);
	}

	 let body = JSON.parse(response.body);
	 let playlistNamesById = {};
	 body.items.forEach(x => playlistNamesById[x.id] = x.name);
	 return playlistNamesById;
}

async function pickPlaylist(playlistNamesById) {
	let playlistNames = Object.keys(playlistNamesById).map(x => playlistNamesById[x]);
	let answer = await inquirer
		.prompt([
		{
			type: 'list',
			name: 'playlist',
			message: 'Choose a playlist containing the artists you want to see shows for',
			choices: playlistNames
		}]);

	let playlist = answer['playlist'];
	return Object.keys(playlistNamesById).filter(x => playlistNamesById[x] === playlist)[0];
}

async function getArtists(playlistId) {
	let getOptions = {
		method: 'GET',
		headers: {
			'Content-type': 'application/json',
			'Authorization': spotifyToken
		}
	};

	let response = {};
	let body = {};
	let artists = [];
	do {
		try {
		response = await request(body.next || `https://api.spotify.com/v1/playlists/${playlistId}/tracks`, getOptions);
	} catch (e) {
		requestError(response, e);
	}

	if (!response.statusCode) {
		requestError(response);
	}

	body = JSON.parse(response.body);
	artists = body.items
	.map(x => x.track)
	.map(x => x.artists)
		.map(x => x[0])					// each artist is a list of a single object (ew)
		.map(x => encodeURI(x.name));	// encode to URL-safe characters

	} while (body.next != null);

	// Filter out duplicates
	hasSeen = {};
	return artists.filter(x => hasSeen.hasOwnProperty(x) ? false : (hasSeen[x] = true));
}

function buildBandsInTownArtistQuery(artist) {
	let getOptions = {
		method: 'GET',
		headers: {
			'Content-type': 'application/json'
		}
	};

	return request(`https://rest.bandsintown.com/artists/${artist}/events?app_id=${constants.bandsInTownSecret}`, getOptions);
}

function printShowInfo(artist, songkickResponse, bandsInTownResponse) {
	let songkickBody = JSON.parse(songkickResponse.body);
	let bandsInTownBody = JSON.parse(bandsInTownResponse.body);

	let sfShows = [];
	let laShows = [];

	if (songkickBody.resultsPage.totalEntries != 0) {
		let eventList = songkickBody.resultsPage.results.event;
		sfShows = sfShows.concat(eventList.filter(x => x.location.city.toLowerCase().indexOf('san francisco') > -1).map(x => x.displayName));
		laShows = laShows.concat(eventList.filter(x => x.location.city.toLowerCase().indexOf('los angeles') > -1).map(x => x.displayName));
	}

	let bandsInTownSfShowObjects = bandsInTownBody.filter(x => x.venue.city.toLowerCase() === 'san francisco')
		.map(x =>  ({
			name: x.venue.name,
			date: new Date(x.datetime),
			url: x.url
		 }));

	let bandsInTownLaShowObjects= bandsInTownBody.filter(x => x.venue.city.toLowerCase() === 'los angeles')
		.map(x =>  ({
			name: x.venue.name,
			date: new Date(x.datetime),
			url: x.url
		 }));

	sfShows = sfShows.concat(bandsInTownSfShowObjects.map(x => `${x.name} on ${x.date.toLocaleString('en-us', { month: 'long' })} ${x.date.getDate()}, ${x.date.getFullYear()}`));
	laShows = laShows.concat(bandsInTownLaShowObjects.map(x => `${x.name} on ${x.date.toLocaleString('en-us', { month: 'long' })} ${x.date.getDate()}, ${x.date.getFullYear()}`));

	if (sfShows.length === 0 && laShows.length === 0) {
		return;
	}

	console.log();
	console.log(`*********** ${decodeURI(artist)} ***********`);

	if (sfShows.length > 0) {
		console.log(`-- SF Shows --`);
		sfShows.forEach(x => console.log(x));
	} else {
		console.log('No SF shows');
	}

	if (laShows.length > 0) {
		console.log(`-- LA Shows --`);
		laShows.forEach(x => console.log(x));
	} else {
		console.log('No LA shows');
	}
}

function buildSongkickArtistIdQuery(artist) {
	let getOptions = {
		method: 'GET',
		headers: {
			'Content-type': 'application/json'
		}
	};

	return request(`https://api.songkick.com/api/3.0/search/artists.json?apikey=${constants.songkickSecret}&query=${artist}`, getOptions);
}

function buildSongkickArtistQuery(artistId) {
	let getOptions = {
		method: 'GET',
		headers: {
			'Content-type': 'application'
		}
	};

	return request(`https://api.songkick.com/api/3.0/artists/${artistId}/calendar.json?apikey=${constants.songkickSecret}`, getOptions);
}

function getSongkickArtistIdsFromJson(responseList) {
	// Keep this returned object as a list of artist objects instead of just
	// an object with { id : artist } KVPs to retain ordering so we can index
	// into the initial 'artists' list when combining artists results across services
	let artistsObjects = [];
	for (responseIndex in responseList) {
		let responseBody = JSON.parse(responseList[responseIndex].body);
		let singleArtistList = responseBody.resultsPage.results.artist;

		// Each query for a single artist name will return a list of all artists fuzzy matched.
		// We're only going to pull the first one for now, since more often than not the related
		// artists don't apply (unfortunate in the case of The XX and getting Jamie xx back, etc. but eh)
		artistsObjects.push({ id: singleArtistList[0].id, name: singleArtistList[0].displayName });
	}

	return artistsObjects;
}

async function main() {
	// console.log("client id: " + constants.clientId);
	if (!constants.clientId || !constants.clientSecret || !constants.spotifyUserId || !constants.bandsInTownSecret || !constants.songkickSecret) {
		console.log("Please supply valid creds in the .env file");
		process.exit(1);
	}

	await getSpotifyToken();
	// spotifyToken = await getSpotifyToken();
	let userId = await getSpotifyUserId();
	let playlistDict = await getPlaylists(userId);
	let playlistId = await pickPlaylist(playlistDict);
	let artists = await getArtists(playlistId);

	let bandsInTownArtistQueries = [];
	let songkickArtistIdQueries = [];
	let songkickArtistQueries = [];

	// Get songkick artist IDs and get BIT full artist response
	artists.forEach(x => songkickArtistIdQueries.push(buildSongkickArtistIdQuery(x)));
	artists.forEach(x => bandsInTownArtistQueries.push(buildBandsInTownArtistQuery(x)));

	// TODO :: better to pass through to artist request as every artist id evaluates versus chunking them all up front?
	console.log('Getting Songkick artists IDs...');
	let songkickArtistIdResponseJson = await Promise.all(songkickArtistIdQueries);
	let songkickArtistObjects = getSongkickArtistIdsFromJson(songkickArtistIdResponseJson);
	songkickArtistObjects.forEach(x => songkickArtistQueries.push(buildSongkickArtistQuery(x.id)));

	console.log('Getting Songkick artist shows...');
	let songkickResponses = await Promise.all(songkickArtistQueries);
	console.log('Getting BandsInTown artist shows...');
	let bandsInTownResponses = await Promise.all(bandsInTownArtistQueries);

	for (artistIndex in artists) {
		let artist = artists[artistIndex];
		printShowInfo(artist, songkickResponses[artistIndex], bandsInTownResponses[artistIndex]);
	}
}

main()
	.catch(e => console.log(e));
