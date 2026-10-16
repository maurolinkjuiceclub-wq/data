/* ---------- state ---------- */
/* Rows are prepared (normalised headers, search text) once, where they
   enter: the sample rows here, a CSV in the file handlers, the Worker's
   pages when they arrive. One copy per row, shared by the matcher and the
   Database screen (review of 08/10). */
const sampleRm = SAMPLE_REMOVED.map(prepareRow);
let dbRows = SAMPLE_DB.map(prepareRow), rmRows = sampleRm, dbSource = "sample", dbLoadedAt = null, rmFromWorkbook = false;   /* dbSource "sample" is translated on screen */
let index = indexDatabase(dbRows, rmRows);
let groups = null, items = [], lastParsed = null, view = "changed", stype = "Publisher";
/* The Worker, when the page is served next to it. In the claude.ai copy
   there is no Worker: the fetch fails and the page stays on sample rows. */
/* Where the Worker answers: /api when the page is on its own, /api/lists
   when it is served inside the desk under /listas/ (13/10). */
const API = /^\/listas(\/|$)/.test(location.pathname) ? "/api/lists" : "/api";
let remote = null;      /* { rows, readAt, write, loading, loadError } when the status route says connected */
let apiAnswered = false; /* the status route answered (connected or not); false when there is no API at all */
let remoteDetail = "";   /* the reason the API gave, verbatim, for the "other" sentence */
let remotePoll = null;
const TEMA_KEY = "mesa-cotejo-tema";   /* the desk's key: one choice for both pages */
let temaElegido = ""; try{ temaElegido = localStorage.getItem(TEMA_KEY) || ""; }catch(e){}
function aplicarTema(){
  const r = document.documentElement;
  if(temaElegido === "dark" || temaElegido === "light") r.setAttribute("data-theme", temaElegido); else r.removeAttribute("data-theme");
  pintarTema();
}
function pintarTema(){
  const b = $("tema"); if(!b) return;
  const d = temaElegido === "dark" ? "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"
    : temaElegido === "light" ? "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
    : "M3 4h18v12H3zM8 20h8M12 16v4";
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const nombre = typeof t === "function" ? (temaElegido === "dark" ? t().temaOscuro : temaElegido === "light" ? t().temaClaro : t().temaAuto) : "";
  b.title = nombre; b.setAttribute("aria-label", nombre);
  pintarPantalla();
}
/* Full screen (Simon, 16/10), the same button as the desk's: the browser's
   Fullscreen API, Esc leaves, the icon follows the browser, hidden where
   the API does not exist (iPhone). */
function pintarPantalla(){
  const b = $("pantalla"); if(!b) return;
  if(!document.fullscreenEnabled){ b.hidden = true; return; }
  b.hidden = false;
  const dentro = !!document.fullscreenElement;
  const d = dentro ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5";
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const nombre = typeof t === "function" ? (dentro ? t().pantallaOff : t().pantallaOn) : "";
  b.title = nombre; b.setAttribute("aria-label", nombre);
}
let lastMatch = null;   /* the Worker's answer for the current list */
const written = {};     /* domain -> updatedRange, rows the Worker appended */
const acceptIds = {};   /* domain -> request id, kept across retries */
/* force: Gary's refresh button (09/10, "live Google sheet with refresh
   button"): the Worker re-reads the sheet instead of serving its cache. */
async function checkRemote(force){
  try{
    const r = await fetch(API + "/status" + (force ? "?refresh=1" : ""), { headers: { accept: "application/json" } });
    /* A 502 with {connected:false, reason} is an answer (a read that
       failed); anything that is not the route's JSON means there is no API
       here (GitHub Pages, a file on disk). */
    const j = await r.json().catch(() => null);
    if(!j || typeof j.connected !== "boolean") throw new Error("HTTP " + r.status);
    apiAnswered = true;
    /* write: the Worker says whether Accept may append to the sheet (the
       desk keeps it off unless Gary switches LISTS_WRITE on). loadError: the
       last refresh failed and the rows shown are the previous read's. */
    remote = j.connected ? { rows: j.rows, readAt: j.readAt, who: j.who, write: j.write === true, loading: j.loading || null, loadError: j.loadError || "" } : null;
    remoteWhy = j.connected ? "" : (/^(paused|no-service-account|no-sheet-id)$/.test(j.reason) ? j.reason : "error");
    remoteDetail = j.connected ? "" : String(j.reason || "");
    /* The desk's Worker reads the sheet in the background (13/10): while it
       says loading, ask again in a few seconds and match once it is done. */
    clearTimeout(remotePoll);
    if(remote && remote.loading) remotePoll = setTimeout(() => checkRemote().then(() => { if(remote && !remote.loading){ if(items.length) run(); if(mode === "db") dbRefresh(); if(mode === "offer") ofRefresh(); } }).catch(() => {}), 4000);
  }catch(e){ remote = null; apiAnswered = false; remoteWhy = ""; remoteDetail = String(e && e.message || e); }
  /* The API is there but the sheet is not (paused, no key, a read that
     failed): the sample rows go, so the Database and Offers screens say so
     instead of listing invented sites (review of 16/10). They stay only
     when there is no API at all. */
  if(apiAnswered && !remote && dbSource === "sample" && dbRows.length){ dbRows = []; rmRows = []; rebuild(); return; }
  describeDb();
}
/* "" when connected or when there is no API; else the reason as a key:
   paused, no-service-account, no-sheet-id, or error (remoteDetail says). */
let remoteWhy = "";
function remoteSentence(){
  if(!remoteWhy) return "";
  const r = t().reasons;
  return r[remoteWhy] || r.other(remoteDetail || remoteWhy);
}
try{ const sv = localStorage.getItem("ljc-lists-stype"); if(FIXED.type.includes(sv)) stype = sv; }catch(e){}
function setStype(v){
  stype = v; try{ localStorage.setItem("ljc-lists-stype", v); }catch(e){}
  document.querySelectorAll("[data-stype]").forEach(b => { b.className = b.dataset.stype === v ? "on-type" : ""; });
  if(groups) run();
}

function noteParse(){
  if(!lastParsed) return;
  const cols = lastParsed.columns ? lastParsed.columns.filter(Boolean).join(", ") : t().noheader;
  /* A Google Sheets link cannot be read from the browser (sign-in, no
     CORS): say what to do instead of showing zero domains. */
  const gsheet = /docs\.google\.com\/spreadsheets/.test($("list").value);
  $("parsenote").textContent = t().parsed(items.length, lastParsed.skipped.length, cols) + (dupes.length ? " · " + t().dupNote(dupes.length) : "") + (gsheet && items.length < 3 ? " · " + t().gsheetHint : "");
}
const decisions = {};   /* domain -> accept | reject | ask | webmaster | remove */
const notes = {};       /* domain -> a short note that goes to User Comments */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
