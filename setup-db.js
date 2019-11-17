const sqlite = require('sqlite3');
const dbHelpers = require('./db-helpers');

const venueListDbPath = 'user_venues.db';
const db = dbHelpers.openDb('user_venues.db');

const createUsersTableSql = `
CREATE TABLE IF NOT EXISTS Users (
    Uid nvarchar NOT NULL PRIMARY KEY,
    Email nvarchar NOT NULL,
    SpotifyUsername nvarchar,
    FullName nvarchar,
    SpotifyAccessToken nvarchar NOT NULL,
    SpotifyRefreshToken nvarchar NOT NULL
)`;

const createVenueListsTableSql = `
CREATE TABLE IF NOT EXISTS VenueLists(
    UserUid nvarchar NOT NULL,
    Location nvarchar NOT NULL,
    VenueIds nvarchar NOT NULL,
    PRIMARY KEY (UserUid, Location) ON CONFLICT REPLACE
)`;

db.serialize(async () => {
    await db.runAsync(createUsersTableSql, (err) => {
        if (err) {
            console.log(err);
        }
    });

    await db.runAsync(createVenueListsTableSql, (err) => {
        if (err) {
            console.log(err);
        }
    });

    db.close();
});

