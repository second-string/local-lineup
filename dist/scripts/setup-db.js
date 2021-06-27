var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const sqlite = require('sqlite3');
const path = require('path');
const { promises: fs } = require('fs');
const dbHelpers = require('../helpers/db-helpers');
const venueListDb = 'user_venues.db';
const venueListDbPath = path.join('..', venueListDb);
const migrationsDir = '../migrations';
const dbBacksupsDir = '../db_backups';
const db = dbHelpers.openDb(venueListDbPath);
function migrate() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield fs.access(dbBacksupsDir);
        }
        catch (_a) {
            yield fs.mkdir(dbBacksupsDir);
        }
        // Copy db file to backup. Eventually just overwrite single backup but might as well keep em for now
        const now = new Date();
        const dbBackupFilename = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}_${venueListDb}`;
        yield fs.copyFile(venueListDbPath, path.join(dbBacksupsDir, dbBackupFilename));
        const migrationFilenames = yield fs.readdir(migrationsDir);
        migrationFilenames.sort();
        // migrationStatements is a list of { filename: string, statements: string[] } objects
        let migrationStatements = [];
        const sqlRegex = /^.*\.(sql|SQL)$/;
        for (const filename of migrationFilenames) {
            if (sqlRegex.test(filename)) {
                const file = yield fs.readFile(path.join(migrationsDir, filename), 'utf-8');
                // Split statements by semicolon and strip newlines from the ends.
                // Filter out the final empty string from splitting on the last semicolon
                const statements = file.split(';').map(x => x.trim()).filter(x => x !== '');
                migrationStatements = migrationStatements.concat(({ filename: filename, statements: statements }));
            }
        }
        let lastRunMigrationObj = null;
        try {
            lastRunMigrationObj = yield db.getAsync('SELECT MigrationFile FROM Migrations ORDER BY DateRun DESC LIMIT 1');
        }
        catch (_b) {
            console.log('Migrations table doesn\'t exist, starting from initial migration');
        }
        let startIndex = 0;
        if (lastRunMigrationObj && lastRunMigrationObj.MigrationFile) {
            startIndex = migrationStatements.map(x => x.filename).indexOf(lastRunMigrationObj.MigrationFile);
            // If we don't find it for some weird reason, start over. Otherwise, add 1 to start with the next one
            startIndex = startIndex == -1 ? 0 : startIndex + 1;
        }
        const numMigrationsToRun = Object.keys(migrationStatements).length;
        if (startIndex === numMigrationsToRun) {
            console.log('No new migrations to apply, returning');
            return;
        }
        db.serialize(() => __awaiter(this, void 0, void 0, function* () {
            for (let i = startIndex; i < numMigrationsToRun; i++) {
                const migrationObj = migrationStatements[i];
                console.log(`Running migrations for ${migrationObj.filename}`);
                const statements = migrationObj.statements;
                for (const statement of statements) {
                    db.run(statement, dbHelpers.handleErr);
                }
            }
            const lastAppliedMigrationObject = migrationStatements[migrationStatements.length - 1];
            console.log(`Saving ${lastAppliedMigrationObject.filename} as most recent applied migration file`);
            db.run('INSERT OR REPLACE INTO Migrations (MigrationFile, DateRun) VALUES (?, ?)', [lastAppliedMigrationObject.filename, now.toISOString()]);
            db.close();
        }));
    });
}
migrate().catch(e => { throw e; });
