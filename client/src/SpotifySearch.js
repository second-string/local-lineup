import React, { Component } from "react";
import ReactDOM from "react-dom";
import ReactList from "react-list-select";
import "./SpotifySearch.css";

class SpotifySearch extends Component {
  baseState = {
    headerText: "Shows by Artist",
    playlists: [],
    playlistNamesById: {},
    allArtists: [],
    shows: [],
    firstPageLoad: true,
    showingLocation: true,
    showingNewSearch: false,
    showingArtists: false,
    showingPlaylists: false,
    showingShows: false,
    showSpinner: false,
    locations: [],
    selectedLocation: null
  };

  state = {};

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

  constructor(props) {
    super(props);

    // Use refs instead up updating state variables because for some reason
    // any call to `setState` from within the component's onChange causes all
    // the styling and selectedItems logic to get completely borked
    this.playlistListRef = React.createRef();
    this.artistListRef = React.createRef();

    this.state = this.baseState;
  }

  componentDidMount() {
    this.setState({ locations: this.locations });
  }

  resetState(overrides) {
    let newState = { ...this.baseState, ...overrides };
    this.setState(newState);
  }

  newSearch = () => {
    this.resetState({
      locations: this.locations,
      selectedLocation: this.state.selectedLocation,
      playlistNamesById: this.state.playlistNamesById,
      firstPageLoad: false,
      showingNewSearch: false
    });

    this.showPlaylists(this.state.playlistNamesById);
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
      firstPageLoad: false,
      showSpinner: true,
      showingLocation: false,
      showingNewSearch: true,
      headerText: "Fetching playlists..."
    });

    let res = await this.instrumentCall("/show-finder/playlists", postOptions);
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
      headerText: `Fetching artists for '${this.state.playlistNamesById[playlistId]}'`
    });

    let res = await this.instrumentCall(`/show-finder/artists?playlistId=${encodedPlaylistId}`, { method: "GET" });
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
        headerText: this.state.playlistNamesById[playlistId]
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
      headerText: "Searching for shows..."
    });
    // list of { artistName, shows[] } objects
    let showsJson = await this.instrumentCall("/show-finder/shows", postOptions);
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
      shows: shows.map(x => (
        <div>
          <h3>{x.artistName}</h3>
          {x.shows.map(y => (
            <li>{y}</li>
          ))}
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
        playlists: names
      },
      () => ReactDOM.findDOMNode(this.playlistListRef.current).focus()
    );
  };

  render() {
    return (
      <div className="SpotifySearch">
        <button id="new-search-button" className="unselectable block" onClick={this.newSearch} style={{ display: this.state.showingNewSearch ? "" : "none" }}>
          New Search
        </button>
        <h3>{this.state.headerText}</h3>
        <p style={{ display: this.state.firstPageLoad ? "" : "none" }}>
          Choose your location, one of your Spotify playlists, and any set of artists from that playlist to generate a list of upcoming shows.
        </p>
        <div className="loader" style={{ display: this.state.showSpinner ? "" : "none" }}></div>
        <div style={{ display: this.state.showingLocation ? "" : "none" }}>
          <div>
            <select id="location-select" onChange={this.getPlaylists}>
              <option id="" disabled defaultValue>
                {" "}
                Choose a location{" "}
              </option>
              {this.state.locations.map(x => (
                <option key={x.value} value={x.value}>
                  {" "}
                  {x.displayName}{" "}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <form onSubmit={this.getArtists} style={{ display: this.state.showingPlaylists ? "" : "none" }}>
            <div>
              <ReactList className="scroll-vertical" ref={this.playlistListRef} items={this.state.playlists} />
            </div>
            <button className="unselectable" type="submit">
              Select playlist
            </button>
          </form>

          <form onSubmit={this.getShowsForArtists} style={{ display: this.state.showingArtists ? "" : "none" }}>
            <div>
              <ReactList
                className="scroll-vertical"
                ref={this.artistListRef}
                items={this.state.allArtists}
                multiple={true}
                selected={Array(this.state.allArtists.length).keys()}
              />
            </div>
            <button className="unselectable" type="submit">
              Choose artists
            </button>
          </form>
        </div>

        {this.state.shows}
      </div>
    );
  }
}

export default SpotifySearch;
