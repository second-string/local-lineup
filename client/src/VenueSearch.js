import React, { Component } from "react";
import ReactDOM from "react-dom";
import Select from "react-select";
import "./VenueSearch.css";

class VenueSearch extends Component {
	state = {
		locations: [],
		selectedLocation: this.defaultLocationLabel,
		allVenues: [],
		venueSelectList: [], // separate variable allows us to switch between venuelist and custom single entry telling user to hit a key
		selectedVenues: [],
		showsByDate: {},
		email: "",
		showVenueSearch: false,
		showButtonChoices: false,
		saveSuccess: false,
		showSpinner: false
	};

	defaultLocationLabel = "Choose a location";

	locations = [
		{ value: "san francisco", displayName: "San Francisco" },
		{ value: "los angeles", displayName: "Los Angeles" },
		{ value: "washington", displayName: "Washington DC" },
		{ value: "new york", displayName: "New York" },
		{ value: "chicago", displayName: "Chicago" },
		{ value: "houston", displayName: "Houston" },
		{ value: "philadelphia", displayName: "Philadelphia" }
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
			console.log("Reponse: ");
			console.log(res);
			// throw new Error(res);
		}

		return res;
	}

	async componentDidMount() {
		this.setState({ locations: this.locations });

		const getOptions = {
			method: "GET",
			headers: {
				"Content-type": "application/json"
			}
		};

		const res = await this.instrumentCall(
			"/show-finder/user-venues",
			getOptions
		);
		const venueIdsObj = await res.json();

		if (venueIdsObj.Location) {
			// Location state will be set within getVenues
			let venues = await this.getVenues(venueIdsObj.Location);

			if (venueIdsObj.VenueIds) {
				let userVenues = [];
				for (let id of venueIdsObj.VenueIds.split(",")) {
					const venueName = venues.find(x => x.id === parseInt(id))
						.name;
					const option = { key: id, value: id, label: venueName };
					userVenues.push(option);
				}

				this.setState({ selectedVenues: userVenues });
			}
		}
	}

	getVenues = async location => {
		this.setState({ showSpinner: true, selectedLocation: location });

		let getOptions = {
			method: "GET",
			headers: {
				"Content-type": "application/json"
			}
		};

		let res = await this.instrumentCall(
			`/show-finder/venues?city=${encodeURIComponent(location)}`,
			getOptions
		);
		let venues = await res.json();

		// Take our name-less venue list from our backend and fill in the venue names from the recently-received full venue list
		let filledOutSelectedVenues = [];
		for (const selectedVenue of this.state.selectedVenues) {
			let venueObj = venues.find(
				x => x.id === parseInt(selectedVenue.key)
			);

			if (venueObj && venueObj.name) {
				selectedVenue.label = venueObj.name;
			}

			filledOutSelectedVenues.push(selectedVenue);
		}

		this.setState({
			allVenues: venues,
			selectedVenues: filledOutSelectedVenues,
			showSpinner: false,
			showVenueSearch: true,
			showButtonChoices: true
		});

		return venues;
	};

	locationSelected = async e => {
		// cache the value b/c react synthetic events and whatnot
		const location = e.target.value;

		// Reset everything
		this.setState({
			showVenueSearch: false,
			showButtonChoices: false,
			saveSuccess: false,
			showsByDate: {},
			selectedVenues: []
		});

		const getOptions = {
			method: "GET",
			headers: {
				"Content-type": "application/json"
			}
		};

		const res = await this.instrumentCall(
			`/show-finder/user-venues?location=${location}`,
			getOptions
		);
		const venueIdsObj = await res.json();

		if (venueIdsObj.VenueIds) {
			const emptyVenues = venueIdsObj.VenueIds.split(",").map(x => ({
				key: x,
				value: x,
				label: null
			}));
			this.setState({ selectedVenues: emptyVenues });
		}

		await this.getVenues(location);
	};

	selectedVenuesChanged = e => {
		if (e === undefined || e === null) {
			return;
		}

		// e is a list of the selected venue objects in the shape of { value: venueId, label: venueName }
		this.setState({ selectedVenues: e });
	};

	selectVenues = async e => {
		e.preventDefault();

		// Send in the format [ { [key]: [name] } ]
		let postBody = {
			seatgeek: this.state.selectedVenues.reduce((obj, current) => {
				obj[current.key] = current.label;
				return obj;
			}, {})
		};
		console.log(postBody);
		let postOptions = {
			method: "POST",
			headers: {
				"Content-type": "application/json"
			},
			body: JSON.stringify({ selectedVenues: postBody })
		};

		let res = await this.instrumentCall(`/show-finder/shows`, postOptions);
		let showDatesByService = await res.json();
		let showsByDate = showDatesByService["seatgeek"];

		if (showsByDate !== undefined && showsByDate !== null) {
			this.setState({
				showsByDate: showsByDate
			});
		}
	};

	saveShowsSelected = async e => {
		e.preventDefault();

		let cookies = document.cookie.split(";");
		let token = null;
		for (let cookiePairString of cookies) {
			let cookiePair = cookiePairString.split("=");
			if (cookiePair[0] === "show-finder-token") {
				token = cookiePair[1];
				break;
			}
		}

		let postBody = {
			token: token,
			venueIds: this.state.selectedVenues.map(x => x.value),
			location: this.state.selectedLocation
		};

		let postOptions = {
			method: "POST",
			headers: {
				"Content-type": "application/json"
			},
			body: JSON.stringify(postBody)
		};

		let res = await this.instrumentCall(
			"/show-finder/save-venues",
			postOptions
		);
		if (res.status === 204) {
			this.setState({ saveSuccess: true });
		}
	};

	backButtonClicked = e => {
		e.preventDefault();

		this.setState({
			// showEmailForm: false,
			showButtonChoices: true
		});
	};

	render() {
		return (
			<div className="VenueSearch">
				<a href="/show-finder">
					<button className="unselectable block">
						Back to main menu
					</button>
				</a>
				<h3>Venue search</h3>
				<div
					className="loader"
					style={{ display: this.state.showSpinner ? "" : "none" }}
				></div>
				<select
					id="location-select"
					value={this.state.selectedLocation}
					onChange={this.locationSelected}
				>
					<option
						key="defaultLocation"
						value="defaultLocation"
						disabled
						defaultValue
					>
						{this.defaultLocationLabel}
					</option>
					{this.state.locations.map(x => (
						<option key={x.value} value={x.value}>
							{x.displayName}
						</option>
					))}
				</select>
				<form
					onSubmit={this.selectVenues}
					style={{
						display: this.state.showVenueSearch ? "" : "none"
					}}
				>
					<Select
						isMulti
						isSearchable
						openMenuOnClick={false}
						ref={input => (this.selectRef = input)}
						placeholder="Start typing to search for a venue..."
						onChange={this.selectedVenuesChanged}
						options={this.state.allVenues.map(x => ({
							key: x.id,
							value: x.id,
							label: x.name
						}))}
						value={this.state.selectedVenues}
					/>
					<div
						style={{
							display: this.state.showButtonChoices ? "" : "none"
						}}
					>
						<div>
							<button
								id="viewShowsButton"
								disabled={
									this.state.selectedVenues === null ||
									Object.keys(this.state.selectedVenues)
										.length === 0
								}
								type="submit"
							>
								See upcoming shows
							</button>
							<label htmlFor="viewShowsButton">
								Select this option to view all upcoming shows in
								your browser
							</label>
						</div>
						<div>
							<button
								id="saveShowsButton"
								disabled={
									this.state.selectedVenues === null ||
									Object.keys(this.state.selectedVenues)
										.length === 0
								}
								onClick={this.saveShowsSelected}
							>
								Save shows
							</button>
							<label htmlFor="saveShowsButton">
								Select this option if you want shows for the
								selected venues emailed to you weekly
							</label>
							<h3
								style={{
									display: this.state.saveSuccess
										? ""
										: "none"
								}}
							>
								Venues saved successfully
							</h3>
						</div>
					</div>
				</form>
				<div>
					{Object.keys(this.state.showsByDate).map(x => (
						<div>
							<h4>{new Date(x).toLocaleDateString("en-US")}</h4>
							<ul id="{x}">
								{this.state.showsByDate[x].map(y => (
									<li key={y.id} value={y.id}>
										{y.title} --- {y.venue.name}
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
			</div>
		);
	}
}

export default VenueSearch;
