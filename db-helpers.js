const sqlite = require('sqlite3');

// Open sqlite db and log for success or fail
function openDb(pathToDb) {
    return new sqlite.Database(pathToDb, (err) => {
        if (err) {
            console.log(err);
            return process.exit(-1);
        }

        console.log(`DB at '${pathToDb}' opened successfully`);
    });
}

// Simple handler to log and reject a promise on fail, resolve with single object on success
function errOrResolveObject(resolve, reject, err, obj) {
    if (err) {
        console.log(err);
        return reject(err);
    }

    resolve(obj);
}

// Simple handler to log and reject a promise on fail, resolve with list of objects on success
function errOrResolveList(resolve, reject, err, objs) {
    if (err) {
        console.log(err);
        return reject(err);
    }

    resolve(objs);
}

sqlite.Database.prototype.getAsync = function(sql, params){
    return new Promise((resolve, reject) => {
        if (params) {
            this.get(sql, params, (err, row) => errOrResolveObject(resolve, reject, err, row));
        } else {
            this.get(sql, (err, row) => errOrResolveObject(resolve, reject, err, row));
        }
    });
};

sqlite.Database.prototype.runAsync = function(sql, params){
    return new Promise((resolve, reject) => {
        if (params) {
            this.run(sql, params, (err) => errOrResolveObject(resolve, reject, err, null));
        } else {
            this.run(sql, (err) => errOrResolveObject(resolve, reject, err, null));
        }
    });
};

sqlite.Database.prototype.allAsync = function(sql, params) {
    return new Promise((resolve, reject) => {
        if (params) {
            this.all(sql, params, (err, rows) => errOrResolveList(resolve, reject, err, rows));
        } else {
            this.all(sql, (err, rows) => errOrResolveList(resolve, reject, err, rows));
        }
    });
};

module.exports = {
    openDb,
    errOrResolveObject,
    errOrResolveList
};