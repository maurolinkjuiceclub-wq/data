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
/* From the desk's Reply, "Open as site list" (14/10): their messages and the
   sender wait in the browser's storage for a few minutes; the page takes
   them once and matches. */
bootStep("from the desk", () => {
  let h = null; try{ h = JSON.parse(localStorage.getItem("ljc-lists:handoff") || "null"); }catch(e){}
  if(!h) return;
  /* One that has waited longer than that, or is empty, is thrown away too: the
     thread's text does not stay in the browser's storage (19/10). */
  try{ localStorage.removeItem("ljc-lists:handoff"); }catch(e){}
  if(!h.text || Date.now() - (h.at || 0) > 10 * 60 * 1000) return;
  $("sender").value = h.sender || ""; $("list").value = h.text; $("label").value = h.label || "";
});
bootStep("database screen", () => {
  $("mode-list").addEventListener("click", () => setMode("list"));
  $("mode-db").addEventListener("click", () => setMode("db"));
  ["db-q", "db-type", "db-country", "db-lang", "db-niche", "db-removed", "db-wide"].forEach(id => $(id).addEventListener("input", dbOnChange));
  $("db-grid").addEventListener("scroll", () => { if(mode === "db") dbDraw(); });
  $("db-rows").addEventListener("click", ev => { const row = ev.target.closest(".dbr"); if(!row || row.dataset.i == null) return; const i = Number(row.dataset.i); const r = remote ? dbRemoteRow(i) : dbState.list[i]; if(r) dbShow(r); });
  $("db-detail-x").addEventListener("click", () => { $("db-detail").hidden = true; dbState.sel = null; dbDraw(); });
  $("db-q").placeholder = t().dbSearch;
  dbBadge = dbRows.length; paintDbBadge();
  dbRestoreFilters();
});
bootStep("remembered screen", () => { let m = "list"; try{ const v = localStorage.getItem("ljc-lists-mode"); m = v === "db" || v === "offer" ? v : "list"; }catch(e){} if(m !== "list") setMode(m); });
bootStep("sender type", () => setStype(stype));
/* Inside the desk (iframe at /listas/?embed=1&lang=es&theme=dark): the
   desk's bar is above, so the title and the language switch go; the
   language and theme follow the desk's. */
bootStep("embedded", () => {
  const q = new URLSearchParams(location.search);
  if(q.get("embed") === "1") document.body.classList.add("embed");
  if(EN_MESA) $("apps").hidden = false;
  if(q.get("lang") === "es" || q.get("lang") === "en"){ lang = q.get("lang"); try{ localStorage.setItem("ljc-lists-lang", lang); }catch(e){} }
  if(q.get("theme") === "dark" || q.get("theme") === "light"){ temaElegido = q.get("theme"); aplicarTema(); }
});
/* And afterwards, when the desk switches language or theme, it says so by
   message (montarListas in the desk's mesa.html). */
window.addEventListener("message", e => {
  if(e.origin !== location.origin || !e.data || e.data.tipo !== "mesa-listas") return;
  if(e.data.lang === "es" || e.data.lang === "en"){ lang = e.data.lang; try{ localStorage.setItem("ljc-lists-lang", lang); }catch(err){} applyLang(); }
  temaElegido = e.data.theme === "dark" || e.data.theme === "light" ? e.data.theme : ""; aplicarTema();
});
/* The theme, as the desk's: follow the system, dark, light, one button
   that cycles and says which with its icon. The key is the desk's own when
   the page is served by it, so both agree. */
bootStep("fullscreen", () => {
  const b = $("pantalla"); if(!b) return;
  b.addEventListener("click", () => { const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); if(p && p.catch) p.catch(() => {}); });
  document.addEventListener("fullscreenchange", pintarPantalla);
  pintarPantalla();
});
bootStep("theme", () => { aplicarTema(); $("tema").addEventListener("click", () => { temaElegido = temaElegido === "" ? "dark" : temaElegido === "dark" ? "light" : ""; try{ localStorage.setItem(TEMA_KEY, temaElegido); }catch(e){} aplicarTema(); }); });
/* Who is signed in, from the desk's Worker, in the blue bubble. */
bootStep("who", () => {
  if(!EN_MESA) return;
  fetch("/api/quien", { headers: { accept: "application/json" } }).then(r => r.ok ? r.json() : null).then(j => {
    if(!j || !j.email) return;
    const w = $("whoami"); w.textContent = ""; const av = document.createElement("span"); av.className = "whoami-av"; av.setAttribute("aria-hidden", "true"); av.textContent = j.email.charAt(0).toUpperCase();
    const tx = document.createElement("span"); tx.className = "txt"; tx.textContent = j.email;
    w.appendChild(av); w.appendChild(tx); w.title = t().whoamiLbl + " " + j.email; w.hidden = false;
  }).catch(() => {});
});
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
/* When it answers, whichever screen is open is redrawn from it: the
   Database and Offers screens may have drawn the local rows meanwhile. */
checkRemote().then(() => { if(remote){ run(); if(mode === "db") dbRefresh(); if(mode === "offer") ofRefresh(); } }).catch(e => console.error("worker check:", e));
