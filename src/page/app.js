/* ---------- sample database (2026 layout, marked rows are examples) ---------- */
const SAMPLE_DB = [
  r("Publisher","sternmagazin.example","redaktion@sternmagazin.example","",{general:"99",casino:"249",cbd:"170",crypto:"170"},"dofollow","Guest post","permanent","Example row: same prices as the list"),
  r("Publisher","nordlicht-magazin.example","redaktion@sternmagazin.example","",{general:"99",casino:"199",cbd:"150",crypto:"150"},"dofollow","Guest post","permanent","Example row: casino and CBD were cheaper"),
  r("Broker","alpenblick-news.example","deals@linkdealers.example","Max",{general:"149",casino:"349"},"dofollow","Guest post","31/12/2026","Example row from a broker"),
  r("Publisher","technikwelt.example","redaktion@technikwelt.example","Petra",{general:"99",casino:"449",cbd:"249",crypto:"249"},"dofollow","Guest post","permanent","Example row"),
  r("Publisher","fussball-arena.example","jof@fussball-arena.example","Jozef",{casino:"400",general:"300"},"dofollow","Guest post","permanent","Example row"),
  r("Broker","deals-a.example","deals@linkdealers.example","Max",{general:"120"},"dofollow","Link insertion","permanent","Example row"),
  r("Broker","deals-b.example","deals@linkdealers.example","Max",{general:"120"},"dofollow","Link insertion","permanent","Example row"),
  r("Broker","deals-c.example","deals@linkdealers.example","Max",{general:"120"},"dofollow","Link insertion","permanent","Example row")
];
const SAMPLE_REMOVED = [ r("Publisher","rheinreport.example","redaktion@sternmagazin.example","",{general:"89"},"dofollow","Guest post","permanent","Example: removed, thin content") ];
function r(type, domain, mail, name, buying, tag, link, validity, comment){
  const row = Object.fromEntries(DB_COLUMNS.map(c => [c, ""]));
  row.Type = type; row.Domain = domain; row.TLD = "." + domain.split(".").slice(1).join(".");
  row["Webmaster Contact"] = mail; row["Contact Name"] = name;
  for(const k in buying) row[BUYING_COLUMN[k]] = buying[k];
  row["Sponsor Tag Type"] = tag; row["Link Type"] = link; row["Price Validity"] = validity;
  row["Admin Comments"] = comment; row["Last Updated"] = "05/10/2026";
  return row;
}

/* An example list in the shape of a real one (33 sites on one line, a
   German header, prices as "99 € / 269 € / 180 €"). The sites and the
   sender are invented: the page is public. */
const STAR = `Unsere verfügbaren Webseiten und Preise (Allgemein / Glücksspiel / Vape-CBD-Crypto):
nordlicht-magazin.example 99 € / 269 € / 180 € · alpenblick-news.example 99 / 249 / 170 · rheinreport.example 89 / 249 / 170 · stadtgefluester.example 99 / 249 / 170 · sternmagazin.example 99 € / 249 € / 170 € · glanzpost.example 88 / 249 / 170 · klartextblog.example 89 / 239 / 160 · tagesglanz.example 99 / 269 / 180 · kurierwelt.example 95 / 249 / 170 · denkraum.example 88 / 239 / 160 · blickpunkt-insider.example 99 / 259 / 180 · promiradar.example 95 / 269 / 180 · weltschau.example 88 / 239 / 160 · neuzeit-magazin.example 99 / 259 / 170 · wissenswert.example 89 / 249 / 160 · blickreport.example 95 / 269 / 180 · technikwelt.example 99 / 449 / 249 · insiderpost.example 99 / 449 / 249 · tagesblatt-online.example 99 / 400 / 200 · heutejournal.example 99 / 349 / 249 · wochenmagazin.example 99 / 349 / 220 · publikum-news.example 99 / 349 / 170 · jetmagazin.example 99 / 249 / 170 · smartjournal.example 99 / 249 / 170 · netzheute.example 99 / 249 / 170 · reportwelt.example 99 / 249 / 170 · presseradar.example 99 / 249 / 170 · visionsblatt.example 99 / 249 / 170 · lebensreport.example 99 / 249 / 170 · flashnews.example 99 / 249 / 170 · themenkern.example 99 / 249 / 170 · fokusprima.example 99 / 249 / 170 · biowissen-at.example 99 / 400 / 200

Unsere Leistungen: Dauerhafte Veröffentlichung von Gastbeiträgen · Do-Follow-Links · Verschiedene Nischen, darunter Krypto, Gambling, CBD und Vape`;

/* ---------- state ---------- */
/* Rows are prepared (normalised headers, search text) once, where they
   enter: the sample rows here, a CSV in the file handlers, the Worker's
   pages when they arrive. One copy per row, shared by the matcher and the
   Database screen (review of 08/10). */
let dbRows = SAMPLE_DB.map(prepareRow), rmRows = SAMPLE_REMOVED.map(prepareRow), dbSource = "sample rows", dbLoadedAt = null, rmFromWorkbook = false;
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
try{ stype = localStorage.getItem("ljc-lists-stype") === "Broker" ? "Broker" : "Publisher"; }catch(e){}
function setStype(v){
  stype = v; try{ localStorage.setItem("ljc-lists-stype", v); }catch(e){}
  $("stype-publisher").className = v === "Publisher" ? "on-type" : "";
  $("stype-broker").className = v === "Broker" ? "on-type" : "";
  if(groups) render();
}

function noteParse(){
  if(!lastParsed) return;
  const cols = lastParsed.columns ? lastParsed.columns.filter(Boolean).join(", ") : t().noheader;
  /* A Google Sheets link cannot be read from the browser (sign-in, no
     CORS): say what to do instead of showing zero domains. */
  const gsheet = /docs\.google\.com\/spreadsheets/.test($("list").value);
  $("parsenote").textContent = t().parsed(items.length, lastParsed.skipped.length, cols) + (gsheet && items.length < 3 ? " · " + t().gsheetHint : "");
}
const decisions = {};   /* domain -> accept | reject | ask */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* ---------- two languages, as the desk ---------- */
const T = {
  en: { title:"Site lists", sender:"Sender", list:"List", paste:"Paste the list", match:"Match", db:"Database",
    dbhint:"Sample rows until a copy of the sheet is loaded. Export the sheet as .xlsx (both tabs) or .csv and load it here: it stays in this browser, also after closing it, until it is replaced or forgotten.", dbfileL:"Copy of the sheet · .xlsx (both tabs) or .csv", rmfileL:"removed sites · .csv, when the copy is a CSV", dbnever:"This page never writes to the database. Accept builds the rows; a person pastes them into the sheet.", dbLoaded:(name, when)=>`${name} · loaded ${when}`, gsheetHint:"A Google Sheets link cannot be read from here: open it, File → Download → .xlsx, and load that file above.", all:"All", exportT:(n)=>`${n} row${n === 1 ? "" : "s"} Accept will write`,
    sheetState:(n, at)=>`sheet: ${n.toLocaleString("en")} rows · read ${at}`, sheetOff:(why)=>`sheet not connected${why ? " · " + why : ""}`, writing:"Writing…", written:(range)=>`Written to the sheet${range ? " (" + range + ")" : ""}`, writeFail:"Could not write to the sheet. Nothing was changed.", writtenT:(n)=>`${n} row${n === 1 ? "" : "s"} written to the sheet`, writtenHint:"Appended to Import Database by the Worker, one per Accept. This is the copy.", dbhintLive:"The page reads the sheet live through the Worker. A CSV loaded here is used only if the sheet is not reachable.",
    modeList:"List", modeDb:"Database", fType:"Type: all", fTypeBlank:"Type: blank", fCountry:"Country: all", fLang:"Language: all", fNiche:"Priced for: any", fRemoved:"removed sites", fWide:"all 45 columns",
    dbSearch:"Search domain, contact or name", dbCount:(n, total)=>`${n.toLocaleString("en")} of ${total.toLocaleString("en")} rows`, dbEmpty:"No row matches.", dbLoading:"Loading…", dbRemovedTab:"removed sites", dbCols:{Domain:"Domain", Type:"Type", Contact:"Contact", Country:"Country", Language:"Language", Updated:"Updated", Terms:"Terms"},
    openInDb:"Open its record in the database", backToList:"Back to the list",
    orfile:"or load the file they sent", fileRead:(n, s)=>`${n}: ${s} sheet${s === 1 ? "" : "s"} read into the box`, fileText:(n)=>`${n} read into the box`, filePdf:(n, p)=>`${n}: ${p} page${p === 1 ? "" : "s"} read into the box`, fileFail:"Could not read the file. Paste its contents instead.", fileLoading:"Reading…",
    stype:"The sender is", typePublisher:"Publisher", typeBroker:"Broker", webmaster:"Webmaster", wmT:(n)=>`${n} site${n === 1 ? "" : "s"} to write to the webmaster`, wmhint:"Tracking rows in the BROKER OUTREACH layout: domain, contact to find, what the broker offered. The direct price is what goes into the database.",
    brokerHint:"Broker list. Unknown sites: write to the real webmaster; the broker's price is the ceiling, not the row. Accept only when the broker is the only way in.",
    terms:{linkType:"link", placement:"placement", priceValidity:"validity", sponsorTag:"tag"}, saidNothing:"terms not stated", fromList:"Stated once for the whole list, not for this site", fromListShort:"whole list", dAbove:"above", dBelow:"below", recorded:"recorded",
    reset:"Forget the file, back to sample rows", rows:"Rows Accept will write", rowshint:"Copy the rows, or download them as CSV or .xlsx and import them into the sheet. A copy of the database is optional here: it only tells you which sites are already in it.", copy:"Copy", copied:"Copied", dlCsv:"Download CSV", dlXlsx:"Download .xlsx",
    state:(src)=>`database: ${src} · sheet not connected`, meta:(n,d,c,r)=>`${n} rows · ${d} domains · ${c} contacts · ${r} removed`,
    parsed:(n,s,cols)=>`${n} domains · ${s} lines skipped${cols ? " · " + cols : ""}`, noheader:"no header: 1st price general, 2nd casino",
    unchanged:"unchanged", changed:"changed", fromSender:"from this sender", unknown:"unknown", removed:"removed", decided:(a,b)=>`${a} of ${b} decided`,
    broker:(n)=>`This sender already has ${n} domains in the database: likely a broker.`,
    removedNote:(n)=>`${n} in removed sites: never written as new.`,
    gChanged:"Changed", gUnknown:"Unknown", gUnchanged:"Unchanged", gRemoved:"Removed",
    hChanged:"In the database with another price. The new figure is in green.", hUnknown:"Not in the database. Verify the site before accepting.", hUnchanged:"Same prices as recorded.", hRemoved:"On the removed sites tab. Never written as new.", hAll:"",
    thDomain:"Domain", thOffered:"Offered", thDb:"In the database", thRemoved:"Removed sites", thTerms:"Terms", thDecision:"Decision",
    accept:"Accept", reject:"Reject", ask:"Ask", none:"none", notInDb:"not in the database", noPrice:"no price", noContact:"no contact", empty:"Nothing here.",
    niche:{casino:"Casino",unlicensedCasino:"Unlic. casino",crypto:"Crypto",forex:"Forex",cbd:"CBD",dating:"Dating",general:"General"} },
  es: { title:"Listas de sitios", sender:"Remitente", list:"Lista", paste:"Pega la lista", match:"Cotejar", db:"Base de datos",
    dbhint:"Filas de muestra hasta cargar una copia de la hoja. Exporta la hoja como .xlsx (las dos pestañas) o .csv y cárgala aquí: se queda en este navegador, también al cerrarlo, hasta reemplazarla u olvidarla.", dbfileL:"Copia de la hoja · .xlsx (las dos pestañas) o .csv", rmfileL:"removed sites · .csv, si la copia es un CSV", dbnever:"Esta página nunca escribe en la base. Aceptar construye las filas; una persona las pega en la hoja.", dbLoaded:(name, when)=>`${name} · cargado ${when}`, gsheetHint:"Un enlace de Google Sheets no se puede leer desde aquí: ábrelo, Archivo → Descargar → .xlsx, y carga ese archivo arriba.", all:"Todos", exportT:(n)=>`${n} fila${n === 1 ? "" : "s"} que escribirá Aceptar`,
    sheetState:(n, at)=>`hoja: ${n.toLocaleString("es")} filas · leída ${at}`, sheetOff:(why)=>`hoja sin conectar${why ? " · " + why : ""}`, writing:"Escribiendo…", written:(range)=>`Escrita en la hoja${range ? " (" + range + ")" : ""}`, writeFail:"No se pudo escribir en la hoja. No se cambió nada.", writtenT:(n)=>`${n} fila${n === 1 ? "" : "s"} escrita${n === 1 ? "" : "s"} en la hoja`, writtenHint:"Añadidas a Import Database por el Worker, una por cada Aceptar. Esto es la copia.", dbhintLive:"La página lee la hoja en vivo a través del Worker. Un CSV cargado aquí solo se usa si la hoja no responde.",
    modeList:"Lista", modeDb:"Base de datos", fType:"Tipo: todos", fTypeBlank:"Tipo: vacío", fCountry:"País: todos", fLang:"Idioma: todos", fNiche:"Con precio para: cualquiera", fRemoved:"removed sites", fWide:"las 45 columnas",
    dbSearch:"Buscar dominio, contacto o nombre", dbCount:(n, total)=>`${n.toLocaleString("es")} de ${total.toLocaleString("es")} filas`, dbEmpty:"Ninguna fila coincide.", dbLoading:"Cargando…", dbRemovedTab:"removed sites", dbCols:{Domain:"Dominio", Type:"Tipo", Contact:"Contacto", Country:"País", Language:"Idioma", Updated:"Actualizado", Terms:"Condiciones"},
    openInDb:"Abrir su ficha en la base", backToList:"Volver a la lista",
    orfile:"o carga el archivo que mandaron", fileRead:(n, s)=>`${n}: ${s} hoja${s === 1 ? "" : "s"} volcada${s === 1 ? "" : "s"} al cuadro`, fileText:(n)=>`${n} volcado al cuadro`, filePdf:(n, p)=>`${n}: ${p} página${p === 1 ? "" : "s"} volcada${p === 1 ? "" : "s"} al cuadro`, fileFail:"No se pudo leer el archivo. Pega su contenido.", fileLoading:"Leyendo…",
    stype:"El remitente es", typePublisher:"Publisher", typeBroker:"Broker", webmaster:"Webmaster", wmT:(n)=>`${n} sitio${n === 1 ? "" : "s"} para escribir al webmaster`, wmhint:"Filas de seguimiento en el formato de BROKER OUTREACH: dominio, contacto por buscar, qué ofreció el broker. A la base entra el precio directo.",
    brokerHint:"Lista de broker. Sitios desconocidos: escribir al webmaster real; el precio del broker es el techo, no la fila. Aceptar solo si el broker es la única vía.",
    terms:{linkType:"enlace", placement:"duración", priceValidity:"validez", sponsorTag:"etiqueta"}, saidNothing:"sin condiciones", fromList:"Dicho una vez para toda la lista, no para este sitio", fromListShort:"toda la lista", dAbove:"más", dBelow:"menos", recorded:"registrado",
    reset:"Olvidar el archivo, volver a la muestra", rows:"Filas que escribirá Aceptar", rowshint:"Copia las filas, o descárgalas en CSV o .xlsx e impórtalas en la hoja. La copia de la base es opcional aquí: solo dice qué sitios ya están.", copy:"Copiar", copied:"Copiado", dlCsv:"Descargar CSV", dlXlsx:"Descargar .xlsx",
    state:(src)=>`base: ${src} · hoja sin conectar`, meta:(n,d,c,r)=>`${n} filas · ${d} dominios · ${c} contactos · ${r} removidos`,
    parsed:(n,s,cols)=>`${n} dominios · ${s} líneas omitidas${cols ? " · " + cols : ""}`, noheader:"sin cabecera: 1.º precio general, 2.º casino",
    unchanged:"iguales", changed:"cambiados", fromSender:"de este remitente", unknown:"desconocidos", removed:"removidos", decided:(a,b)=>`${a} de ${b} decididos`,
    broker:(n)=>`Este remitente ya tiene ${n} dominios en la base: probable broker.`,
    removedNote:(n)=>`${n} en removed sites: nunca se escriben como nuevos.`,
    gChanged:"Cambiados", gUnknown:"Desconocidos", gUnchanged:"Iguales", gRemoved:"Removidos",
    hChanged:"Está en la base con otro precio. El nuevo va en verde.", hUnknown:"No está en la base. Verifica el sitio antes de aceptar.", hUnchanged:"Mismos precios que los registrados.", hRemoved:"En la pestaña removed sites. Nunca se escriben como nuevos.", hAll:"",
    thDomain:"Dominio", thOffered:"Ofrece", thDb:"En la base", thRemoved:"Removed sites", thTerms:"Condiciones", thDecision:"Decisión",
    accept:"Aceptar", reject:"Rechazar", ask:"Preguntar", none:"ninguna", notInDb:"no está en la base", noPrice:"sin precio", noContact:"sin contacto", empty:"Nada aquí.",
    niche:{casino:"Casino",unlicensedCasino:"Casino s/lic.",crypto:"Cripto",forex:"Forex",cbd:"CBD",dating:"Citas",general:"General"} }
};
let lang = "en";
try{ lang = localStorage.getItem("ljc-lists-lang") === "es" ? "es" : "en"; }catch(e){}
const t = () => T[lang];
function applyLang(){
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t()[el.dataset.i18n]; });
  $("lang-en").setAttribute("aria-pressed", String(lang === "en"));
  $("lang-es").setAttribute("aria-pressed", String(lang === "es"));
  describeDb();
  if(groups) { noteParse(); render(); }
  try{ $("db-q").placeholder = t().dbSearch; if(mode === "db") dbDraw(); }catch(e){}
}
$("lang-en").addEventListener("click", () => { lang = "en"; try{ localStorage.setItem("ljc-lists-lang", lang); }catch(e){} applyLang(); });
$("lang-es").addEventListener("click", () => { lang = "es"; try{ localStorage.setItem("ljc-lists-lang", lang); }catch(e){} applyLang(); });

function storageKey(){ return "ljc-lists:" + ($("label").value || "list").trim(); }
function loadDecisions(){ try{ Object.assign(decisions, JSON.parse(localStorage.getItem(storageKey()) || "{}")); }catch(e){} }
function saveDecisions(){ try{ localStorage.setItem(storageKey(), JSON.stringify(decisions)); }catch(e){} }

function describeDb(){
  const contacts = [...index.bySender.keys()].filter(Boolean).length;
  const when = dbLoadedAt ? `${String(dbLoadedAt.getDate()).padStart(2, "0")}/${String(dbLoadedAt.getMonth() + 1).padStart(2, "0")} ${String(dbLoadedAt.getHours()).padStart(2, "0")}:${String(dbLoadedAt.getMinutes()).padStart(2, "0")}` : "";
  $("dbmeta").textContent = (when ? t().dbLoaded(dbSource, when) : dbSource) + ": " + t().meta(dbRows.length, index.size, contacts, index.removed.size);
  if(remote){
    const at = new Date(remote.readAt); const hh = String(at.getHours()).padStart(2, "0") + ":" + String(at.getMinutes()).padStart(2, "0");
    $("state").textContent = t().sheetState(remote.rows, hh);
    document.querySelector("[data-i18n=dbhint]").textContent = t().dbhintLive;
  }else{
    $("state").textContent = t().state(dbSource) + (remoteWhy ? " · " + remoteWhy : "");
  }
}

/* ---------- CSV ---------- */
function csvToObjects(text){
  const lines = text.replace(/\r/g, "").split("\n");
  const rows = []; let cur = []; let cell = ""; let q = false; let head = null;
  for(const line of lines){
    for(let i = 0; i < line.length; i++){
      const ch = line[i];
      if(ch === '"'){ if(q && line[i + 1] === '"'){ cell += '"'; i++; } else q = !q; }
      else if(ch === "," && !q){ cur.push(cell); cell = ""; }
      else cell += ch;
    }
    if(q){ cell += "\n"; continue; }
    cur.push(cell); cell = "";
    if(!head) head = cur.map(h => h.trim()); else if(cur.length > 1) rows.push(Object.fromEntries(head.map((h, j) => [h, cur[j] == null ? "" : cur[j]])));
    cur = [];
  }
  return rows;
}
$("state").addEventListener("click", () => { const open = $("dbpanel").hidden; $("dbpanel").hidden = !open; $("state").setAttribute("aria-expanded", String(open)); });
$("export-h").addEventListener("click", () => { const open = $("export-body").hidden; $("export-body").hidden = !open; $("export-h").setAttribute("aria-expanded", String(open)); });
$("wm-h").addEventListener("click", () => { const open = $("wm-body").hidden; $("wm-body").hidden = !open; $("wm-h").setAttribute("aria-expanded", String(open)); });
/* The copy of the sheet (Gary, 09/10: "the team can upload CSV/Excel to
   always have an updated database when doing site lists"). An .xlsx carries
   both tabs, found by name ("Import Database", "removed sites") or taken as
   the first and second sheet; a .csv is the main tab, with removed sites as
   a second .csv. The file is kept in the browser's IndexedDB and read again
   on the next visit, so it is loaded once per export, not once per visit.
   Nothing here writes anywhere. */
function idb(){
  return new Promise((ok, no) => {
    if(!window.indexedDB) return no(new Error("no IndexedDB"));
    const r = indexedDB.open("ljc-lists", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
}
function idbPut(key, val){ return idb().then(db => new Promise((ok, no) => { const tx = db.transaction("files", "readwrite"); tx.objectStore("files").put(val, key); tx.oncomplete = () => ok(); tx.onerror = () => no(tx.error); })).catch(e => console.error("store:", e)); }
function idbGet(key){ return idb().then(db => new Promise((ok, no) => { const q = db.transaction("files", "readonly").objectStore("files").get(key); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); })).catch(() => null); }
function idbDel(key){ return idb().then(db => new Promise((ok, no) => { const tx = db.transaction("files", "readwrite"); tx.objectStore("files").delete(key); tx.oncomplete = () => ok(); tx.onerror = () => no(tx.error); })).catch(() => {}); }
/* The rows are stored, not the file: reading the 103,393-row workbook
   takes about 20 s and 540 MB, reading the stored rows a couple of
   seconds (measured 09/10). */
function rememberDb(){ return idbPut("db", { name: dbSource, when: dbLoadedAt ? dbLoadedAt.getTime() : Date.now(), db: dbRows, rm: rmRows }); }
async function loadDbFile(f, opts){
  opts = opts || {};
  $("dbmeta").textContent = t().fileLoading;
  await new Promise(r => setTimeout(r, 30));   /* let the note paint before the parse blocks */
  try{
    if(/\.(xlsx|xls|xlsm|ods)$/i.test(f.name)){
      const XLSX = await loadSheetJS();
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", dense: true });
      const names = wb.SheetNames;
      const dbName = names.find(n => /import|datab/i.test(n)) || names[0];
      const rmName = names.find(n => n !== dbName && /remov|elimin/i.test(n)) || (names.length > 1 ? names.find(n => n !== dbName) : null);
      const objs = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: "", raw: false }).map(prepareRow);
      dbRows = objs(dbName);
      rmRows = rmName ? objs(rmName) : SAMPLE_REMOVED.map(prepareRow);
    }else{
      dbRows = csvToObjects(await f.text()).map(prepareRow);
      /* A CSV is the main tab only: removed sites from an earlier workbook
         do not belong to it. */
      if(rmFromWorkbook) rmRows = SAMPLE_REMOVED.map(prepareRow);
    }
    rmFromWorkbook = /\.(xlsx|xls|xlsm|ods)$/i.test(f.name) && rmRows !== SAMPLE_REMOVED;
    dbSource = f.name; dbLoadedAt = new Date();
    rebuild();
    if(opts.remember) rememberDb();
  }catch(e){
    console.error("database file:", e);
    $("dbmeta").textContent = t().fileFail;
  }
}
async function loadRmFile(f){
  try{
    rmRows = csvToObjects(await f.text()).map(prepareRow);
    rebuild();
    if(dbLoadedAt) rememberDb();
  }catch(e){ $("dbmeta").textContent = t().fileFail; }
}
$("dbfile").addEventListener("change", () => { const f = $("dbfile").files && $("dbfile").files[0]; if(f) loadDbFile(f, { remember: true }); });
$("rmfile").addEventListener("change", () => { const f = $("rmfile").files && $("rmfile").files[0]; if(f) loadRmFile(f); });
$("reset").addEventListener("click", () => { dbRows = SAMPLE_DB.map(prepareRow); rmRows = SAMPLE_REMOVED.map(prepareRow); dbSource = "sample rows"; dbLoadedAt = null; $("dbfile").value = ""; $("rmfile").value = ""; idbDel("db"); rebuild(); });
function rebuild(){ index = indexDatabase(dbRows, rmRows); describeDb(); facetCache = new WeakMap(); $("mode-db-n").textContent = dbRows.length.toLocaleString("en"); if(items.length) run(); if(mode === "db") dbRefresh(); }

/* ---------- matching ---------- */
/* A list with nothing changed used to open on an empty "Changed" tab while
   the rows sat under "Unknown" (seen with a PDF rate card, 08/10). The view
   moves to the first group that has rows; a view chosen by hand stays. */
function pickView(){
  if(view === "all" || !groups || !groups[view] || groups[view].length) return;
  const k = ["changed", "unknown", "unchanged", "removed"].find(g => groups[g] && groups[g].length);
  if(k) view = k;
}
function run(){
  const parsed = parseList($("list").value);
  const listTerms = listTermsOf(parsed);
  items = parsed.items.map(i => withListTerms(i, listTerms)); lastParsed = parsed;
  noteParse();
  for(const k in decisions) delete decisions[k];
  loadDecisions();
  groups = matchList(items, index, { sender: $("sender").value });
  pickView();
  render();
  if(remote) matchRemote();
}
async function matchRemote(){
  const sender = $("sender").value.trim();
  try{
    const r = await fetch("/api/match", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domains: items.map(i => i.domain), sender }) });
    if(!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    lastMatch = j;
    const idx = indexDatabase(Object.values(j.rows || {}).flat().map(prepareRow), Object.values(j.removed || {}).flat().map(prepareRow));
    groups = matchList(items, idx, { sender, senderCount: j.senderCount });
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
  }).join("") || `<span class="sender">${t().noPrice}</span>`;
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
function dbCells(rows){
  if(!rows.length) return `<span class="sender">${t().notInDb}</span>`;
  return rows.map(row => {
    const ps = NICHES.filter(n => row[BUYING_COLUMN[n]]).map(n => `<span class="pr"><span class="k">${esc(t().niche[n])}</span>${esc(row[BUYING_COLUMN[n]])}</span>`).join("") || `<span class="sender">${t().noPrice}</span>`;
    const type = String(row.Type || "").trim();
    return `<div class="dbrow"><span class="sender">${type ? `<span class="tipo ${type.toLowerCase() === "broker" ? "broker" : ""}">${esc(type)}</span>` : ""}${esc(senderOf(row) || t().noContact)} · ${esc(row["Last Updated"] || "")}</span>${ps}</div>`;
  }).join("");
}
function decisionCell(domain){
  const d = decisions[domain];
  if(written[domain]) return `<span class="fv" style="border-color:var(--ok-line);color:var(--ok-ink)" title="${esc(written[domain])}">${esc(t().written(""))}</span>`;
  /* A removed site is never written as new (CLAUDE.md rule 4): no Accept. */
  const keys = removedDomains.has(domain) ? ["webmaster","ask","reject"] : stype === "Broker" ? ["webmaster","accept","ask","reject"] : ["accept","webmaster","ask","reject"];
  return `<span class="seg">` + keys.map(k => `<button type="button" data-dom="${esc(domain)}" data-dec="${k}" class="${d === k ? "on-" + k : ""}">${t()[k]}</button>`).join("") + `</span>`;
}
function table(entries, kind){
  if(!entries.length) return `<div class="tabla-wrap"><div class="empty">${t().empty}</div></div>`;
  const rows = entries.map(e => {
    const d = e.item.domain; const done = decisions[d] ? " done" : "";
    const dbCol = e.removedRows ? dbCells(e.removedRows) : dbCells(e.rows);
    return `<tr class="${done.trim()}"><td class="dom"><button type="button" class="domlink" data-open="${esc(d)}" title="${esc(t().openInDb)}">${esc(d)}</button>${e.item.path ? `<span class="sender">${esc(e.item.path)}</span>` : ""}</td><td>${offeredCells(e.item, e.diffs)}</td><td>${dbCol}</td><td class="ancha">${termsCells(e.item)}</td><td class="dec">${decisionCell(d)}</td></tr>`;
  }).join("");
  return `<div class="tabla-wrap"><table class="outreach"><thead><tr><th>${t().thDomain}</th><th>${t().thOffered}</th><th>${kind === "removed" ? t().thRemoved : t().thDb}</th><th>${t().thTerms}</th><th>${t().thDecision}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
let removedDomains = new Set();
function render(){
  if(!groups) return;
  removedDomains = new Set(groups.removed.map(e => e.item.domain));
  const first = groups.unknown.concat(groups.changed, groups.unchanged, groups.removed)[0];
  const broker = stype === "Broker" ? `<div class="aviso acc">${t().brokerHint}</div>` : (first && first.brokerHint ? `<div class="aviso">${t().broker(first.brokerHint)}</div>` : "");
  const sameSender = groups.changed.filter(c => c.sameSender).length;
  const all = groups.changed.concat(groups.unknown, groups.unchanged, groups.removed);
  const tabs = [
    ["changed", "wait", t().gChanged, groups.changed, t().hChanged],
    ["unknown", "", t().gUnknown, groups.unknown, t().hUnknown],
    ["unchanged", "ok", t().gUnchanged, groups.unchanged, t().hUnchanged],
    ["removed", "", t().gRemoved, groups.removed, t().hRemoved],
    ["all", "", t().all, all, ""]
  ];
  if(!tabs.find(x => x[0] === view)) view = "changed";
  const cur = tabs.find(x => x[0] === view);
  $("results").innerHTML = `
    <div class="gtabs" role="tablist">
      ${tabs.map(([k, cls, label, arr]) => `<button type="button" role="tab" class="gtab ${cls}" data-view="${k}" aria-selected="${k === view}">${label} <span class="n">${arr.length}</span></button>`).join("")}
      <span class="progreso" id="progreso">${progressHtml()}</span>
    </div>
    ${broker}
    ${cur[4] ? `<p class="ghint">${cur[4]}${view === "changed" && sameSender ? ` ${sameSender} ${t().fromSender}.` : ""}</p>` : ""}
    ${table(cur[3], view === "removed" ? "removed" : view)}`;
  renderExport();
}
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
  tds.forEach(td => { td.innerHTML = decisionCell(dom); const tr = td.closest("tr"); if(tr) tr.className = decisions[dom] ? "done" : ""; });
  const p = $("progreso"); if(p) p.innerHTML = progressHtml();
  renderExport();
}
/* One listener for the whole result area: tabs, domain links, decisions. */
$("results").addEventListener("click", e => {
  const b = e.target.closest("button"); if(!b) return;
  if(b.classList.contains("gtab")){ view = b.dataset.view; render(); return; }
  if(b.dataset.open){ openInDb(b.dataset.open); return; }
  if(!b.dataset.dec) return;
  const dom = b.dataset.dom, dec = b.dataset.dec;
  if(written[dom]) return;   /* already in the sheet: no undo from here */
  if(remote && dec === "accept" && decisions[dom] !== "accept"){ acceptRemote(dom, b); return; }
  if(decisions[dom] === dec) delete decisions[dom]; else decisions[dom] = dec;
  saveDecisions(); refreshRow(dom);
});
async function acceptRemote(dom, btn){
  const item = items.find(i => i.domain === dom); if(!item) return;
  /* The Worker writes who accepted from the Access token; the page does
     not. The request id lets a retry after a lost answer not write twice. */
  const row = rowForAccept(item, { type: stype, sender: $("sender").value.trim(), who: "", listLabel: $("label").value.trim() });
  const requestId = (acceptIds[dom] = acceptIds[dom] || (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)));
  btn.disabled = true; btn.textContent = t().writing;
  try{
    const r = await fetch("/api/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ row, requestId }) });
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
    const rows = accepted.map(i => rowForAccept(i, { type: stype, sender, who: "", listLabel: label }));
    const show = ["Type", "Domain", "Webmaster Contact", ...NICHES.map(n => BUYING_COLUMN[n]), "Sponsor Tag Type", "Link Type", "Placement", "Price Validity", "Admin Comments", "Last Updated"];
    const used = show.filter(c => c === "Type" || c === "Domain" || rows.some(r => r[c]));
    $("export-prev").innerHTML = `<table class="outreach"><thead><tr>${used.map(c => `<th>${esc(c.replace("Buying ", "B. "))}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${used.map(c => `<td class="${c === "Domain" ? "dom" : ""}">${esc(r[c]).replace(/\n/g, "<br>")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    $("tsv").value = [DB_COLUMNS.join("\t")].concat(rows.map(r => DB_COLUMNS.map(c => String(r[c]).replace(/\t|\n/g, " ")).join("\t"))).join("\n");
    outputs.accepted = { cols: DB_COLUMNS, rows, name: "accepted", sheet: "Import Database" };
  }
  const wm = items.filter(i => decisions[i.domain] === "webmaster");
  $("wm").hidden = !wm.length;
  if(wm.length){
    $("wm-t").textContent = t().wmT(wm.length);
    const cols = ["Domain", "Country", "Date Sent", "Whatsapp / Phone Number", "Status WA / Number", "Contact Email", "Alternative contact", "Replied?", "Database?", "Additional Comments"];
    const rows = wm.map(i => {
      const offered = NICHES.filter(n => i.prices[n]).map(n => `${t().niche[n]} ${formatPrice(i.prices[n])}`).join(", ");
      return { Domain: i.domain, Country: "", "Date Sent": "", "Whatsapp / Phone Number": "", "Status WA / Number": "", "Contact Email": "", "Alternative contact": "", "Replied?": "FALSE", "Database?": "FALSE",
        "Additional Comments": `${stype} ${sender} offered ${offered || "no price"}${label ? ` (list ${label})` : ""}${i.terms ? `; ${i.terms}` : ""}` };
    });
    const used = ["Domain", "Contact Email", "Additional Comments"];
    $("wm-prev").innerHTML = `<table class="outreach"><thead><tr>${used.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${used.map(c => `<td class="${c === "Domain" ? "dom" : ""}">${esc(r[c]) || "<span class=sender>—</span>"}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    $("wm-tsv").value = [cols.join("\t")].concat(rows.map(r => cols.map(c => String(r[c]).replace(/\t|\n/g, " ")).join("\t"))).join("\n");
    outputs.webmaster = { cols, rows, name: "webmaster", sheet: "BROKER OUTREACH" };
  }
}
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
const outputs = { accepted: null, webmaster: null };
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
$("wm-csv").addEventListener("click", () => downloadCsv(outputs.webmaster));
$("wm-xlsx").addEventListener("click", () => downloadXlsx(outputs.webmaster, "wm-note"));

/* ---------- the file they sent ---------- */
/* SheetJS is loaded only when an Excel file arrives, from cdnjs (the only
   script host the page may use), pinned. CSV and text need nothing. */
const SHEETJS = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
let sheetjs = null;
function loadSheetJS(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  if(sheetjs) return sheetjs;
  sheetjs = new Promise((ok, no) => {
    const s = document.createElement("script"); s.src = SHEETJS; s.async = true;
    s.onload = () => window.XLSX ? ok(window.XLSX) : no(new Error("no XLSX"));
    s.onerror = () => { sheetjs = null; no(new Error("load failed")); };
    document.head.appendChild(s);
  });
  return sheetjs;
}
/* pdf.js the same way, for rate cards sent as PDF (businessamlive sent one
   on 05/10). A PDF has no lines: the text of each page is rebuilt from the
   glyph positions, one line per baseline, left to right. The pinned version
   is 4.10.38; the worker is loaded from the same place. The text of a page
   is rebuilt by pdfTextOf in the module: lines, and columns when it is a
   table. */
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
let pdfjs = null;
function loadPdfJS(){
  if(pdfjs) return pdfjs;
  pdfjs = import(PDFJS).then(m => { m.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return m; }, e => { pdfjs = null; throw e; });
  return pdfjs;
}
async function pdfText(buf){
  const lib = await loadPdfJS();
  const doc = await lib.getDocument({ data: buf }).promise;
  const pages = [];
  for(let n = 1; n <= doc.numPages; n++){
    const page = await doc.getPage(n);
    pages.push(pdfTextOf((await page.getTextContent()).items));
  }
  return { text: pages.join("\n\n"), pages: doc.numPages };
}
$("listfile").addEventListener("change", async () => {
  const f = $("listfile").files && $("listfile").files[0]; if(!f) return;
  $("filenote").textContent = t().fileLoading;
  try{
    if(/\.pdf$/i.test(f.name) || f.type === "application/pdf"){
      const r = await pdfText(await f.arrayBuffer());
      $("list").value = r.text;
      $("filenote").textContent = t().filePdf(f.name, r.pages);
    }else if(/\.(xlsx|xls|xlsm|ods)$/i.test(f.name)){
      const XLSX = await loadSheetJS();
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const parts = wb.SheetNames.map(n => tableToList(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" }))).filter(Boolean);
      $("list").value = parts.join("\n\n");
      $("filenote").textContent = t().fileRead(f.name, wb.SheetNames.length);
    }else{
      $("list").value = await f.text();
      $("filenote").textContent = t().fileText(f.name);
    }
    if(!$("label").value.trim()) $("label").value = f.name.replace(/\.[^.]+$/, "");
    run();
  }catch(e){
    $("filenote").textContent = t().fileFail;
  }
});


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
  $("screen-list").hidden = m !== "list";
  $("screen-db").hidden = m !== "db";
  if(m === "db") dbRefresh();
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
    const r = await fetch("/api/rows?" + key);
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
  $("stype-publisher").addEventListener("click", () => setStype("Publisher"));
  $("stype-broker").addEventListener("click", () => setStype("Broker"));
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
    dbRows = rec.db; if(Array.isArray(rec.rm)) rmRows = rec.rm;
    dbSource = rec.name; dbLoadedAt = new Date(rec.when);
    rebuild();
  });
});
/* The Worker, if there is one next to the page; the sample result stays
   until it answers. */
checkRemote().then(() => { if(remote) run(); }).catch(e => console.error("worker check:", e));
