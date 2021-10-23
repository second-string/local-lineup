import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import VenueSearch from "./VenueSearch";
import NavBar from "./NavBar";
import * as serviceWorker from "./serviceWorker";

ReactDOM.render(<NavBar venueSearchSelected={true} />, document.getElementById("navbar"));
ReactDOM.render(<VenueSearch />, document.getElementById("root"));

serviceWorker.unregister();
