/* ---------- the outputs under the result ---------- */
/* Before the rows go to the sheet: what would arrive wrong. */
function exportWarnings(accepted, sender){
  const few = arr => arr.slice(0, 6).join(", ") + (arr.length > 6 ? ` +${arr.length - 6}` : "");
  const noPrice = accepted.filter(i => !NICHES.some(n => i.prices[n])).map(i => i.domain);
  const foreign = accepted.filter(i => NICHES.some(n => i.prices[n] && i.prices[n].currency && i.prices[n].currency !== "EUR")).map(i => i.domain);
  const noTerms = accepted.filter(i => { const f = termsOf(i); return !f.linkType && !f.placement; }).map(i => i.domain);
  const lines = [];
  if(!sender) lines.push(t().warnNoContact);
  if(noPrice.length) lines.push(t().warnNoPrice(noPrice.length, few(noPrice)));
  if(foreign.length) lines.push(t().warnCurrency(foreign.length, few(foreign)));
  if(noTerms.length) lines.push(t().warnNoTerms(noTerms.length, few(noTerms)));
  const w = $("export-warn"); w.hidden = !lines.length; w.innerHTML = lines.map(l => `<div>${esc(l)}</div>`).join("");
}
/* A summary for the team channel, in English whatever the screen's language. */
function summaryText(){
  if(!groups) return "";
  const g = groups, n = items.length;
  const c = k => items.filter(i => decisions[i.domain] === k).length;
  const rm = (g.missing || []).filter(e => decisions[e.item.domain] === "remove").length;
  const conv = g.changed.filter(e => e.conversion && decisions[e.item.domain] === "accept").length;
  const label = $("label").value.trim(), sender = $("sender").value.trim();
  const parts = [`List ${label || "(no label)"} from ${sender || "(no sender)"} (${stype}), ${new Date().toLocaleDateString("en-GB")}: ${n} site${n === 1 ? "" : "s"}.`,
    `${g.changed.length} changed, ${g.unknown.length} new, ${g.unchanged.length} unchanged, ${g.removed.length} on removed sites, ${(g.missing || []).length} missing from the list.`,
    `Decided: ${c("accept")} accepted${conv ? ` (${conv} broker conversion${conv === 1 ? "" : "s"})` : ""}, ${c("webmaster")} to webmaster, ${c("ask")} to ask, ${c("reject")} rejected, ${rm} to removed sites.`];
  const open = n - ["accept", "webmaster", "ask", "reject"].reduce((a, k) => a + c(k), 0);
  if(open) parts.push(`${open} still undecided.`);
  return parts.join(" ");
}
function copyText(txt, btn, said){
  const done = () => { const prev = btn.textContent; btn.textContent = said; setTimeout(() => { btn.textContent = prev; }, 1500); };
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, () => window.prompt("", txt)); else window.prompt("", txt);
}
/* The reply to the sender (house rule 5 of the desk): thanks, what was
   updated, and only the questions the rows leave open. A finished thread
   gets one closing email with no questions. Never sent from here. */
function draftReply(){
  const accepted = items.filter(i => decisions[i.domain] === "accept");
  const asks = items.filter(i => decisions[i.domain] === "ask");
  if(!accepted.length && !asks.length) return { text: "", questions: 0 };
  const lt = lastParsed ? listTermsOf(lastParsed) : { adminComments: [], priceValidity: "" };
  const listText = (lastParsed ? lastParsed.skipped.map(x => x.text).join(" ") : "") + " " + items.map(i => i.terms || "").join(" ");
  const saysUnlicensed = /unlicen[cs]ed|non[- ]?gamstop|licen[cs]ed (casinos?|gambling|operators?) only|only (properly |duly )?licen[cs]ed|gambling \(legal\)|illegal gambling/i.test(listText) || items.some(i => i.prices.unlicensedCasino);
  const saysValidity = !!lt.priceValidity || /valid (until|till|for)|validity|fixed price|festpreis|not fixed|negotiable/i.test(listText);
  const lines = [];
  lines.push("Hello,");
  lines.push("");
  lines.push("Thank you for the list.");
  if(accepted.length) lines.push(`We have updated ${accepted.length === 1 ? "the site" : accepted.length + " sites"} in our database${asks.length ? " and have a few questions about the rest" : ""}.`);
  let q = 0;
  if(asks.length){
    lines.push("");
    for(const i of asks){
      const f = termsOf(i); const want = [];
      const priced = NICHES.filter(n => i.prices[n]);
      if(!priced.length) want.push("your price for an article with a dofollow link");
      else {
        if(!i.prices.casino) want.push("whether you accept casino or betting links, and at what price");
        if(!i.prices.crypto && !i.prices.forex) want.push("whether you accept crypto or forex links, and at what price");
      }
      if(!f.linkType) want.push("whether the link is dofollow");
      if(!f.placement) want.push("whether the article stays permanently");
      if(f.sponsorTag === "" && !/sponsored|marked|tag/i.test(i.terms || "")) want.push("whether the article is marked as sponsored");
      if(!want.length) want.push("could you confirm the price and conditions");
      lines.push(`- ${i.domain}: ${want.join("; ")}.`);
      q += want.length;
    }
  }
  const general = [];
  if(!saysUnlicensed) general.push("Do you accept unlicensed casinos, and at what price?");
  if(!saysValidity) general.push("How long will these prices stay valid for us?");
  if(general.length && (asks.length || accepted.length)){
    lines.push("");
    general.forEach(g => { lines.push(g); q++; });
  }
  lines.push("");
  lines.push(q ? "Thank you in advance." : "Thank you again, everything is noted.");
  lines.push("");
  lines.push("Best regards,");
  return { text: lines.join("\n"), questions: q };
}
function renderDraft(){
  const d = draftReply();
  $("ask").hidden = !d.text;
  if(d.text){ $("ask-t").textContent = t().askT(d.questions); $("ask-txt").value = d.text; }
}
$("ask-copy").addEventListener("click", () => copyText($("ask-txt").value, $("ask-copy"), t().copied));
$("ask-h").addEventListener("click", () => { const open = $("ask-body").hidden; $("ask-body").hidden = !open; $("ask-h").setAttribute("aria-expanded", String(open)); });
function copyFrom(id, note){
  const el = $(id); const txt = el.value;
  const done = () => { $(note).textContent = t().copied; setTimeout(() => { $(note).textContent = ""; }, 1500); };
  const fallback = () => { el.hidden = false; el.select(); };
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback); else fallback();
}
$("wm-copy").addEventListener("click", () => copyFrom("wm-tsv", "wm-note"));
$("copy").addEventListener("click", () => copyFrom("tsv", "copynote"));
/* Downloads, as the desk's "Download CSV" (Gary, 09/10: "an export option
   like in the desk"). The CSV carries a BOM for Excel and keeps the line
   breaks of Admin Comments inside quotes; the .xlsx (SheetJS, loaded only
   then) writes prices as numbers under the sheet's own tab name. */
const outputs = { accepted: null, webmaster: null, removed: null };
function stamp(){ return new Date().toISOString().slice(0, 10); }
/* In the claude.ai viewer a page cannot download by itself: the file goes
   through the viewer's own save prompt (claude.use("downloads")). Anywhere
   else (GitHub Pages, a file on disk, the desk) it is a plain download. */
async function saveBlob(blob, name){
  if(window.claude && typeof window.claude.use === "function"){
    const dl = await window.claude.use("downloads").catch(() => null);
    if(dl){
      try{ await dl.save({ filename: name, data: blob }); }
      catch(e){ if(!e || e.code !== "declined") console.error("save:", e); }
      return;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function csvOf(out){
  const q = v => { const s = String(v == null ? "" : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return "\ufeff" + [out.cols.map(q).join(",")].concat(out.rows.map(r => out.cols.map(c => q(r[c])).join(","))).join("\r\n");
}
function downloadCsv(out){ if(out) saveBlob(new Blob([csvOf(out)], { type: "text/csv;charset=utf-8" }), `ljc-lists-${out.name}-${stamp()}.csv`); }
async function downloadXlsx(out, note){
  if(!out) return;
  try{
    const XLSX = await loadSheetJS();
    const num = v => (typeof v === "string" && /^\d+(\.\d+)?$/.test(v)) ? Number(v) : v;
    const aoa = [out.cols].concat(out.rows.map(r => out.cols.map(c => /^Buying /.test(c) ? num(r[c]) : (r[c] == null ? "" : r[c]))));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), out.sheet);
    saveBlob(new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `ljc-lists-${out.name}-${stamp()}.xlsx`);
  }catch(e){ $(note).textContent = t().fileFail; }
}
$("dl-csv").addEventListener("click", () => downloadCsv(outputs.accepted));
$("dl-xlsx").addEventListener("click", () => downloadXlsx(outputs.accepted, "copynote"));
$("rm-copy").addEventListener("click", () => copyFrom("rm-tsv", "rm-note"));
$("rm-csv").addEventListener("click", () => downloadCsv(outputs.removed));
$("rm-xlsx").addEventListener("click", () => downloadXlsx(outputs.removed, "rm-note"));
$("rm-h").addEventListener("click", () => { const open = $("rm-body").hidden; $("rm-body").hidden = !open; $("rm-h").setAttribute("aria-expanded", String(open)); });
$("wm-csv").addEventListener("click", () => downloadCsv(outputs.webmaster));
$("wm-xlsx").addEventListener("click", () => downloadXlsx(outputs.webmaster, "wm-note"));
