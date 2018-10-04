// TODO :: API call to server to pull in spotify and BIT creds for app use by others

var request = require('async-request');
var inquirer = require('inquirer');
require('dotenv').load();

// TODO :: Constants file
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const spotifyUserId = process.env.SPOTIFY_USERNAME;
const bandsInTownSecret = process.env.BANDS_IN_TOWN_SECRET;

// TODO :: Cache token?
var spotifyToken;

// TODO :: Helper class
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

var spotifyAuth = () => 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

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

	console.log('Authing with spotify...');
	let response;
	try {
		response = await request('https://accounts.spotify.com/api/token', postOptions);
	} catch (e) {
		requestError(response, e);
	}

	if (!response.statusCode) {
		requestError(response);
	} else {
		spotifyToken = `Bearer ${JSON.parse(response.body).access_token}`;
	}
} 

async function getPlaylists() {
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
		response = await request(`https://api.spotify.com/v1/users/${spotifyUserId}/playlists`, getOptions);
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

	let response;
	try {
		// TODO :: page tracklist
		response = await request(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, getOptions);
	} catch (e) {
		requestError(response, e);
	}

	if (!response.statusCode) {
		requestError(response);
	}

	let body = JSON.parse(response.body);
	let artists = body.items
		.map(x => x.track)
		.map(x => x.artists)
		.map(x => x[0])					// each artist is a list of a single object (ew)
		.map(x => encodeURI(x.name));	// encode to URL-safe characters

	// Filter out duplicates
	hasSeen = {};
	return artists.filter(x => hasSeen.hasOwnProperty(x) ? false : (hasSeen[x] = true));
}

async function doSomething(artist) {
	let getOptions = {
		method: 'GET',
		headers: {
			'Content-type': 'application/json'
		}
	};

	// TODO :: going to get the shit ratelimited out of us
	let response;
	try {
		response = await request(`https://rest.bandsintown.com/artists/${artist}/events?app_id=${bandsInTownSecret}`);
	} catch (e) {
		requestError(response, e);
	}

	if (!response.statusCode) {
		requestError(response);
	}

	console.log();
	console.log(`*********** ${decodeURI(artist)} ***********`);
	let body = JSON.parse(response.body);
	let sfShows = body.filter(x => x.venue.city.toLowerCase() === 'san francisco')
		.map(x =>  ({
			name: x.venue.name,
			date: new Date(x.datetime),
			url: x.url
		 }));

	let laShows= body.filter(x => x.venue.city.toLowerCase() === 'los angeles')
		.map(x =>  ({
			name: x.venue.name,
			date: new Date(x.datetime),
			url: x.url
		 }));

	if (sfShows.length > 0) {
		console.log(`-- SF Shows --`);
		sfShows.forEach(x => console.log(`${x.name} on ${x.date.toLocaleString('en-us', { month: 'long' })} ${x.date.getDate()}, ${x.date.getFullYear()}`));
	} else {
		console.log('No SF shows');
	}

	if (sfShows.length > 0) {
		console.log(`-- LA Shows --`);
		laShows.forEach(x => console.log(`${x.name} on ${x.date.toLocaleString('en-us', { month: 'long' })} ${x.date.getDate()}, ${x.date.getFullYear()}`));
	} else {
		console.log('No LA shows');
	}
}

async function main() {
	if (!clientId || !clientSecret || !spotifyUserId || !bandsInTownSecret) {
		console.log("Please supply valid creds in the .env file");
		process.exit(1);
	}

	await getSpotifyToken();
	let playlistDict = await getPlaylists();
	let playlistId = await pickPlaylist(playlistDict);
	let artists = await getArtists(playlistId);

	for (let artist of artists) {
		await doSomething(artist);
	}
}

main()
	.catch(e => console.log(e));
