import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import VenueSearch from './VenueSearch';
import * as serviceWorker from './serviceWorker'

ReactDOM.render(<VenueSearch />, document.getElementById('root'));
serviceWorker.unregister();