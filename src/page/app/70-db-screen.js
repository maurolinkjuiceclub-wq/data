/* ---------- the database screen ----------
   Gary, 08/10: "I think it's best if you show the full database here?".
   Read only. The rows come from the CSV or sample rows in the browser, or,
   when the Worker is there, from /api/rows page by page. Only the rows on
   screen are drawn, so 103k rows cost nothing. */
let mode = "list";
const ROW_H = 34;
const dbState = { q: "", type: "", country: "", lang: "", niche: "", removed: false, wide: false, list: [], total: 0, sel: null, remotePages: new Map(), remoteTotal: 0 };
const NARROW = [
  ["Domain", 220], ["Type", 110], ["Contact", 230], ["Country", 120], ["Language", 100],
  ["Buying Casino", 84], ["Buying Unlicensed Casino", 84], ["Buying Crypto", 84], ["Buying Forex", 84], ["Buying CBD", 84], ["Buying Dating", 84], ["Buying General", 84],
  ["Terms", 230], ["Updated", 100]
];
const SHORT = { "Buying Casino": "Casino", "Buying Unlicensed Casino": "Unlic.", "Buying Crypto": "Crypto", "Buying Forex": "Forex", "Buying CBD": "CBD", "Buying Dating": "Dating", "Buying General": "General" };
function setMode(m){
  mode = m; try{ localStorage.setItem("ljc-lists-mode", m); }catch(e){}
  $("mode-list").setAttribute("aria-selected", String(m === "list"));
  $("mode-db").setAttribute("aria-selected", String(m === "db"));
  $("mode-offer").setAttribute("aria-selected", String(m === "offer"));
  $("screen-list").hidden = m !== "list";
  $("screen-db").hidden = m !== "db";
  $("screen-offer").hidden = m !== "offer";
  if(m === "db") dbRefresh();
  if(m === "offer") ofRefresh();
}
function dbSourceRows(){ return dbState.removed ? rmRows : dbRows; }
/* Facets once per source; the rows themselves are already prepared. */
let facetCache = new WeakMap();
function dbFacetsFor(rows){
  let f = facetCache.get(rows);
  if(!f){ f = facetsOf(rows); facetCache.set(rows, f); }
  return f;
}
/* Rebuilds a <select> and returns the value it shows, so the state can be
   written back: a country kept from the other tab that this tab does not
   have must not keep filtering invisibly (review of 08/10). */
function fillSelect(id, values, keep){
  const sel = $(id); const first = sel.options[0];
  sel.innerHTML = ""; sel.appendChild(first);
  values.forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o); });
  sel.value = values.includes(keep) ? keep : "";
  return sel.value;
}
function dbRefresh(){
  if(remote){ dbState.remotePages.clear(); dbRemoteFetch(0, true); return; }
  const rows = dbSourceRows();
  const f = dbFacetsFor(rows);
  dbState.country = fillSelect("db-country", f.countries, dbState.country);
  dbState.lang = fillSelect("db-lang", f.languages, dbState.lang);
  dbState.list = rows.filter(r => rowMatchesFilters(r, dbState));
  dbState.total = rows.length;
  $("mode-db-n").textContent = rows.length.toLocaleString(lang === "es" ? "es" : "en");
  dbDraw();
}
function dbColumns(){
  if(dbState.wide) return DB_COLUMNS.map(c => [c, c === "Domain" ? 220 : /Comments/.test(c) ? 260 : /Contact/.test(c) ? 220 : 110]);
  return NARROW;
}
function dbCell(r, c){
  if(c === "Domain") return `<div class="d" title="${esc(r.Domain)}">${esc(r.Domain)}</div>`;
  if(c === "Type"){ const ty = String(r.Type || "").trim(); return `<div>${ty ? `<span class="tipo ${ty.toLowerCase() === "broker" ? "broker" : ""}">${esc(ty)}</span>` : `<span class="mut">—</span>`}</div>`; }
  if(c === "Contact"){ const s = senderOf(r); return `<div class="s" title="${esc(s)}">${esc(s) || `<span class="mut">—</span>`}</div>`; }
  if(c === "Country") return `<div class="s">${esc(r["Main Country"] || "")}</div>`;
  if(c === "Language") return `<div class="s">${esc(r["Domain Language"] || "")}</div>`;
  if(c === "Updated") return `<div class="mut">${esc(r["Last Updated"] || "")}</div>`;
  if(c === "Terms"){ const f = [r["Link Type"], r["Placement"], r["Price Validity"], r["Sponsor Tag Type"]].filter(Boolean).join(" · "); return `<div class="s" title="${esc(f)}">${esc(f) || `<span class="mut">—</span>`}</div>`; }
  if(/^Buying /.test(c)){ const v = String(r[c] ?? "").trim(); return `<div class="num ${v ? "has" : ""}">${v ? esc(v) : "·"}</div>`; }
  const v = String(r[c] ?? ""); return `<div class="s" title="${esc(v)}">${esc(v)}</div>`;
}
function dbDraw(){
  const cols = dbColumns();
  const grid = $("db-grid");
  grid.style.setProperty("--cols", cols.map(([, w]) => w + "px").join(" "));
  $("db-head").innerHTML = cols.map(([c]) => `<div title="${esc(c)}">${esc(t().dbCols[c] || SHORT[c] || c)}</div>`).join("");
  const total = remote ? dbState.remoteTotal : dbState.list.length;
  $("db-count").textContent = t().dbCount(total, remote ? (remote.rows || 0) : dbState.total) + (dbState.removed ? " · " + t().dbRemovedTab : "");
  if(!total){ $("db-top").style.height = "0px"; $("db-bottom").style.height = "0px"; $("db-rows").innerHTML = `<div class="dbempty">${t().dbEmpty}</div>`; return; }
  const scroll = grid.scrollTop, h = grid.clientHeight || 600;
  const first = Math.max(0, Math.floor(scroll / ROW_H) - 10), last = Math.min(total, Math.ceil((scroll + h) / ROW_H) + 10);
  $("db-top").style.height = (first * ROW_H) + "px";
  $("db-bottom").style.height = ((total - last) * ROW_H) + "px";
  const out = [];
  for(let i = first; i < last; i++){
    const r = remote ? dbRemoteRow(i) : dbState.list[i];
    if(!r){ out.push(`<div class="dbr dbloading"><div class="d">${t().dbLoading}</div></div>`); continue; }
    out.push(`<div class="dbr ${dbState.sel === r ? "sel" : ""}" data-i="${i}">${cols.map(([c]) => dbCell(r, c)).join("")}</div>`);
  }
  $("db-rows").innerHTML = out.join("");
}
function dbShow(r){
  dbState.sel = r;
  $("db-detail-dom").textContent = r.Domain || "";
  $("db-detail-body").innerHTML = DB_COLUMNS.map(c => { const v = String(r[c] ?? "").trim(); return `<dt>${esc(c)}</dt><dd class="${v ? "" : "e"}">${v ? esc(v) : "—"}</dd>`; }).join("");
  $("db-detail").hidden = false;
  dbDraw();
}
/* A domain clicked on the list: the Database screen, searched for it, with
   its record open when there is one. The list is one click away again. */
function openInDb(domain){
  $("db-q").value = domain; $("db-type").value = ""; $("db-niche").value = ""; $("db-removed").checked = false;
  dbState.country = ""; dbState.lang = "";
  dbOnChange();
  setMode("db");
  setTimeout(() => {
    const r = remote ? dbRemoteRow(0) : dbState.list[0];
    if(r && normaliseDomain(r.Domain) && normaliseDomain(r.Domain).domain === domain) dbShow(r);
    else { $("db-detail").hidden = true; dbState.sel = null; }
  }, remote ? 400 : 0);
}

/* --- the Worker's pages, 300 rows each, fetched for the window on screen --- */
const PAGE = 300;
function dbRemoteRow(i){
  const page = Math.floor(i / PAGE), rows = dbState.remotePages.get(page);
  if(rows === undefined){ dbRemoteFetch(page * PAGE, false); dbState.remotePages.set(page, null); return null; }
  return rows ? rows[i - page * PAGE] : null;
}
function dbRemoteQuery(offset){
  const p = new URLSearchParams({ offset: String(offset), limit: String(PAGE) });
  if(dbState.q.trim()) p.set("q", dbState.q.trim());
  if(dbState.type) p.set("type", dbState.type);
  if(dbState.country) p.set("country", dbState.country);
  if(dbState.lang) p.set("lang", dbState.lang);
  if(dbState.niche) p.set("niche", dbState.niche);
  if(dbState.removed) p.set("removed", "1");
  return p.toString();
}
async function dbRemoteFetch(offset, first){
  const key = dbRemoteQuery(offset);
  try{
    const r = await fetch(API + "/rows?" + key);
    if(!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    if(dbRemoteQuery(offset) !== key) return;   /* filters changed meanwhile */
    dbState.remotePages.set(Math.floor(offset / PAGE), (j.rows || []).map(prepareRow));
    dbState.remoteTotal = j.total || 0;
    if(first && j.facets){ dbState.country = fillSelect("db-country", j.facets.countries || [], dbState.country); dbState.lang = fillSelect("db-lang", j.facets.languages || [], dbState.lang); $("mode-db-n").textContent = (j.all || 0).toLocaleString(lang === "es" ? "es" : "en"); }
    dbDraw();
  }catch(e){
    dbState.remoteTotal = 0; dbDraw();
  }
}
let dbTimer = null;
const DB_FILTER_KEYS = ["q", "type", "country", "lang", "niche", "removed", "wide"];
function dbSaveFilters(){ try{ localStorage.setItem("ljc-lists-dbfilters", JSON.stringify(Object.fromEntries(DB_FILTER_KEYS.map(k => [k, dbState[k]])))); }catch(e){} }
function dbRestoreFilters(){
  try{
    const f = JSON.parse(localStorage.getItem("ljc-lists-dbfilters") || "{}");
    DB_FILTER_KEYS.forEach(k => { if(f[k] != null) dbState[k] = f[k]; });
    $("db-q").value = dbState.q; $("db-type").value = dbState.type; $("db-niche").value = dbState.niche;
    $("db-removed").checked = !!dbState.removed; $("db-wide").checked = !!dbState.wide;
  }catch(e){}
}
function dbOnChange(){
  dbState.q = $("db-q").value; dbState.type = $("db-type").value; dbState.country = $("db-country").value; dbState.lang = $("db-lang").value; dbState.niche = $("db-niche").value;
  dbState.removed = $("db-removed").checked; dbState.wide = $("db-wide").checked;
  dbSaveFilters();
  $("db-grid").scrollTop = 0;
  clearTimeout(dbTimer); dbTimer = setTimeout(dbRefresh, remote ? 250 : 0);
}

/* Whatever throws in some viewer's browser is shown on the page, so the
   person can send us the text instead of a blank screen. */
window.addEventListener("error", ev => {
  try{
    const note = document.createElement("div"); note.className = "aviso";
    note.textContent = "Script error: " + (ev.message || ev.error || "unknown") + (ev.lineno ? " (line " + ev.lineno + ")" : "") + ". Please send this text to Simon.";
    (document.getElementById("results") || document.body).prepend(note);
  }catch(e){}
});
