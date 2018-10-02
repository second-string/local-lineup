var request = require('async-request');
var inquirer = require('inquirer');
require('dotenv').load();

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const spotifyUserId = process.env.SPOTIFY_USERNAME;

var spotifyToken;

function requestError(response) {
	console.log('REQUEST ERROR');
	console.log(`RESPONSE STATUS CODE: ${response.statusCode}`);
	console.log(response.body);
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
		console.log(e);
	}

	if (response.statusCode) {
		spotifyToken = `Bearer ${JSON.parse(response.body).access_token}`;
	} else {
		requestError(response);
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
		console.log(e);
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

async function getTracks(playlistId) {
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
		console.log(e);
	}

	let body = JSON.parse(response.body);
	let artists = body.items
		.map(x => x.track)
		.map(x => x.artists)
		.map(x => encodeURI(x.name));
	console.log(artists);
}

async function main() {
	if (!clientId || !clientSecret || !spotifyUserId) {
		console.log("Please supply a valid CLIENT_ID and CLIENT_SECRET in the .env file");
		process.exit(1);
	}

	await getSpotifyToken();
	let playlistDict = await getPlaylists();
	let playlistId = await pickPlaylist(playlistDict);
	let artists = await getTracks(playlistId);
}

main()
	.catch(e => console.log(e));
