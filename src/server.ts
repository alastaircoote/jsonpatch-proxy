import fetch, { Request, Response } from "node-fetch";
import * as http from "http";
import * as express from "express";
import * as jsonPatch from "fast-json-patch";
import { HttpError } from "./httperror";
import { getStoredVersion, setStoredVersion } from "./stored-versions";

function checkIfRequestIsValid(req: express.Request) {
	// There might be additional things to throw in here, but at the very least
	// you don't ever want to be doing this with POST requests, etc.
	if (req.method !== "GET") {
		throw new HttpError(400, "Only GET requests are supported");
	}
}

function checkIfResponseIsValid(fetchResponse: Response) {
	// The response that comes from the backend must be JSON. If not we'll
	// throw an error and stop.
	const mimeType = fetchResponse.headers.get("content-type");

	if (
		!mimeType ||
		(mimeType.indexOf("application/json") === -1 &&
			mimeType.indexOf("text/json") === -1)
	) {
		throw new HttpError(400, "Requested URL was not JSON");
	}

	// The response also needs to have an etag, otherwise we have nothing to
	// use as a unique key.
	const etag = fetchResponse.headers.get("etag");
	if (!etag) {
		throw new HttpError(
			400,
			"Underlying request does not provide an ETag header"
		);
	}
}

// Again, might want to tweak these. But broadly speaking the idea is that we
// want this response to live for as long as the original response does, but we
// can't copy across all headers because things like Content-Length would be
// totally wrong
const headersToForward = [
	"age",
	"cache-control",
	"access-control-allow-origin",
	"date",
	"expires",
	"last-modified",
];

function copyResponseMetadata(
	sourceResponse: Response,
	targetResponse: express.Response
) {
	// Might want to be stricter about this, I'm assuming the status would always be 200,
	// but maybe we should verify that. Or verify that it's 2xx at least?
	targetResponse.status(sourceResponse.status);
	sourceResponse.headers.forEach(function (value, key) {
		if (headersToForward.indexOf(key) === -1) {
			return;
		}
		targetResponse.setHeader(key, value);
	});
}

export function startServer(targetOrigin: string): Promise<http.Server> {
	const server = express();

	server.use(async function (req, res, next) {
		try {
			checkIfRequestIsValid(req);

			// req.url is just the path, so we map that path onto our target origin
			const requestURL = new URL(req.url, targetOrigin);

			// the client can optionally send a header indicating which etag they want
			// to compare to. If they don't provide it then we assume they have no data
			// cached locally and we send the full dataset.
			const getChangesSinceEtag = String(req.headers["changes-since-etag"]);

			// It's also possible that we don't have this etag cached. It shouldn't happen
			// in normal execution but maybe we've just restarted, or the user is sending
			// an invalid value. In either case we can just send back the full response
			// at worst it's what they'd be getting anyway!
			const previousJSON = getChangesSinceEtag
				? getStoredVersion(req.url, getChangesSinceEtag)
				: null;

			const fetchResponse = await fetch(requestURL);

			checkIfResponseIsValid(fetchResponse);
			copyResponseMetadata(fetchResponse, res);

			const responseEtag = fetchResponse.headers.get("etag");

			// We might be sitting behind a CDN that'll set an ETag for this (patched) response,
			// so to make sure we give the client the info they need, we add this etag-from-source
			// header, which it can use for the changes-since-etag header above.
			res.setHeader("etag-from-source", responseEtag);

			const json = await fetchResponse.json();

			setStoredVersion(req.url, responseEtag, json);

			if (!previousJSON) {
				// We have nothing to compare to, so just send through the whole
				// dataset

				res.json({
					responseType: "reset",
					response: json,
				});
				return;
			}

			// Otherwise, generate the patches and send them down:
			const patches = jsonPatch.compare(previousJSON, json);

			res.json({
				responseType: "patches",
				response: patches,
			});
		} catch (err) {
			if (err.name === "HttpError") {
				res.status(err.code);
				res.send(err.message);
				res.end();
			} else {
				console.log("waterror");
				next(err);
			}
		}
	});

	return new Promise(function (fulfill, reject) {
		const httpServer = server.listen(3000, function () {
			fulfill(httpServer);
		});
	});
}

if (require.main === module) {
	(async function () {
		const TARGET_ORIGIN = process.env.TARGET_ORIGIN;
		if (!TARGET_ORIGIN) {
			throw new Error("TARGET_ORIGIN environment variable is not defined");
		}
		startServer(TARGET_ORIGIN);
		console.log("Server is listening...");
	})();
}
