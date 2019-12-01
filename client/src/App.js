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
        <h3>helloaf</h3>
        <div style={{ display: this.state.isLoggedIn ? "" : "none" }}>
          <a href="./show-finder">Show Finder</a>
        </div>
        <div style={{ display: this.state.isLoggedIn ? "none" : "" }}>
          <a href="./login">Login</a>
        </div>
      </div>
    );
  }
}

export default App;
