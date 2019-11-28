const sqlite = require('sqlite3');
const showEmailer = require('./show-emailer');
const venueShowSearch = require('./venue-show-finder');
const dbHelpers = require('./db-helpers');
const playlistBuilder = require('./playlist-builder');

async function main() {
	const db = dbHelpers.openDb(process.env.DEPLOY_STAGE === 'PROD' ? '/home/pi/Show-Finder/user_venues.db' : 'user_venues.db');

	let venueListObjs;
	if (process.env.DEPLOY_STAGE === 'PROD') {
		venueListObjs = await db.allAsync(`SELECT * from VenueLists;`, []);
	} else {
		venueListObjs = await db.allAsync(`SELECT * from VenueLists WHERE UserUid=(SELECT Uid FROM Users WHERE Email=?);`, ['show.finder.bot@gmail.com']);
		if (venueListObjs.length !== 1) {
			console.log(`Warning, got ${venueListObjs.length} users from db when only expecting the single show.finder.bot one`);
		}
	}

	let emailPromises = [];
	let playlistPromises = [];
	for (let venueListObj of venueListObjs) {
		const userUid = venueListObj.UserUid;
		let venueIds = venueListObj.VenueIds.split(',');

		// TODO :: get rid of this query and have the initial SELECT above join the two tables
		let userObj = await db.getAsync('SELECT * FROM Users WHERE Uid=?', [userUid]);

		let venues = {
			'seatgeek': venueIds.reduce((obj, item) => {
				obj[parseInt(item)] = null;
				return obj;
			}, {})
		};

		let startDate = getStartDate();
		let endDate = new Date(startDate);
		endDate.setDate(endDate.getDate() + 7);

		let services = await venueShowSearch.getShowsForVenues(venues);
		if (services === undefined || services.status >= 300) {
			console.log(`Call to get shows for selected venues failed with status ${services.status}`);
		}

		// We get back every upcoming show by date string for each venue,
		// parse them as real dates and rebuild objects with user-facing date strings
		let showsByDate = Object.keys(services.seatgeek)
			.filter(x => Date.parse(x) >= startDate && Date.parse(x) <= endDate)
			.reduce((obj, dateString) => {
				let dateStringOptions = {
					weekday: 'long',
					month: 'long',
					day: 'numeric'
				};

				obj[new Date(dateString).toLocaleDateString('en-US', dateStringOptions)] = services.seatgeek[dateString];
				return obj;
			}, {});

		let emailPromise = new Promise(async (resolve, reject) => {
			let exitCode = await showEmailer.sendShowsEmail(userObj, showsByDate, startDate, endDate);
			if (exitCode < 0) {
				return reject(Error(userObj.Email));
			}

			resolve(userObj.Email);
		})
		.catch(e => e);

		let playlistPromise = new Promise(async (resolve, reject) => {
			// Flatten showsByDate into one list of shows for the playlist builder
			let shows = Object.keys(showsByDate).flatMap(x => showsByDate[x]);
			let exitCode = await playlistBuilder.buildPlaylist(db, userObj, shows);
			if (exitCode < 0) {
				return reject(Error(userObj.SpotifyUsername));
			}

			resolve(userObj.Email);
		})

		emailPromises.push(emailPromise);
		playlistPromises.push(playlistPromise);
	}

	let emailResults = null;
	try {
		emailResults = await Promise.all(emailPromises);
	} catch (e) {
		console.log(e);
		console.log(emailPromises);
		return -1;
	}

	if (emailResults === null) {
		return -1;
	}

	let validEmails = [];
	let erroredEmails = [];
	emailResults.forEach(x => {
		if (x instanceof Error) {
			erroredEmails.push(x.message);
			return;
		}

		validEmails.push(x);
	});

	let playlistResults = null;
	try {
		playlistResults = await Promise.all(playlistPromises);
	} catch (e) {
		console.log(e);
		return -1;
	}

	if (playlistResults === null) {
		return -1;
	}

	let validPlaylists = [];
	let erroredPlaylists = [];
	playlistResults.forEach(x => {
		if (x instanceof Error) {
			erroredPlaylists.push(x.message);
			return;
		}

		validPlaylists.push(x);
	});

	console.log(`Successfully sent show emails to ${validEmails.length} emails`);
	console.log(`Email failed for ${erroredEmails.length} emails:`)
	erroredEmails.length > 0 && console.log(erroredEmails);

	console.log(`Successfully created playlists for ${validPlaylists.length} users`);
	console.log(`Playlist creation failed for ${erroredPlaylists.length} users:`)
	erroredPlaylists.length > 0 && console.log(erroredPlaylists);

	return 0;
}

// return a date 7 days from now with all time elements zeroed
function getStartDate() {
	let d = new Date();
	d.setDate(d.getDate() + 7);
	d.setHours(0);
	d.setMinutes(0);
	d.setSeconds(0);
	d.setMilliseconds(0);
	return d;
}

main()
	.then(exitCode => {
		process.exit(exitCode);
	})
	.catch(e => {
		console.log('Uncaught exception when sending show emails:');
		console.log(e);
		process.exit(1);
	});
