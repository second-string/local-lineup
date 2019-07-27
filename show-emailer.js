const Email = require('email-templates');
const sqlite = require('sqlite');
const venueShowSearch = require('./venue-show-finder');

async function sendShowsEmail(email) {
	if (email === null || email === undefined) {
		console.log('Must provide email to retrieve selected venues and send upcoming shows');
		return -1;
	}

	if (process.env.OAUTH2_CLIENT_ID === undefined
		|| process.env.OAUTH2_CLIENT_SECRET === undefined
		|| process.env.OAUTH2_ACCESS_TOKEN === undefined) {
		console.log('No env vars set for OAuth2, run setup_env.sh');
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
	// let startDate = new Date(Math.min.apply(null, Object.keys(showsByDate).map(x => new Date(x)))).toLocaleDateString('en-US');
	// let endDate = new Date(Math.max.apply(null, Object.keys(showsByDate).map(x => new Date(x)))).toLocaleDateString('en-US');
	let startDate = getStartDate();
	let endDate = new Date();
	endDate.setDate(startDate.getDate() + 7);

	// Map to date for comparison and then back to locale string for retrieval of show object.
	// Dict lookups with a key of a date weren't working and I didn't want to deal with it
	let filteredShowsByDate = Object.keys(showsByDate)
		.map(x => new Date(x))
		.filter(x => x >= startDate && x <= endDate)
		.reduce((obj, date) => {
			let dateStringOptions = {
				weekday: 'long',
				month: 'long',
				day: 'numeric'
			};

			obj[date.toLocaleDateString('en-US', dateStringOptions)] = showsByDate[date.toLocaleDateString('en-US')];
			return obj;
		}, {});


	// Prettify for the email template
	startDate = startDate.toLocaleDateString('en-US');
	endDate = endDate.toLocaleDateString('en-US');

// TODO :: BT seems like this should be working but need to ternary it for dev/prod. Can test first by deploying and testing on prod
	let unsubscribeUrl = `https://brianteam.dev/show-finder/delete-venues?email=${email}`;

	// oauth auth object fields: https://nodemailer.com/smtp/oauth2/
	const emailObj = new Email({
		message: {
			from: '1123greenchores@gmail.com'
		},
		transport: {
			service: 'gmail',
			auth: {
				user: '1123greenchores@gmail.com',
				type: 'OAuth2',
				clientId: process.env.OAUTH2_CLIENT_ID,
				clientSecret: process.env.OAUTH2_CLIENT_SECRET,
				refreshToken: process.env.OAUTH2_REFRESH_TOKEN,
				accessToken: process.env.OAUTH2_ACCESS_TOKEN
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
			showsByDate: filteredShowsByDate,
			unsubscribeUrl: unsubscribeUrl
		}
	})
	.catch(e => {
		console.log(e);
		return -1
	});
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
