import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import './index.css';

class VenueSearch extends Component {
	state = {
		locations: [],
		selectedLocation: null,
		venues: [],
	};

	locations = [
     { value: 'san francisco', displayName: 'San Francisco' },
     { value: 'los angeles', displayName: 'Los Angeles' },
     { value: 'washington', displayName: 'Washington DC' },
     { value: 'new york', displayName: 'New York' },
     { value: 'chicago', displayName: 'Chicago' },
     { value: 'houston', displayName: 'Houston' },
     { value: 'philadelphia', displayName: 'Philadelphia' }
    ];

    async instrumentCall(url, options) {
	    let res;
	    try {
	      res = await fetch(url, options);
	    } catch (e) {
	      console.log(e);
	      throw new Error(e);
	    }

	    if (res.status >= 400) {
	      console.log(`ERROR contacting ${url} with options:`);
	      console.log(options);
	      console.log('Reponse: ');
	      console.log(res);
	      // throw new Error(res);
	    }

	    return res;
  	}

	componentDidMount() {
		this.setState({ locations: this.locations });
	}

	locationSelected = async e => {
		let getOptions = {
			method: 'GET',
			headers: {
				'Content-type': 'application/json'
			}
		}

		let res = await this.instrumentCall(`/show-finder/venues?city=${encodeURIComponent(e.target.value)}`, getOptions);
		let venues = await res.json();

		this.setState({ venues: venues });
	}

	render() {
		return (
			<div className="VenueSearch">
				<h3>hello helloaf</h3>
				<select id='location-select' onChange={this.locationSelected}>
					<option id='' disabled defaultValue>Choose a location</option>
					{ this.state.locations.map(x => <option key={x.value} value={x.value}>{x.displayName}</option>) }
				</select>
				<div>
					<ul id='venue-list'>
						{ this.state.venues.map(x => <li key={x.slug} value={x.slug}>{x.name}</li>) }
					</ul>
				</div>
			</div>
		);
	}
}

export default VenueSearch;