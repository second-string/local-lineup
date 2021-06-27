var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const helpers = require('./helpers/helpers');
const constants = require('./helpers/constants');
var seatGeekAuth = () => 'Basic ' + Buffer.from(`${constants.seatGeekClientId}:`).toString('base64');
function getVenues(location, db) {
    return __awaiter(this, void 0, void 0, function* () {
        const venueObjs = yield db.allAsync('SELECT * FROM Venues WHERE Location=?', [location]);
        if (!venueObjs) {
            return {};
        }
        // Map to api lowercase values. Should probably refactor the react code to use DB column names at some point
        return venueObjs.map(x => ({ id: x.Id, name: x.Name, ticketUrl: x.TicketUrl }));
    });
}
/*
  param is object with service name keys mapped to object holding venue names by ID
  {
    "seatgeek": {
        "12": "Fox Theater",
        "354": "The Independent"
    },
    "songkick": {
        ...
    }
  }
*/
function getShowsForVenues(venues) {
    return __awaiter(this, void 0, void 0, function* () {
        let showsByVenueId = {};
        if (venues.seatgeek) {
            const resObj = yield getSeatGeekShows(venues.seatgeek);
            if (resObj.success) {
                showsByVenueId['seatgeek'] = resObj.response;
            }
            else {
                console.error("Failure getting shows for seatgeek, returning empty list for showsByVenueId['seatgeek']. Error: ");
                showsByVenueId['seatgeek'] = [];
            }
        }
        return showsByVenueId;
    });
}
function getSeatGeekShows(venuesById) {
    return __awaiter(this, void 0, void 0, function* () {
        let getOptions = {
            method: 'GET',
            headers: { 'Content-type': 'application/json', 'Authorization': seatGeekAuth() }
        };
        let showList = [];
        let venueString = Object.keys(venuesById).join(',');
        let page = 1;
        let perPage = 50;
        let total = 0;
        let totalMillis = 0;
        console.log(`Getting shows for venues...`);
        do {
            let { success, response } = yield helpers.instrumentCall(`https://api.seatgeek.com/2/events?venue.id=${venueString}&per_page=${perPage}&page=${page++}`, getOptions, false);
            if (!success) {
                return { success, response };
            }
            // Filter out all sports events and whatnot
            showList = showList.concat(response.events.filter(x => x.type.toLowerCase() === "concert" || x.type.toLowerCase() === "festival"));
            total = response.meta.total;
            totalMillis += response.meta.took;
        } while (page * perPage <= total);
        console.log(`Took ${totalMillis} milliseconds to get ${total} shows from ${Object.keys(venuesById).length} venues`);
        let showsByDate = {};
        for (let show of showList) {
            let showDate = new Date(show.datetime_local);
            showDate.setHours(0);
            showDate.setMinutes(0);
            showDate.setSeconds(0);
            if (showsByDate[showDate]) {
                showsByDate[showDate] = showsByDate[showDate].concat(show);
            }
            else {
                showsByDate[showDate] = [show];
            }
        }
        return { success: true, response: showsByDate };
    });
}
/*
meta: ...,
events: [
{ links: [],
       event_promotion: null,
       conditional: false,
       is_open: false,
       id: 4613178,
       stats: [Object],
       title: 'Milwaukee Brewers at San Francisco Giants',
       announce_date: '2018-10-31T00:00:00',
       score: 0.836,
       access_method: [Object],
       announcements: {},
       taxonomies: [Array],
       type: 'mlb',
       status: 'normal',
       description: '',
       datetime_local: '2019-06-16T13:05:00',
       visible_until_utc: '2019-06-17T00:05:00',
       time_tbd: false,
       date_tbd: false,
       performers: [Array],
       url:
        'https://seatgeek.com/brewers-at-giants-tickets/6-16-2019-san-francisco-california-oracle-park/mlb/4613178',
       created_at: '2018-10-31T16:17:12',
       popularity: 0.872,
       venue: [Object],
       enddatetime_utc: null,
       short_title: 'Brewers at Giants',
       datetime_utc: '2019-06-16T20:05:00',
       datetime_tbd: false },
       */
module.exports = {
    getVenues,
    getShowsForVenues
};
