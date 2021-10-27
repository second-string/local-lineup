// We only need to import /client-ses here, but I think aws-sdk has to be npm installed in its entirety to properly
// source access keys from env vars. Maybe not and something else was messed up but it was fishy before I installed the
// full thing
import * as aws from "@aws-sdk/client-ses";

import Email from 'email-templates';
import nodemailer from "nodemailer";

import * as localLineup from '../local-lineup';

export async function sendShowsEmail(userObj, shows, startDate, endDate) {
    if (userObj === null || userObj === undefined) {
        console.log('Must provide user object to retrieve selected venues and send upcoming shows');
        return -1;
    }

    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        // Fail hard with nothing set
        const err = 'No env vars set for AWS SES IAM user, run setup_env.sh';
        console.error(err);
        throw new Error('No env vars set for AWS SES IAM user, run setup_env.sh');
    }

    // Prettify for the email template
    startDate = startDate.toLocaleDateString('en-US');
    endDate   = endDate.toLocaleDateString('en-US');

    let baseUrl        = process.env.DEPLOY_STAGE === 'PROD' ? 'locallineup.live' : 'localhost';
    let unsubscribeUrl = `https://${baseUrl}/local-lineup/delete-venues?uid=${userObj.Uid}`;

    // Keys from env vars
    const ses       = new aws.SES({
        region : "us-east-1",
    });
    const transport = nodemailer.createTransport({
        SES : {ses, aws},
    });

    const emailObj = new Email({message : {from : 'concierge@locallineup.live'}, transport : transport, send : true});

    return emailObj
        .send({
            template : process.env.DEPLOY_STAGE === 'PROD' ? '/root/local-lineup/emails/test' : 'test',
            message : {to : userObj.Email},
            locals : {startDate : startDate, endDate : endDate, showsByDate : shows, unsubscribeUrl : unsubscribeUrl}
        })
        .catch(e => {
            console.log(e);
            return -1
        });
}
