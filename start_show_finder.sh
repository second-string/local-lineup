NODE=/usr/bin/node
NPM=/usr/bin/npm

source setup_env.sh
cd scripts
$NODE setup-db.js
$NODE sync-venues.js 
cd ..
$NODE server.js
