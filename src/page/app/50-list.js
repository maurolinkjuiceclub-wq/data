/* ---------- matching: the list against the database ---------- */
/* A list with nothing changed used to open on an empty "Changed" tab while
   the rows sat under "Unknown" (seen with a PDF rate card, 08/10). The view
   moves to the first group that has rows; a view chosen by hand stays. */
function pickView(){
  if(view === "all" || !groups || !groups[view] || groups[view].length) return;
  const k = ["changed", "unknown", "unchanged", "removed", "missing"].find(g => groups[g] && groups[g].length);
  if(k) view = k;
}
let dupes = [];   /* sites named more than once in this list */
function run(){
  const parsed = parseList($("list").value);
  const listTerms = listTermsOf(parsed);
  const merged = mergeDuplicates(parsed.items.map(i => withListTerms(i, listTerms)));
  items = merged.items; dupes = merged.dupes; lastParsed = parsed;
  noteParse();
  for(const k in decisions) delete decisions[k];
  loadDecisions();
  groups = matchList(items, index, { sender: $("sender").value, senderType: stype });
  indexEntries(); pruneDecisions();
  pickView();
  render();
  rememberList();
  if(remote) matchRemote();
}
async function matchRemote(){
  const sender = $("sender").value.trim();
  try{
    const r = await fetch("/api/match", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domains: items.map(i => i.domain), sender }) });
    if(!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    lastMatch = j;
    const idx = indexDatabase(Object.values(j.rows || {}).flat().concat(j.senderRows || []).map(prepareRow), Object.values(j.removed || {}).flat().map(prepareRow));
    groups = matchList(items, idx, { sender, senderCount: j.senderCount, senderType: stype });
    indexEntries(); pruneDecisions();
    pickView();
    remote = { ...remote, rows: j.total, readAt: j.readAt };
    describeDb(); render();
  }catch(e){
    remote = null; remoteWhy = "match failed"; describeDb();
  }
}
$("match").addEventListener("click", run);

/* A price in another currency than the database's EUR shows it. */
function price(p){ return p ? formatPrice(p) + (p.currency && p.currency !== "EUR" ? " " + p.currency : "") : ""; }
function offeredCells(item, diffs){
  const deltas = new Map();
  (diffs || []).forEach(list => priceDelta(list).forEach(d => { if(!deltas.has(d.niche)) deltas.set(d.niche, d); }));
  return NICHES.filter(n => item.prices[n]).map(n => {
    const d = deltas.get(n);
    let tail = "";
    if(d && d.delta != null && d.delta !== 0) tail = `<span class="delta ${d.delta > 0 ? "up" : "down"}">${d.delta > 0 ? "+" : "−"}${esc(formatPrice({ amount: Math.abs(d.delta) }))} · ${Math.abs(d.pct)}% ${d.delta > 0 ? t().dAbove : t().dBelow}</span>`;
    else if(d && d.inDatabase == null) tail = `<span class="delta up">${t().recorded}: —</span>`;
    return `<span class="pr${d ? " cambia" : ""}"><span class="k">${esc(t().niche[n])}</span>${esc(price(item.prices[n]))}${tail}</span>`;
  }).join("") + metricsCell(item) || `<span class="sender">${t().noPrice}</span>`;
}
function termsCells(item){
  const f = termsOf(item);
  const chips = [["linkType", f.linkType], ["placement", f.placement], ["priceValidity", f.priceValidity], ["sponsorTag", f.sponsorTag]]
    .map(([k, v]) => v ? `<span class="fv" title="${esc(t().terms[k])}">${esc(v)}</span>` : "").join("");
  const admin = f.adminComments.map(c => `<span class="fv off">${esc(c)}</span>`).join("");
  const raw = !item.terms ? "" : item.inherited
    ? `<span class="fv off" title="${esc(t().fromList)}: ${esc(item.terms)}">${esc(t().fromListShort)}</span>`
    : `${item.inheritedPartly ? `<span class="fv off" title="${esc(t().fromList)}">${esc(t().fromListShort)}</span>` : ""}<span class="raw">${esc(item.terms.split(" | ").slice(0, 2).join(" | "))}</span>`;
  return (chips || admin) ? chips + admin + raw : (item.terms ? raw : `<span class="sender">${t().saidNothing}</span>`);
}
function dbCells(rows, removed){
  if(!rows.length) return `<span class="sender">${t().notInDb}</span>`;
  return rows.map(row => {
    const ps = NICHES.filter(n => row[BUYING_COLUMN[n]]).map(n => `<span class="pr"><span class="k">${esc(t().niche[n])}</span>${esc(row[BUYING_COLUMN[n]])}</span>`).join("") || `<span class="sender">${t().noPrice}</span>`;
    const type = String(row.Type || "").trim();
    /* On the removed tab the reason sits in Admin Comments ("REMOVED FROM THE LIST", "UNRESPONSIVE"). */
    const why = removed && row["Admin Comments"] ? `<span class="fv off">${esc(String(row["Admin Comments"]).split("\n")[0])}</span>` : "";
    return `<div class="dbrow"><span class="sender">${type ? `<span class="tipo ${isReseller(type) ? "broker" : ""}">${esc(type)}</span>` : ""}${esc(senderOf(row) || t().noContact)} · ${ageCell(row["Last Updated"])}</span>${ps}${why}</div>`;
  }).join("");
}
let entryOf = new Map();   /* domain -> its entry in the current groups */
function indexEntries(){
  const all = groups ? groups.changed.concat(groups.unknown, groups.unchanged, groups.removed, groups.missing || []) : [];
  entryOf = new Map(all.map(e => [e.item.domain, e]));
  removedDomains = new Set(groups ? groups.removed.map(e => e.item.domain) : []);
}
/* The decisions a row can take (Senad, 09/10): from a reseller nothing
   new is added (leads: write to the webmaster) and a webmaster's row is
   never replaced; a removed site comes back with Restore; a row missing
   from the list goes to removed sites. */
function decisionKeys(domain){
  const e = entryOf.get(domain);
  const unknown = !e || !e.rows || !e.rows.length;
  if(e && e.missing) return ["remove","ask","reject"];
  if(removedDomains.has(domain)) return ["accept","webmaster","ask","reject"];
  if(e && e.keepWebmaster) return ["ask","reject"];
  if(isReseller(stype)) return unknown ? ["webmaster","ask","reject"] : ["webmaster","accept","ask","reject"];
  return ["accept","webmaster","ask","reject"];
}
/* A decision taken under another sender type or another list (they are
   kept per list label) may no longer be on offer: a Publisher's Accept
   over a webmaster's row after switching to Broker would export a
   reseller's row. Such decisions are dropped (review of 12/10). */
function pruneDecisions(){
  let changed = false;
  for(const d in decisions){ if(entryOf.has(d) && !decisionKeys(d).includes(decisions[d])){ delete decisions[d]; changed = true; } }
  if(changed) saveDecisions();
}
function decisionCell(domain){
  const d = decisions[domain];
  if(written[domain]) return `<span class="fv" style="border-color:var(--ok-line);color:var(--ok-ink)" title="${esc(written[domain])}">${esc(t().written(""))}</span>`;
  const keys = decisionKeys(domain);
  const label = k => (k === "accept" && removedDomains.has(domain)) ? t().restore : t()[k];
  const sel = `<select class="decsel${d ? " on-" + d : ""}" data-dom="${esc(domain)}" aria-label="${esc(t().thDecision)}"><option value="-">${d ? "" : "—"}</option>${keys.map(k => `<option value="${k}"${d === k ? " selected" : ""}>${label(k)}</option>`).join("")}</select>`;
  return `<span class="seg${keys.length === 3 ? " three" : ""}">` + keys.map(k => `<button type="button" data-dom="${esc(domain)}" data-dec="${k}" class="${d === k ? "on-" + k : ""}">${label(k)}</button>`).join("") + `</span>` + sel;
}
/* Every list worked is remembered in the browser (label, sender, type, the
   text, the sites, how many decided), so a list can be picked up again and
   the next list from the same sender is compared with the previous one. */
let histCache = [];
function histKey(){ return "hist:" + ($("label").value || "list").trim(); }
function rememberList(){
  if(!items.length) return;
  const decided = items.filter(i => decisions[i.domain]).length;
  const rec = { label: $("label").value.trim() || "list", sender: $("sender").value.trim(), stype, when: Date.now(), text: $("list").value, domains: items.map(i => i.domain), n: items.length, decided };
  idbPut(histKey(), rec).then(() => loadHistory());
}
function fmtDay(ms){ const d = new Date(ms); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; }
function loadHistory(){
  return idb().then(db => new Promise((ok, no) => {
    const st = db.transaction("files", "readonly").objectStore("files");
    const ks = st.getAllKeys(), vs = st.getAll();
    vs.onsuccess = () => { const keys = ks.result || []; const vals = vs.result || []; ok(vals.filter((v, i) => String(keys[i]).startsWith("hist:") && v && v.domains)); };
    vs.onerror = () => no(vs.error);
  })).then(list => {
    histCache = list.sort((a, b) => b.when - a.when).slice(0, 50);
    const sel = $("hist");
    sel.innerHTML = `<option value="">${esc(t().histPh)}</option>` + histCache.map((h, i) => `<option value="${i}">${esc(t().histItem({ label: h.label, sender: h.sender, when: fmtDay(h.when), n: h.n, decided: h.decided }))}</option>`).join("");
    sel.hidden = !histCache.length;
    previousListNote();
  }).catch(() => {});
}
function openHistory(i){
  const h = histCache[i]; if(!h) return;
  $("label").value = h.label; $("sender").value = h.sender || ""; $("list").value = h.text || "";
  if(FIXED.type.includes(h.stype)) setStype(h.stype); else run();
  $("hist").value = "";
}
/* The sender's previous list, when this one is a different list. */
function previousListNote(){
  const old = $("prevlist"); if(old) old.remove();
  const sender = $("sender").value.trim().toLowerCase(); const label = ($("label").value || "").trim();
  if(!sender || !items.length) return;
  const prev = histCache.find(h => (h.sender || "").toLowerCase() === sender && h.label !== label);
  if(!prev) return;
  const now = new Set(items.map(i => i.domain)), before = new Set(prev.domains);
  const dropped = prev.domains.filter(d => !now.has(d)), added = items.filter(i => !before.has(i.domain)).length;
  const div = document.createElement("div"); div.className = "aviso"; div.id = "prevlist";
  div.textContent = t().prevList({ label: prev.label, when: fmtDay(prev.when), n: prev.n }, dropped.length, added) + (dropped.length ? dropped.slice(0, 10).join(", ") + (dropped.length > 10 ? ` +${dropped.length - 10}` : "") : "");
  const tabs = $("results").querySelector(".gtabs"); if(tabs) tabs.insertAdjacentElement("afterend", div);
}
/* Filter and order of the rows on screen (the toolbar over the table). */
let listQ = "", listSort = "default";
/* The team's minimums for a site to be worth contacting (Senad: "sellable
   metrics"); blank until Gary gives them. Kept in the browser. */
const mins = { dr: "", traffic: "" };
try{ Object.assign(mins, JSON.parse(localStorage.getItem("ljc-lists-mins") || "{}")); }catch(e){}
function metricsCell(item){
  const m = metricsOf(item.terms); if(!m) return "";
  const low = belowThreshold(m, mins);
  const parts = [["dr", "DR"], ["da", "DA"], ["rd", "RD"], ["traffic", "Traffic"], ["tf", "TF"], ["cf", "CF"]].filter(([k]) => m[k] != null).map(([k, l]) => `${l} <b>${m[k] >= 10000 ? Math.round(m[k] / 1000) + "k" : m[k]}</b>`);
  return `<span class="met${low.length ? " low" : ""}" title="${low.length ? esc(t().lowMetrics) : ""}">${parts.join(" · ")}${low.length ? ` · ${esc(t().lowMetrics)}` : ""}</span>`;
}
function ageCell(dateStr){
  const m = monthsSince(dateStr);
  if(m == null) return esc(dateStr || "");
  return `<span class="age${m >= 6 ? " old" : ""}" title="${esc(t().monthsOld(m))}">${esc(dateStr)}${m >= 6 ? ` · ${esc(t().monthsOld(m))}` : ""}</span>`;
}
function entryText(e){
  const low = belowThreshold(metricsOf(e.item.terms), mins).length ? " below minimum low metrics" : "";
  return [e.item.domain, e.item.terms || "", ...(e.rows || []).map(r => (senderOf(r) || "") + " " + (r["Contact Name"] || "")), ...(e.removedRows || []).map(r => senderOf(r) || "")].join(" ").toLowerCase() + low;
}
function maxDelta(e){ let m = 0; (e.diffs || []).forEach(list => priceDelta(list).forEach(d => { if(d.delta != null && Math.abs(d.delta) > Math.abs(m)) m = d.delta; })); return m; }
function minPrice(e){ const ps = NICHES.map(n => e.item.prices[n]).filter(Boolean).map(p => p.amount); return ps.length ? Math.min(...ps) : Infinity; }
function shownEntries(entries){
  const q = listQ.trim().toLowerCase();
  let out = q ? entries.filter(e => entryText(e).includes(q)) : entries.slice();
  if(listSort === "delta") out.sort((a, b) => Math.abs(maxDelta(b)) - Math.abs(maxDelta(a)));
  else if(listSort === "price") out.sort((a, b) => minPrice(a) - minPrice(b));
  else if(listSort === "domain") out.sort((a, b) => a.item.domain.localeCompare(b.item.domain));
  return out;
}
function table(entries, kind){
  if(!entries.length) return `<div class="tabla-wrap"><div class="empty">${t().empty}</div></div>`;
  const rows = entries.map(e => {
    const d = e.item.domain; const done = decisions[d] ? " done" : "";
    const flag = e.conversion ? `<span class="fv off">${t().convChip}</span>` : e.keepWebmaster ? `<span class="fv">${t().keepChip}</span>` : "";
    const dbCol = flag + (e.removedRows ? dbCells(e.removedRows, true) : dbCells(e.rows));
    const offered = e.missing ? `<span class="sender">${t().notListed}</span>` : offeredCells(e.item, e.diffs);
    const terms = e.missing ? "" : termsCells(e.item);
    const note = notes[d] ? `<span class="note" data-notetext="${esc(d)}">${esc(notes[d])}</span>` : `<span class="note" data-notetext="${esc(d)}"></span>`;
    const dup = dupes.find(x => x.domain === d);
    const dupChip = dup ? `<span class="dup">${esc(t().dupChip(dup.count, dup.conflicts.map(c => `${t().niche[c.niche]} ${formatPrice(c.first)} vs ${formatPrice(c.other)}`).join(", ")))}</span>` : "";
    return `<tr class="${done.trim()}" data-row="${esc(d)}"><td class="dom"><button type="button" class="domlink" data-open="${esc(d)}" title="${esc(t().openInDb)}">${esc(d)}</button><button type="button" class="notebtn" data-note="${esc(d)}" title="${esc(t().noteBtn)}">✎</button>${e.item.path ? `<span class="sender">${esc(e.item.path)}</span>` : ""}${dupChip}${note}</td><td data-th="${esc(t().thOffered)}">${offered}</td><td class="dbc" data-th="${esc(kind === "removed" ? t().thRemoved : t().thDb)}">${dbCol}</td><td class="ancha" data-th="${esc(t().thTerms)}">${terms}</td><td class="dec" data-th="${esc(t().thDecision)}">${decisionCell(d)}</td></tr>`;
  }).join("");
  return `<div class="tabla-wrap"><table class="outreach"><thead><tr><th>${t().thDomain}</th><th>${t().thOffered}</th><th>${kind === "removed" ? t().thRemoved : t().thDb}</th><th>${t().thTerms}</th><th>${t().thDecision}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
let removedDomains = new Set();
function render(){
  if(!groups) return;
  indexEntries();
  const first = groups.unknown.concat(groups.changed, groups.unchanged, groups.removed)[0];
  const broker = isReseller(stype) ? `<div class="aviso acc">${t().brokerHint}</div>` : (first && first.brokerHint ? `<div class="aviso">${t().broker(first.brokerHint)}</div>` : "");
  const sameSender = groups.changed.filter(c => c.sameSender).length;
  const all = groups.changed.concat(groups.unknown, groups.unchanged, groups.removed, groups.missing || []);
  const tabs = [
    ["changed", "wait", t().gChanged, groups.changed, t().hChanged],
    ["unknown", "", t().gUnknown, groups.unknown, t().hUnknown],
    ["unchanged", "ok", t().gUnchanged, groups.unchanged, t().hUnchanged],
    ["removed", "", t().gRemoved, groups.removed, t().hRemoved],
    ["missing", "", t().gMissing, groups.missing || [], t().hMissing],
    ["all", "", t().all, all, ""]
  ];
  if(!tabs.find(x => x[0] === view)) view = "changed";
  const cur = tabs.find(x => x[0] === view);
  $("results").innerHTML = `
    <div class="gtabs" role="tablist">
      ${tabs.map(([k, cls, label, arr]) => `<button type="button" role="tab" class="gtab ${cls}" data-view="${k}" aria-selected="${k === view}">${label} <span class="n">${arr.length}</span></button>`).join("")}
      <span class="progreso" id="progreso">${progressHtml()}</span>
      <button type="button" class="btn sutil sumbtn" id="sumcopy" title="${esc(t().summary)}">${esc(t().summary)}</button>
    </div>
    ${broker}
    ${cur[4] ? `<p class="ghint">${cur[4]}${view === "changed" && sameSender ? ` ${sameSender} ${t().fromSender}.` : ""}</p>` : ""}
    ${cur[3].length ? `<div class="ltools">
      <input type="search" id="lq" class="inp" placeholder="${esc(t().lFilter)}" value="${esc(listQ)}" autocomplete="off">
      <select id="lsort">${[["default", t().sortDefault], ["delta", t().sortDelta], ["price", t().sortPriceUp], ["domain", t().sortDomain]].map(([v, l]) => `<option value="${v}"${v === listSort ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>
      <label class="lbl" for="lall">${esc(t().allShown)}</label><select id="lall"><option value="-">${esc(t().choose)}</option>${batchKeys(cur[3]).map(k => `<option value="${k}">${esc(t()[k])}</option>`).join("")}<option value="">${esc(t().clearShown)}</option></select>
      <span class="said" id="shownn"></span>
    </div><p class="keys">${t().keysHint}</p>` : ""}
    <div id="ltable"></div>`;
  renderTable();
  renderExport();
  previousListNote();
}
/* The decisions every row on this tab can take, for the batch buttons. */
function batchKeys(entries){
  const counts = {};
  entries.forEach(e => decisionKeys(e.item.domain).forEach(k => { counts[k] = (counts[k] || 0) + 1; }));
  return ["accept", "webmaster", "ask", "reject", "remove"].filter(k => counts[k]);
}
let curRow = null;   /* domain of the row the keys act on */
function currentEntries(){
  if(!groups) return [];
  const all = groups.changed.concat(groups.unknown, groups.unchanged, groups.removed, groups.missing || []);
  const byView = { changed: groups.changed, unknown: groups.unknown, unchanged: groups.unchanged, removed: groups.removed, missing: groups.missing || [], all };
  return byView[view] || [];
}
function renderTable(){
  const entries = currentEntries();
  const shown = shownEntries(entries);
  const el = $("ltable"); if(!el) return;
  el.innerHTML = table(shown, view === "removed" ? "removed" : view);
  const n = $("shownn"); if(n) n.textContent = shown.length === entries.length ? "" : t().shownN(shown.length, entries.length);
  if(curRow){ const tr = el.querySelector(`tr[data-row="${CSS.escape(curRow)}"]`); if(tr) tr.classList.add("cur"); }
}
/* Batch: the same decision on every row shown, where the row offers it. */
function decideShown(dec){
  const shown = shownEntries(currentEntries());
  shown.forEach(e => { const d = e.item.domain; if(written[d]) return; if(!dec) delete decisions[d]; else if(decisionKeys(d).includes(dec)) decisions[d] = dec; });
  saveDecisions(); renderTable();
  const p = $("progreso"); if(p) p.innerHTML = progressHtml();
  renderExport();
}
function setCurRow(d){
  curRow = d;
  $("results").querySelectorAll("tr.cur").forEach(tr => tr.classList.remove("cur"));
  const tr = d ? $("results").querySelector(`tr[data-row="${CSS.escape(d)}"]`) : null;
  if(tr){ tr.classList.add("cur"); tr.scrollIntoView({ block: "nearest" }); }
}
function decide(d, dec){
  if(written[d]) return;
  if(remote && dec === "accept" && decisions[d] !== "accept"){ const b = $("results").querySelector(`button[data-dom="${CSS.escape(d)}"][data-dec="accept"]`); if(b) acceptRemote(d, b); return; }
  if(!dec || decisions[d] === dec) delete decisions[d]; else if(decisionKeys(d).includes(dec)) decisions[d] = dec; else return;
  saveDecisions(); refreshRow(d);
}
/* Notes: an inline box under the domain, kept with the decisions. */
function editNote(d){
  const span = $("results").querySelector(`.note[data-notetext="${CSS.escape(d)}"]`); if(!span) return;
  if(span.querySelector("input")) { span.querySelector("input").focus(); return; }
  const inp = document.createElement("input"); inp.className = "noteinp"; inp.value = notes[d] || ""; inp.placeholder = t().notePh;
  const done = () => { const v = inp.value.trim(); if(v) notes[d] = v; else delete notes[d]; saveDecisions(); span.textContent = v; renderExport(); };
  inp.addEventListener("keydown", ev => { if(ev.key === "Enter"){ ev.preventDefault(); inp.blur(); } if(ev.key === "Escape"){ inp.value = notes[d] || ""; inp.blur(); } ev.stopPropagation(); });
  inp.addEventListener("blur", done);
  span.textContent = ""; span.appendChild(inp); inp.focus();
}
document.addEventListener("keydown", e => {
  if(mode !== "list" || !groups) return;
  const tag = (e.target && e.target.tagName || "").toLowerCase();
  if(tag === "input" || tag === "textarea" || tag === "select" || e.metaKey || e.ctrlKey || e.altKey) return;
  const rows = [...$("results").querySelectorAll("tr[data-row]")].map(tr => tr.dataset.row);
  if(!rows.length) return;
  const i = rows.indexOf(curRow);
  if(e.key === "ArrowDown" || e.key === "ArrowUp"){
    e.preventDefault();
    const j = e.key === "ArrowDown" ? Math.min(rows.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
    setCurRow(rows[j]); return;
  }
  if(!curRow) return;
  const map = { a: "accept", w: "webmaster", q: "ask", r: "reject", m: "remove", x: "" };
  const k = e.key.toLowerCase();
  if(k === "n"){ e.preventDefault(); editNote(curRow); return; }
  if(k in map){ e.preventDefault(); decide(curRow, map[k]); }
});
function progressHtml(){
  const total = items.length, decided = Object.keys(decisions).filter(k => items.some(i => i.domain === k)).length;
  return `${t().decided(decided, total)} <i><b style="width:${total ? Math.round(decided / total * 100) : 0}%"></b></i>`;
}
/* A decision redraws its own row, the counter and the outputs, not the
   table: with the 877-row librawebcorp list (09/10) a full render took a
   second per click. */
function refreshRow(dom){
  const sel = `button[data-dom="${window.CSS && CSS.escape ? CSS.escape(dom) : dom}"]`;
  const tds = new Set(); $("results").querySelectorAll(sel).forEach(b => { const td = b.closest("td.dec"); if(td) tds.add(td); });
  tds.forEach(td => { td.innerHTML = decisionCell(dom); const tr = td.closest("tr"); if(tr) tr.classList.toggle("done", !!decisions[dom]); });
  const p = $("progreso"); if(p) p.innerHTML = progressHtml();
  renderExport();
}
/* One listener for the whole result area: tabs, domain links, decisions. */
$("results").addEventListener("click", e => {
  const tr = e.target.closest("tr[data-row]"); if(tr) setCurRow(tr.dataset.row);
  const b = e.target.closest("button"); if(!b) return;
  if(b.classList.contains("gtab")){ view = b.dataset.view; curRow = null; render(); return; }
  if(b.dataset.open){ openInDb(b.dataset.open); return; }
  if(b.dataset.note){ editNote(b.dataset.note); return; }
  if(b.id === "sumcopy"){ copyText(summaryText(), b, t().summaryCopied); return; }
  if(b.dataset.all != null){ decideShown(b.dataset.all); return; }
  if(!b.dataset.dec) return;
  const dom = b.dataset.dom, dec = b.dataset.dec;
  if(written[dom]) return;   /* already in the sheet: no undo from here */
  if(remote && dec === "accept" && decisions[dom] !== "accept"){ acceptRemote(dom, b); return; }
  if(decisions[dom] === dec) delete decisions[dom]; else decisions[dom] = dec;
  saveDecisions(); refreshRow(dom);
});
$("results").addEventListener("input", e => {
  if(e.target.id === "lq"){ listQ = e.target.value; renderTable(); }
});
$("results").addEventListener("change", e => {
  if(e.target.id === "lsort"){ listSort = e.target.value; renderTable(); }
  if(e.target.id === "lall"){ const v = e.target.value; if(v !== "-"){ decideShown(v); e.target.value = "-"; } }
  if(e.target.classList.contains("decsel")){ const d = e.target.dataset.dom, v = e.target.value; if(v === "-"){ decide(d, ""); } else if(decisions[d] !== v) decide(d, v); }
});
async function acceptRemote(dom, btn){
  const item = items.find(i => i.domain === dom); if(!item) return;
  /* The Worker writes who accepted from the Access token; the page does
     not. The request id lets a retry after a lost answer not write twice. */
  const flags = acceptFlags(dom);
  const row = rowForAccept(item, Object.assign({ type: stype, sender: $("sender").value.trim(), who: "", listLabel: $("label").value.trim() }, flags));
  const requestId = (acceptIds[dom] = acceptIds[dom] || (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)));
  btn.disabled = true; btn.textContent = t().writing;
  try{
    const r = await fetch("/api/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ row, requestId, restore: !!flags.restored }) });
    const j = await r.json().catch(() => ({}));
    if(!r.ok || !j.ok) throw new Error(j.error || String(r.status));
    written[dom] = j.updatedRange || "ok";
    decisions[dom] = "accept"; saveDecisions();
    refreshRow(dom);
  }catch(e){
    btn.disabled = false; refreshRow(dom);
    const note = document.createElement("div"); note.className = "aviso"; note.textContent = t().writeFail + " " + dom;
    $("results").prepend(note); setTimeout(() => note.remove(), 6000);
  }
}
/* What the row has to say about itself (Senad, 09/10): it replaces a
   reseller's row, or it comes back from removed sites. */
function acceptFlags(domain){
  const e = entryOf.get(domain); if(!e) return {};
  const first = r => (r && r.length) ? r[0] : null;
  return {
    conversion: e.conversion ? (senderOf(first(e.rows)) || true) : false,
    restored: e.removedRows ? (String((first(e.removedRows) || {})["Admin Comments"] || "").split("\n")[0] || true) : false
  };
}
function renderExport(){
  const accepted = items.filter(i => decisions[i.domain] === "accept");
  const label = $("label").value.trim();
  const sender = $("sender").value.trim();
  $("export").hidden = !accepted.length;
  if(accepted.length){
    const done = accepted.filter(i => written[i.domain]).length;
    $("export-t").textContent = remote && done ? t().writtenT(done) : t().exportT(accepted.length);
    document.querySelector("[data-i18n=rowshint]").textContent = remote && done ? t().writtenHint : t().rowshint;
    /* No identity on this page: the trace names the list, not a person. */
    const rows = accepted.map(i => rowForAccept(i, Object.assign({ type: stype, sender, who: "", listLabel: label, note: notes[i.domain] || "" }, acceptFlags(i.domain))));
    const show = ["Type", "Domain", "Webmaster Contact", ...NICHES.map(n => BUYING_COLUMN[n]), "Sponsor Tag Type", "Link Type", "Placement", "Price Validity", "Admin Comments", "Last Updated"];
    const used = show.filter(c => c === "Type" || c === "Domain" || rows.some(r => r[c]));
    $("export-prev").innerHTML = `<table class="outreach"><thead><tr>${used.map(c => `<th>${esc(c.replace("Buying ", "B. "))}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${used.map(c => `<td class="${c === "Domain" ? "dom" : ""}">${esc(r[c]).replace(/\n/g, "<br>")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    $("tsv").value = [DB_COLUMNS.join("\t")].concat(rows.map(r => DB_COLUMNS.map(c => String(r[c]).replace(/\t|\n/g, " ")).join("\t"))).join("\n");
    outputs.accepted = { cols: DB_COLUMNS, rows, name: "accepted", sheet: "Import Database" };
  }
  if(accepted.length) exportWarnings(accepted, sender); else $("export-warn").hidden = true;
  renderDraft();
  const wm = items.filter(i => decisions[i.domain] === "webmaster");
  $("wm").hidden = !wm.length;
  if(wm.length){
    $("wm-t").textContent = t().wmT(wm.length);
    const cols = ["Domain", "Country", "Date Sent", "Whatsapp / Phone Number", "Status WA / Number", "Contact Email", "Alternative contact", "Replied?", "Database?", "Additional Comments"];
    const rows = wm.map(i => {
      const offered = NICHES.filter(n => i.prices[n]).map(n => `${t().niche[n]} ${formatPrice(i.prices[n])}`).join(", ");
      return { Domain: i.domain, Country: "", "Date Sent": "", "Whatsapp / Phone Number": "", "Status WA / Number": "", "Contact Email": "", "Alternative contact": "", "Replied?": "FALSE", "Database?": "FALSE",
        "Additional Comments": `${stype} ${sender} offered ${offered || "no price"}${label ? ` (list ${label})` : ""}${i.terms ? `; ${i.terms}` : ""}${notes[i.domain] ? `; ${notes[i.domain]}` : ""}` };
    });
    const used = ["Domain", "Contact Email", "Additional Comments"];
    $("wm-prev").innerHTML = `<table class="outreach"><thead><tr>${used.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${used.map(c => `<td class="${c === "Domain" ? "dom" : ""}">${esc(r[c]) || "<span class=sender>—</span>"}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    $("wm-tsv").value = [cols.join("\t")].concat(rows.map(r => cols.map(c => String(r[c]).replace(/\t|\n/g, " ")).join("\t"))).join("\n");
    outputs.webmaster = { cols, rows, name: "webmaster", sheet: "BROKER OUTREACH" };
  }
  /* Rows for the removed sites tab: the sender's sites this list no longer names. */
  const gone = ((groups && groups.missing) || []).filter(e => decisions[e.item.domain] === "remove");
  $("rm").hidden = !gone.length;
  if(gone.length){
    $("rm-t").textContent = t().rmT(gone.length);
    const rows = gone.map(e => rowForRemoved(e.rows[0], { listLabel: label, note: notes[e.item.domain] || "" }));
    const used = ["Domain", "Webmaster Contact", "Admin Comments", "Last Updated"];
    $("rm-prev").innerHTML = `<table class="outreach"><thead><tr>${used.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${used.map(c => `<td class="${c === "Domain" ? "dom" : ""}">${esc(r[c]).replace(/\n/g, "<br>")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    $("rm-tsv").value = [REMOVED_COLUMNS.join("\t")].concat(rows.map(r => REMOVED_COLUMNS.map(c => String(r[c]).replace(/\t|\n/g, " ")).join("\t"))).join("\n");
    outputs.removed = { cols: REMOVED_COLUMNS, rows, name: "removed", sheet: "removed sites" };
  }
}
