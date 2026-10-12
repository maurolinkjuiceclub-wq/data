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
