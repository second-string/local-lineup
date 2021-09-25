declare namespace Express {
    export interface Request {
        sessionToken: string;
    }
}

interface DbUser {
    Uid: string;
    Email: string;
    SpotifyUsername: string;
    FullName: string;
    SpotifyAccessToken: string;
    SpotifyRefreshToken: string;
}

interface DbVenueList {
    UserUid: string;
    Location: string;
    VenueIds: string;
    SongsPerArtist: number;
    IncludeOpeners: boolean;
}

interface DbVenue {
    Id: number;
    Location: string;
    Name: string;
    TicketUrl: string;
}
