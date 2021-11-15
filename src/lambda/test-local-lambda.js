// import * as index from "./index.js";
const fs = require("fs");

const index = require("./index.js");

const payload = fs.readFileSync("./lambda_test_payload.json");
const jsPayload = JSON.parse(payload);

index.handler(jsPayload).then(resp => console.log(resp));
