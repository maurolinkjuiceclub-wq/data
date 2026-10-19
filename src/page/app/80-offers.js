/* ---------- the offers screen ----------
   Tim, 13/10: "offers we send to clients, that is now done manually". An
   offer is a selection of sites from the database for one client, with
   metrics and a price per site. The screen is the database with the same
   filters plus two minimums (DR, traffic), an order, and a basket on the
   right: click a row to add it, type the price the client gets, copy or
   download the sheet. Nothing here writes anywhere. The price starts as
   the publisher's price for the niche; the margin rule is the team's to
   give (BRIEF, open question 1). Offers are kept in this browser by name. */
const ofState = { q: "", type: "", country: "", lang: "", niche: "casino", minDr: "", minTraffic: "", topic: "", sort: "dr", list: [], total: 0, remotePages: new Map(), remoteTotal: 0, failed: false };
const OF_COLS = [["pick", 40], ["Domain", 220], ["Country", 110], ["Language", 90], ["DR", 64], ["RD", 84], ["Traffic", 94], ["Topic", 170], ["Price", 84], ["Terms", 220]];
const OFFERS_KEY = "ljc-offers";
let offer = { client: "", label: "", niche: "casino", items: [], linked: "" };   /* items: {domain, row, price, comment}; linked: the pasted domains that already link to the client */
const inOffer = () => new Set(offer.items.map(i => i.domain));
/* Senad's offer process (13/10): the client sheet's used domains and the
   target URL's referring domains are not offered again. Parsed once per
   change of the box. */
let linkedSet = new Set();
function parseLinked(text){
  const out = new Set();
  String(text || "").split(/[\s,;]+/).forEach(tok => { const d = normaliseDomain(tok); if(d) out.add(d.domain); });
  return out;
}

function ofSourceRows(){ return dbRows; }
/* "price" on the select is the niche's price column. */
function ofSort(){ return ofState.sort === "price" ? "price:" + ofState.niche : ofState.sort; }
function ofRefresh(){
  if(remote){ ofState.remotePages.clear(); ofState.failed = false; ofRemoteFetch(0, true); return; }
  const rows = ofSourceRows();
  const f = dbFacetsFor(rows);
  ofState.country = fillSelect("of-country", f.countries, ofState.country);
  ofState.lang = fillSelect("of-lang", f.languages, ofState.lang);
  ofState.list = sortRows(rows.filter(r => rowMatchesFilters(r, ofState)), ofSort());
  ofState.total = rows.length;
  ofDraw();
}
function ofCell(r, c, picked){
  if(c === "pick") return `<div class="pick">${picked ? "✓" : "+"}</div>`;
  if(c === "Domain") return `<div class="d" title="${esc(r.Domain)}">${esc(r.Domain)}</div>`;
  if(c === "Country") return `<div class="s">${esc(r["Main Country"] || "")}</div>`;
  if(c === "Language") return `<div class="s">${esc(r["Domain Language"] || "")}</div>`;
  if(c === "Topic") return `<div class="s" title="${esc(r["Website Topic"] || "")}">${esc(r["Website Topic"] || "")}</div>`;
  if(c === "DR" || c === "RD" || c === "Traffic"){ const v = numberOf(r[{ DR: "Ahrefs Domain Rating", RD: "Ahrefs Referring Domains", Traffic: "Ahrefs Organic Traffic" }[c]]); return `<div class="num ${v != null ? "has" : ""}">${v != null ? v.toLocaleString("en") : "·"}</div>`; }
  if(c === "Price"){ const p = offerPriceOf(r, ofState.niche); return `<div class="num ${p ? "has" : ""}${p && p.source === "buy" ? " cost" : ""}" title="${p ? esc(p.source === "sell" ? t().priceOurs : t().priceCost) : ""}">${p ? p.amount : "·"}</div>`; }
  if(c === "Terms"){ const f = [r["Link Type"], r["Placement"], r["Price Validity"], r["Sponsor Tag Type"]].filter(Boolean).join(" · "); return `<div class="s" title="${esc(f)}">${esc(f) || `<span class="mut">—</span>`}</div>`; }
  return `<div></div>`;
}
function ofDraw(){
  const grid = $("of-grid");
  grid.style.setProperty("--cols", OF_COLS.map(([, w]) => w + "px").join(" "));
  $("of-head").innerHTML = OF_COLS.map(([c]) => `<div title="${esc(c)}">${c === "pick" ? "" : esc(t().ofCols[c] || c)}</div>`).join("");
  const total = remote ? ofState.remoteTotal : ofState.list.length;
  $("of-count").textContent = t().dbCount(total, remote ? (remote.rows || 0) : ofState.total);
  if(!total){ $("of-top").style.height = "0px"; $("of-bottom").style.height = "0px"; $("of-rows").innerHTML = (remote && ofState.failed) ? `<div class="dbempty">${esc(t().dbLoadFailed)} <button type="button" class="btn sutil" id="of-retry">${esc(t().dbRetry)}</button></div>` : `<div class="dbempty">${esc(emptyText())}</div>`;
    const retry = $("of-retry"); if(retry) retry.onclick = () => ofRefresh();
    return; }
  const scroll = grid.scrollTop, h = grid.clientHeight || 600;
  const first = Math.max(0, Math.floor(scroll / ROW_H) - 10), last = Math.min(total, Math.ceil((scroll + h) / ROW_H) + 10);
  $("of-top").style.height = (first * ROW_H) + "px";
  $("of-bottom").style.height = ((total - last) * ROW_H) + "px";
  const have = inOffer(); const out = [];
  for(let i = first; i < last; i++){
    const r = remote ? ofRemoteRow(i) : ofState.list[i];
    if(!r){ out.push(`<div class="dbr dbloading"><div class="d">${t().dbLoading}</div></div>`); continue; }
    const d = normaliseDomain(r.Domain); const picked = !!(d && have.has(d.domain)); const linked = !!(d && linkedSet.has(d.domain));
    out.push(`<div class="dbr ${picked ? "sel" : ""} ${linked ? "linked" : ""}" data-i="${i}">${OF_COLS.map(([c]) => ofCell(r, c, picked)).join("")}</div>`);
  }
  $("of-rows").innerHTML = out.join("");
}
/* Click a row: in or out of the offer. Price from the sheet for the niche. */
function ofToggle(r){
  const d = normaliseDomain(r.Domain); if(!d) return;
  const i = offer.items.findIndex(x => x.domain === d.domain);
  if(i >= 0) offer.items.splice(i, 1);
  else offer.items.push({ domain: d.domain, row: r, price: offerPrice(r, offer.niche), comment: "" });
  saveOffer(); renderBasket(); ofDraw();
}
/* --- the basket --- */
function renderBasket(){
  const list = $("of-items");
  if(!offer.items.length){ list.innerHTML = `<div class="dbempty">${esc(t().ofEmpty)}</div>`; }
  else list.innerHTML = offer.items.map((it, i) => {
    /* Where the price came from, unless the person typed it: our sell
       price, or the cost price when the database has no sell price. */
    const src = it.typed ? null : offerPriceOf(it.row, offer.niche);
    const tag = src ? `<span class="pricesrc${src.source === "buy" ? " cost" : ""}" title="${esc(src.source === "sell" ? t().priceOurs : t().priceCost)}">${esc(src.source === "sell" ? t().priceOurs : t().priceCost)}</span>` : "";
    return `<div class="ofit" data-i="${i}"><div class="d" title="${esc(it.domain)}">${esc(it.domain)}</div><input type="number" class="ofprice" data-i="${i}" min="0" step="1" value="${it.price == null ? "" : esc(String(it.price))}" aria-label="Price"><input type="text" class="ofcomment" data-i="${i}" value="${esc(it.comment || "")}" placeholder="${esc(t().ofComment)}" aria-label="Comment"><button type="button" class="btn sutil ofx" data-i="${i}" aria-label="Remove">×</button>${tag}</div>`;
  }).join("");
  const sum = offer.items.reduce((a, it) => a + (Number(it.price) || 0), 0);
  $("of-total").textContent = t().ofTotal(offer.items.length, sum);
  const out = offerOutput();
  $("of-tsv").value = [out.cols.join("\t")].concat(out.rows.map(r => out.cols.map(c => String(r[c] ?? "").replace(/\t/g, " ")).join("\t"))).join("\n");
  outputs.offer = out;
}
function offerOutput(){
  const rows = offer.items.map(it => rowForOffer(it.row, { niche: offer.niche, price: it.price, comment: it.comment }));
  const slug = (offer.label || offer.client || "offer").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "offer";
  return { cols: OFFER_COLUMNS, rows, name: "offer-" + slug, sheet: "Offer" };
}
function offersStore(){ try{ return JSON.parse(localStorage.getItem(OFFERS_KEY) || "{}"); }catch(e){ return {}; } }
function saveOffer(){
  const key = (offer.label || "").trim(); if(!key) return;
  const all = offersStore();
  all[key] = { client: offer.client, niche: offer.niche, linked: offer.linked || "", at: Date.now(), items: offer.items.map(it => ({ domain: it.domain, price: it.price, typed: !!it.typed, comment: it.comment, row: it.row })) };
  try{ localStorage.setItem(OFFERS_KEY, JSON.stringify(all)); localStorage.setItem(OFFERS_KEY + ":current", key); }catch(e){}
  fillOfferHist();
}
function fillOfferHist(){
  const all = offersStore(); const sel = $("of-hist");
  const names = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0));
  sel.innerHTML = `<option value="">${esc(t().ofPrev)}</option>` + names.map(n => `<option value="${esc(n)}">${esc(n)} · ${all[n].items.length}</option>`).join("");
  sel.hidden = !names.length;
}
function openOffer(name){
  const rec = offersStore()[name]; if(!rec) return;
  offer = { client: rec.client || "", label: name, niche: rec.niche || "casino", linked: rec.linked || "", items: (rec.items || []).map(it => ({ domain: it.domain, row: it.row || { Domain: it.domain }, price: it.price, typed: !!it.typed, comment: it.comment || "" })) };
  $("of-client").value = offer.client; $("of-label").value = offer.label; $("of-niche").value = offer.niche; ofState.niche = offer.niche; $("of-hist").value = name;
  $("of-linked").value = offer.linked; linkedSet = parseLinked(offer.linked); $("of-linked-n").textContent = linkedSet.size ? t().ofLinkedN(linkedSet.size) : "";
  try{ localStorage.setItem(OFFERS_KEY + ":current", name); }catch(e){}
  renderBasket(); if(mode === "offer") ofRefresh();
}
function newOffer(){
  offer = { client: "", label: "", niche: ofState.niche, items: [], linked: "" };
  $("of-client").value = ""; $("of-label").value = ""; $("of-hist").value = ""; $("of-linked").value = ""; linkedSet = new Set(); $("of-linked-n").textContent = "";
  try{ localStorage.removeItem(OFFERS_KEY + ":current"); }catch(e){}
  renderBasket(); ofDraw();
}

/* --- the Worker's pages, as the database screen --- */
function ofRemoteRow(i){
  const page = Math.floor(i / PAGE), rows = ofState.remotePages.get(page);
  if(rows === undefined){ ofRemoteFetch(page * PAGE, false); ofState.remotePages.set(page, null); return null; }
  return rows ? rows[i - page * PAGE] : null;
}
function ofRemoteQuery(offset){
  const p = new URLSearchParams({ offset: String(offset), limit: String(PAGE) });
  for(const k of ["q", "type", "country", "lang", "niche", "minDr", "minTraffic", "topic"]){ const v = String(ofState[k] || "").trim(); if(v) p.set(k, v); }
  if(ofSort()) p.set("sort", ofSort());
  return p.toString();
}
async function ofRemoteFetch(offset, first){
  const key = ofRemoteQuery(offset);
  try{
    const r = await fetch(API + "/rows?" + key);
    if(!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    if(ofRemoteQuery(offset) !== key) return;
    ofState.remotePages.set(Math.floor(offset / PAGE), (j.rows || []).map(prepareRow));
    ofState.remoteTotal = j.total || 0; ofState.failed = false;
    if(first && j.facets){ ofState.country = fillSelect("of-country", j.facets.countries || [], ofState.country); ofState.lang = fillSelect("of-lang", j.facets.languages || [], ofState.lang); }
    ofDraw();
  }catch(e){
    if(offset === 0){ ofState.failed = true; ofState.remoteTotal = 0; }
    else { ofState.remotePages.delete(Math.floor(offset / PAGE)); setTimeout(ofDraw, 3000); }
    ofDraw();
  }
}
let ofTimer = null;
const OF_FILTER_KEYS = ["q", "type", "country", "lang", "niche", "minDr", "minTraffic", "topic", "sort"];
function ofSaveFilters(){ try{ localStorage.setItem("ljc-lists-offilters", JSON.stringify(Object.fromEntries(OF_FILTER_KEYS.map(k => [k, ofState[k]])))); }catch(e){} }
function ofRestoreFilters(){
  try{
    const f = JSON.parse(localStorage.getItem("ljc-lists-offilters") || "{}");
    OF_FILTER_KEYS.forEach(k => { if(f[k] != null) ofState[k] = f[k]; });
    $("of-q").value = ofState.q; $("of-type").value = ofState.type; $("of-niche").value = ofState.niche || "casino"; $("of-min-dr").value = ofState.minDr; $("of-min-traffic").value = ofState.minTraffic; $("of-topic").value = ofState.topic || ""; $("of-sort").value = ofState.sort || "dr";
    offer.niche = ofState.niche;
  }catch(e){}
}
function ofOnChange(){
  ofState.q = $("of-q").value; ofState.type = $("of-type").value; ofState.country = $("of-country").value; ofState.lang = $("of-lang").value;
  ofState.niche = $("of-niche").value || "casino"; ofState.minDr = $("of-min-dr").value; ofState.minTraffic = $("of-min-traffic").value; ofState.topic = $("of-topic").value; ofState.sort = $("of-sort").value;
  /* The niche is the offer's: the prices in the basket follow it only for
     sites whose price was not typed by hand. */
  if(offer.niche !== ofState.niche){ offer.niche = ofState.niche; offer.items.forEach(it => { if(!it.typed) it.price = offerPrice(it.row, offer.niche); }); saveOffer(); renderBasket(); }
  ofSaveFilters();
  $("of-grid").scrollTop = 0;
  clearTimeout(ofTimer); ofTimer = setTimeout(ofRefresh, remote ? 250 : 0);
}
bootStep("offers screen", () => {
  $("mode-offer").addEventListener("click", () => setMode("offer"));
  ["of-q", "of-type", "of-country", "of-lang", "of-niche", "of-min-dr", "of-min-traffic", "of-topic", "of-sort"].forEach(id => $(id).addEventListener("input", ofOnChange));
  $("of-linked").addEventListener("input", () => { offer.linked = $("of-linked").value; linkedSet = parseLinked(offer.linked); $("of-linked-n").textContent = linkedSet.size ? t().ofLinkedN(linkedSet.size) : ""; saveOffer(); ofDraw(); });
  /* The export as it comes: Ahrefs' Referring domains (CSV in UTF-8 or
     UTF-16, or Excel) or the client sheet. Every cell that is a domain or
     a URL counts; the rest (numbers, words) is left alone. */
  $("of-linked-file").addEventListener("change", async () => {
    const f = $("of-linked-file").files && $("of-linked-file").files[0]; if(!f) return;
    $("of-linked-note").textContent = t().fileLoading;
    try{
      let cells = [];
      if(/\.(xlsx|xls|xlsm|ods)$/i.test(f.name)){
        const XLSX = await loadSheetJS();
        const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
        wb.SheetNames.forEach(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" }).forEach(r => r.forEach(c => cells.push(String(c)))));
      }else{
        const buf = new Uint8Array(await f.arrayBuffer());
        const utf16 = (buf[0] === 0xFF && buf[1] === 0xFE) || (buf.length > 3 && buf[1] === 0 && buf[3] === 0);
        const text = new TextDecoder(utf16 ? "utf-16le" : "utf-8").decode(buf);
        cells = text.split(/[\r\n]+/).flatMap(l => l.split(/[\t,;]/)).map(c => c.replace(/^"|"$/g, "").trim());
      }
      const found = new Set();
      cells.forEach(c => { const d = normaliseDomain(c); if(d && /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(d.domain)) found.add(d.domain); });
      const had = parseLinked($("of-linked").value);
      const fresh = [...found].filter(d => !had.has(d));
      if(fresh.length){ $("of-linked").value = ($("of-linked").value.trim() ? $("of-linked").value.trim() + "\n" : "") + fresh.join("\n"); $("of-linked").dispatchEvent(new Event("input")); }
      $("of-linked-note").textContent = found.size ? t().ofLinkedRead(fresh.length, f.name) : t().ofLinkedNone(f.name);
    }catch(e){ $("of-linked-note").textContent = t().fileFail; }
    $("of-linked-file").value = "";
  });
  $("of-grid").addEventListener("scroll", () => { if(mode === "offer") ofDraw(); });
  $("of-rows").addEventListener("click", ev => { const row = ev.target.closest(".dbr"); if(!row || row.dataset.i == null) return; const i = Number(row.dataset.i); const r = remote ? ofRemoteRow(i) : ofState.list[i]; if(r) ofToggle(r); });
  $("of-items").addEventListener("input", ev => {
    const i = Number(ev.target.dataset.i); const it = offer.items[i]; if(!it) return;
    if(ev.target.classList.contains("ofprice")){ it.price = ev.target.value === "" ? null : Number(ev.target.value); it.typed = true; }
    if(ev.target.classList.contains("ofcomment")) it.comment = ev.target.value;
    const sum = offer.items.reduce((a, x) => a + (Number(x.price) || 0), 0);
    $("of-total").textContent = t().ofTotal(offer.items.length, sum);
    outputs.offer = offerOutput(); $("of-tsv").value = [outputs.offer.cols.join("\t")].concat(outputs.offer.rows.map(r => outputs.offer.cols.map(c => String(r[c] ?? "")).join("\t"))).join("\n");
    saveOffer();
  });
  $("of-items").addEventListener("click", ev => { const b = ev.target.closest(".ofx"); if(!b) return; offer.items.splice(Number(b.dataset.i), 1); saveOffer(); renderBasket(); ofDraw(); });
  $("of-client").addEventListener("input", () => { offer.client = $("of-client").value; saveOffer(); });
  $("of-label").addEventListener("input", () => { offer.label = $("of-label").value; saveOffer(); });
  $("of-hist").addEventListener("change", () => { if($("of-hist").value) openOffer($("of-hist").value); });
  $("of-new").addEventListener("click", newOffer);
  $("of-copy").addEventListener("click", () => copyFrom("of-tsv", "of-note"));
  $("of-csv").addEventListener("click", () => downloadCsv(outputs.offer));
  $("of-xlsx").addEventListener("click", () => downloadXlsx(outputs.offer, "of-note"));
  $("of-q").placeholder = t().dbSearch; $("of-topic").placeholder = t().ofTopic;
  ofRestoreFilters(); fillOfferHist(); renderBasket();
  /* The offer that was open last time, back with its rows. */
  let cur = ""; try{ cur = localStorage.getItem(OFFERS_KEY + ":current") || ""; }catch(e){}
  if(cur) openOffer(cur);
});
