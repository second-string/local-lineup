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
    { value: "philadelphia", displayName: "Philadelphia" }
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

// module.exports = {instrumentCall};
