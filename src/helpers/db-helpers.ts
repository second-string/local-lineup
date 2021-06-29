import sqlite3 from "sqlite3";

// Open sqlite db and log for success or fail
export function openDb(pathToDb) {
    return new sqlite3.Database(pathToDb, (err) => {
        if (err) {
            console.log(err);
            return process.exit(-1);
        }

        console.log(`DB at '${pathToDb}' opened successfully`);
    });
}

// Simple handler to log and reject a promise on fail, resolve with single object on success
export function errOrResolveObject(resolve, reject, err, obj) {
    if (err) {
        console.log(err);
        return reject(err);
    }

    resolve(obj);
}

// Simple handler to log and reject a promise on fail, resolve with list of objects on success
export function errOrResolveList(resolve, reject, err, objs) {
    if (err) {
        console.log(err);
        return reject(err);
    }

    resolve(objs);
}

sqlite3.Database.prototype.getAsync = function(sql, params?: any) {
    return new Promise((resolve, reject) => {
        if (params) {
            this.get(sql, params, (err, row) => errOrResolveObject(resolve, reject, err, row));
        } else {
            this.get(sql, (err, row) => errOrResolveObject(resolve, reject, err, row));
        }
    });
};

sqlite3.Database.prototype.runAsync = function(sql, params?: any) {
    return new Promise((resolve, reject) => {
        if (params) {
            this.run(sql, params, (err) => errOrResolveObject(resolve, reject, err, null));
        } else {
            this.run(sql, (err) => errOrResolveObject(resolve, reject, err, null));
        }
    });
};

sqlite3.Database.prototype.allAsync = function(sql, params?: any) {
    return new Promise((resolve, reject) => {
        if (params) {
            this.all(sql, params, (err, rows) => errOrResolveList(resolve, reject, err, rows));
        } else {
            this.all(sql, (err, rows) => errOrResolveList(resolve, reject, err, rows));
        }
    });
};

sqlite3.Database.prototype.trace = function() {
    return this.on("trace", sql => console.log(sql));
};
