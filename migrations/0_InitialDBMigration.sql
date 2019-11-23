CREATE TABLE IF NOT EXISTS Users (
    Uid nvarchar NOT NULL PRIMARY KEY,
    Email nvarchar NOT NULL,
    SpotifyUsername nvarchar,
    FullName nvarchar,
    SpotifyAccessToken nvarchar NOT NULL,
    SpotifyRefreshToken nvarchar NOT NULL
);

CREATE TABLE IF NOT EXISTS VenueLists(
    UserUid nvarchar NOT NULL,
    Location nvarchar NOT NULL,
    VenueIds nvarchar NOT NULL,
    PRIMARY KEY (UserUid, Location) ON CONFLICT REPLACE
);