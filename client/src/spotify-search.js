import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import NavBar from "./NavBar";
import SpotifySearch from "./SpotifySearch";
import * as serviceWorker from "./serviceWorker";

ReactDOM.render(<NavBar spotifySearchSelected={true} />, document.getElementById("navbar"));
ReactDOM.render(<SpotifySearch />, document.getElementById("root"));
serviceWorker.unregister();
