import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import NavBar from "./NavBar";
import ShowsByArtist from "./ShowsByArtist";
import * as serviceWorker from "./serviceWorker";

ReactDOM.render(<NavBar spotifySearchSelected={true} />, document.getElementById("navbar"));
ReactDOM.render(<ShowsByArtist />, document.getElementById("root"));

serviceWorker.unregister();
