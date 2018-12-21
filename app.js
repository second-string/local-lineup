// TODO :: API call to server to pull in spotify and BIT creds for app use by others

var request = require('async-request');
var inquirer = require('inquirer');
var constants = require('./constants');
var fs = require('fs');

// TODO :: Cache token?
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
		if (fs.existsSync('.env')) {
			var envFile = fs.readFileSync('.env', 'utf8', error => console.log(error));
			if (envFile.indexOf('SPOTIFY_TOKEN') === -1) {
				fs.appendFile('.env', 'SPOTIFY_TOKEN=' + spotifyToken, error => console.log('Error writing token to env file: ' + error));
			}
		}
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
		response = await request(`https://api.spotify.com/v1/users/${constants.spotifyUserId}/playlists`, getOptions);
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

function printBandsInTownShowInfo(artist, response) {
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

	if (sfShows.length == 0 && laShows.length == 0) {
		return;
	}

	console.log();
	console.log(`*********** ${decodeURI(artist)} ***********`);

	if (sfShows.length > 0) {
		console.log(`-- SF Shows --`);
		sfShows.forEach(x => console.log(`${x.name} on ${x.date.toLocaleString('en-us', { month: 'long' })} ${x.date.getDate()}, ${x.date.getFullYear()}`));
	} else {
		console.log('No SF shows');
	}

	if (laShows.length > 0) {
		console.log(`-- LA Shows --`);
		laShows.forEach(x => console.log(`${x.name} on ${x.date.toLocaleString('en-us', { month: 'long' })} ${x.date.getDate()}, ${x.date.getFullYear()}`));
	} else {
		console.log('No LA shows');
	}
}

function printSongkickShowInfo(artist, response) {
	let body = JSON.parse(response.body);
	if (body.resultsPage.totalEntries === 0) {
		return;
	}

	let eventList = body.resultsPage.results.event;
	let sfShows = eventList.filter(x => x.location.city.toLowerCase().indexOf('san francisco') > -1);
	let laShows = eventList.filter(x => x.location.city.toLowerCase().indexOf('los angeles') > -1);

	if (sfShows.length == 0 && laShows.length == 0) {
		return;
	}

	console.log();
	console.log(`*********** ${decodeURI(artist)} ***********`);

	if (sfShows.length > 0) {
		console.log(`-- SF Shows --`);
		sfShows.forEach(x => console.log(x.displayName));
	} else {
		console.log('No SF shows');
	}

	if (laShows.length > 0) {
		console.log(`-- LA Shows --`);
		laShows.forEach(x => console.log(x.displayName));
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

	// let requests = Object.keys(artistIdsByArtist).map(x => request(`https://api.songkick.com/api/3.0/artists/${artistIdsByArtist[x]}/calendar.json?apikey=${constants.songkickSecret}`, getOptions));
	// return Promise.all(requests);
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
		// artistsById[singleArtistList[0].id] = singleArtistList[0].displayName;
	}
	// for (artistIndex in singleArtistList) {
	// 	let artistEntry = singleArtistList[artistIndex];
	// 		// There's only ever going to be one ID per display name, since they're all 'different'
	// 		artistIdByArtist[artistEntry.displayName] = artistEntry.id;
	// }

	return artistsObjects;
}

async function main() {
	// console.log("client id: " + constants.clientId);
	if (!constants.clientId || !constants.clientSecret || !constants.spotifyUserId || !constants.bandsInTownSecret || !constants.songkickSecret) {
		console.log("Please supply valid creds in the .env file");
		process.exit(1);
	}

	await getSpotifyToken();
	let playlistDict = await getPlaylists();
	let playlistId = await pickPlaylist(playlistDict);
	let artists = await getArtists(playlistId);

	let bandsInTownArtistQueries = [];
	let songkickArtistIdQueries = [];
	let songkickArtistQueries = [];

	artists.forEach(x => songkickArtistIdQueries.push(buildSongkickArtistIdQuery(x)));
	artists.forEach(x => bandsInTownArtistQueries.push(buildBandsInTownArtistQuery(x)));

	// TODO :: better to pass through to artist request as every artist id evaluates versus chunking them all up front?
	let songkickArtistIdResponseJson = await Promise.all(songkickArtistIdQueries);

	// This ends up as a list of Dictionary<string, int> where each dict represents the response from a single artist query,
	// and the KVP contained is all of the related artist names mapped to their ID
	let songkickArtistObjects = getSongkickArtistIdsFromJson(songkickArtistIdResponseJson);
	songkickArtistObjects.forEach(x => songkickArtistQueries.push(buildSongkickArtistQuery(x.id)));
	let songkickResponses = await Promise.all(songkickArtistQueries);
	let bandsInTownResponses = await Promise.all(bandsInTownArtistQueries);

	for (artistIndex in artists) {
		let artist = artists[artistIndex];
		printSongkickShowInfo(artist, songkickResponses[artistIndex]);
		printBandsInTownShowInfo(artist, bandsInTownResponses[artistIndex]);
	}
}

main()
	.catch(e => console.log(e));


/*
Work done for handling list of related songkick responses as well
	for (responseIndex in songkickResponses) {
		console.log('``````````````````````````````````````New artist group``````````````````````````````````````````````````')
		let resultsPageList = songkickResponses[responseIndex].map(x => JSON.parse(x.body).resultsPage);
		// console.log(resultsPageList)
		if (resultsPageList) {
			let innerResultsList = resultsPageList.filter(x => x.totalEntries > 0).map(x => x.results);
			if (innerResultsList.length === 0) {
				// This means for all related artists for this specific artist name, none have upcoming shows
				continue;
			}

			// Overall list is of each related artist for a single playlist artist
			// Inner list is every performance for that specific artist (list of `event` to list KVPs)
			let eventListPerArtist = innerResultsList.filter(x => x != null).map(x => x.event);
			for (artistListIndex in eventListPerArtist) {
				let artistList = eventListPerArtist[artistListIndex];
				if (artistListIndex)
				console.log('``````````````` new artist in artist group`````````````');
				console.log(artistList.map(y => y.displayName + ' in ' + y.location.city));
			}
		}
*/
