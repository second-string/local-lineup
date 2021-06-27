// import * as constants from "./constants";
// import * as helpers   from "./helpers";
// const constants = require("./constants");
// const helpers = require("./helpers");

// export const testvar: boolean = true;

// export async function getPlaylists(spotifyToken, userUid) {
//     console.log("Getting playlists...");
//     let {success, response} =
//         await helpers.autoRetrySpotifyCall(spotifyToken,
//                                            `https://api.spotify.com/v1/users/${userUid}/playlists`,
//                                            "GET",
//                                            userUid,
//                                            false);
//     if (!success) {
//         return response;
//     }

//     let playlistNamesById = {};
//     response.items.forEach(x => (playlistNamesById[x.id] = x.name));

//     // Shove a fake playlist in there for the users liked songs
//     playlistNamesById[constants.user_library_playlist_id] = "All Liked Songs";

//     return playlistNamesById;
// }
