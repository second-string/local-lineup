import * as helpers from "./Helpers.js";

import React, { Component } from "react";
import ReactDOM from "react-dom";
import ReactList from "react-list-select";
import "./ShowsByArtist.css";

class SpotifySearch extends Component {
  baseState = {
    isLoggedIn: false,
    headerText: "",
    subHeaderText: "",
    playlists: [],
    playlistNamesById: {},
    allArtists: [],
    shows: [],
    showingLocation: true,
    showingNewSearch: false,
    showingArtists: false,
    showingPlaylists: false,
    showingShows: false,
    showSpinner: false,
    locations: [],
    selectedLocation: this.defaultLocationValue,
  };

  defaultLocationLabel = "Choose a location";
  defaultLocationValue = "defaultLocation";
  state = {};

  constructor(props) {
    super(props);

    // Use refs instead up updating state variables because for some reason
    // any call to `setState` from within the component's onChange causes all
    // the styling and selectedItems logic to get completely borked
    this.playlistListRef = React.createRef();
    this.artistListRef = React.createRef();

    this.state = this.baseState;
  }

  async componentDidMount() {
      const isLoggedIn = await helpers.isUserLoggedIn(document.cookie);
      this.setState({ locations: helpers.locations, isLoggedIn });
  }

  newSearch = (e) => {
    e.preventDefault();
    this.setState({
        headerText: "",
        subHeaderText: "",
        playlists: [],
        playlistNamesById: {},
        allArtists: [],
        shows: [],
        showingLocation: true,
        showingNewSearch: false,
        showingArtists: false,
        showingPlaylists: false,
        showingShows: false,
        showSpinner: false,
        selectedLocation: this.defaultLocationValue,
    });
  };

  getPlaylists = async e => {
    e.preventDefault();

    if (e.target.value == null) {
      alert("You must enter a location");
      return;
    }

    let postOptions = {
      method: "POST",
      headers: {
        "Content-type": "application/json"
      }
    };

    this.setState({
      selectedLocation: e.target.value,
      showSpinner: true,
      showingLocation: false,
      showingNewSearch: true,
      headerText: "Fetching playlists...",
      subHeaderText: "",
    });

    let res = await helpers.instrumentCall("/local-lineup/playlists", postOptions);
    let playlistNamesById = await res.json();

    this.setState({ playlistNamesById });

    this.showPlaylists(playlistNamesById);
  };

  getArtists = async e => {
    e.preventDefault();

    let selectedPlaylistIndex = this.playlistListRef.current.state.lastSelected;
    if (selectedPlaylistIndex === null) {
      alert("You must select a playlist");
      return;
    }

    let playlistId = Object.keys(this.state.playlistNamesById)[selectedPlaylistIndex];
    let encodedPlaylistId = encodeURIComponent(playlistId);

    this.setState({
      showingPlaylists: false,
      showSpinner: true,
      showingLocation: false,
      showingNewSearch: true,
      headerText: `Fetching artists for '${this.state.playlistNamesById[playlistId]}'`,
      subHeaderText: "",
    });

    let res = await helpers.instrumentCall(`/local-lineup/artists?playlistId=${encodedPlaylistId}`, { method: "GET" });
    let artistJson = await res.json();
    let decodedArtists = [];
    for (let index in Object.keys(artistJson)) {
      decodedArtists.push(decodeURIComponent(artistJson[index]));
    }

    this.setState(
      {
        showingArtists: true,
        showSpinner: false,
        allArtists: decodedArtists,
        headerText: this.state.playlistNamesById[playlistId],
        subHeaderText: "",
      },
      () => ReactDOM.findDOMNode(this.artistListRef.current).focus()
    );
  };

  getShowsForArtists = async e => {
    e.preventDefault();

    let selectedArtistIndices = this.artistListRef.current.state.selectedItems;

    // If no artists have been selected then selectedArtistIndices will be an iterator.
    // If any have, it will be an array. Fuck this list implementation
    if (selectedArtistIndices.length === undefined && selectedArtistIndices.next()) {
      alert("You must select at least one artist. Select the list and all artists are included by default.");
      return;
    }

    let encodedArtists = this.state.allArtists.filter((x, i) => selectedArtistIndices.includes(i)).map(x => encodeURIComponent(x));

    let postOptions = {
      method: "POST",
      headers: {
        "Content-type": "application/json"
      },
      body: JSON.stringify({
        selectedArtists: encodedArtists,
        location: this.state.selectedLocation
      })
    };

    this.setState({
      showingArtists: false,
      showSpinner: true,
      headerText: "Searching for shows...",
      subHeaderText: "Please be patient, this can take up to a minute for large numbers of artists",
    });
    // list of { artistName, shows[] } objects
    let showsJson = await helpers.instrumentCall("/local-lineup/shows", postOptions);
    let shows = await showsJson.json();

    // shows.length is actually a count of number of artists returned
    let showCount = shows.map(x => x.shows.length || 0).reduce((x, y) => x + y, 0);
    let location = this.state.locations.filter(x => x.value === this.state.selectedLocation).map(x => x.displayName);

    let header;
    if (shows.length > 0) {
      let selectedPlaylistIndex = this.playlistListRef.current.state.lastSelected;
      let playlistId = Object.keys(this.state.playlistNamesById)[selectedPlaylistIndex];
      header = `${showCount + (showCount === 1 ? " show" : " shows")} found in ${location} for ${shows.length +
        (shows.length === 1 ? " artist" : " artists")} on '${this.state.playlistNamesById[playlistId]}'`;
    } else {
      header = `No ${location} shows found for those artists`;
    }

    this.setState({
      showingShows: true,
      showSpinner: false,
      headerText: header,
      subHeaderText: "",
      shows: shows.map(x => (
        <div>
          <h3>{x.artistName}</h3>
          <ul>
          {x.shows.map(y => (
            <li>{y}</li>
          ))}
         </ul>
        </div>
      ))
    });
  };

  showPlaylists = playlistNamesById => {
    let names = [];
    Object.keys(playlistNamesById).forEach(x => names.push(playlistNamesById[x]));

    this.setState(
      {
        showingPlaylists: true,
        showSpinner: false,
        headerText: "Choose a playlist",
        subHeaderText: "",
        playlists: names
      }
    );
  };

  render() {
        if (!this.state.isLoggedIn) {
            return (
                <div className="ShowsByArtist">
                    <form action="/login" method="GET">
                        <h3>Log in with Spotify</h3>
                        <p>Local Lineup gives you the ability to choose artists from your existing Spotify playlists to search for upcoming shows.</p>
                        <p>In order to access your playlists, please log in with your Spotify account.</p>
                        <input type="hidden" name="redirect" value={window.location.pathname} />
                        <button type="submit" value="Log in">Log in</button>
                    </form>
                </div>
            );
        } else {
            return (
                <div className="ShowsByArtist">
                    <h1>Shows by Artist</h1>
                    <p>Choose your location, one of your Spotify playlists, and any set of artists from that playlist to generate a list of upcoming shows.</p>
                    <p>Results from 4 different music services are combined to ensure a complete set of shows.</p>
                    <div style={{ display: this.state.showingLocation ? "" : "none" }}>
                        <select id="location-select" value={this.state.selectedLocation} defaultValue={this.defaultLocationValue} onChange={this.getPlaylists}>
                            <option id="defaultValueId" value={this.defaultLocationValue} disabled>{this.defaultLocationLabel}</option>
                            {this.state.locations.map(x => (
                                <option key={x.value} value={x.value}>
                                {x.displayName}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div style={{position: "relative"}}>
                        <div className="flex-col">
                            <h3>{this.state.headerText}</h3>
                            <p className="no-margin-top">{this.state.subHeaderText}</p>
                        </div>
                        <div className="loader" style={{ display: this.state.showSpinner ? "" : "none" }}></div>
                        <form onSubmit={this.getArtists} style={{ display: this.state.showingPlaylists ? "" : "none" }}>
                            <div className="flex-row justify-content-space-between">
                                <button id="new-search-button" className="unselectable block" onClick={this.newSearch} style={{ display: this.state.showingNewSearch ? "" : "none" }}>
                                    New Search
                                </button>
                                <button className="unselectable" type="submit">Select playlist</button>
                            </div>
                            <div>
                                <ReactList className="scroll-vertical" ref={this.playlistListRef} items={this.state.playlists} />
                            </div>
                        </form>

                        <form onSubmit={this.getShowsForArtists} style={{ display: this.state.showingArtists ? "" : "none" }}>
                            <div className="flex-row justify-content-space-between">
                                <button id="new-search-button" className="unselectable block" onClick={this.newSearch} style={{ display: this.state.showingNewSearch ? "" : "none" }}>
                                    New Search
                                </button>
                                <button className="unselectable" type="submit">Choose artists</button>
                            </div>
                            <div>
                            <ReactList
                                className="scroll-vertical"
                                ref={this.artistListRef}
                                items={this.state.allArtists}
                                multiple={true}
                                selected={Array(this.state.allArtists.length).keys()}
                            />
                            </div>
                        </form>
                    </div>

                {
                    // Not a good way to do this (not to mention the 3 'new search' buttons re-used throughout the layout is a god-awful way to do this
                    // but it touches the least of the existing logic)
                    (this.state.shows && this.state.shows.length > 0) || this.state.showingShows ?
                        <div className="flex-row justify-content-end">
                            <button id="new-search-button" className="unselectable block" onClick={this.newSearch} style={{ display: this.state.showingNewSearch ? "" : "none" }}>
                                New Search
                            </button>
                        </div>
                        : null
                }
                    {this.state.shows}
                </div>
            );
        }
  }
}

export default SpotifySearch;
