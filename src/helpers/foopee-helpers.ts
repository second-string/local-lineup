import * as foopee from "../scripts/foopee-scrape";

// Assuming location-checking for location of SF is done beforehand
export async function getFoopeeShows(artists, location, showsByArtistId) {
    console.log("Getting foopee artist shows...");
    let foopeeShows = await foopee.getFoopeeShows(artists);
    for (const foopeeObject of foopeeShows) {
        if (showsByArtistId[foopeeObject.id]) {
            showsByArtistId[foopeeObject.id] = showsByArtistId[foopeeObject.id].concat(foopeeObject.showObjects);
        } else {
            showsByArtistId[foopeeObject.id] = foopeeObject.showObjects;
        }
    }
    console.log(`Added or appended shows for ${Object.keys(foopeeShows).length} artists from Foopee`);
}
