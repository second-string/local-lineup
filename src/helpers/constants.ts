export const clientId: String          = process.env.CLIENT_ID;
export const clientSecret: String      = process.env.CLIENT_SECRET;
export const bandsInTownSecret: String = process.env.BANDS_IN_TOWN_SECRET;
export const songkickSecret: String    = process.env.SONGKICK_SECRET;
export const seatGeekClientId: String  = process.env.SEATGEEK_CLIENT_ID;
export const jwtSigningSecret: String  = process.env.JWT_SIGNING_SECRET;

// Fake ID so we can show an entry for the user's library when they're searching by
// shows from their playlists
export const user_library_playlist_id: Number = 0;
