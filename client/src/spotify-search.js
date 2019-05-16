import React from 'react';
import ReactDOM from 'react-dom';
import SpotifySearch from './SpotifySearch';
import * as serviceWorker from './serviceWorker';

ReactDOM.render(<SpotifySearch />, document.getElementById('root'));
serviceWorker.unregister();