const sqlite = require('sqlite3');
const showEmailer = require('./show-emailer');
const dbHelpers = require('./db-helpers');
const playlistBuilder = require('./playlist-builder');

async function main() {
	// const dbPromise = sqlite.open(process.env.DEPLOY_STAGE === 'PROD' ? '/home/pi/Show-Finder/user_venues.db' : 'user_venues.db');
	const db = dbHelpers.openDb(process.env.DEPLOY_STAGE === 'PROD' ? '/home/pi/Show-Finder/user_venues.db' : 'user_venues.db');
	// const db = await dbPromise;
	const emailColumn = 'Email';
	const tableName = 'VenueLists';

	let sql = `SELECT ${emailColumn} from ${tableName};`;
	let emails = await db.allAsync(sql, []);
	let emailPromises = [];
	let playlistPromises = [];
	for (emailObj of emails) {
		let email = emailObj.Email
		let emailPromise = new Promise(async (resolve, reject) => {
			// let responseCode = await showEmailer.sendShowsEmail(email);
			// if (responseCode < 0) {
			// 	return reject(Error(email));
			// }

			resolve(email);
		})
		.catch(e => e);

		let playlistPromise = new Promise(async (resolve, reject) => {
			let responseCode = await playlistBuilder.buildPlaylist(email);
			if (responseCode < 0) {
				return reject(Error(email));
			}

			resolve(email);
		})

		emailPromises.push(emailPromise);
		playlistPromises.push(playlistPromise);
	}

	let results = null;
	try {
		results = await Promise.all(emailPromises);
	} catch (e) {
		console.log(e);
		console.log(emailPromises);
		return -1;
	}

	if (results === null) {
		return -1;
	}

	let valid = [];
	let errored = [];
	results.forEach(x => {
		if (x instanceof Error) {
			errored.push(x.message);
			return;
		}

		valid.push(x);
	});

	try {
		results = await Promise.all(playlistPromises);
	} catch (e) {
		console.log(e);
		return -1;
	}

	// 	if (results === null) {
	// 	return -1;
	// }

	// let valid = [];
	// let errored = [];
	// results.forEach(x => {
	// 	if (x instanceof Error) {
	// 		errored.push(x.message);
	// 		return;
	// 	}

	// 	valid.push(x);
	// });

	console.log(`Successfully sent show emails to ${valid.length} emails`);
	console.log(`Email failed for ${errored.length} emails:`)
	errored.length > 0 && console.log(errored);

	return 0;
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
