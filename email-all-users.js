const sqlite = require('sqlite');
const showEmailer = require('./show-emailer.js');

async function main() {
	const dbPromise = sqlite.open('./USER_VENUES.db');
	const db = await dbPromise;

	const emailColumn = 'email';
	const tableName = 'VenueLists';

	let sql = `SELECT ${emailColumn} from ${tableName};`;
	let emails = await db.all(sql);
	let emailPromises = [];
	for (emailObj of emails) {
		let email = emailObj.email
		let emailPromise = new Promise(async (resolve, reject) => {
			let responseCode = await showEmailer.sendShowsEmail(email);
			if (responseCode < 0) {
				return reject(Error(email));
			}

			resolve(email);
		})
		.catch(e => e);

		emailPromises.push(emailPromise);
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

	console.log(`Successfully sent show emails to ${valid.length} emails`);
	console.log(`Email failed for ${errored.length} emails:`)
	errored && console.log(errored);

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