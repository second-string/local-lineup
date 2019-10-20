const Email = require('email-templates');
// const sqlite = require('sqlite');
const venueShowSearch = require('./venue-show-finder');

async function sendShowsEmail(email, shows, startDate, endDate) {
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

	// Transform shows by date object into shows by user-facing short date string for email display
	// let showsByDateString = Object.keys(shows).reduce((obj, item) => {
	// 	let dateStringOptions = {
	// 		weekday: 'long',
	// 		month: 'long',
	// 		day: 'numeric'
	// 	};

	// 	obj[item.toLocaleDateString('en-US', dateStringOptions)] = shows[item];
	// 	return obj;
	// }, {});

	// Prettify for the email template
	startDate = startDate.toLocaleDateString('en-US');
	endDate = endDate.toLocaleDateString('en-US');

	let unsubscribeUrl = process.env.DEPLOY_STAGE === 'PROD' ? `https://brianteam.dev/show-finder/delete-venues?email=${email}` : `https://localhost/show-finder/delete-venues?email=${email}`;

	// oauth auth object fields: https://nodemailer.com/smtp/oauth2/
	const emailObj = new Email({
		message: {
			from: 'show.finder.bot@gmail.com'
		},
		transport: {
			service: 'gmail',
			auth: {
				user: 'show.finder.bot@gmail.com',
				type: 'OAuth2',
				clientId: process.env.OAUTH2_CLIENT_ID,
				clientSecret: process.env.OAUTH2_CLIENT_SECRET,
				refreshToken: process.env.OAUTH2_REFRESH_TOKEN,
				accessToken: process.env.OAUTH2_ACCESS_TOKEN
			}
		},
		send: true
	});

	return emailObj.send({
		template: process.env.DEPLOY_STAGE === 'PROD' ? '/home/pi/Show-Finder/emails/test' : 'test',
		message: {
			to: email
		},
		locals: {
			startDate: startDate,
			endDate: endDate,
			showsByDate: shows,
			unsubscribeUrl: unsubscribeUrl
		}
	})
	.catch(e => {
		console.log(e);
		return -1
	});
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
