const helpers = require('./helpers');
const constants = require('./constants')

var seatGeekAuth = () => 'Basic ' + Buffer.from(`${constants.seatGeekClientId}:`).toString('base64');

async function getVenues(city) {
	let getOptions = {
		method: 'GET',
		headers: {
			'Content-type': 'application/json',
			'Authorization': seatGeekAuth()
		}
	};

	let venueList = [];
	let page = 1;
	let perPage = 100;
	let total = 0;
	let totalMillis = 0;
	console.log(`Getting ${city} venues...`);
	do {
		let { success, response } = await helpers.instrumentCall(`https://api.seatgeek.com/2/venues?city=${city}&per_page=${perPage}&page=${page++}`, getOptions,
			false);

		if (!success) {
			return response;
		}

		venueList = venueList.concat(response.venues);
		total = response.meta.total;
		totalMillis += response.meta.took
	} while (page * perPage <= total);

	console.log(`Took ${totalMillis} milliseconds to get ${total} venues`);

	// De-dupe venues cause they send a ton of repeats
	let hasSeen = {};
	return venueList.filter(x => hasSeen.hasOwnProperty(x.id) ? false : (hasSeen[x.id] = true))
}

module.exports = {
	getVenues
}