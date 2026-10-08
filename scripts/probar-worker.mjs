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
caso("accept writes in the sheet's column order", appended[0][2] === "delta.org" && appended[0][26] === "200" && appended[0][35] === "Do follow" && appended[0].length === HEADERS.length, appended[0]);
caso("accept: the Worker names who accepted", appended[0][39] === "Accepted by mauro@linkjuiceclub.com; from list x", appended[0][39]);
r = await pedir("/api/match", "POST", { domains: ["delta.org"] }, "mauro@linkjuiceclub.com");
caso("accepted row is known at once", r.json.rows["delta.org"] && r.json.rows["delta.org"][0]["Buying General"] === "200", r.json.rows);
r = await pedir("/api/accept", "POST", { row: { Domain: "epsilon.org" } }, "");
caso("accept without a person is refused", r.status === 403 && appended.length === 1, r);
r = await pedir("/api/accept", "POST", { row: { Domain: "not a domain" } }, "mauro@linkjuiceclub.com");
caso("accept with a bad domain is refused", r.status === 400 && appended.length === 1, r);
r = await pedir("/api/accept", "POST", "{bad", "mauro@linkjuiceclub.com");
caso("accept with bad json", r.status === 400);

/* --- rows, for the database screen --- */
r = await pedir("/api/rows?limit=2", "GET", null, "mauro@linkjuiceclub.com");
caso("rows: first page with facets", r.status === 200 && r.json.total === 4 && r.json.rows.length === 2 && Array.isArray(r.json.facets.countries), r.json);
r = await pedir("/api/rows?type=Broker", "GET", null, "mauro@linkjuiceclub.com");
caso("rows: filter by type", r.json.total === 1 && r.json.rows[0].Domain === "beta.es", r.json.rows);
r = await pedir("/api/rows?q=owner%40beta", "GET", null, "mauro@linkjuiceclub.com");
caso("rows: search by contact", r.json.total === 1 && r.json.rows[0].Domain === "www.Beta.es", r.json.rows);
r = await pedir("/api/rows?niche=general&offset=1&limit=1", "GET", null, "mauro@linkjuiceclub.com");
caso("rows: niche filter and paging", r.json.total === 4 && r.json.rows.length === 1 && r.json.offset === 1 && !r.json.facets, r.json);
r = await pedir("/api/rows?removed=1", "GET", null, "mauro@linkjuiceclub.com");
caso("rows: removed tab", r.json.total === 1 && r.json.rows[0].Domain === "gamma.net", r.json.rows);

/* --- access --- */
r = await pedir("/api/status", "GET", null, "x@y.z", { ...env, SIN_ACCESS: undefined });
caso("without Access token the API answers 403", r.status === 403, r);
r = await worker.fetch(new Request("http://lists/index.html"), env);
caso("static files go to ASSETS", (await r.text()) === "asset");

/* --- cache expiry --- */
forgetCache();
r = await pedir("/api/status?refresh=1", "GET", null, "mauro@linkjuiceclub.com");
caso("refresh re-reads the sheet", r.json.connected && calls.filter(c => c.includes("/values/") && !c.includes(":append")).length === 4, calls);

console.log(`${casos - fallos} of ${casos} checks passed`);
process.exit(fallos ? 1 : 0);
