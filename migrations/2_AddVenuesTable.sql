CREATE TABLE Venues (
    Id number NOT NULL PRIMARY KEY,
    Location nvarchar NOT NULL,
    Name nvarchar NOT NULL,
    TicketUrl nvarchar
);

CREATE INDEX idx_venues_location ON Venues (Location);