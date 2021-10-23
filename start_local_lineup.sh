NODEMON=./node_modules/nodemon/bin/nodemon.js
NPM=/usr/bin/npm

source setup_env.sh
# cd scripts
# $NODE setup-db.js
# $NODE sync-venues.js 
# cd ..
$NODEMON dist/server.js
