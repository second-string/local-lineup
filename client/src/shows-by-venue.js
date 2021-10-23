import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import ShowsByVenue from "./ShowsByVenue";
import NavBar from "./NavBar";
import * as serviceWorker from "./serviceWorker";

ReactDOM.render(<NavBar venueSearchSelected={true} />, document.getElementById("navbar"));
ReactDOM.render(<ShowsByVenue />, document.getElementById("root"));

serviceWorker.unregister();
