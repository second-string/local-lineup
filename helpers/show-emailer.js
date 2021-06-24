const Email = require('email-templates');

const venueShowSearch = require('../venue-show-finder');

async function sendShowsEmail(userObj, shows, startDate, endDate) {
    if (userObj === null || userObj === undefined) {
        console.log('Must provide user object to retrieve selected venues and send upcoming shows');
        return -1;
    }

    if (process.env.OAUTH2_CLIENT_ID === undefined
        || process.env.OAUTH2_CLIENT_SECRET === undefined
        || process.env.OAUTH2_ACCESS_TOKEN === undefined) {
        console.log('No env vars set for OAuth2, run setup_env.sh');
        return -1;
    }

    // Prettify for the email template
    startDate = startDate.toLocaleDateString('en-US');
    endDate = endDate.toLocaleDateString('en-US');

    let baseUrl = process.env.DEPLOY_STAGE === 'PROD' ? 'brianteam.dev' : 'localhost';
    let unsubscribeUrl = `https://${baseUrl}/show-finder/delete-venues?uid=${userObj.Uid}`;

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
            to: userObj.Email
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
