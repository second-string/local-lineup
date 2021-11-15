const clientId          = process.env.CLIENT_ID;
const clientSecret      = process.env.CLIENT_SECRET;
const bandsInTownSecret = process.env.BANDS_IN_TOWN_SECRET;
const songkickSecret    = process.env.SONGKICK_SECRET;
const seatGeekClientId  = process.env.SEATGEEK_CLIENT_ID;
const jwtSigningSecret  = process.env.JWT_SIGNING_SECRET;

// Fake ID so we can show an entry for the user's library when they're searching by
// shows from their playlists. Real spotify playlist IDs are ~10 character encoded uid things
const user_library_playlist_id = "0";

// Should mirror the clients list in Helpers.js
const locations = [
    {value : "san francisco", displayName : "San Francisco"},
    {value : "los angeles", displayName : "Los Angeles"},
    {value : "washington", displayName : "Washington DC"},
    {value : "new york", displayName : "New York"},
    {value : "denver", displayName : "Denver"},
    {value : "chicago", displayName : "Chicago"},
    {value : "boston", displayName : "Boston"},
    {value : "austin", displayName : "Austin"},
    {value : "houston", displayName : "Houston"},
    {value : "charlotte", displayName : "Charlotte"},
    {value : "philadelphia", displayName : "Philadelphia"},
    {value : "seattle", displayName : "Seattle"},
];

module.exports = {
    clientId,
    clientSecret,
    bandsInTownSecret,
    songkickSecret,
    seatGeekClientId,
    jwtSigningSecret,
    user_library_playlist_id,
    locations,
}
