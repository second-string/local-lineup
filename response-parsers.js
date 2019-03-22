function parseBandsInTownResponse(responseBody, location) {
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

	// We do weird shit with the datetime to strip off the timezone so we can create a datetime with just the date.
	// If you don't the datetime automatically converts it to UTC for its string repres., which for all late-night, west-coast
	// shows rolls it to the next day. This is the only way to get rid of it _before_ creating the Date object
	let shows = body.filter(x => x.venue.city.toLowerCase().includes(location))
		.map(x =>  {
			let showObj = {
				name: x.venue.name,
				date: new Date(x.datetime.substring(0, x.datetime.indexOf('T'))),
				url: x.url
			};

			return { date: showObj.date, show: `${showObj.name} on ${showObj.date.toLocaleString('en-us', { month: 'long' })} ${showObj.date.getUTCDate()}, ${showObj.date.getUTCFullYear()}` };
		});

	return shows.length === 0 ? null : shows;
}

function parseSongkickResponse(responseBody, location) {
	let body;
	try {
		body = JSON.parse(responseBody);
	} catch (e) {
		throw new Error('Failed to parse JSON for ' + responseBody);
	}

	if (body.resultsPage.totalEntries !== 0) {
		let eventList = body.resultsPage.results.event;
		let shows = eventList.filter(x => x.location.city.toLowerCase().includes(location))
			.map(x => ({
				date: new Date(x.start.date),
				show: x.displayName
			}));

		return shows.length === 0 ? null : shows;
	} else {
		return null;
	}
}

function parseSongkickArtistsResponse(responseList) {
	let artistsObjects = [];
	for (responseIndex in responseList) {
		if (!responseList[responseIndex].success) {
			console.log(`Failed query in Songkick artist ID requests, ${responseList[responseIndex].response}`);
			continue;
		}

		let responseBody = JSON.parse(responseList[responseIndex].response.body || responseList[responseIndex].response.query.body);
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

module.exports = {
	parseBandsInTownResponse,
	parseSongkickResponse,
	parseSongkickArtistsResponse
};