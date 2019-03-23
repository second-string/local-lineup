var request = require('async-request');
var inquirer = require('inquirer');
var constants = require('./constants');
var helpers = require('./helpers');
var parsers = require('./response-parsers');
var foopee = require('./foopee-scrape');
var fs = require('fs');


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
	let {success, response} = await helpers.instrumentCall('https://accounts.spotify.com/api/token', postOptions);

	return success ? `Bearer ${JSON.parse(response.body).access_token}` : response;
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
	let { success, response } = await helpers.instrumentCall(`https://api.spotify.com/v1/users/${userId}/playlists`, getOptions);

	if (!success) {
		return response;
	}

	let body = JSON.parse(response.body);
	let playlistNamesById = {};
	body.items.forEach(x => playlistNamesById[x.id] = x.name);
	return playlistNamesById;
}

async function getArtists(spotifyToken, playlistId) {
	let getOptions = {
		method: 'GET',
		headers: {
			'Content-type': 'application/json',
			'Authorization': spotifyToken
		}
	};

	let body = {};
	let artists = [];
	console.log('Getting artists...');
	do {
		let { success, response } = await helpers.instrumentCall(body.next || `https://api.spotify.com/v1/playlists/${playlistId}/tracks`, getOptions);
		if (!success) {
			return response;
		}

		body = JSON.parse(response.body);

		// Amalgamates a list of lists, where each top-level list is one endpoint page
		artists.push(body.items
			.map(x => x.track)
			.map(x => x.artists)
				.map(x => x[0])					// each artist is a list of a single object (ew)
				.map(x => encodeURI(x.name)));	// encode to URL-safe characters

		} while (body.next != null);

	// Filter out duplicates
	hasSeen = {};
	return artists
		.reduce((x, y) => x.concat(y))
		.filter(x => hasSeen.hasOwnProperty(x) ? false : (hasSeen[x] = true));
}

// artists param is list of { id, name }, location is lowercased basic city string
async function getAllShows(artists, location) {
	// Eventual return value (ish). Object with key of artist ID (int) and value of a list of { date: DateTime, show: string }
	let showsByArtistId = {};
	let showServiceRequests = [];
	showServiceRequests.push(getBandsInTownShows(artists, location, showsByArtistId));
	showServiceRequests.push(getSongkickShows(artists, location, showsByArtistId));

	if (location === 'san francisco')
	{
		showServiceRequests.push(getFoopeeShows(artists, location, showsByArtistId));
	}

	await Promise.all(showServiceRequests);
	helpers.dedupeShows(showsByArtistId);

	// Set each value of the artist ID key to just the list of shows from the previous list of show/date objects
	Object.keys(showsByArtistId).forEach(x => showsByArtistId[x] = showsByArtistId[x].map(y => y.show));

	return showsByArtistId;
}

async function getSongkickShows(artists, location, showsByArtistId) {
	// List of { artistId, query } objects
	let bandsInTownQueries = [];
	artists.forEach(x => bandsInTownQueries.push({ artistId: x.id, query: buildBandsInTownArtistQuery(x.name) }));
	console.log('Getting BandsInTown artist shows...');
	let bandsInTownResponses = await Promise.all(bandsInTownQueries.map(x => x.query));

	for (index in bandsInTownResponses) {
		if (!bandsInTownResponses[index].success) {
			console.log(`Failed query in BandsInTown requests, ${bandsInTownResponses[index].response}`);
			continue;
		}
		// Can loop responses and index into artists b/c we're guaranteed a response for each req,
		// even if body is an empty list (no shows) or `{warn=Not found}` (artist not found)
		let cleanedShowObjects = parsers.parseBandsInTownResponse(bandsInTownResponses[index].response.body, location);
		if (cleanedShowObjects !== null && cleanedShowObjects !== undefined) {
			if (showsByArtistId[artists[index].id]){
				// Theoretically we should never be here since it means we're
				// indexing to the same artist twice from different BIT responses
				showsByArtistId[artists[index].id] = showsByArtistId[artists[index].id].concat(cleanedShowObjects);
				// showsByArtistId[artists[index].id] = showsByArtistId[artists[index].id].concat(cleanedShowObjects);
			} else {
				showsByArtistId[artists[index].id] = cleanedShowObjects;
			}
		}
	}
	console.log(`Added shows for ${Object.keys(showsByArtistId).length} artists from BandsInTown response`);
}

async function getBandsInTownShows(artists, location, showsByArtistId) {
	// Both are list of { artistId, query } objects
	let songkickArtistIdQueries = [];
	let songkickArtistQueries = [];

	// First get artist IDs from within songkick to be able to query artist directly
	// Butchered it for now, but should create own promises in `buildXQuery` to return an object holding result of the fetch and artist ID
	artists.forEach(x => songkickArtistIdQueries.push({ artistId: x.id, query: buildSongkickArtistIdQuery(x.name) }));
	console.log('Getting Songkick artist IDs...');
	let songkickArtistIdResponseJson = await Promise.all(songkickArtistIdQueries.map(x => x.query));
	let songkickArtistObjects = parsers.parseSongkickArtistsResponse(songkickArtistIdResponseJson);

	// Build and send queries for actual shows for each artist
	songkickArtistObjects.forEach(x => songkickArtistQueries.push({ artistId: x.artistId, query: buildSongkickArtistQuery(x.songkickId) }));
	console.log('Getting Songkick artist shows...');
	songkickResponses = await Promise.all(songkickArtistQueries.map(x => x.query));

	let songkickShowsFound = 0;
	for (index in songkickArtistObjects) {
		if (!songkickResponses[index].success) {
			console.log(`Failed query in Songkick artist show requests, ${songkickResponses[index].response}`);
		}
		let cleanedShowObjects = parsers.parseSongkickResponse(songkickResponses[index].response.body, location);
		if (cleanedShowObjects !== null && cleanedShowObjects !== undefined) {
			songkickShowsFound++;
			if (showsByArtistId[songkickArtistObjects[index].artistId]){
				showsByArtistId[songkickArtistObjects[index].artistId] = showsByArtistId[songkickArtistObjects[index].artistId].concat(cleanedShowObjects);
			} else {
				showsByArtistId[songkickArtistObjects[index].artistId] = cleanedShowObjects;
			}
		}
	}

	console.log(`Added or appended shows for ${songkickShowsFound} artists from Songkick`);
}

// Assuming location-checking for location of SF is done beforehand
async function getFoopeeShows(artists, location, showsByArtistId) {
	console.log('Getting foopee artist shows...');
	let foopeeShows = await foopee.getFoopeeShows(artists);
	for (foopeeObject of foopeeShows) {
		if (showsByArtistId[foopeeObject.id]) {
			showsByArtistId[foopeeObject.id] = showsByArtistId[foopeeObject.id].concat(foopeeObject.showObjects);
		} else {
			showsByArtistId[foopeeObject.id]= foopeeObject.showObjects;
		}
	}
	console.log(`Added or appended shows for ${Object.keys(foopeeShows).length} artists from Foopee`);
}

/*
refactor these back again when we support individual service querying for the api

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
*/

function buildBandsInTownArtistQuery(artist) {
	let getOptions = {
		method: 'GET',
		headers: {
			'Content-type': 'application/json'
		}
	};

	return helpers.instrumentCall(`https://rest.bandsintown.com/artists/${artist}/events?app_id=${constants.bandsInTownSecret}`, getOptions);
}

function buildSongkickArtistIdQuery(artist) {
	let getOptions = {
		method: 'GET',
		headers: {
			'Content-type': 'application/json'
		}
	};

	return helpers.instrumentCall(`https://api.songkick.com/api/3.0/search/artists.json?apikey=${constants.songkickSecret}&query=${artist}`, getOptions);
}

function buildSongkickArtistQuery(artistId) {
	let getOptions = {
		method: 'GET',
		headers: {
			'Content-type': 'application/json'
		}
	};

	return helpers.instrumentCall(`https://api.songkick.com/api/3.0/artists/${artistId}/calendar.json?apikey=${constants.songkickSecret}`, getOptions);
}

module.exports = {
	getSpotifyToken: getSpotifyToken,
	getPlaylists: getPlaylists,
	getArtists: getArtists,
	// getSongkickShows: getSongkickShows,
	// getBandsInTownShows: getBandsInTownShows,
	getAllShows: getAllShows
};