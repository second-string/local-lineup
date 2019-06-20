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
		showsByDate: {}
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
		let showDatesByService = await res.json();
		let showsByDate = showDatesByService['seatgeek'];

		console.log(showsByDate);
		this.setState({
			showsByDate: showsByDate
		});
	}

	saveVenuesForEmail = async e => {
		e.preventDefault();

		let postBody = {
			email: 'brian.team.jr@gmail.com',
			showIds: Object.keys(this.state.selectedVenuesById)
		};

		let postOptions = {
			method: 'POST',
			headers: {
				'Content-type': 'application/json'
			},
			body: JSON.stringify(postBody)
		};

		let res = await this.instrumentCall('/show-finder/save-venues', postOptions);
		console.log(`done, ${res.status}`);
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
						{ this.state.filteredVenues.map(x => <li onClick={() => this.venueSelected(x)} key={x.id} value={x.id}>{x.name}</li>) }
					</ul>
					<button type="submit">Select venues</button>
					<button onClick={this.saveVenuesForEmail}>Save venues</button>
				</form>
				<div>
					{ Object.keys(this.state.showsByDate).map(x =>
						<div>
							<h4>{(new Date(x)).toLocaleDateString('en-US')}</h4>
							<ul id='{x}'>
								{ this.state.showsByDate[x].map(y => <li key={y.id} value={y.id}>{y.title} --- {y.venue.name}</li>) }
							</ul>
						</div>
					) }
				</div>
			</div>
		);
	}
}

export default VenueSearch;