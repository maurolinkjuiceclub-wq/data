/* ---------- state ---------- */
/* Rows are prepared (normalised headers, search text) once, where they
   enter: the sample rows here, a CSV in the file handlers, the Worker's
   pages when they arrive. One copy per row, shared by the matcher and the
   Database screen (review of 08/10). */
const sampleRm = SAMPLE_REMOVED.map(prepareRow);
let dbRows = SAMPLE_DB.map(prepareRow), rmRows = sampleRm, dbSource = "sample rows", dbLoadedAt = null, rmFromWorkbook = false;
let index = indexDatabase(dbRows, rmRows);
let groups = null, items = [], lastParsed = null, view = "changed", stype = "Publisher";
/* The Worker, when the page is served next to it. In the claude.ai copy
   there is no Worker: the fetch fails and the page stays on sample rows. */
/* Where the Worker answers: /api when the page is on its own, /api/lists
   when it is served inside the desk under /listas/ (13/10). */
const API = /^\/listas(\/|$)/.test(location.pathname) ? "/api/lists" : "/api";
let remote = null;      /* { rows, readAt, write, loading } when the status route says connected */
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
}
let lastMatch = null;   /* the Worker's answer for the current list */
const written = {};     /* domain -> updatedRange, rows the Worker appended */
const acceptIds = {};   /* domain -> request id, kept across retries */
/* force: Gary's refresh button (09/10, "live Google sheet with refresh
   button"): the Worker re-reads the sheet instead of serving its cache. */
async function checkRemote(force){
  try{
    const r = await fetch(API + "/status" + (force ? "?refresh=1" : ""), { headers: { accept: "application/json" } });
    if(!r.ok){ const j = await r.json().catch(() => null); throw new Error("HTTP " + r.status + (j && j.reason ? ": " + j.reason : "")); }
    const j = await r.json();
    /* write: the Worker says whether Accept may append to the sheet (the
       desk keeps it off unless Gary switches LISTS_WRITE on). */
    remote = j.connected ? { rows: j.rows, readAt: j.readAt, who: j.who, write: j.write === true, loading: j.loading || null } : null;
    remoteWhy = j.connected ? "" : (j.reason || "");
    /* The desk's Worker reads the sheet in the background (13/10): while it
       says loading, ask again in a few seconds and match once it is done. */
    clearTimeout(remotePoll);
    if(remote && remote.loading) remotePoll = setTimeout(() => checkRemote().then(() => { if(remote && !remote.loading && items.length) run(); }).catch(() => {}), 4000);
  }catch(e){ remote = null; remoteWhy = String(e && e.message || e); }
  describeDb();
}
let remoteWhy = "";
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
