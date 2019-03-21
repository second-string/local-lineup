var request = require('async-request');

function requestError(response, exception = null) {
	console.log('REQUEST ERROR');
	if (response) {
		console.log(`RESPONSE STATUS CODE: ${response.statusCode}`);
		console.log(response.body);
	}

	if (exception) {
		console.log(exception);
	}

	return response;
}

async function instrumentCall(url, options) {
	let res;
	let error = null;
	try {
		res = await request(url, options);
	} catch (e) {
		error = requestError(res, e);
	}

	if (res.statusCode >= 400) {
		error = requestError(res);
	}

	let success = error === null;
	let response = error || res;
	return { success, response };
}

// Compare dates agnostic of times
function datesEqual(dateString1, dateString2) {
	// The date will come as ms since epoch from foopee scrape but a datetime string from the other two
	let date1 = new Date(dateString1);
	let date2 = new Date(dateString2);
	return date1.getUTCFullYear() === date2.getUTCFullYear()
		&& date1.getUTCMonth() === date2.getUTCMonth()
		&& date1.getUTCDate() === date2.getUTCDate();
}

function addDedupedShows(previouslyAddedShows, newArtistShowList)
{
	// If you set this to previouslyAddedShows directly does js do a shallow copy or are we dealing with pointers?
	let dedupedShows = [].concat(previouslyAddedShows);
	for (i in newArtistShowList) {
		let dupeDate = false;
		for (j in previouslyAddedShows) {
			if (datesEqual(newArtistShowList[i].date, previouslyAddedShows[j].date)) {
				dupeDate = true;
				break;
			}
		}

		if (!dupeDate) {
			dedupedShows.push(newArtistShowList[i]);
		}
	}

	return dedupedShows;
}

module.exports = {
	instrumentCall,
	datesEqual,
	addDedupedShows
};