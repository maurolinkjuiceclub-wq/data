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
/* Refresh sheet: the Worker reads the sheet again, then the open list is
   matched again and the Database screen redrawn from the fresh rows. */
$("refresh").addEventListener("click", async () => {
  const b = $("refresh"); b.disabled = true; b.textContent = t().refreshing;
  try{ await checkRemote(true); } finally { b.disabled = false; b.textContent = t().refresh; }
  if(remote){ if(items.length) run(); if(mode === "db") dbRefresh(); }
});
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
function rememberDb(){ return idbPut("db", { name: dbSource, when: dbLoadedAt ? dbLoadedAt.getTime() : Date.now(), db: dbRows, rm: rmRows, rmFromWorkbook }); }
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
      /* A real database: the sample removed row goes; the workbook's own
         removed tab comes, or nothing. */
      rmRows = rmName ? objs(rmName) : [];
      rmFromWorkbook = !!rmName;
    }else{
      dbRows = csvToObjects(await f.text()).map(prepareRow);
      /* A CSV is the main tab only: removed sites from an earlier workbook
         do not belong to it; a removed-sites CSV loaded before stays. */
      if(rmFromWorkbook || rmRows === sampleRm){ rmRows = []; }
      rmFromWorkbook = false;
    }
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
$("reset").addEventListener("click", () => { dbRows = SAMPLE_DB.map(prepareRow); rmRows = sampleRm; rmFromWorkbook = false; dbSource = "sample rows"; dbLoadedAt = null; $("dbfile").value = ""; $("rmfile").value = ""; idbDel("db"); rebuild(); });
function rebuild(){ index = indexDatabase(dbRows, rmRows); describeDb(); facetCache = new WeakMap(); $("mode-db-n").textContent = dbRows.length.toLocaleString("en"); if(items.length) run(); if(mode === "db") dbRefresh(); }
