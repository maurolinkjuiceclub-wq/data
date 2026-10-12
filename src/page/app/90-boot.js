/* ---------- boot ----------
   Each step on its own, so one that fails in some browser does not leave
   the page blank: the list and the sample result come first, the Worker
   check after, and an error is shown instead of swallowed. */
function bootStep(name, fn){
  try{ return fn(); }
  catch(e){
    console.error("boot:", name, e);
    const note = document.createElement("div"); note.className = "aviso";
    note.textContent = "Something failed while loading (" + name + "): " + (e && e.message ? e.message : e) + ". Please send this text to Simon.";
    ($("results") || document.body).prepend(note);
  }
}
bootStep("buttons", () => {
  document.querySelectorAll("[data-stype]").forEach(b => b.addEventListener("click", () => setStype(b.dataset.stype)));
  $("hist").addEventListener("change", () => { if($("hist").value !== "") openHistory(Number($("hist").value)); });
  $("help").addEventListener("click", () => { const open = $("helppanel").hidden; $("helppanel").hidden = !open; $("help").setAttribute("aria-expanded", String(open)); });
  loadHistory();
  $("min-dr").value = mins.dr; $("min-traffic").value = mins.traffic;
  ["dr", "traffic"].forEach(k => $("min-" + k).addEventListener("change", () => { mins[k] = $("min-" + k).value; try{ localStorage.setItem("ljc-lists-mins", JSON.stringify(mins)); }catch(e){} if(groups) renderTable(); }));
});
bootStep("list", () => { $("list").value = STAR; });
bootStep("database screen", () => {
  $("mode-list").addEventListener("click", () => setMode("list"));
  $("mode-db").addEventListener("click", () => setMode("db"));
  ["db-q", "db-type", "db-country", "db-lang", "db-niche", "db-removed", "db-wide"].forEach(id => $(id).addEventListener("input", dbOnChange));
  $("db-grid").addEventListener("scroll", () => { if(mode === "db") dbDraw(); });
  $("db-rows").addEventListener("click", ev => { const row = ev.target.closest(".dbr"); if(!row || row.dataset.i == null) return; const i = Number(row.dataset.i); const r = remote ? dbRemoteRow(i) : dbState.list[i]; if(r) dbShow(r); });
  $("db-detail-x").addEventListener("click", () => { $("db-detail").hidden = true; dbState.sel = null; dbDraw(); });
  $("db-q").placeholder = t().dbSearch;
  $("mode-db-n").textContent = dbRows.length.toLocaleString("en");
  dbRestoreFilters();
});
bootStep("remembered screen", () => { let m = "list"; try{ m = localStorage.getItem("ljc-lists-mode") === "db" ? "db" : "list"; }catch(e){} if(m === "db") setMode("db"); });
bootStep("sender type", () => setStype(stype));
bootStep("language", () => applyLang());
bootStep("match", () => run());
/* The copy loaded on an earlier visit, if any: read again from the browser. */
bootStep("stored database", () => {
  idbGet("db").then(rec => {
    if(!rec || !Array.isArray(rec.db)) return;
    dbRows = rec.db; rmRows = Array.isArray(rec.rm) ? rec.rm : []; rmFromWorkbook = !!rec.rmFromWorkbook;
    dbSource = rec.name; dbLoadedAt = new Date(rec.when);
    rebuild();
  });
});
/* The Worker, if there is one next to the page; the sample result stays
   until it answers. */
checkRemote().then(() => { if(remote) run(); }).catch(e => console.error("worker check:", e));
