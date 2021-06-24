require('dotenv').load();

module.exports = {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    spotifyUserId: process.env.SPOTIFY_USERNAME,
    bandsInTownSecret: process.env.BANDS_IN_TOWN_SECRET,
    songkickSecret: process.env.SONGKICK_SECRET,
    seatGeekClientId: process.env.SEATGEEK_CLIENT_ID,
    jwtSigningSecret: process.env.JWT_SIGNING_SECRET
};
