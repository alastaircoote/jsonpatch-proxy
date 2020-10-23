import fetch from "node-fetch";
import { startServer } from "../src/server";
import * as http from "http";
import * as nock from "nock";
import { expect } from "chai";

describe("Server tests", function () {
	let server: http.Server;
	let nockInstance: nock.Scope;

	before(() => {
		// Just good practise: stop this script from being able to access external URLs
		nock.disableNetConnect();
		nock.enableNetConnect("localhost:3000");
	});

	after(() => {
		// Remove all the nock shims once we're done here
		nock.enableNetConnect();
	});

	beforeEach(async function () {
		server = await startServer("https://example.com");
	});

	afterEach(async function () {
		server.close();
		// This verifies that all of the requests we set up within the test have actually been
		// requested. If not, it'll throw an error
		nockInstance.done();
	});

	it("fails when it doesn't get an etag header", async function () {
		nockInstance = nock("https://example.com").get("/test").reply(200, {});
		let res = await fetch("http://localhost:3000/test");
		expect(res.status).to.eq(400);
	});

	it("passes headers to response", async function () {
		nockInstance = nock("https://example.com").get("/test").reply(
			200,
			{},
			{
				"cache-control": "HEADER_VALUE",
				etag: "ETAG_VALUE",
			}
		);
		let res = await fetch("http://localhost:3000/test");
		expect(res.status).to.eq(200);
		const header = res.headers.get("cache-control");
		expect(header).to.equal("HEADER_VALUE");
	});

	it("generates patches", async function () {
		let payload: any = { one: "two" };
		let etag = "a";

		nockInstance = nock("https://example.com")
			.get("/test")
			.times(2)
			.reply(
				200,
				function () {
					return JSON.stringify(payload);
				},
				{
					"Content-Type": "application/json",
					etag: () => etag,
				}
			);
		let res = await fetch("http://localhost:3000/test");
		expect(res.headers.get("ETag-From-Source")).to.eq("a");
		let json = await res.json();
		expect(json.responseType).to.eq("reset");
		expect(json.response).to.deep.eq({ one: "two" });

		payload.three = "four";
		etag = "b";

		res = await fetch("http://localhost:3000/test", {
			headers: {
				"changes-since-etag": "a",
			},
		});
		expect(res.headers.get("ETag-From-Source")).to.eq("b");
		json = await res.json();
		expect(json.responseType).to.eq("patches");
		expect(json.response.length).to.eq(1);
		expect(json.response[0]).to.deep.eq({
			op: "add",
			path: "/three",
			value: "four",
		});
	});
});
