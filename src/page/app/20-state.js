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
let remote = null;      /* { rows, readAt } when /api/status says connected */
let lastMatch = null;   /* the Worker's answer for the current list */
const written = {};     /* domain -> updatedRange, rows the Worker appended */
const acceptIds = {};   /* domain -> request id, kept across retries */
async function checkRemote(){
  try{
    const r = await fetch("/api/status", { headers: { accept: "application/json" } });
    if(!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    remote = j.connected ? { rows: j.rows, readAt: j.readAt, who: j.who } : null;
    remoteWhy = j.connected ? "" : (j.reason || "");
  }catch(e){ remote = null; remoteWhy = ""; }
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
