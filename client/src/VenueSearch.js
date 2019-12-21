import React, { Component } from "react";
import ReactDOM from "react-dom";
import Select from "react-select";
import "./VenueSearch.css";

class VenueSearch extends Component {
    state = {
        // locations: [],
        selectedLocation: this.defaultLocationLabel,
        allVenues: [],
        selectedVenues: [],
        showsByDate: {},
        selectedSongsPerArtist: this.defaultSongsPerArtistLabel,
        includeOpeners: true,
        showVenueSearch: false,
        saveSuccess: false,
        showSpinner: false,
        showViewShowsInBrowserSection: false
    };

    defaultLocationLabel = "Choose a location";
    defaultSongsPerArtistLabel = "# songs per artist";
    songsPerArtistChoices = [1, 2, 3, 4, 5];

    locations = [
        { value: "san francisco", displayName: "San Francisco" },
        { value: "los angeles", displayName: "Los Angeles" },
        { value: "washington", displayName: "Washington DC" },
        { value: "new york", displayName: "New York" },
        { value: "denver", displayName: "Denver" },
        { value: "chicago", displayName: "Chicago" },
        { value: "boston", displayName: "Boston" },
        { value: "austin", displayName: "Austin" },
        { value: "houston", displayName: "Houston" },
        { value: "charlotte", displayName: "Charlotte" },
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
        const userSavedVenuesObj = await this.getUserSavedVenues();
        let state = { showVenueSearch: false };

        // See if this user has any saved locations already. If not, don't do anything
        if (userSavedVenuesObj.Location) {
            // If they have a location, go get all the venues for that location
            let allVenuesForLocation = await this.getAllVenuesForLocation(userSavedVenuesObj.Location);
            state.showVenueSearch = true;

            // Map each solo venue ID to its venue to get the name for display
            if (userSavedVenuesObj.VenueIds) {
                const uiVenueObjs = this.buildUiVenueObjects(userSavedVenuesObj.VenueIds, allVenuesForLocation);
                state.selectedVenues = uiVenueObjs;
            }
        }

        if (userSavedVenuesObj.SongsPerArtist) {
            state.selectedSongsPerArtist = userSavedVenuesObj.SongsPerArtist;
        }

        if (userSavedVenuesObj.IncludeOpeners !== undefined) {
            state.includeOpeners = userSavedVenuesObj.IncludeOpeners;
        }

        this.setState(state);
    }

    locationSelected = async e => {
        // cache the value b/c react synthetic events and whatnot
        const location = e.target.value;

        // Reset everything
        this.setState({
            showVenueSearch: false,
            saveSuccess: false,
            showViewShowsInBrowserSection: false,
            showsByDate: {},
            selectedVenues: []
        });

        const allVenuesForLocation = await this.getAllVenuesForLocation(location);
        const userSavedVenuesObj = await this.getUserSavedVenues(location);
        let state = { showVenueSearch: true };
        if (userSavedVenuesObj.VenueIds) {
            const uiVenueObjs = this.buildUiVenueObjects(userSavedVenuesObj.VenueIds, allVenuesForLocation);
            state.selectedVenues = uiVenueObjs;
        }

        if (userSavedVenuesObj.SongsPerArtist) {
            state.selectedSongsPerArtist = userSavedVenuesObj.SongsPerArtist;
        }

        if (userSavedVenuesObj.IncludeOpeners !== undefined) {
            state.includeOpeners = userSavedVenuesObj.IncludeOpeners;
        }

        this.setState(state);
    };

    getAllVenuesForLocation = async location => {
        this.setState({ showSpinner: true, selectedLocation: location });

        let getOptions = {
            method: "GET",
            headers: {
                "Content-type": "application/json"
            }
        };

        let res = await this.instrumentCall(`/show-finder/venues?city=${encodeURIComponent(location)}`, getOptions);
        let allVenuesForLocation = await res.json();

        this.setState({
            showSpinner: false,
            allVenues: allVenuesForLocation
        });

        return allVenuesForLocation;
    };

    getUserSavedVenues = async location => {
        const getOptions = {
            method: "GET",
            headers: {
                "Content-type": "application/json"
            }
        };

        const res = await this.instrumentCall(`/show-finder/user-venues${location ? `?location=${location}` : ""}`, getOptions);
        const venueIdsObj = await res.json();

        return venueIdsObj;
    };

    // Takes in comma-delimited string of ids and a list of the full venue objects
    // Returns a list of the jsx objects for display with key, value, and label
    buildUiVenueObjects = (venueIdString, venueObjs) => {
        let userVenues = [];
        for (let id of venueIdString.split(",")) {
            const venue = venueObjs.find(x => x.id === parseInt(id));
            if (!venue) {
                continue;
            }

            const option = { key: id, value: id, label: venue.name };
            userVenues.push(option);
        }

        return userVenues;
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

        let postBody = {
            venueIds: this.state.selectedVenues.map(x => x.value),
            location: this.state.selectedLocation,
            songsPerArtist: this.state.selectedSongsPerArtist,
            includeOpeners: this.state.includeOpeners
        };

        let postOptions = {
            method: "POST",
            headers: {
                "Content-type": "application/json"
            },
            body: JSON.stringify(postBody)
        };

        let res = await this.instrumentCall("/show-finder/save-venues", postOptions);
        if (res.status === 204) {
            this.setState({
                saveSuccess: true,
                showViewShowsInBrowserSection: true
            });
        }
    };

    selectedVenuesChanged = e => {
        if (e === undefined || e === null) {
            this.setState({ selectedVenues: [] });
        } else {
            // e is a list of the selected venue objects in the shape of { value: venueId, label: venueName }
            this.setState({ selectedVenues: e });
        }
    };

    selectedSongsPerArtistChanged = e => {
        this.setState({ selectedSongsPerArtist: e.target.value });
    };

    includeOpenersChanged = e => {
        this.setState({ includeOpeners: e.target.checked });
    };

    render() {
        return (
            <div className="VenueSearch">
                <h3>Shows by Venue</h3>
                <p style={{ display: "inline-block", margin: "auto" }}>
                    Choose your location and pick a list of venues in that city. After saving, you'll receive a weekly email on Sundays listing the upcoming
                    shows for those venues in the week after next. A 'Show Finder' playlist will also be created in your Spotify account that updates each week
                    with songs from the artists listed in the email.
                </p>
                <div className="loader" style={{ display: this.state.showSpinner ? "" : "none" }}></div>
                <select id="location-select" value={this.state.selectedLocation} onChange={this.locationSelected} style={{ margin: "2em auto 1em" }}>
                    <option key="defaultLocation" value="defaultLocation" disabled defaultValue>
                        {this.defaultLocationLabel}
                    </option>
                    {this.locations.map(x => (
                        <option key={x.value} value={x.value}>
                            {x.displayName}
                        </option>
                    ))}
                </select>
                <form
                    onSubmit={this.selectVenues}
                    style={{
                        display: this.state.showVenueSearch ? "" : "none"
                    }}>
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
                    <div>
                        <div>
                            <div style={{ display: "inline-block", margin: "2em auto auto" }}>
                                <label style={{ marginRight: "1em", fontSize: ".8em" }}>
                                    Choose the number of songs per artist you'd like to appear in your playlist:
                                </label>
                                <select
                                    value={this.state.selectedSongsPerArtist}
                                    disabled={this.state.selectVenues === null || Object.keys(this.state.selectedVenues).length === 0}
                                    onChange={this.selectedSongsPerArtistChanged}>
                                    <option key="defaultSongsPerArtist" value="defaultSongsPerArtist" disabled>
                                        {this.defaultSongsPerArtistLabel}
                                    </option>
                                    {this.songsPerArtistChoices.map(x => (
                                        <option key={x} value={x} defaultValue={x === 2 ? "true" : "false"}>
                                            {x}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ display: "block", margin: "1em auto" }}>
                                <label style={{ marginRight: "1em", fontSize: ".8em" }}>Do you want show openers to be included in your playlist?</label>
                                <input type="checkbox" checked={this.state.includeOpeners} onChange={this.includeOpenersChanged} />
                            </div>
                            <button
                                id="saveShowsButton"
                                disabled={this.state.selectedVenues === null || Object.keys(this.state.selectedVenues).length === 0}
                                onClick={this.saveShowsSelected}
                                style={{ display: "block", margin: "1em auto" }}>
                                Save shows
                            </button>
                            <a
                                href="./#"
                                onClick={this.selectVenues}
                                style={{
                                    display: this.state.saveSuccess ? "none" : "inline-block",
                                    margin: "auto",
                                    marginTop: ".5em",
                                    fontSize: ".7em",
                                    color: "black",
                                    opacity: ".7"
                                }}>
                                I don't want to save anything yet, just show me the upcoming shows
                            </a>
                            <h4
                                style={{
                                    display: this.state.saveSuccess ? "" : "none"
                                }}>
                                Venues saved successfully
                            </h4>
                        </div>

                        <div
                            style={{
                                display: this.state.showViewShowsInBrowserSection ? "" : "none",
                                textAlign: "center"
                            }}>
                            <label htmlFor="viewShowsButton" style={{ display: "block" }}>
                                Can't wait until Sunday for the email? Click the button below to see the list of upcoming shows right here in your browser
                            </label>
                            <button
                                id="viewShowsButton"
                                disabled={this.state.selectedVenues === null || Object.keys(this.state.selectedVenues).length === 0}
                                type="submit"
                                style={{ display: "inline-block" }}>
                                Gimme
                            </button>
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
