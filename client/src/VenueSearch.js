import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import './index.css';

class VenueSearch extends Component {
	state = {
		locations: [],
		selectedLocation: null,
		allVenues: [],
		filteredVenues: [],
		selectedVenuesById: {},
		shows: []
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

	venueSelected = venue => {
		this.setState(prevState => ({ selectedVenuesById: {...prevState.selectedVenuesById, [venue.id]: venue} }));
	}

	selectVenues = async e => {
		e.preventDefault();

		let postBody = {
			'seatgeek': Object.keys(this.state.selectedVenuesById).reduce((obj, id) => {
				obj[id] = this.state.selectedVenuesById[id].name;
				return obj;
			}, {})
		};

		let postOptions = {
			method: 'POST',
			headers: {
				'Content-type': 'application/json'
			},
			body: JSON.stringify({ 'selectedVenues': postBody })
		}

		let res = await this.instrumentCall(`/show-finder/shows`, postOptions);
		let venueIdsByService = await res.json();
		let seatGeekShowsByVenueId = venueIdsByService['seatgeek'];

		console.log(seatGeekShowsByVenueId);
		this.setState({
			shows: Object.keys(seatGeekShowsByVenueId).map(x =>
				<div>
					<h4>{this.state.selectedVenuesById[x].name}</h4>
					<ul id='{x}'>
						{ seatGeekShowsByVenueId[x].map(y => <li key={y.id} value={y.id}>{y.title}</li>) }
					</ul>
				</div>
			)
		});
	}

	render() {
		return (
			<div className="VenueSearch">
				<h3>hello helloaf</h3>
				<select id='location-select' onChange={this.locationSelected}>
					<option id='' disabled defaultValue>Choose a location</option>
					{ this.state.locations.map(x => <option key={x.value} value={x.value}>{x.displayName}</option>) }
				</select>
				<form onSubmit={this.selectVenues}>
					<ul id='selected-venues'>
						{ Object.keys(this.state.selectedVenuesById).map(x => <li key={x} value={x}>{this.state.selectedVenuesById[x].name}</li>) }
					</ul>
					<input type='text' onChange={this.venueSearchTextChanged}></input>
					<ul id='venue-list'>
						{ this.state.filteredVenues.slice(0, 10).map(x => <li onClick={() => this.venueSelected(x)} key={x.id} value={x.id}>{x.name}</li>) }
					</ul>
					<button type="submit">Select venues</button>
				</form>
				<div>
					{ this.state.shows }
				</div>
			</div>
		);
	}
}

export default VenueSearch;