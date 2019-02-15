var request = require('async-request');
var inquirer = require('inquirer');
var constants = require('./constants');
var fs = require('fs');

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
		// spotifyToken = `Bearer ${JSON.parse(response.body).access_token}`;
		return `Bearer ${JSON.parse(response.body).access_token}`;
		if (fs.existsSync('.env')) {
			var envFile = fs.readFileSync('.env', 'utf8', error => console.log(error));
			if (envFile.indexOf('SPOTIFY_TOKEN') === -1) {
				fs.appendFile('.env', 'SPOTIFY_TOKEN=' + spotifyToken, error => console.log('Error writing token to env file: ' + error));
			}
		}
	}
}

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

async function getPlaylists(spotifyToken, userId) {
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

async function getArtists(spotifyToken, playlistId) {
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
	console.log('Getting artists...');
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

// TODO :: handle songkick's bullshit random 500ing
// artists param is list of { id, name }
async function getAllShows(artists) {
	// List of { artistId, query } objects
	let bandsInTownQueries = [];
	artists.forEach(x => bandsInTownQueries.push({ artistId: x.id, query: buildBandsInTownArtistQuery(x.name) }));
	console.log('Getting BandsInTown artist shows...');
	let bandsInTownResponses = await Promise.all(bandsInTownQueries.map(x => x.query));

	let showsByArtistId = {};
	for (index in bandsInTownResponses) {
		// Can loop responses and index into artists b/c we're guaranteed a response for each req,
		// even if body is an empty list (no shows) or `{warn=Not found}` (artist not found)
		let cleanedShows = parseBandsInTownResponse(bandsInTownResponses[index].body);
		if (cleanedShows !== null && cleanedShows !== undefined) {
			if (showsByArtistId[artists[index].id]){
				// Theoretically we should never be here since it means we're
				// indexing to the same artist twice from different BIT responses
				showsByArtistId[artists[index].id].sf = showsByArtistId[artists[index].id].sf.concat(cleanedShows);
				showsByArtistId[artists[index].id].la = showsByArtistId[artists[index].id].la.concat(cleanedShows);
			} else {
				showsByArtistId[artists[index].id] = cleanedShows;
			}
		}
	}

	console.log(`Added shows for ${Object.keys(showsByArtistId).length} artists from BandsInTown response`);

	// Both are list of { artistId, query } objects
	let songkickArtistIdQueries = [];
	let songkickArtistQueries = [];

	// First get artist IDs from within songkick to be able to query artist directly
	// TODO :: how to keep passing the artist ID through all the Promise.alls
	// Butchered it for now, but should create own promises in `buildXQuery` to return an object holding result of the fetch and artist ID
	artists.forEach(x => songkickArtistIdQueries.push({ artistId: x.id, query: buildSongkickArtistIdQuery(x.name) }));
	console.log('Getting Songkick artist IDs...');
	let songkickArtistIdResponseJson = await Promise.all(songkickArtistIdQueries.map(x => x.query));
	let songkickArtistObjects = getSongkickArtistIdsFromJson(songkickArtistIdResponseJson);

	// Build and send queries for actual shows for each artist
	songkickArtistObjects.forEach(x => songkickArtistQueries.push({ artistId: x.artistId, query: buildSongkickArtistQuery(x.songkickId) }));
	console.log('Getting Songkick artist shows...');
	songkickResponses = await Promise.all(songkickArtistQueries.map(x => x.query));

	// TODO :: dedupe based on date
	let songkickShowsFound = 0;
	for (index in songkickArtistObjects) {
		let cleanedShows = parseSongkickResponse(songkickResponses[index].body);
		if (cleanedShows !== null && cleanedShows !== undefined) {
			songkickShowsFound++;
			if (showsByArtistId[songkickArtistObjects[index].artistId]){
				showsByArtistId[songkickArtistObjects[index].artistId].sf = showsByArtistId[songkickArtistObjects[index].artistId].sf.concat(cleanedShows.sf);
				showsByArtistId[songkickArtistObjects[index].artistId].la = showsByArtistId[songkickArtistObjects[index].artistId].la.concat(cleanedShows.la);
			} else {
				showsByArtistId[songkickArtistObjects[index].artistId] = cleanedShows;
			}
		}
	}

	console.log(`Added or appended shows for ${songkickShowsFound} artists from Songkick`);
	return showsByArtistId;
}

function parseBandsInTownResponse(responseBody) {
	let locations = {};
	let body;
	try {
		body = JSON.parse(responseBody);
	} catch (e) {
		throw new Error('Failed to parse JSON for ' + responseBody);
	}

	if (body.errorMessage) {
		// Most likely artist not found
		return null;
	}

	let bandsInTownSfShowObjects = body.filter(x => x.venue.city.toLowerCase() === 'san francisco')
	.map(x =>  ({
		name: x.venue.name,
		date: new Date(x.datetime),
		url: x.url
	}));

	let bandsInTownLaShowObjects= body.filter(x => x.venue.city.toLowerCase() === 'los angeles')
	.map(x =>  ({
		name: x.venue.name,
		date: new Date(x.datetime),
		url: x.url
	}));

	let sfShows = bandsInTownSfShowObjects.map(x => `${x.name} on ${x.date.toLocaleString('en-us', { month: 'long' })} ${x.date.getDate()}, ${x.date.getFullYear()}`);
	let laShows = bandsInTownLaShowObjects.map(x => `${x.name} on ${x.date.toLocaleString('en-us', { month: 'long' })} ${x.date.getDate()}, ${x.date.getFullYear()}`);
	if (sfShows.length === 0 && laShows.length === 0) {
		return null;
	}

	locations.sf = sfShows;
	locations.la = laShows;
	return locations;
}

function parseSongkickResponse(responseBody) {
	let body;
	try {
		body = JSON.parse(responseBody);
	} catch (e) {
		throw new Error('Failed to parse JSON for ' + responseBody);
	}

	if (body.resultsPage.totalEntries !== 0) {
		let locations = {};
		let eventList = body.resultsPage.results.event;
		locations.sf = eventList.filter(x => x.location.city.toLowerCase().indexOf('san francisco') > -1).map(x => x.displayName);
		locations.la = eventList.filter(x => x.location.city.toLowerCase().indexOf('los angeles') > -1).map(x => x.displayName);
		if (locations.sf.length !== 0 || locations.la.length !== 0) {
			return locations;
		} else {
			return null;
		}
	} else {
		return null;
	}
}

async function getSongkickShows(artistList) {
	let songkickArtistIdQueries = [];
	let songkickArtistQueries = [];

	// First get artist IDs from within songkick to be able to query artist directly
	artistList.forEach(x => songkickArtistIdQueries.push(buildSongkickArtistIdQuery(x)));
	let songkickArtistIdResponseJson = await Promise.all(songkickArtistIdQueries);
	let songkickArtistObjects = getSongkickArtistIdsFromJsonOLD(songkickArtistIdResponseJson);

	// Build and send queries for actual shows for each artist
	songkickArtistObjects.forEach(x => songkickArtistQueries.push(buildSongkickArtistQuery(x.songkickId)));
	console.log('Getting Songkick artist shows...');
	songkickResponse = await Promise.all(songkickArtistQueries);

	let showsByArtistName = {};
	for (index in songkickArtistObjects) {
		showsByArtistName[songkickArtistObjects[index].name] = songkickResponse[index].body;
	}

	return prettifySongkickShows(showsByArtistName);
}

async function getBandsInTownShows(artistList) {
	let bandsInTownArtistQueries = [];
	artistList.forEach(x => bandsInTownArtistQueries.push(buildBandsInTownArtistQuery(x)));
	let bandsInTownResponses = await Promise.all(bandsInTownArtistQueries);

	let showsByArtistName = {};
	for (index in bandsInTownResponses) {
		// Can loop responses and index into artistList b/c we're guaranteed a response for each req,
		// even if body is an empty list (no shows) or `{warn=Not found}` (artist not found)
		showsByArtistName[decodeURI(artistList[index])] = bandsInTownResponses[index].body;
	}

	return prettifyBandsInTownShows(showsByArtistName);
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

function prettifySongkickShows(showsByArtistName) {
	let locationsByArtistName = {};
	let artistNames = Object.keys(showsByArtistName);
	for (index in artistNames) {
		let artistName = artistNames[index];
		let artistEntry = showsByArtistName[artistName];
		let body;
		try {
			body = JSON.parse(artistEntry);
		} catch (e) {
			console.log('Failed to parse artist json for ' + artistName);
			console.log('Offending object: ' + artistEntry.toString());
		}

		if (body.resultsPage.totalEntries !== 0) {
			let locations = {};
			let eventList = body.resultsPage.results.event;
			locations.sf = eventList.filter(x => x.location.city.toLowerCase().indexOf('san francisco') > -1).map(x => x.displayName);
			locations.la = eventList.filter(x => x.location.city.toLowerCase().indexOf('los angeles') > -1).map(x => x.displayName);
			if (locations.sf.length !== 0 || locations.la.length !== 0) {
				locationsByArtistName[artistName] = locations;
			}
		}
	}

	return locationsByArtistName;
}

function prettifyBandsInTownShows(showsByArtistName) {
	let locationsByArtistName = {};
	let artistNames = Object.keys(showsByArtistName);
	for (index in artistNames) {
		let locations = {};
		let artistName = artistNames[index];
		let artistEntry = showsByArtistName[artistName];

		if (artistEntry.toString().includes('warn')) {
			// Non-parsable format of `{warn=Not found}` so easiest just to string it and check
			continue;
		}

		let body;
		try {
			body = JSON.parse(artistEntry);
		} catch (e) {
			console.log('Failed to parse artist json for ' + artistName);
			console.log('Offending object: ' + artistEntry.toString());
		}

		let bandsInTownSfShowObjects = body.filter(x => x.venue.city.toLowerCase() === 'san francisco')
		.map(x =>  ({
			name: x.venue.name,
			date: new Date(x.datetime),
			url: x.url
		 }));

		let bandsInTownLaShowObjects= body.filter(x => x.venue.city.toLowerCase() === 'los angeles')
		.map(x =>  ({
			name: x.venue.name,
			date: new Date(x.datetime),
			url: x.url
		 }));

		let sfShows = bandsInTownSfShowObjects.map(x => `${x.name} on ${x.date.toLocaleString('en-us', { month: 'long' })} ${x.date.getDate()}, ${x.date.getFullYear()}`);
		let laShows = bandsInTownLaShowObjects.map(x => `${x.name} on ${x.date.toLocaleString('en-us', { month: 'long' })} ${x.date.getDate()}, ${x.date.getFullYear()}`);
		if (sfShows.length === 0 && laShows.length === 0) {
			continue;
		}

		locations.sf = sfShows;
		locations.la = laShows;
		locationsByArtistName[artistName] = locations;
	}

	return locationsByArtistName;
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
			'Content-type': 'application/json'
		}
	};

	return request(`https://api.songkick.com/api/3.0/artists/${artistId}/calendar.json?apikey=${constants.songkickSecret}`, getOptions);
}

function getSongkickArtistIdsFromJson(responseList) {
	let artistsObjects = [];
	for (responseIndex in responseList) {
		let responseBody = JSON.parse(responseList[responseIndex].body || responseList[responseIndex].query.body);
		let singleArtistList = responseBody.resultsPage.results.artist;
		if (singleArtistList === undefined) {
			continue;
		}
		/*
		 Each query for a single artist name will return a list of all artists fuzzy matched.
		 We're only going to pull the first one for now, since more often than not the related
		 artists don't apply (unfortunate in the case of The XX and getting Jamie xx back, etc. but eh).
		 Also this is some pretty hacky code to bundle the artist ID. Since we know the list of artist
		 responses that we're going to get here is the full list of artists requested, we're just assinging
		 the artist ID as the index, since that's how the initial artist list is built in the express
		 Server. I don't see this working out well in the future
		*/
		artistsObjects.push({ artistId: responseIndex, songkickId: singleArtistList[0].id });
	}

	return artistsObjects;
}

// Keeping to support legacy but all calls should be refactored to use the other
function getSongkickArtistIdsFromJsonOLD(responseList) {
	// Keep this returned object as a list of artist objects instead of just
	// an object with { id : artist } KVPs to retain ordering so we can index
	// into the initial 'artists' list when combining artists results across services
	let artistsObjects = [];
	for (responseIndex in responseList) {
		let responseBody = JSON.parse(responseList[responseIndex].body || responseList[responseIndex].query.body);
		let singleArtistList = responseBody.resultsPage.results.artist;
		if (singleArtistList === undefined) {
			continue;
		}
		// Each query for a single artist name will return a list of all artists fuzzy matched.
		// We're only going to pull the first one for now, since more often than not the related
		// artists don't apply (unfortunate in the case of The XX and getting Jamie xx back, etc. but eh)
		artistsObjects.push({ songkickId: singleArtistList[0].id, name: singleArtistList[0].displayName });
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
	let songkickArtistObjects = getSongkickArtistIdsFromJsonOLD(songkickArtistIdResponseJson);
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

module.exports = {
	getSpotifyToken: getSpotifyToken,
	getPlaylists: getPlaylists,
	getArtists: getArtists,
	getSongkickShows: getSongkickShows,
	getBandsInTownShows: getBandsInTownShows,
	getAllShows: getAllShows
};

// main()
// 	.catch(e => console.log(e));
