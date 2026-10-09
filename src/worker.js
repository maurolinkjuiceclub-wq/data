/* Site lists: the Worker between the page and the Google Sheet.

   What it does (BRIEF.md, decisions 2 and 3):
   - reads "Import Database" and "removed sites" through the Sheets API as
     the service account Gary shares the sheet with, keeps them in memory
     for a few minutes, and answers lookups by domain;
   - appends ONE row to "Import Database" when a person clicks Accept, and
     nothing else, ever. Nothing is written on import, on match or on a
     timer;
   - knows who is asking from the token Cloudflare Access signs, as the desk
     does. No valid token, no API.

   Configuration (wrangler.jsonc and secrets):
     SHEET_ID     var     the spreadsheet id (the copy while we test)
     GOOGLE_SA    secret  the service account's JSON key, as one string
     ACCESS_AUD   var     Application Audience tag(s) of the Access app
     SIN_ACCESS   tests and the dev server only: trust the plain header

   Tested by scripts/probar-worker.mjs with Google replaced by a stand-in.
   No email is sent from here. */
import { normaliseDomain, prepareRow, rowMatchesFilters, facetsOf, indexDatabase, headerKey, DB_COLUMNS, senderOf } from "./site-lists.js";

const TAB_DB = "Import Database";
const TAB_REMOVED = "removed sites";
const CACHE_MS = 5 * 60 * 1000;
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets/";

function json(data, status){
  return new Response(JSON.stringify(data), { status: status || 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

/* ---------- who is asking (same mechanism as the desk's Worker) ---------- */
const ACCESS_TEAM = "https://morning-thunder-6a64.cloudflareaccess.com";
let accessKeys = null, accessKeysAt = 0;
async function accessPublicKeys(){
  if(accessKeys && Date.now() - accessKeysAt < 3600000) return accessKeys;
  const r = await fetch(ACCESS_TEAM + "/cdn-cgi/access/certs");
  if(!r.ok) return accessKeys || [];           /* keep the last good set, do not cache a failure */
  const j = await r.json().catch(() => null);
  const keys = (j && Array.isArray(j.keys)) ? j.keys : [];
  if(keys.length){ accessKeys = keys; accessKeysAt = Date.now(); }
  return accessKeys || [];
}
function b64url(t){
  t = String(t).replace(/-/g, "+").replace(/_/g, "/");
  while(t.length % 4) t += "=";
  return Uint8Array.from(atob(t), c => c.charCodeAt(0));
}
function toB64url(bytes){
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function identity(req, env){
  if(env.SIN_ACCESS) return String(req.headers.get("cf-access-authenticated-user-email") || "").trim().toLowerCase();
  const parts = String(req.headers.get("cf-access-jwt-assertion") || "").split(".");
  if(parts.length !== 3) return null;
  try {
    const head = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
    const body = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
    if(head.alg !== "RS256") return null;
    const jwk = (await accessPublicKeys()).find(k => k.kid === head.kid);
    if(!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
    if(!ok || !(body.exp > Date.now() / 1000) || body.iss !== ACCESS_TEAM) return null;
    const valid = String(env.ACCESS_AUD || "").split(",").map(x => x.trim()).filter(Boolean);
    if(!valid.length || ![].concat(body.aud || []).some(a => valid.includes(a))) return null;
    return String(body.email || "").trim().toLowerCase() || null;
  } catch(e){ return null; }
}

/* ---------- the service account's token ---------- */
let saToken = null, saTokenExp = 0, saInFlight = null;
function pem2der(pem){
  const b = String(pem).replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(b), c => c.charCodeAt(0));
}
export async function googleToken(env){
  if(saToken && Date.now() < saTokenExp - 60000) return saToken;
  if(!env.GOOGLE_SA) throw new Error("no-service-account");
  /* Two tabs are read in parallel; they share one token request. */
  if(saInFlight) return saInFlight;
  saInFlight = fetchToken(env).finally(() => { saInFlight = null; });
  return saInFlight;
}
async function fetchToken(env){
  const sa = typeof env.GOOGLE_SA === "string" ? JSON.parse(env.GOOGLE_SA) : env.GOOGLE_SA;
  const now = Math.floor(Date.now() / 1000);
  const header = toB64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = toB64url(new TextEncoder().encode(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })));
  const key = await crypto.subtle.importKey("pkcs8", pem2der(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(header + "." + claims));
  const assertion = header + "." + claims + "." + toB64url(sig);
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + encodeURIComponent(assertion) });
  if(!r.ok) throw new Error("token " + r.status);
  const j = await r.json();
  saToken = j.access_token; saTokenExp = Date.now() + (j.expires_in || 3600) * 1000;
  return saToken;
}

/* ---------- the sheet, in memory ---------- */
let cache = null;   /* { at, headers, byDomain, removedByDomain, bySender, rows, removedRows } */
async function readTab(env, tab){
  const token = await googleToken(env);
  const url = SHEETS + encodeURIComponent(env.SHEET_ID) + "/values/" + encodeURIComponent(tab + "!A:AS") + "?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING";
  const r = await fetch(url, { headers: { authorization: "Bearer " + token } });
  if(!r.ok) throw new Error("sheets " + r.status + " " + tab);
  const j = await r.json();
  const values = j.values || [];
  const headers = (values[0] || []).map(String);
  const rows = values.slice(1).map((v, i) => { const o = {}; headers.forEach((h, k) => { o[h] = v[k] == null ? "" : v[k]; }); o._row = i + 2; return prepareRow(o); });
  return { headers, rows };
}
/* One index for both tabs, the module's own (review of 08/10: the Worker
   had its own indexer and the two could drift). bySender gives the number
   of domains a contact already has, for the Broker hint. */
let dbInFlight = null;
async function readBoth(env){
  const [db, removed] = await Promise.all([readTab(env, TAB_DB), readTab(env, TAB_REMOVED)]);
  const idx = indexDatabase(db.rows, removed.rows);
  return { at: Date.now(), headers: db.headers, rows: db.rows.length, removedRows: removed.rows.length,
    byDomain: idx.byDomain, bySender: idx.bySender, removedByDomain: idx.removed,
    list: db.rows, removedList: removed.rows, facets: facetsOf(db.rows), removedFacets: facetsOf(removed.rows) };
}
/* The sheet from memory. A cold or forced read is shared by every request
   that arrives meanwhile (one pair of downloads, not one per request). A
   stale cache is served at once and refreshed in the background when the
   runtime gives us ctx.waitUntil, so no request waits on the re-read. */
export async function database(env, force, ctx){
  const fresh = cache && Date.now() - cache.at < CACHE_MS;
  if(cache && !force && fresh) return cache;
  if(cache && !force && ctx && ctx.waitUntil){
    if(!dbInFlight){ dbInFlight = readBoth(env).then(c => { cache = c; return c; }).finally(() => { dbInFlight = null; }); ctx.waitUntil(dbInFlight.catch(() => {})); }
    return cache;
  }
  if(!dbInFlight) dbInFlight = readBoth(env).then(c => { cache = c; return c; }).finally(() => { dbInFlight = null; });
  return dbInFlight;
}
export function forgetCache(){ cache = null; dbInFlight = null; saToken = null; saTokenExp = 0; saInFlight = null; }
/* Rows leave the Worker without the fields that are only for its own
   filtering (_q, _type) or bookkeeping (_row). */
function publicRow(r){ const o = {}; for(const k in r) if(k[0] !== "_") o[k] = r[k]; return o; }

/* ---------- the row Accept appends ---------- */
function appendValues(row, headers){
  /* In the sheet's own column order, by header; the 45 names of DB_COLUMNS
     when the sheet gives none. A column the row does not know stays "". */
  const cols = headers && headers.length ? headers : DB_COLUMNS;
  const byKey = new Map(Object.keys(row).map(k => [headerKey(k), k]));
  return cols.map(h => {
    const k = byKey.get(headerKey(h)); if(!k) return "";
    const v = row[k];
    if(v == null) return "";
    if(typeof v === "number") return v;
    /* "200" written RAW would be a text cell in a numeric column: a plain
       number in a string goes as a number. */
    return /^\d+(\.\d+)?$/.test(String(v).trim()) ? Number(v) : String(v);
  });
}
async function appendRow(env, row, headers){
  const token = await googleToken(env);
  const url = SHEETS + encodeURIComponent(env.SHEET_ID) + "/values/" + encodeURIComponent(TAB_DB + "!A:AS") + ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS";
  const r = await fetch(url, { method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({ majorDimension: "ROWS", values: [appendValues(row, headers)] }) });
  if(!r.ok) throw new Error("append " + r.status);
  return r.json();
}

const BUYING = ["Buying Casino", "Buying Unlicensed Casino", "Buying Crypto", "Buying Forex", "Buying CBD", "Buying Dating", "Buying General"];
const recentAccepts = new Map();   /* requestId -> updatedRange, the last 500 */

/* ---------- routes ---------- */
export default {
  async fetch(req, env, ctx){
    const url = new URL(req.url);
    if(!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    /* An Access app with no audience configured would reject everybody with
       the same 403 as a bad token; say so instead. */
    if(!env.SIN_ACCESS && !String(env.ACCESS_AUD || "").trim()) return json({ error: "access", reason: "no-aud" }, 403);
    const who = await identity(req, env);
    if(who === null) return json({ error: "access" }, 403);

    if(url.pathname === "/api/status"){
      if(!env.GOOGLE_SA || !env.SHEET_ID) return json({ connected: false, reason: !env.SHEET_ID ? "no-sheet-id" : "no-service-account", who });
      try {
        const db = await database(env, url.searchParams.get("refresh") === "1", ctx);
        return json({ connected: true, who, rows: db.rows, removedRows: db.removedRows, readAt: new Date(db.at).toISOString(), sheetId: env.SHEET_ID });
      } catch(e){ return json({ connected: false, reason: String(e.message || e), who }, 502); }
    }

    if(url.pathname === "/api/match" && req.method === "POST"){
      let body; try { body = await req.json(); } catch(e){ return json({ error: "json" }, 400); }
      if(!body || typeof body !== "object") return json({ error: "json" }, 400);
      const domains = Array.isArray(body.domains) ? body.domains.slice(0, 2000) : [];
      const sender = String(body.sender || "").trim().toLowerCase();
      let db; try { db = await database(env, false, ctx); } catch(e){ return json({ error: String(e.message || e) }, 502); }
      const rows = {}, removed = {};
      for(const raw of domains){
        const d = normaliseDomain(raw); if(!d) continue;
        if(db.byDomain.has(d.domain)) rows[d.domain] = db.byDomain.get(d.domain).map(h => publicRow(h.row));
        if(db.removedByDomain.has(d.domain)) removed[d.domain] = db.removedByDomain.get(d.domain).map(h => publicRow(h.row));
      }
      return json({ rows, removed, senderCount: sender ? (db.bySender.get(sender) || []).length : 0, readAt: new Date(db.at).toISOString(), total: db.rows });
    }

    /* The database screen: a page of rows after filters, with facets on
       the first page. Read only. */
    if(url.pathname === "/api/rows"){
      let db; try { db = await database(env, false, ctx); } catch(e){ return json({ error: String(e.message || e) }, 502); }
      const q = url.searchParams;
      const source = q.get("removed") === "1" ? db.removedList : db.list;
      const filters = { q: q.get("q") || "", type: q.get("type") || "", country: q.get("country") || "", lang: q.get("lang") || "", niche: q.get("niche") || "" };
      const hit = source.filter(r => rowMatchesFilters(r, filters));
      const offset = Math.max(0, parseInt(q.get("offset") || "0", 10) || 0);
      const limit = Math.min(500, Math.max(1, parseInt(q.get("limit") || "300", 10) || 300));
      const out = { total: hit.length, all: source.length, offset, rows: hit.slice(offset, offset + limit).map(publicRow) };
      if(offset === 0) out.facets = q.get("removed") === "1" ? db.removedFacets : db.facets;
      return json(out);
    }

    if(url.pathname === "/api/accept" && req.method === "POST"){
      if(!who) return json({ error: "who" }, 403);
      let body; try { body = await req.json(); } catch(e){ return json({ error: "json" }, 400); }
      const row = body && body.row;
      if(!row || typeof row !== "object" || !normaliseDomain(row.Domain)) return json({ error: "row" }, 400);
      const d = normaliseDomain(row.Domain).domain;
      let db; try { db = await database(env, false, ctx); } catch(e){ return json({ error: String(e.message || e) }, 502); }
      /* CLAUDE.md rule 4: a domain on "removed sites" comes back only on
         purpose: the page says so (restore) and the row says so. */
      if(db.removedByDomain.has(d) && !(body && body.restore === true)) return json({ error: "removed", domain: d }, 409);
      /* The trace of who accepted is the Worker's, not the browser's. */
      const trace = "Accepted by " + who;
      const rest = String(row["User Comments"] || "").replace(/^Accepted by [^;]*;?\s*/, "").trim();
      row["User Comments"] = [trace, rest].filter(Boolean).join("; ");
      /* A retry after a lost answer must not write the row twice: the same
         request id, or the same domain from the same sender with the same
         buying prices already in the sheet, answers ok without appending. */
      const rid = String((body && body.requestId) || "").slice(0, 80);
      if(rid && recentAccepts.has(rid)) return json({ ok: true, who, duplicate: true, updatedRange: recentAccepts.get(rid) });
      const sender = senderOf(row);
      const same = (db.byDomain.get(d) || []).find(h => senderOf(h.row) === sender && BUYING.every(c => String(h.row[c] ?? "").trim() === String(row[c] ?? "").trim()));
      if(same) return json({ ok: true, who, duplicate: true, updatedRange: null });
      let res; try { res = await appendRow(env, row, db.headers); } catch(e){ return json({ error: String(e.message || e) }, 502); }
      const range = res.updates && res.updates.updatedRange;
      if(rid){ recentAccepts.set(rid, range); if(recentAccepts.size > 500) recentAccepts.delete(recentAccepts.keys().next().value); }
      /* Patch whatever cache is current now, not the one this request read:
         a refresh may have replaced it meanwhile. */
      const live = cache || db;
      const added = prepareRow(row);
      (live.byDomain.get(d) || live.byDomain.set(d, []).get(d)).push({ row: added, index: live.list.length });
      if(sender) (live.bySender.get(sender) || live.bySender.set(sender, []).get(sender)).push(d);
      live.list.push(added);
      live.rows += 1;
      return json({ ok: true, who, updatedRange: range });
    }

    return json({ error: "not-found" }, 404);
  }
};
