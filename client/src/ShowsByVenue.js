import * as helpers from "./Helpers.js";

import React, { Component } from "react";
import ReactDOM from "react-dom";
import Select from "react-select";
import "./ShowsByVenue.css";

class VenueSearch extends Component {
    state = {
        // locations: [],
        isLoggedIn: false,
        selectedLocation: this.defaultLocationValue,
        allVenues: [],
        selectedVenues: [],
        showsByDate: null,
        selectedSongsPerArtist: this.defaultSongsPerArtistLabel,
        includeOpeners: true,
        showVenueSearch: false,
        saveSuccess: false,
        showSpinner: false,
        showViewShowsInBrowserSection: false
    };

    defaultLocationValue = "defaultLocation";
    defaultLocationLabel = "Choose a location";
    defaultSongsPerArtistLabel = "# songs per artist";
    songsPerArtistChoices = [1, 2, 3, 4, 5];

    async componentDidMount() {
        const isLoggedIn = await helpers.isUserLoggedIn(document.cookie);

        let state = { showVenueSearch: false, isLoggedIn, ...state };

        // Get best-matching saved venues obj from api. If we're logged in, might be saved db values, or fallback to token values.
        // If not logged in, just check token values. Empty object returned for none found
        let savedVenuesObj = await this.getSavedVenues(isLoggedIn);

        // See if this user has any saved locations already. If not, try to pull over a previous venue list from the cookie
        let allVenuesForLocation = null;
        let extendedState = {};
        if (savedVenuesObj.Location) {
            allVenuesForLocation = await this.getAllVenuesForLocation(savedVenuesObj.Location);
            extendedState = await this.populateFromSavedValues(savedVenuesObj, allVenuesForLocation, state);
        } else if (isLoggedIn) {
            // Force cookie venues/location with 'false' for isLoggedIn param only if our first check wasn't already a logged out cookie check
            savedVenuesObj = await this.getSavedVenues(false);
            if (savedVenuesObj.Location) {
                allVenuesForLocation = await this.getAllVenuesForLocation(savedVenuesObj.Location);
                extendedState = await this.populateFromSavedValues(savedVenuesObj, allVenuesForLocation, state);
            }
        }

        // Make sure we don't fully drop the variables declared at beginning of function in initial state declaration
        state = { ...state, ...extendedState };

        // Only set locations if we actually have them in the above process. If we never got them sometime above,
        // don't get anything since we're on the default disabled "choose a city" option
        if (allVenuesForLocation) {
            state.allVenues = allVenuesForLocation;
        }
        // If we never got them sometime in the above process, get them for the current default location
        // if (!allVenuesForLocation) {
        //     allVenuesForLocation = await this.getAllVenuesForLocation(this.state.selectedLocation);
        // }

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
            showsByDate: null,
            selectedVenues: []
        });

        let savedVenuesObj = await this.getSavedVenues(this.state.isLoggedIn, location);
        let state = { showVenueSearch: true, selectedLocation: location, };

        // Get best-matching saved venues obj from api. If we're logged in, might be saved db values, or fallback to token values.
        // If not logged in, just check token values. Empty object returned for none found
        let allVenuesForLocation = null;
        let extendedState = {};
        if (savedVenuesObj.Location) {
            allVenuesForLocation = await this.getAllVenuesForLocation(location);
            extendedState = await this.populateFromSavedValues(savedVenuesObj, allVenuesForLocation, state);
        } else if (this.state.isLoggedIn) {
            // Force cookie venues/location with 'false' for isLoggedIn param only if our first check wasn't already a logged out cookie check
            savedVenuesObj = await this.getSavedVenues(false);
            if (savedVenuesObj) {
                allVenuesForLocation = await this.getAllVenuesForLocation(location);
                extendedState = await this.populateFromSavedValues(savedVenuesObj, allVenuesForLocation, state);
            }
        }

        // Make sure we don't fully drop the variables declared at beginning of function in initial state declaration
        state = { ...state, ...extendedState };

        // If we never got them sometime in the above process, get them for the selected location
        if (!allVenuesForLocation) {
            allVenuesForLocation = await this.getAllVenuesForLocation(location);
        }

        state.allVenues = allVenuesForLocation;

        this.setState(state);
    };

    // Set state variables for showing venue ids and playlist options that were previously saved.
    // Expects an existing savedVenuesObj.Location check beforehand. Returns passed-in updated temp state.
    populateFromSavedValues = async (savedVenuesObj, allVenuesForLocation, tempState) => {
        tempState.showVenueSearch = true;

        // Map each solo venue ID to its venue to get the name for display
        if (savedVenuesObj.VenueIds) {
            const uiVenueObjs = this.buildUiVenueObjects(savedVenuesObj.VenueIds, allVenuesForLocation);
            tempState.selectedVenues = uiVenueObjs;
        }

        if (savedVenuesObj.SongsPerArtist) {
            tempState.selectedSongsPerArtist = savedVenuesObj.SongsPerArtist;
        }

        if (savedVenuesObj.IncludeOpeners !== undefined) {
            tempState.includeOpeners = savedVenuesObj.IncludeOpeners;
        }

        return tempState;
    }

    getAllVenuesForLocation = async location => {
        this.setState({ showSpinner: true, selectedLocation: location });

        let getOptions = {
            method: "GET",
            headers: {
                "Content-type": "application/json"
            }
        };

        let res  = await helpers.instrumentCall(`/local-lineup/venues?city=${encodeURIComponent(location)}`, getOptions);
        let allVenuesForLocation = await res.json();

        this.setState({
            showSpinner: false,
            allVenues: allVenuesForLocation
        });

        return allVenuesForLocation;
    };

    // Get the venue ids for a specific location either from db user venueids or cookie if not logged in
    getSavedVenues = async (isLoggedIn, location) => {
        const getOptions = {
            method: "GET",
            headers: {
                "Content-type": "application/json"
            }
        };

        // Switch URLs (user-venues or selected-venues) depending on if user is logged in or just looking in cookie respectively
        const res = await helpers.instrumentCall(`/local-lineup/${isLoggedIn ? "user" : "selected"}-venues${location ? `?location=${location}` : ""}`, getOptions);
        const venueIdsObj = await res.json();

        return venueIdsObj;
    };

    // Let the backend update the selected venues saved in cookie every time we change selected list on frontend
    updateCookieVenueList = async (location, venueIds) => {
        const postBody = {
            location,
            venueIds,
        };

        const postOptions = {
            method: "POST",
            headers: {
                "Content-type": "application/json"
            },
            body:  JSON.stringify(postBody),
        };

        const res = await helpers.instrumentCall("/local-lineup/selected-venues", postOptions);
        // TODO :: any error checking or something to do with the result?
    }

    // Takes in an array of ids and a list of the full venue objects
    // Returns a list of the jsx objects for display with key, value, and label
    buildUiVenueObjects = (venueIds, venueObjs) => {
        let userVenues = [];
        for (let id of venueIds) {
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

        let res = await helpers.instrumentCall(`/local-lineup/shows`, postOptions);
        let showDatesByService = await res.json();
        let showsByDate = showDatesByService["seatgeek"];

        if (!showsByDate) {
            showsByDate = {};
        }

        this.setState({
            showsByDate: showsByDate
        });
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

        let res = await helpers.instrumentCall("/local-lineup/save-venues", postOptions);
        if (res.status === 204) {
            this.setState({
                saveSuccess: true,
                showViewShowsInBrowserSection: true,
                showsByDate: null,
            });
        }
    };

    selectedVenuesChanged = e => {
        if (e === undefined || e === null) {
            this.setState({ selectedVenues: [] });
        } else {
            // e is a list of the selected venue objects in the shape of { value: venueId, label: venueName }
            this.setState({ selectedVenues: e });

            // Send selected venue ids to backend to update cookie list
            this.updateCookieVenueList(this.state.selectedLocation, e.map(x => x.value));
        }
    };

    selectedSongsPerArtistChanged = e => {
        this.setState({ selectedSongsPerArtist: e.target.value });
    };

    includeOpenersChanged = e => {
        this.setState({ includeOpeners: e.target.checked });
    };

    renderShows = () => {
        if (this.state.showsByDate) {
            if (Object.keys(this.state.showsByDate).length > 0) {
                const showListObjects = Object.keys(this.state.showsByDate).map(x => (
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
                ));

                return (
                    <div>
                        <h3>Upcoming shows</h3>
                        {showListObjects}
                    </div>
                );
            } else {
                return <h3>No shows found for the selected venues in {this.state.selectedLocation}</h3>;
            }
        }

        // If we've had no shows set yet, don't show any header (or shows obviously)
        return null;
    }

    render() {
        return (
            <div className="ShowsByVenue">
                <h1>Shows by Venue</h1>
                <p>Choose your location and pick a list of venues in that city.</p>
                <p>After saving, you'll receive a weekly email on Sundays listing the upcoming shows for those venues in the week after next.</p>
                <p>A 'Local Lineup' playlist will also be created in your Spotify account that updates each week with songs from the artists listed in the email.</p>
                <div className="loader" style={{ display: this.state.showSpinner ? "" : "none" }}></div>
                <div id="location-select-div"> 
                    <select value={this.state.selectedLocation} onChange={this.locationSelected} defaultValue={this.defaultLocationValue}>
                        <option key="defaultLocation" value={this.defaultLocationValue} disabled>{this.defaultLocationLabel}</option>
                        {helpers.locations.map(x => (
                            <option key={x.value} value={x.value}>
                                {x.displayName}
                            </option>
                        ))}
                    </select>
                    <a 
                        href="mailto:brian.team.jr@gmail.com?subject=Add my city!"
                        style={{
                            margin: "auto",
                            marginTop: ".5em",
                            fontSize: ".7em",
                            color: "white",
                            opacity: ".8"
                        }}>
                            Don't see your city? Let me know and I'll add it
                    </a>
                </div>
                <form
                    onSubmit={this.selectVenues}
                    style={{
                        display: this.state.showVenueSearch ? "" : "none"
                    }}>
                    <Select
                        className="react-list-select"
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
                        <div style={{ display: this.state.isLoggedIn ? "" : "none" }}>
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
                                    color: "white",
                                    opacity: ".8"
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
                                Get shows
                            </button>
                        </div>
                    </div>
                </form>
                <form action="/login" method="GET" style={{ display: (!this.state.isLoggedIn && this.state.showVenueSearch) ? "" : "none" }}>
                    <div style={{ margin: "2em auto auto" }}>
                        <p style={{ marginRight: "1em" }}>
                            In order to send you a email and build a customized playlist every week, Local Lineup needs you to log in with Spotify.
                        </p>
                        <input type="hidden" name="redirect" value={window.location.pathname} />
                        <button type="submit" value="Log in">Log in</button>
                        <a
                            href="./#"
                            onClick={this.selectVenues}
                            style={{
                                display: this.state.saveSuccess ? "none" : "block",
                                margin: "auto",
                                marginTop: ".5em",
                                fontSize: ".7em",
                                color: "white",
                                opacity: ".8"
                            }}>
                            I don't want to sign in yet, just show me the upcoming shows
                        </a>
                    </div>
                </form>

                {this.renderShows()}
            </div>
        );
    }
}

export default VenueSearch;
