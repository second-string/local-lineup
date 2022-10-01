
// Should match object in server constants.ts - don't add here without updating there!
export const locations = [
    { value: "san francisco", displayName: "San Francisco" },
    { value: "los angeles", displayName: "Los Angeles" },
    { value: "washington", displayName: "Washington DC" },
    { value: "new york", displayName: "New York" },
    { value: "denver", displayName: "Denver" },
    { value: "chicago", displayName: "Chicago" },
    { value: "boston", displayName: "Boston" },
    { value: "austin", displayName: "Austin" },
    { value: "houston", displayName: "Houston" },
    { value: "charlotte", displayName: "Charlotte" },
    { value: "philadelphia", displayName: "Philadelphia" },
    { value: "seattle", displayName: "Seattle" },
    { value: "baltimore", displayName: "Baltimore" },
    { value: "munich", displayName: "Munich" },
    { value: "amsterdam", displayName: "Amsterdam" },
    { value: "paris", displayName: "Paris" },
    { value: "manchester", displayName: "Manchester" },
    { value: "berlin", displayName: "Berlin" },
    { value: "madrid", displayName: "Madrid" },
    { value: "barcelona", displayName: "Barcelona" },
  ];

export async function instrumentCall(url, options) {
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
};

export async function isUserLoggedIn(cookieString) {
    let cookies = cookieString.split(";");
    let token = null;
    for (let cookiePairString of cookies) {
      let cookiePair = cookiePairString.split("=");
      if (cookiePair[0] === "local-lineup-token") {
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

      let responseJson = await instrumentCall("/token-auth", postOptions);
      let response = await responseJson.json();
      isLoggedIn = response.isLoggedIn;
    }

    return isLoggedIn;
}

// module.exports = {instrumentCall};
