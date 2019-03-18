import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import ReactList from 'react-list-select';
import './App.css';

class App extends Component {
  state = {
    userName: null,
    headerText: 'Show Finder',
    playlists: [],
    playlistNamesById: {},
    allArtists: [],
    shows: [],
    showingArtists: false,
    showingPlaylists: false,
    showingShows: false,
    showSpinner: false
  }

  async instrumentCall(url, options) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (e) {
      throw new Error(e);
    }

    if (res.status >= 400) {
      throw new Error(res);
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
  }

  getPlaylists = async e => {
    e.preventDefault();
    let postOptions = {
      method: 'POST',
      headers: {
        'Content-type': 'application/json'
      },
      body: JSON.stringify({ username: this.state.userName })
    };

    this.setState({ showSpinner: true, headerText: 'Fetching playlists...' });
    let res = await this.instrumentCall('/show-finder/playlists', postOptions);

    let playlistNamesById = await res.json();
    this.setState({ playlistNamesById: playlistNamesById });
    let names = [];
    Object.keys(playlistNamesById).forEach(x => names.push(playlistNamesById[x]));
    this.setState({
      showingPlaylists: true,
      showSpinner: false,
      headerText: 'Choose a playlist',
      playlists: names },
      () => ReactDOM.findDOMNode(this.playlistListRef.current).focus());
  };


  getArtists = async e => {
    e.preventDefault();

    let selectedPlaylistIndex = this.playlistListRef.current.state.lastSelected;
    if (selectedPlaylistIndex === null) {
      alert('You must select a playlist');
      return;
    }

    let playlistId = Object.keys(this.state.playlistNamesById)[selectedPlaylistIndex];
    let encodedPlaylistId = encodeURIComponent(playlistId);

    this.setState({
      showingPlaylists: false,
      showSpinner: true,
      headerText: `Fetching artists for '${this.state.playlistNamesById[playlistId]}'`
    });
    let res = await this.instrumentCall(`/show-finder/artists?playlistId=${encodedPlaylistId}`, { method: 'GET' });
    let artistJson = await res.json();
    let decodedArtists = [];
    for (let index in Object.keys(artistJson)) {
      decodedArtists.push(decodeURI(artistJson[index]));
    }

    this.setState({
      showingArtists: true,
      showSpinner: false,
      allArtists: decodedArtists,
      headerText: this.state.playlistNamesById[playlistId]},
      () => ReactDOM.findDOMNode(this.artistListRef.current).focus());
  };

  getShowsForArtists = async e => {
    e.preventDefault();

    let selectedArtistIndices = this.artistListRef.current.state.selectedItems;
    let encodedArtists = this.state.allArtists
      .filter((x, i) => selectedArtistIndices.includes(i))
      .map(x => encodeURI(x));

    let postOptions = {
      method: 'POST',
      headers: {
        'Content-type': 'application/json'
      },
      body: JSON.stringify({ selectedArtists: encodedArtists })
    }

    // List of { artistName, show } objects
    this.setState({
      showingArtists: false,
      showSpinner: true,
      headerText: 'Searching for shows...'});
    let showsJson = await this.instrumentCall('/show-finder/shows', postOptions);
    let shows = await showsJson.json();

    this.setState({
      showingShows: true,
      showSpinner: false,
      headerText: 'Shows found',
      shows: shows.map(x =>
        <div>
        <h3>{x.artistName}</h3>
        {x.shows.sf.length > 0 && <h5>San Francisco</h5>}
        {x.shows.sf.length > 0 && x.shows.sf.map(y => <li>{y}</li>)}
          {x.shows.la.length > 0 && <h5>Los Angeles</h5>}
          {x.shows.la.length > 0 && x.shows.la.map(y => <li>{y}</li>)}
            </div>
            ) });
      }

  render() {
    return (
      <div className="App">
        <h1 className="center-child">{ this.state.headerText }</h1>
        <div className="loader" style={{ display: this.state.showSpinner ? '' : 'none' }}></div>
        <div className="center-child" style={{ display: this.state.showingArtists || this.state.showingPlaylists || this.state.showingShows || this.state.showSpinner ? 'none' : '' }}>
          <h4>Enter your spotify username:</h4>
          <form onSubmit={this.getPlaylists}>
            <div className="center-child">
              <input className="textbox" type="text" onChange={ entry => this.setState({ userName: entry.target.value }) } />
            </div>
            <button className="unselectable" type="submit">Submit</button>
          </form>
        </div>
        <div>
        <form className="center-child" onSubmit={this.getArtists} style={{ display: this.state.showingPlaylists ? '' : 'none' }}>
          <div className="center-child">
            <ReactList className="scroll-vertical" ref={ this.playlistListRef } items={this.state.playlists} />
          </div>
          <button className="unselectable" type="submit">Select playlist</button>
        </form>

        <form className="center-child" onSubmit={this.getShowsForArtists} style={{ display: this.state.showingArtists ? '' : 'none' }}>
          <div className="center-child">
            <ReactList className="scroll-vertical" ref={ this.artistListRef } items={this.state.allArtists} multiple={true} selected={ Array(this.state.allArtists.length).keys() } />
          </div>
          <button className="unselectable" type="submit">Choose artists</button>
        </form>
        </div>
        { this.state.shows }
      </div>
    );
  }
}

export default App;
