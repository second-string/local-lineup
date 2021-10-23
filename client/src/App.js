import * as helpers from "./Helpers.js";
import React, { Component } from "react";
import ReactDOM from "react-dom";
import ReactList from "react-list-select";
import _ from "./index-background.jpg"
import "./App.css";

class App extends Component {
  state = {
    isLoggedIn: false
  };

  async componentDidMount() {
      const isLoggedIn = await helpers.isUserLoggedIn(document.cookie);
      this.setState({ isLoggedIn: isLoggedIn });
  }

  render() {
    return (
      <div className="App">
        <div className="main-content-wrapper flex-column">
            <h1>Show Finder</h1>
            <h3>Whether you're discovering new artists or falling back on old favorites, see who will be playing at your favorite local venues soon.</h3>
            <p>Show Finder aggregates concert listings from four separate music services to provide a complete list of who is playing in your city.</p>
            <p>Choose from one of two options to start your search:</p>
            <div className="main-content-browser">
                <div className="flex-row white-rounded-border flex-basis-100" style={{minHeight: "175px", margin: "20px", padding: "10px"}}>
                    <form action="/local-lineup/shows-by-venue" method="GET">
                        <div className="flex-row align-items-center text-align-left">
                            <div className="flex-col justify-content-center align-items-center">
                                <div style={{flexGrow: 1}}></div>
                                <button className="blue-button-border" type="submit">Search by venue</button>
                                <div className="flex-col" style={{alignItems: "top" }}>
                                    <p style={{color: "#6699FF", margin: 0}}>Most popular option!</p>
                                </div>
                            </div>
                            <div className="flex-col justify-content-center" style={{paddingLeft: "20px"}}>
                                <p>Select your favorite venues to receive an email every Sunday listing who will be playing there the following week.</p>
                                <p>Link your Spotify account for Show Finder to build a playlist of those artists' songs for you to discover new talent.</p>
                            </div>
                        </div>
                    </form>
                </div>
                <div className="flex-row white-rounded-border flex-basis-100" style={{minHeight: "175px", margin: "20px", padding: "10px"}}>
                    <form action="/local-lineup/shows-by-artist" method="GET">
                        <div className="flex-row align-items-center">
                            <button className="default-button-border" type="submit">Search by artist</button>
                            <div className="flex-col justify-content-center" style={{paddingLeft: "20px"}}>
                                <p>Select a list of artists from your Spotify to see who will be playing in your city soon.</p>
                                <p>This option is good for finding when artists you already know and love will be playing near you.</p>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
            <div className="main-content-mobile">
                <div className="flex-col white-rounded-border flex-basis-100" style={{marginTop: "20px", marginBottom: "20px"}}>
                    <form action="/local-lineup/shows-by-venue" method="GET">
                        <div className="flex-col justify-content-center align-items-center" style={{padding: "10px"}}>
                            <p>Select your favorite venues to receive an email every Sunday listing who will be playing there the following week.</p>
                            <p>Link your Spotify account for Show Finder to build a playlist of those artists' songs for you to discover new talent.</p>
                            <button className="blue-button-border" type="submit">Search by venue</button>
                            <div className="flex-col" style={{alignItems: "top" }}>
                                <p style={{color: "#6699FF", margin: 0}}>Most popular option!</p>
                            </div>
                        </div>
                    </form>
                </div>
                <div className="flex-col white-rounded-border flex-basis-100" style={{marginTop: "20px", marginBottom: "20px"}}>
                    <form action="/local-lineup/shows-by-artist" method="GET">
                        <div className="flex-col justify-content-center align-items-center" style={{padding: "10px"}}>
                            <p>Select a list of artists from your Spotify to see who will be playing in your city soon.</p>
                            <p>This option is good for finding when artists you already know and love will be playing near you.</p>
                            <button className="default-button-border" type="submit">Search by artist</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
      </div>
    );
  }
}

export default App;
