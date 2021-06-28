export const clientId: string          = process.env.CLIENT_ID;
export const clientSecret: string      = process.env.CLIENT_SECRET;
export const bandsInTownSecret: string = process.env.BANDS_IN_TOWN_SECRET;
export const songkickSecret: string    = process.env.SONGKICK_SECRET;
export const seatGeekClientId: string  = process.env.SEATGEEK_CLIENT_ID;
export const jwtSigningSecret: string  = process.env.JWT_SIGNING_SECRET;

// Fake ID so we can show an entry for the user's library when they're searching by
// shows from their playlists
export const user_library_playlist_id: Number = 0;
