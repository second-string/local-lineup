import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import Select from 'react-select';
import './VenueSearch.css';

class VenueSearch extends Component {
	state = {
		locations: [],
		selectedLocation: null,
		allVenues: [],
		venueSelectList: [],	// separate variable allows us to switch between venuelist and custom single entry telling user to hit a key
		selectedVenueNamesById: {},
		showsByDate: {},
		email: '',
		showVenueSearch: false,
		showButtonChoices: false,
		showEmailForm: false,
		showSpinner: false
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

		this.setState({ showSpinner: true });

		let res = await this.instrumentCall(`/show-finder/venues?city=${encodeURIComponent(e.target.value)}`, getOptions);
		let venues = await res.json();

		this.setState({
			allVenues: venues,
			showSpinner: false,
			showVenueSearch: true,
			showButtonChoices: true
		});
	}

	selectedVenuesChanged = e => {
		// venueObj is each of the selected venue objects in the shape of { value: venueId, label: venueName }
		this.setState({
			selectedVenueNamesById: e && e.reduce((obj, venueObj) => {
				obj[venueObj.value] = venueObj.label;
				return obj;
			}, {})
		});
	}

	selectVenues = async e => {
		e.preventDefault();

		let postBody = {
			'seatgeek': this.state.selectedVenueNamesById
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

	saveShowsSelected = e => {
		e.preventDefault();
		this.setState({
			showEmailForm: true,
			showButtonChoices: false
		});
	}

	emailChanged = e => {
		this.setState({ email: e.target.value });
	}

	backButtonClicked = e => {
		e.preventDefault();

		this.setState({
			showEmailForm: false,
			showButtonChoices: true
		});
	}

	saveShowsForEmail = async e => {
		e.preventDefault();

		// TODO :: BT basic email validation
		let email = this.state.email;
		if (email === undefined || email === null || email == '') {
			alert('Please enter an email address');
			return;
		}

		let postBody = {
			email: email,
			venueIds: Object.keys(this.state.selectedVenueNamesById)
		};

		let postOptions = {
			method: 'POST',
			headers: {
				'Content-type': 'application/json'
			},
			body: JSON.stringify(postBody)
		};

		let res = await this.instrumentCall('/show-finder/save-venues', postOptions);
	}

	render() {
		return (
			<div className="VenueSearch">
				<h3>hello helloaf</h3>
        		<div className="loader" style={{ display: this.state.showSpinner ? '' : 'none' }}></div>
				<select id='location-select' onChange={this.locationSelected}>
					<option id='' disabled defaultValue>Choose a location</option>
					{ this.state.locations.map(x => <option key={x.value} value={x.value}>{x.displayName}</option>) }
				</select>
				<form onSubmit={this.selectVenues} style={{ display: this.state.showVenueSearch ? '' : 'none' }}>
					<Select
						isMulti
						isSearchable
						openMenuOnClick={false}
						ref={ input => this.selectRef = input }
						placeholder='Start typing to search for a venue...'
						onChange={this.selectedVenuesChanged}
						options={this.state.allVenues.map(x => ({ value: x.id, label: x.name }))}
					/>
					<div style={{ display: this.state.showButtonChoices ? '' : 'none' }}>
						<div>
							<button id='viewShowsButton' disabled={ this.state.selectedVenueNamesById === null || Object.keys(this.state.selectedVenueNamesById).length === 0 } type="submit">See upcoming shows</button>
							<label htmlFor='viewShowsButton'>Select this option to view all upcoming shows in your browser</label>
						</div>
						<div>
							<button id='saveShowsButton' disabled={ this.state.selectedVenueNamesById === null || Object.keys(this.state.selectedVenueNamesById).length === 0 } onClick={this.saveShowsSelected}>Save shows</button>
							<label htmlFor='showsaveShowsButton'>Select this option if you want shows for the selected venues emailed to you weekly</label>
						</div>
					</div>
				</form>
				<div>

				<form onSubmit={this.saveShowsForEmail} style={{ display: this.state.showEmailForm ? '' : 'none' }}>
					<input type='text' className='textbox' style={{ marginTop: '20px', textAlign: 'center' }} onChange={this.emailChanged}></input>
					<div id='buttonDiv' className='block'>
						<button onClick={this.backButtonClicked}>Back</button>
						<button type='submit' disabled={ this.state.email === undefined || this.state.email === null || this.state.email === '' }>Save</button>
					</div>
					<label htmlFor='buttonDiv'>When you click save, your email address will be saved along with your selected venues. You'll receive an email every sunday at 5pm outlining the shows at your venues for the week after the upcoming week.</label>
				</form>

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