function parseBandsInTownResponse(responseBody, location) {
	if (typeof responseBody === "string" && responseBody.includes("{warn=Not found}")) {
		return null;
	}

	if (responseBody.errorMessage) {
		// Most likely artist not found
		return null;
	}

	// We do weird shit with the datetime to strip off the timezone so we can create a datetime with just the date.
	// If you don't the datetime automatically converts it to UTC for its string repres., which for all late-night, west-coast
	// shows rolls it to the next day. This is the only way to get rid of it _before_ creating the Date object
	let shows = responseBody
		.filter(x => x.venue.city.toLowerCase().includes(location))
		.map(x => {
			let showObj = {
				show: x.venue.name,
				date: new Date(x.datetime.substring(0, x.datetime.indexOf("T"))),
				url: x.url
			};

			return {
				date: showObj.date,
				show: `${showObj.show} on ${showObj.date.toLocaleString("en-us", {
					month: "long"
				})} ${showObj.date.getUTCDate()}, ${showObj.date.getUTCFullYear()}`
			};
		});

	return shows.length === 0 ? null : shows;
}

function parseSongkickResponse(responseBody, location) {
	if (responseBody.resultsPage.totalEntries !== 0) {
		let eventList = responseBody.resultsPage.results.event;
		let shows = eventList
			.filter(x => x.location.city.toLowerCase().includes(location))
			.map(x => ({
				date: new Date(x.start.date),
				show: x.displayName
			}));

		return shows.length === 0 ? null : shows;
	} else {
		return null;
	}
}

// param is a list of { artistId: int, queryResponse: http response object }
function parseSongkickArtistsResponse(responseList) {
	let artistObjects = [];
	for (let promiseObject of responseList) {
		let responseObject = promiseObject.queryResponse;
		if (!responseObject.success) {
			console.log(`Failed query in Songkick artist ID requests:`);
			console.log(responseObject.response);
			continue;
		}

		responseBody = responseObject.response || responseObject.response.query;
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
		artistObjects.push({ artistId: promiseObject.artistId, songkickId: singleArtistList[0].id });
	}

	return artistObjects;
}

function parseSeatGeekResponse(responseBody, location) {
	if (responseBody.meta.total === 0) {
		return null;
	}

	let shows = responseBody.events
		.filter(x => x.venue.city.toLowerCase().includes(location))
		.map(x => {
			let showObj = {
				date: new Date(x.datetime_local.substring(0, x.datetime_local.indexOf("T"))),
				show: x.short_title,
				url: x.url
			};

			return {
				date: showObj.date,
				show: `${showObj.show} on ${showObj.date.toLocaleString("en-us", {
					month: "long"
				})} ${showObj.date.getUTCDate()}, ${showObj.date.getUTCFullYear()}`
			};
		});

	return shows.length === 0 ? null : shows;
}

function parseSeatGeekArtistsResponse(responseList) {
	let artistObjects = [];
	for (let promiseObject of responseList) {
		let responseObject = promiseObject.queryResponse;
		if (!responseObject.success) {
			console.log(`Failed query in SeatGeek artist ID requests`);
			console.log(responseObject.response);
			continue;
		}

		let responseBody = responseObject.response || responseObject.response.query;
		if (responseBody.meta.total === 0) {
			// No results for this artist
			continue;
		}

		// Same situation as songkick with a list of fuzzy-matched artists that we're just taking the first result of
		artistObjects.push({ artistId: promiseObject.artistId, seatGeekId: responseBody.performers[0].id });
	}

	return artistObjects;
}

module.exports = {
	parseBandsInTownResponse,
	parseSongkickResponse,
	parseSongkickArtistsResponse,
	parseSeatGeekResponse,
	parseSeatGeekArtistsResponse
};
