import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import './index.css';

class VenueSearch extends Component {
	state = {
		locations: [],
		selectedLocation: null,
		allVenues: [],
		filteredVenues: [],
		selectedVenueIds: []
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

		this.setState({ allVenues: venues, filteredVenues: venues });
	}

	venueSearchTextChanged = e => {
		let text = e.target.value.toLowerCase();
		let newVenues = this.state.allVenues.filter(x => x.name.toLowerCase().includes(text));
		this.setState({ filteredVenues: newVenues });
	}

	venueSelected = id => {
		let oldSelected = this.state.selectedVenueIds;
		console.log(oldSelected);
		oldSelected.push(id)
		console.log(oldSelected);
		this.setState({ selectedVenueIds: oldSelected })
	}

	/*
	  { links: [],
    metro_code: 602,
    postal_code: '60614',
    timezone: 'America/Chicago',
    has_upcoming_events: true,
    id: 13271,
    city: 'Chicago',
    stats: { event_count: 25 },
    extended_address: 'Chicago, IL 60614',
    display_location: 'Chicago, IL',
    state: 'IL',
    score: 0.36037397,
    location: { lat: 41.9268, lon: -87.6486 },
    access_method: null,
    num_upcoming_events: 25,
    address: '2447 N. Halsted St.',
    capacity: 0,
    slug: 'tonic-room',
    name: 'Tonic Room',
    url: 'https://seatgeek.com/venues/tonic-room/tickets',
    country: 'US',
    popularity: 0,
    name_v2: 'Tonic Room' },
    */

	render() {
		return (
			<div className="VenueSearch">
				<h3>hello helloaf</h3>
				<select id='location-select' onChange={this.locationSelected}>
					<option id='' disabled defaultValue>Choose a location</option>
					{ this.state.locations.map(x => <option key={x.value} value={x.value}>{x.displayName}</option>) }
				</select>
				<div>

					<input type='text' onChange={this.venueSearchTextChanged}></input>
					<ul id='venue-list'>
						{ this.state.filteredVenues.map(x => <li onClick={() => this.venueSelected(x.id)} key={x.id} value={x.id}>{x.name}</li>) }
					</ul>
				</div>
			</div>
		);
	}
}

export default VenueSearch;