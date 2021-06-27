var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var fetch = require("node-fetch");
var cheerio = require("cheerio");
// Will return the { id, name } object for the artist we're looking for, null if this
// dom artist does not match
function getMatchingArtist(domArtist, userSelectedArtists) {
    // Surprise! foopee sometimes will have a blank artist name or empty children list as a bug
    if (domArtist.children.length === 0 || domArtist.children[0].data === undefined) {
        return null;
    }
    for (artistObject of userSelectedArtists) {
        if (decodeURIComponent(artistObject.name).toLowerCase() === domArtist.children[0].data.toLowerCase()) {
            return artistObject;
        }
    }
    return null;
}
// artists param is a list of { id, name }
function getFoopeeShows(artists) {
    return __awaiter(this, void 0, void 0, function* () {
        let unparsedResponse = yield fetch("http://www.foopee.com/punk/the-list/", { method: "GET" });
        if (!unparsedResponse.ok) {
            console.log(`Status of ${unparsedResponse.statusText}, exiting`);
            console.log(unparsedResponse);
            process.exit(1);
        }
        let response = yield unparsedResponse.text();
        // Pulling in all bands available on page
        let root = cheerio.load(response);
        let headings = root("dt > b");
        let bandsTable = null;
        for (let i = 0; i < headings.length; i++) {
            let text = headings[i].children[0].data;
            if (text.toLowerCase().includes("band")) {
                bandsTable = headings[i].parent.next;
                break;
            }
        }
        // All bands are stored on one of five pages, broken up by chunks of the alphabet.
        // We want to store each artist/id list as the value of a key for that page's href, so
        // we can grab every artist per page and only deal with 4 to 5 requests total.
        // { [href]: { id, name } }. Again, can incur a pretty bad runtime if we're looking
        // for a long list of user-supplied artists as described in the comment below.
        let artistObjectsByHref = {};
        let domArtists = bandsTable.children.filter(x => x.name === "a");
        for (let index in domArtists) {
            let domArtist = domArtists[index];
            if (domArtist === undefined) {
                console.log(index);
            }
            let matchingArtistObject = getMatchingArtist(domArtist, artists);
            if (matchingArtistObject === null) {
                continue;
            }
            let poundIndex = domArtist.attribs.href.indexOf("#");
            let page = domArtist.attribs.href.substring(0, poundIndex);
            let band = domArtist.attribs.href.substring(poundIndex + 1);
            if (artistObjectsByHref[page]) {
                artistObjectsByHref[page].push({ id: matchingArtistObject.id, name: band });
            }
            else {
                artistObjectsByHref[page] = [{ id: matchingArtistObject.id, name: band }];
            }
        }
        let shows = [];
        for (index in Object.keys(artistObjectsByHref)) {
            // request page href
            let href = Object.keys(artistObjectsByHref)[index];
            let unparsedShowPage = yield fetch(`http://www.foopee.com/punk/the-list/${href}`, { method: "GET" });
            if (!unparsedShowPage.ok) {
                console.log(`Status of ${unparsedShowPage.statusText}, exiting`);
                console.log(unparsedShowPage);
                process.exit(1);
            }
            let showPage = yield unparsedShowPage.text();
            // Yeah so right now this is going to run down the entire page of artists and if one of them
            // is in our list of artists we're looking for on this page, we grab their shows and keep going.
            // Once we've found all our artists we break. I'm pretty sure this is O(n) of artists on the page
            // (because I'm assuming that the number of artists we're searching for is decently < number on page),
            // versus O(n^2) for if we looped through the artists we're looking for and then scan down the
            // page for each of them, but I dunno if cheerio does some shit better than that.
            root = cheerio.load(showPage);
            let domArtists = root("li > a");
            let artistObjectsOnPage = artistObjectsByHref[href];
            for (let key of Object.keys(domArtists)) {
                // If we've found every artist no need to iterate through more
                if (artistObjectsOnPage.length === 0) {
                    break;
                }
                let pageArtist = domArtists[key];
                if (pageArtist.attribs &&
                    (artistObjectIndex = artistObjectsOnPage.map(x => x.name).indexOf(pageArtist.attribs.name)) > -1) {
                    let showListObject = pageArtist.next.children;
                    let domShows = showListObject.filter(x => x.name === "li");
                    let listOfShowObjs = [];
                    for (showIndex in domShows) {
                        let info = domShows[showIndex].children;
                        let date = info.filter(x => x.name === "b")[0].children.filter(x => x.name === "a")[0].children[0].data;
                        let venue = info.filter(x => x.name === "a")[0].children[0].data;
                        let cleanedStr = venue + " on " + date; // TODO :: format date correctly
                        listOfShowObjs.push({ date: new Date(date).setYear(new Date().getFullYear()), show: cleanedStr });
                    }
                    shows.push({ id: artistObjectsOnPage[artistObjectIndex].id, showObjects: listOfShowObjs });
                    // Remove just-found artist
                    artistObjectsOnPage.splice(artistObjectIndex, 1);
                }
            }
        }
        return shows;
    });
}
module.exports = {
    getFoopeeShows: getFoopeeShows
};
