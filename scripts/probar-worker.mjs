#!/usr/bin/env node
/* Checks src/worker.js with Google replaced by a stand-in: the token
   endpoint, the two tabs, the append. No network, no Cloudflare, no sheet.
   A throwaway RSA key stands in for the service account's.

   Usage:  node scripts/probar-worker.mjs      Exit code 1 when a case fails. */
import { generateKeyPairSync } from "node:crypto";
import worker, { forgetCache } from "../src/worker.js";

let fallos = 0, casos = 0;
function caso(nombre, ok, detalle){
  casos++; if(ok) return; fallos++;
  console.log("FAIL " + nombre + (detalle !== undefined ? "\n     " + JSON.stringify(detalle) : ""));
}

/* --- the stand-in for Google --- */
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const SA = JSON.stringify({ client_email: "ljc-lists@test.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
const HEADERS = ["Type", "TLD", "Domain", "Webmaster Contact", "Webmaster Extra Contact", "Contact Name", "IP Address",
  "Ahrefs \nDomain Rating", "Ahrefs \nReferring Domains", "Ahrefs \nOrganic Traffic", "Ahrefs \nURL Rating", "Ahrefs\nTop 3 Keywords", "Ahrefs\nTop 4-10 Keywords",
  "Majestic\nTrust Flow", "Majestic\nCitation Flow", "MOZ\nSpam Score", "MOZ\nDomain Authority", "Semrush \nAuthority Score", "TF / CF", "RD / OT",
  "Buying Casino", "Buying Unlicensed Casino", "Buying Crypto", "Buying Forex", "Buying CBD", "Buying Dating", "Buying General",
  "Casino", "Unlicensed \nCasino", "Crypto", "Forex", "CBD", "Dating", "General",
  "Sponsor Tag Type", "Link Type", "Placement", "Price Validity", "Admin Comments", "User Comments", "Last Updated",
  "Main Country", "Main Country Traffic", "Domain Language", "Website Topic"];
const row = (type, domain, mail, casino, general) => { const r = new Array(HEADERS.length).fill(""); r[0] = type; r[2] = domain; r[3] = mail; r[20] = casino; r[26] = general; r[35] = "Do follow"; r[36] = "permanent"; return r; };
const sheet = {
  "Import Database": [HEADERS, row("Publisher", "alpha.com", "a@alpha.com", 400, 300), row("Broker", "beta.es", "broker@lists.com", 250, 120), row("", "www.Beta.es", "owner@beta.es", "", 150)],
  "removed sites": [HEADERS.slice(0, 21).concat(HEADERS.slice(22, 28), HEADERS.slice(29)), ["", ".net", "gamma.net", "g@gamma.net"]]
};
const calls = [];
let appended = [];
globalThis.fetch = async (url, init) => {
  const u = String(url); calls.push(u);
  if(u.startsWith("https://oauth2.googleapis.com/token")){
    const body = String(init.body);
    if(!/grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=/.test(body)) return new Response("bad", { status: 400 });
    return Response.json({ access_token: "tok-1", expires_in: 3600 });
  }
  if(u.includes("/values/") && u.includes(":append")){
    if(init.headers.authorization !== "Bearer tok-1") return new Response("no auth", { status: 401 });
    const b = JSON.parse(init.body); appended.push(b.values[0]);
    return Response.json({ updates: { updatedRange: "'Import Database'!A4:AS4" } });
  }
  if(u.includes("/values/")){
    if(init.headers.authorization !== "Bearer tok-1") return new Response("no auth", { status: 401 });
    const tab = decodeURIComponent(u.split("/values/")[1].split("?")[0]).split("!")[0];
    return Response.json({ values: sheet[tab] });
  }
  return new Response("unexpected " + u, { status: 500 });
};

const env = { SHEET_ID: "sheet-1", GOOGLE_SA: SA, SIN_ACCESS: "1", ASSETS: { fetch: async () => new Response("asset") } };
async function pedir(path, method, body, who, e){
  const headers = { "content-type": "application/json" };
  if(who) headers["cf-access-authenticated-user-email"] = who;
  const r = await worker.fetch(new Request("http://lists" + path, { method: method || "GET", headers, body: body ? JSON.stringify(body) : undefined }), e || env);
  return { status: r.status, json: r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text() };
}

/* --- status --- */
let r = await pedir("/api/status", "GET", null, "mauro@linkjuiceclub.com");
caso("status connected", r.status === 200 && r.json.connected === true && r.json.rows === 3 && r.json.removedRows === 1, r.json);
caso("token asked once, two tabs read", calls.filter(c => c.includes("oauth2")).length === 1 && calls.filter(c => c.includes("/values/")).length === 2, calls);
r = await pedir("/api/status", "GET", null, "mauro@linkjuiceclub.com", { ...env, GOOGLE_SA: undefined });
caso("status without service account says so", r.status === 200 && r.json.connected === false && r.json.reason === "no-service-account", r.json);

/* --- match --- */
const before = calls.length;
r = await pedir("/api/match", "POST", { domains: ["https://www.alpha.com/", "beta.es", "gamma.net", "nobody.io", "not a domain"], sender: "broker@lists.com" }, "mauro@linkjuiceclub.com");
caso("match: rows by normalised domain", r.status === 200 && r.json.rows["alpha.com"].length === 1 && r.json.rows["beta.es"].length === 2 && !r.json.rows["nobody.io"], Object.keys(r.json.rows || {}));
caso("match: row headers normalised to one line", r.json.rows["alpha.com"][0]["Buying Casino"] === 400 && r.json.rows["alpha.com"][0]["Ahrefs Domain Rating"] === "", r.json.rows["alpha.com"][0]);
caso("match: removed sites", r.json.removed["gamma.net"] && r.json.removed["gamma.net"][0].Domain === "gamma.net", r.json.removed);
caso("match: sender count", r.json.senderCount === 1, r.json.senderCount);
caso("match: served from cache, no new Google call", calls.length === before, calls.slice(before));

/* --- accept --- */
r = await pedir("/api/accept", "POST", { row: { Type: "Publisher", Domain: "delta.org", "Webmaster Contact": "d@delta.org", "Buying General": "200", "Link Type": "Do follow", "User Comments": "Accepted by you; from list x" } }, "mauro@linkjuiceclub.com");
caso("accept appends one row", r.status === 200 && r.json.ok && appended.length === 1 && r.json.updatedRange === "'Import Database'!A4:AS4", r.json);
caso("accept writes in the sheet's column order", appended[0][2] === "delta.org" && appended[0][26] === 200 && appended[0][35] === "Do follow" && appended[0].length === HEADERS.length, appended[0]);
caso("accept: the Worker names who accepted", appended[0][39] === "Accepted by mauro@linkjuiceclub.com; from list x", appended[0][39]);
caso("accept writes in the sheet's column order (count)", appended[0].length === HEADERS.length);
r = await pedir("/api/match", "POST", { domains: ["delta.org"] }, "mauro@linkjuiceclub.com");
caso("accepted row is known at once", r.json.rows["delta.org"] && r.json.rows["delta.org"][0]["Buying General"] === "200", r.json.rows);
r = await pedir("/api/accept", "POST", { row: { Type: "Publisher", Domain: "gamma.net", "Webmaster Contact": "g@gamma.net", "Buying General": "50" } }, "mauro@linkjuiceclub.com");
caso("accept of a removed site is refused", r.status === 409 && r.json.error === "removed" && appended.length === 1, r);
r = await pedir("/api/accept", "POST", { row: { Type: "Publisher", Domain: "delta.org", "Webmaster Contact": "d@delta.org", "Buying General": "200" } }, "mauro@linkjuiceclub.com");
caso("same domain, sender and prices again: ok without a second row", r.status === 200 && r.json.duplicate === true && appended.length === 1, r.json);
r = await pedir("/api/accept", "POST", { row: { Type: "Publisher", Domain: "theta.org", "Webmaster Contact": "t@theta.org", "Buying General": "300" }, requestId: "req-1" }, "mauro@linkjuiceclub.com");
const r2 = await pedir("/api/accept", "POST", { row: { Type: "Publisher", Domain: "theta.org", "Webmaster Contact": "t@theta.org", "Buying General": "300" }, requestId: "req-1" }, "mauro@linkjuiceclub.com");
caso("same request id twice: one row", r.status === 200 && r2.json.duplicate === true && appended.length === 2, [r.json, r2.json]);
caso("prices are written as numbers, not text", appended[0][26] === 200 && typeof appended[0][26] === "number", appended[0][26]);
r = await pedir("/api/match", "POST", { domains: ["theta.org"], sender: "t@theta.org" }, "mauro@linkjuiceclub.com");
caso("after accept the sender count is up to date", r.json.senderCount === 1 && r.json.rows["theta.org"].length === 1, r.json);
caso("rows leave without internal fields", !("_q" in r.json.rows["theta.org"][0]) && !("_type" in r.json.rows["theta.org"][0]) && !("_row" in r.json.rows["theta.org"][0]), Object.keys(r.json.rows["theta.org"][0]).filter(k => k[0] === "_"));
r = await pedir("/api/match", "POST", null, "mauro@linkjuiceclub.com");
caso("match with an empty body is a 400, not a crash", r.status === 400, r);
r = await worker.fetch(new Request("http://lists/api/match", { method: "POST", headers: { "content-type": "application/json", "cf-access-authenticated-user-email": "m@x" }, body: "null" }), env);
caso("match with a null body is a 400", r.status === 400, r.status);
r = await pedir("/api/rows?niche=foo", "GET", null, "mauro@linkjuiceclub.com");
caso("unknown niche is no filter", r.json.total === r.json.all, r.json.total);
r = await pedir("/api/nothing", "GET", null, "mauro@linkjuiceclub.com");
caso("404 in English", r.status === 404 && r.json.error === "not-found", r.json);
r = await pedir("/api/status", "GET", null, "x@y.z", { ...env, SIN_ACCESS: undefined, ACCESS_AUD: "" });
caso("no audience configured says so", r.status === 403 && r.json.reason === "no-aud", r.json);
r = await pedir("/api/accept", "POST", { row: { Domain: "epsilon.org" } }, "");
caso("accept without a person is refused", r.status === 403 && appended.length === 2, r);
r = await pedir("/api/accept", "POST", { row: { Domain: "not a domain" } }, "mauro@linkjuiceclub.com");
caso("accept with a bad domain is refused", r.status === 400 && appended.length === 2, r);
r = await pedir("/api/accept", "POST", "{bad", "mauro@linkjuiceclub.com");
caso("accept with bad json", r.status === 400);

/* --- rows, for the database screen --- */
r = await pedir("/api/rows?limit=2", "GET", null, "mauro@linkjuiceclub.com");
caso("rows: first page with facets", r.status === 200 && r.json.total === 5 && r.json.rows.length === 2 && Array.isArray(r.json.facets.countries), r.json);
r = await pedir("/api/rows?type=Broker", "GET", null, "mauro@linkjuiceclub.com");
caso("rows: filter by type", r.json.total === 1 && r.json.rows[0].Domain === "beta.es", r.json.rows);
r = await pedir("/api/rows?q=owner%40beta", "GET", null, "mauro@linkjuiceclub.com");
caso("rows: search by contact", r.json.total === 1 && r.json.rows[0].Domain === "www.Beta.es", r.json.rows);
r = await pedir("/api/rows?niche=general&offset=1&limit=1", "GET", null, "mauro@linkjuiceclub.com");
caso("rows: niche filter and paging", r.json.total === 5 && r.json.rows.length === 1 && r.json.offset === 1 && !r.json.facets, r.json);
r = await pedir("/api/rows?removed=1", "GET", null, "mauro@linkjuiceclub.com");
caso("rows: removed tab", r.json.total === 1 && r.json.rows[0].Domain === "gamma.net", r.json.rows);

/* --- access --- */
r = await pedir("/api/status", "GET", null, "x@y.z", { ...env, SIN_ACCESS: undefined });
caso("without Access token the API answers 403", r.status === 403, r);
r = await worker.fetch(new Request("http://lists/index.html"), env);
caso("static files go to ASSETS", (await r.text()) === "asset");

/* Senad, 09/10: a removed site comes back on purpose. The page says
   restore; the Worker writes the row, which says so itself. Last of the
   writes, so the counts above stay as they were. */
const before3 = appended.length;
r = await pedir("/api/accept", "POST", { row: { Type: "Publisher", Domain: "gamma.net", "Webmaster Contact": "g@gamma.net", "Buying General": "50", "User Comments": "Restored from removed sites (REMOVED FROM THE LIST)" }, restore: true }, "mauro@linkjuiceclub.com");
caso("a removed site is written when the page says restore, and the row says so", r.status === 200 && r.json.ok === true && appended.length === before3 + 1 && /Restored from removed sites/.test(appended[appended.length - 1][39]), [r.status, r.json]);

/* --- cache expiry --- */
forgetCache();
r = await pedir("/api/status?refresh=1", "GET", null, "mauro@linkjuiceclub.com");
caso("refresh re-reads the sheet", r.json.connected && calls.filter(c => c.includes("/values/") && !c.includes(":append")).length === 4, calls);

/* concurrent cold reads share one download */
forgetCache(); const before2 = calls.length;
await Promise.all([pedir("/api/status", "GET", null, "m@x"), pedir("/api/rows", "GET", null, "m@x"), pedir("/api/match", "POST", { domains: ["alpha.com"] }, "m@x")]);
caso("three requests on a cold cache read the sheet once", calls.slice(before2).filter(c => c.includes("/values/") && !c.includes(":append")).length === 2, calls.slice(before2));

console.log(`${casos - fallos} of ${casos} checks passed`);
process.exit(fallos ? 1 : 0);
