import React, { Component } from "react";
import ReactDOM from "react-dom";
import Select from "react-select";
import "./VenueSearch.css";

class VenueSearch extends Component {
    state = {
        locations: [],
        selectedLocation: this.defaultLocationLabel,
        allVenues: [],
        selectedVenues: [],
        showsByDate: {},
        selectedSongsPerArtist: this.defaultSongsPerArtistLabel,
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

        // Get venues/songsPerArtist for first location we have for the user in the db on first load
        const res = await this.instrumentCall("/show-finder/user-venues", getOptions);
        const venueIdsObj = await res.json();

        if (venueIdsObj.Location) {
            // Location state will be set within getVenues
            let venues = await this.getVenues(venueIdsObj.Location);

            if (venueIdsObj.VenueIds) {
                let userVenues = [];
                for (let id of venueIdsObj.VenueIds.split(",")) {
                    const venueName = venues.find(x => x.id === parseInt(id)).name;
                    const option = { key: id, value: id, label: venueName };
                    userVenues.push(option);
                }

                this.setState({ selectedVenues: userVenues });
            }
        }

        if (venueIdsObj.SongsPerArtist) {
            this.setState({
                selectedSongsPerArtist: venueIdsObj.SongsPerArtist
            });
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

        let res = await this.instrumentCall(`/show-finder/venues?city=${encodeURIComponent(location)}`, getOptions);

        let allVenuesForCity = await res.json();

        // Take our name-less venue list from our backend and fill in the venue names from the recently-received full venue list
        let filledOutSelectedVenues = [];
        for (const selectedVenue of this.state.selectedVenues) {
            let venueObj = allVenuesForCity.find(x => x.id === parseInt(selectedVenue.key));

            if (venueObj && venueObj.name) {
                selectedVenue.label = venueObj.name;
            }

            filledOutSelectedVenues.push(selectedVenue);
        }

        this.setState({
            allVenues: allVenuesForCity,
            selectedVenues: filledOutSelectedVenues,
            showSpinner: false,
            showVenueSearch: true
        });

        return allVenuesForCity;
    };

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

        const getOptions = {
            method: "GET",
            headers: {
                "Content-type": "application/json"
            }
        };

        const res = await this.instrumentCall(`/show-finder/user-venues?location=${location}`, getOptions);
        const venueIdsObj = await res.json();

        if (venueIdsObj.VenueIds) {
            const emptyVenues = venueIdsObj.VenueIds.split(",").map(x => ({
                key: x,
                value: x,
                label: null
            }));
            this.setState({ selectedVenues: emptyVenues });
        }

        if (venueIdsObj.SongsPerArtist) {
            this.setState({
                selectedSongsPerArtist: venueIdsObj.SongsPerArtist
            });
        }

        await this.getVenues(location);
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
            songsPerArtist: this.state.selectedSongsPerArtist
        };

        console.log(postBody);

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

    render() {
        return (
            <div className="VenueSearch">
                <div>
                    <form action="/show-finder" method="GET" style={{ position: "absolute" }}>
                        <button className="unselectable" style={{ margin: "auto" }}>
                            Back to main menu
                        </button>
                    </form>
                    <h3>Venue search</h3>
                </div>
                <div className="loader" style={{ display: this.state.showSpinner ? "" : "none" }}></div>
                <select id="location-select" value={this.state.selectedLocation} onChange={this.locationSelected} style={{ margin: "3em auto 1em" }}>
                    <option key="defaultLocation" value="defaultLocation" disabled defaultValue>
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
                            <div style={{ display: "block", margin: "1em auto" }}>
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
                            <label htmlFor="saveShowsButton" style={{ margin: "1em auto" }}>
                                By saving these venues, you'll get both a Sunday evening email listing all of the upcoming shows for the week after next and
                                also a customized spotify playlist of all the artists playing
                            </label>
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
                                    display: this.state.saveSuccess ? "none" : "block",
                                    margin: "auto",
                                    marginTop: ".5em",
                                    fontSize: ".7em",
                                    color: "black",
                                    opacity: ".7"
                                }}>
                                I don't want to save anything yet, just show me the upcoming shows
                            </a>
                            <h3
                                style={{
                                    display: this.state.saveSuccess ? "" : "none"
                                }}>
                                Venues saved successfully
                            </h3>
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
