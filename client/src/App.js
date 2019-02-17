import React, { Component } from 'react';
import ReactList from 'react-list-select';
import './App.css';

class App extends Component {
  state = {
    userName: null,
    playlists: [],
    playlistNamesById: {},
    allArtists: [],
    shows: [],
    showingArtists: false,
    showingPlaylists: false,
    showingShows: false
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

    let res = await fetch('/show-finder/playlists', postOptions);
    let playlistNamesById = await res.json();
    this.setState({ playlistNamesById: playlistNamesById });
    let names = [];
    Object.keys(playlistNamesById).forEach(x => names.push(playlistNamesById[x]));
    this.setState({ showingPlaylists: true, showingArtists: false, playlists: names });
  };


  getArtists = async e => {
    e.preventDefault();
    console.log(this.playlistListRef);
    let selectedPlaylistIndex = this.playlistListRef.current.state.lastSelected;
    if (selectedPlaylistIndex === null) {
      alert('You must select a playlist');
    }

    let playlistId = Object.keys(this.state.playlistNamesById)[selectedPlaylistIndex];
    let encodedPlaylistId = encodeURIComponent(playlistId);
    let res = await fetch(`/show-finder/artists?playlistId=${encodedPlaylistId}`, { method: 'GET' });
    let artistJson = await res.json();
    let decodedArtists = [];
    for (let index in Object.keys(artistJson)) {
      decodedArtists.push(decodeURI(artistJson[index]));
    }

    this.setState({ showingPlaylists: false, showingArtists: true, allArtists: decodedArtists});
  };

  getShowsForArtists = async e => {
    e.preventDefault();
    let selectedArtistIndices = this.artistListRef.current.state.selectedItems;
    let encodedArtists = this.state.allArtists
      .filter((x, i) => selectedArtistIndices.includes(i))
      .map(x => encodeURI(x));
    console.log(encodedArtists);
    let postOptions = {
      method: 'POST',
      headers: {
        'Content-type': 'application/json'
      },
      body: JSON.stringify({ selectedArtists: encodedArtists })
    }

    // List of { artistName, show } objects
    let showsJson = await fetch('/show-finder/shows', postOptions);
    let shows = await showsJson.json();

    this.setState({ showingShows: true, showingPlaylists: false, showingArtists: false,
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
        <h1>Show Finder</h1>
        <div  style={{ display: this.state.showingArtists || this.state.showingPlaylists || this.state.showingShows ? 'none' : '' }}>
          <h4>Enter your spotify username:</h4>
          <form onSubmit={this.getPlaylists}>
            <input type="text" onChange={ entry => this.setState({ userName: entry.target.value }) } />
            <button type="submit">Submit</button>
          </form>
        </div>
        <form onSubmit={this.getArtists} style={{ display: this.state.showingPlaylists ? '' : 'none' }}>
          <ReactList ref={ this.playlistListRef } items={this.state.playlists} /*onChange={index => this.setState({ selectedPlaylistIndex: index }) }*/ />
          <button type="submit">Select playlist</button>
        </form>
        <form onSubmit={this.getShowsForArtists} style={{ display: this.state.showingArtists ? '' : 'none' }}>
          <ReactList ref={ this.artistListRef } items={this.state.allArtists} multiple={true} selected={ Array(this.state.allArtists.length).keys() } />
          <button type="submit">Choose artists</button>
        </form>
        { this.state.shows }
      </div>
    );
  }
}

export default App;
