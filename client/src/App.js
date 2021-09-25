import * as helpers from "./Helpers.js";
import React, { Component } from "react";
import ReactDOM from "react-dom";
import ReactList from "react-list-select";
import "./App.css";

class App extends Component {
  state = {
    isLoggedIn: false
  };

  async componentDidMount() {
    let cookies = document.cookie.split(";");
    let token = null;
    for (let cookiePairString of cookies) {
      let cookiePair = cookiePairString.split("=");
      if (cookiePair[0] === "show-finder-token") {
        token = cookiePair[1];
        break;
      }
    }

    let isLoggedIn = false;
    if (token !== null) {
      // Make sure this is our set token
      let postOptions = {
        method: "POST",
        headers: {
          "Content-type": "application/json"
        },
        body: JSON.stringify({
          token: token
        })
      };

      let responseJson = await helpers.instrumentCall("/token-auth", postOptions);
      let response = await responseJson.json();
      isLoggedIn = response.isLoggedIn;
    }

    this.setState({ isLoggedIn: isLoggedIn });
  }

  render() {
    return (
      <div className="App">
        <div className="flex-column" style={{maxWidth: "66%"}}>
            <h1>Show Finder</h1>
            <h3>Whether you're discovering new artists or falling back on old favorites, view who will be playing at your favorite venues soon</h3>
            <p>Show Finder aggregates concert listing from four separate music services to provide a complete list of who is playing in your city.</p>
            <p>Choose from one of two options to start your search:</p>
            <div className="flex-row">
                <form action="/show-finder/venue-search" method="GET" style={{flexBasis: "100%"}}>
                    <button type="submit">Search by venue</button>
                    <p>Select all venues you're interested in from your city to receive an email every Sunday listing who will be playing there the following week. Link your Spotify account for Show Finder to build a playlist of those artists' songs for you to discover new talent.</p>
                </form>
                <form action="/show-finder/spotify-search" method="GET" style={{flexBasis: "100%"}}>
                    <button type="submit">Search by artist</button>
                    <p>Select a list of artists from your Spotify playlists to see who will be playing in your city soon.</p>
                </form>
            </div>
        </div>
      </div>
    );
  }
}

export default App;
