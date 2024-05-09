const AUTHORIZATION_TOKEN = "Basic dGVzdDp0ZXN0";
const SCHOOL_IDS = [
	"U2Nob29sLTQ1",
	"U2Nob29sLTEzMjcx",
	"U2Nob29sLTEzNDgz",
	"U2Nob29sLTEzNjQ3",
	"U2Nob29sLTE3MTA4",
	"U2Nob29sLTE1NzIz",
];
const PROFESSOR_ID = `
query ($query: TeacherSearchQuery!) {
    newSearch {
        teachers(query: $query) {
            edges {
                node {
                	id
                }
            }
        }
    }
}
`;

const PROFESSOR_DATA = `
query ($id: ID!) {
    node(id: $id) {
        ... on Teacher {
            id
            department
            legacyId
            firstName
            lastName
            avgRating
            numRatings
            avgDifficulty
            wouldTakeAgainPercent
        }
    }
}
`;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; 

const fetchProfIDFallbackLoop = async (profName, retryCount = 0) => {
	try {
		const raw_response = await fetch(
			"https://www.ratemyprofessors.com/graphql",
			{
				method: "POST",
				headers: {
					Authorization: AUTHORIZATION_TOKEN,
				},
				body: JSON.stringify({
					query: PROFESSOR_ID,
					variables: {
						query: { text: profName, schoolID: SCHOOL_ID },
					},
				}),
			}
		);

		const response = await raw_response.json();
		if (response.data && response.data.newSearch && response.data.newSearch.teachers && response.data.newSearch.teachers.edges && response.data.newSearch.teachers.edges.length > 0) {
			return response; 
		} else if (retryCount < MAX_RETRIES) {
			console.log(`No matching professor found for "${profName}". Retrying (${retryCount + 1}/${MAX_RETRIES})...`);
			await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS)); 
			return fetchProfIDFallbackLoop(profName, retryCount + 1); 
		} else {
			console.error(`Maximum number of retries (${MAX_RETRIES}) exceeded for "${profName}".`);
			return null; 
		}
	} catch (error) {
		console.error(`Error fetching professor ID for "${profName}":`, error);
		if (retryCount < MAX_RETRIES) {
			console.log(`Retrying (${retryCount + 1}/${MAX_RETRIES})...`);
			await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS)); 
			return fetchProfIDFallbackLoop(profName, retryCount + 1); 
		} else {
			console.error(`Maximum number of retries (${MAX_RETRIES}) exceeded for "${profName}".`);
			return null; 
		}
	}
};

const fetchProfIDFallbackLoop = (profName) => {
	return new Promise(async (resolve, reject) => {
		let response = null;
		let raw_response = null;
		for (let i = 0; i < SCHOOL_IDS.length; i++) {
			const SCHOOL_ID = SCHOOL_IDS[i];
			raw_response = await fetch(
				"https://www.ratemyprofessors.com/graphql",
				{
					method: "POST",
					headers: {
						Authorization: AUTHORIZATION_TOKEN,
					},
					body: JSON.stringify({
						query: PROFESSOR_ID,
						variables: {
							query: { text: profName, schoolID: SCHOOL_ID },
						},
					}),
				}
			);

			response = await raw_response.json();
			if (response.data.newSearch.teachers.edges.length !== 0) {
				resolve(response);
				return;
			}
		}

		resolve(response);
		return;
	});
};

const profIDCache = new Map();
const fetchProfID = async (profName) => {
	if (!profIDCache.has(profName)) {
		const profIDFetch = fetchProfIDFallbackLoop(profName);
		profIDCache.set(profName, profIDFetch);
	}
	return profIDCache.get(profName);
};

const queryProfID = async function queryProfIDAsync(profName, sendResponse) {
	try {
		const response = await fetchProfID(profName);
		sendResponse(response);
	} catch (error) {
		sendResponse(new Error(error));
	}
};

const profDataCache = new Map();
const fetchProfData = (profID) => {
	if (!profDataCache.has(profID)) {
		const profDataFetch = fetch(
			"https://www.ratemyprofessors.com/graphql",
			{
				method: "POST",
				headers: {
					Authorization: AUTHORIZATION_TOKEN,
				},
				body: JSON.stringify({
					query: PROFESSOR_DATA,
					variables: {
						id: profID,
					},
				}),
			}
		);
		// return profDataFetch;
		profDataCache.set(profID, profDataFetch);
	}

	return profDataCache.get(profID);
};

const queryProfData = async function queryProfDataAsync(profID, sendResponse) {
	try {
		const raw_response = await fetchProfData(profID);
		const response = await raw_response.clone().json();

		sendResponse(response);
	} catch (error) {
		sendResponse(new Error(error));
	}
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	switch (request.contentScriptQuery) {
		case "queryProfID":
			queryProfID(request.profName, sendResponse);
			return true;

		case "queryProfData":
			queryProfData(request.profID, sendResponse);
			return true;

		default:
			return true;
	}
});
