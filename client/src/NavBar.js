import React, { Component } from "react";
import PropTypes from "prop-types";
import "./NavBar.css";

class NavBar extends Component {
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
            <div className="NavBar">
                <div className="side">
                    <a className={this.props.homeSelected ? "active nav-a" : "nav-a"} href="/">
                        Home
                    </a>
                    <a
                        className={this.props.venueSearchSelected ? "active nav-a" : "nav-a"}
                        style={{ display: this.state.isLoggedIn ? "" : "none" }}
                        href="/show-finder/venue-search">
                        Venue search
                    </a>
                    <a
                        className={this.props.spotifySearchSelected ? "active nav-a" : "nav-a"}
                        style={{ display: this.state.isLoggedIn ? "" : "none" }}
                        href="/show-finder/spotify-search">
                        Spoot search
                    </a>
                </div>
                <div className="side right-align" style={{ display: this.state.isLoggedIn ? "" : "none" }}>
                    <form className="nav-form" method="POST" action="/logout">
                        <input className="nav-input" type="submit" value="Logout" />
                    </form>
                </div>
            </div>
        );
    }
}

NavBar.propTypes = {
    homeSelected: PropTypes.bool,
    spotifySearchSelected: PropTypes.bool,
    venueSearchSelected: PropTypes.bool
};

NavBar.defaultProps = {
    homeSelected: false,
    spotifySearchSelected: false,
    venueSearchSelected: false
};

export default NavBar;
