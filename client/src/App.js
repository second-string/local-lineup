import React, { Component } from 'react';
import ReactList from 'react-list-select';
import './App.css';

class App extends Component {
  state = {
    userName: null,
    playlists: [],
    playlistNamesById: {},
    selectedPlaylistIndex: null,
    artists: [],
    shows: []
  }

  // playlistNamesById = {};

  async componentDidMount() {
    // this.resultsRef = React.createRef();
    // try {
    //   let res = await this.getHello();
    //   this.setState({ data: res.data });
    // } catch (e) {
    //   console.log(e);
    // }
  }

  // getHello = async () => {
  //   let response = await fetch('/hello');
  //   let body = await response.json();
  //   if (response.status !== 200) {
  //     throw Error(body.message);
  //   }

  //   return body;
  // }

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
    this.setState({ playlists: names });
  };


  // TODO :: BT this seems to maybe not get all artists for certain playlists (Salad, CCHLA XXIX)
  choosePlaylist = async e => {
    e.preventDefault();
    if (this.state.selectedPlaylistIndex === null) {
      alert('You must select a playlist');
    }
    let playlistId = Object.keys(this.state.playlistNamesById)[this.state.selectedPlaylistIndex];
    let encodedPlaylistId = encodeURIComponent(playlistId);
    let res = await fetch(`/show-finder/artists?playlistId=${encodedPlaylistId}`, { method: 'GET' });
    let artistJson = await res.json();
    let decodedArtists = [];
    for (let index in Object.keys(artistJson)) {
      decodedArtists.push(decodeURI(artistJson[index]));
    }

    this.setState({ artists: decodedArtists});
    console.log(decodedArtists);
  };

  getShowsForArtists = async e => {
    e.preventDefault();
    let encodedArtists = this.state.artists.map(x => encodeURI(x));
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

    console.log(shows);
    this.setState({ shows: shows.map(x =>
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
        <h4>Enter your spotify username:</h4>
        <form onSubmit={this.getPlaylists}>
          <input type="text" onChange={ entry => this.setState({ userName: entry.target.value }) } />
          <button type="submit">Submit</button>
        </form>
        <form onSubmit={this.choosePlaylist}>
          <ReactList items={this.state.playlists} onChange={index => this.setState({ selectedPlaylistIndex: index }) } />
          <button type="submit">Select playlist</button>
        </form>
        <form onSubmit={this.getShowsForArtists}>
          {/* TODO :: handle setting the state of all artists in onchange */}
          <ReactList items={this.state.artists} multiple={true} selected={ Array(this.state.artists.length).keys() } /*onChange={ this.setState({ }) }*/ />
          <button type="submit">Choose artists</button>
        </form>
        { this.state.shows }
      </div>
    );
  }
}

export default App;
