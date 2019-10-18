const sqlite = require('sqlite3');
const dbHelpers = require('./db-helpers');

const venueListDbPath = 'user_venues.db';
const db = dbHelpers.openDb('user_venues.db');

const createUsersTableSql = `
CREATE TABLE IF NOT EXISTS Users (
    Email nvarchar NOT NULL PRIMARY KEY,
    SpotifyUsername nvarchar,
    FullName nvarchar,
    SpotifyAccessToken nvarchar NOT NULL,
    SpotifyRefreshToken nvarchar NOT NULL,
    SessionToken nvarchar
)`;

const createVenueListsTableSql = `
CREATE TABLE IF NOT EXISTS VenueLists(
    Email nvarchar NOT NULL PRIMARY KEY,
    VenueIds nvarchar NOT NULL
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

