import * as dbHelpers     from "./helpers/db-helpers";
import * as showEmailer   from "./helpers/show-emailer";
import * as spotifyHelper from "./helpers/spotify-helper";
import * as localLineup   from "./local-lineup";

async function main() {
    const db =
        dbHelpers.openDb(process.env.DEPLOY_STAGE === "PROD" ? "/root/local-lineup/user_venues.db" : "user_venues.db");

    let venueListObjs: DbVenueList[];
    if (process.env.DEPLOY_STAGE === "PROD") {
        venueListObjs = await db.allAsync(`SELECT * from VenueLists;`, []);
    } else {
        venueListObjs =
            await db.allAsync(`SELECT * from VenueLists WHERE UserUid=(SELECT Uid FROM Users WHERE Email=?);`,
                              [ "dot4qu@virginia.edu" ]);
        if (venueListObjs.length !== 1) {
            console.log(`Warning, got ${
                venueListObjs.length} users from db when only expecting the single show.finder.bot one`);
        }
    }

    let emailPromises    = [];
    let playlistPromises = [];
    for (let venueListObj of venueListObjs) {
        const userUid        = venueListObj.UserUid;
        const venueIds       = venueListObj.VenueIds.split(",");
        const songsPerArtist = venueListObj.SongsPerArtist;
        const includeOpeners = venueListObj.IncludeOpeners;
        const location       = venueListObj.Location;

        // TODO :: get rid of this query and have the initial SELECT above join the two tables
        let userObj = await db.getAsync("SELECT * FROM Users WHERE Uid=?", [ userUid ]);

        // Preemptively refresh token with useless request for remainder of requests for this user
        const _ = await spotifyHelper.getLoggedInUserProfile(userObj.SpotifyAccessToken, userObj, db);

        // Unfortunately we need the user object to make the above test request, but have no way of knowing if that
        // request actually refreshed the token. If it did, we need to reload our user object since we still have the
        // stale token. Thus, this ugly double SQL query. Since this is only run for every venue list we have once a
        // week, I'm not too worried about it
        userObj = await db.getAsync("SELECT * FROM Users WHERE Uid=?", [ userUid ]);

        let venues = {
            seatgeek : venueIds.reduce(
                (obj, item) => {
                    obj[parseInt(item)] = null;
                    return obj;
                },
                {})
        };

        let startDate: Date = getStartDate();
        let endDate         = new Date(startDate);
        endDate.setDate(endDate.getDate() + 7);

        let services: any = await localLineup.getShowsForVenues(venues);
        if (services === undefined) {
            console.log(`Call to get shows for selected venues failed`);
            return;
        }

        // We get back every upcoming show by date string for each venue,
        // parse them as real dates and rebuild objects with user-facing date strings
        let showsByDate = Object.keys(services.seatgeek)
                              .filter(x => Date.parse(x) >= startDate.valueOf() && Date.parse(x) <= endDate.valueOf())
                              .reduce((obj, dateString) => {
                                  // 'as const' append hack for tsc:
                                  // https://stackoverflow.com/questions/66590691/typescript-type-string-is-not-assignable-to-type-numeric-2-digit-in-d
                                  let dateStringOptions = {weekday : "long", month : "long", day : "numeric"} as const;

                                  obj[new Date(dateString).toLocaleDateString("en-US", dateStringOptions)] =
                                      services.seatgeek[dateString];
                                  return obj;
                              }, {});

        if (Object.keys(showsByDate).length === 0) {
            console.log(`Got zero shows for venuelist user ${venueListObj.UserUid} in ${
                venueListObj.Location}, no email or playlist changes`);
            continue;
        }

        // if showsByDate empty that's fine, email will just be blank but no error
        let emailPromise = new Promise(async (resolve, reject) => {
                               let       exitCode =
                                   await showEmailer.sendShowsEmail(userObj, showsByDate, startDate, endDate);
                               if (exitCode < 0) {
                                   return reject(Error(userObj.Email));
                               }

                               resolve(userObj.Email);
                           }).catch(e => e);

        let playlistPromise = new Promise(async (resolve, reject) => {
            // Flatten showsByDate into one list of shows for the playlist builder
            let shows = [];
            if (showsByDate && Object.keys(showsByDate).length > 0) {
                shows = Object.keys(showsByDate).flatMap(x => showsByDate[x]);
            }

            console.log("Attempting to build playlist...");
            let       exitCode =
                await localLineup.buildPlaylist(userObj, shows, songsPerArtist, includeOpeners, location, db);
            if (exitCode < 0) {
                return reject(Error(userObj.SpotifyUsername));
            }

            resolve(userObj.Email);
        });

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

    let validEmails   = [];
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

    let validPlaylists   = [];
    let erroredPlaylists = [];
    playlistResults.forEach(x => {
        if (x instanceof Error) {
            erroredPlaylists.push(x.message);
            return;
        }

        validPlaylists.push(x);
    });

    console.log(`Successfully sent show emails to ${validEmails.length} emails`);
    console.log(`Email failed for ${erroredEmails.length} emails:`);
    erroredEmails.length > 0 && console.log(erroredEmails);

    console.log(`Successfully created playlists for ${validPlaylists.length} users`);
    console.log(`Playlist creation failed for ${erroredPlaylists.length} users:`);
    erroredPlaylists.length > 0 && console.log(erroredPlaylists);

    return 0;
}

// return a date 7 days from now with all time elements zeroed
function getStartDate(): Date {
    let d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(0);
    d.setMinutes(0);
    d.setSeconds(0);
    d.setMilliseconds(0);
    return d;
}

main().then(exitCode => { process.exit(exitCode); }).catch(e => {
    console.log("Uncaught exception when sending show emails:");
    console.log(e);
    process.exit(1);
});
