import React, { Component } from "react";
import ReactDOM from "react-dom";
import ReactList from "react-list-select";
import "./App.css";

class App extends Component {
  state = {
    isLoggedIn: false
  };

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

      let responseJson = await this.instrumentCall("/token-auth", postOptions);
      let response = await responseJson.json();
      isLoggedIn = response.isLoggedIn;
    }

    this.setState({ isLoggedIn: isLoggedIn });
  }

  render() {
    return (
      <div className="App">
        <div className="center-vertically" style={{ display: this.state.isLoggedIn ? "" : "none" }}>
          <h2>music n shit</h2>
        </div>
        <div className="center-vertically" style={{ display: this.state.isLoggedIn ? "none" : "", marginTop: "2rem" }}>
          <a href="./login">Login to your Spotify account to enable Show Finder</a>
          <p >This login is used to retrieve a list of your public playlists and to create the weekly Show Finder playlist ONLY if you explicitly choose to do so.</p>
        </div>
      </div>
    );
  }
}

export default App;
