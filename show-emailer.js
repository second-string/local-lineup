const Email = require('email-templates');
const sqlite = require('sqlite');
const venueShowSearch = require('./venue-show-finder');

async function sendShowsEmail(email) {
	if (email === null || email === undefined) {
		console.log('Must provide email to retrieve selected venues and send upcoming shows');
		return -1;
	}

	const db = await sqlite.open(process.env.DEPLOY_STAGE === 'PROD' ? '/home/pi/Show-Finder/USER_VENUES.db' : 'USER_VENUES.db');
	const tableName = 'VenueLists';
	const venueColumn = 'venueIds';
	let sql = `SELECT ${venueColumn} FROM ${tableName} WHERE email='${email}';`;
	let venueIdObject = await db.get(sql);
	let venueIds = venueIdObject.venueIds.split(',');

	let venues = {
		'seatgeek': venueIds.reduce((obj, item) => {
			obj[parseInt(item)] = null;
			return obj;
		}, {})
	};

	let services = await venueShowSearch.getShowsForVenues(venues);
	if (services === undefined || services.status >= 300) {
		console.log(`Call to get shows for selected venues failed with status ${services.status}`);
	}

	// Transform detailed key strings into basic date ones for email display
	let showsByDate = Object.keys(services.seatgeek).reduce((obj, item) => {
		obj[new Date(item).toLocaleDateString('en-US')] = services.seatgeek[item];
		return obj;
	}, {});

	// yes it's inefficient to redo this with another map but oh whale
	let startDate = new Date(Math.min.apply(null, Object.keys(showsByDate).map(x => new Date(x)))).toLocaleDateString('en-US');
	let endDate = new Date(Math.max.apply(null, Object.keys(showsByDate).map(x => new Date(x)))).toLocaleDateString('en-US');

	const emailObj = new Email({
		message: {
			from: '1123greenchores@gmail.com'
		},
		transport: {
			service: 'gmail',
			auth: {
				user: '1123greenchores@gmail.com',
				pass: process.env.CHORES_PW
			}
		},
		send: process.env.DEPLOY_STAGE === 'PROD' ? true : false
	});

	return emailObj.send({
		template: process.env.DEPLOY_STAGE === 'PROD' ? '/home/pi/Show-Finder/emails/test' : 'test',
		message: {
			to: email
		},
		locals: {
			startDate: startDate,
			endDate: endDate,
			showsByDate: showsByDate
		}
	})
	.catch(console.error);
}

module.exports = {
	sendShowsEmail
};

/*
const email = new Email({
	message: {
		from: '1123greenchores@gmail.com'
	},
	transport: {
 		service: 'gmail',
 		auth: {
        	user: '1123greenchores@gmail.com',
        	pass: process.env.CHORES_PW
    	}
	},
	send: true
});

email.send({
	template: 'test',
	message: {
		to: 'brian.team.jr@gmail.com'
	},
	locals: {
		testLocal: 'helloaf'
	}
})
.then(console.log)
.catch(console.error)
*/