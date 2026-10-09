# Site lists

A page for the offers that publishers and brokers send as lists of sites
with prices. Paste the list, match it against the database ("Import
Database" sheet), decide every row, and let Accept write the accepted row.

Separate project from the outreach desk (`proto2`), decided 07/10/2026.
It shares the desk's look (tokens, type) but none of its code or deploy.

## What is here

- `src/index.html`: the screen, EN/ES, **generated** by
  `scripts/build-page.mjs` from `src/page/` (head, body, app) and the module,
  as one file with everything inside. It opens from disk, from GitHub, as the
  claude.ai copy and behind the Worker alike. Edit `src/page/`, then run
  `node scripts/build-page.mjs`. Until the sheet is connected it matches
  against sample rows marked as examples, or a CSV loaded in the browser.
- The **Database** screen (switch in the bar): the whole sheet, read only,
  with search, filters, the removed tab, 14 or all 45 columns and a detail
  panel per row; only the rows on screen are drawn.
- `src/site-lists.js`: parser (text, tab or CSV table, header optional),
  domain and price normalisation, index of the database with the
  "removed sites" exclusion, grouping into changed / unknown / unchanged /
  removed, Broker hint, and the row Accept writes. Plain ES module, no DOM.
- `scripts/inventar-csv.mjs`: writes an invented, sheet-sized CSV (103,393
  rows) to measure the page with. Nothing in it is real.
- `scripts/probar-listas.mjs`: 94 checks. `node scripts/probar-listas.mjs
  path/to/copy.csv` also indexes a real CSV copy and prints a summary.
- `BRIEF.md`: the plan, the decisions (Mauro, 06/10), Gary's answers, the
  glossary of the database's columns, and what is still open.

## Run

    node scripts/probar-listas.mjs
    python3 -m http.server 8000 --directory src   # then open http://localhost:8000/

`src/index.html` loads `site-lists.js` as a module, so it needs to be served,
not opened as a file.

- `src/worker.js`: the Worker between the page and the Google Sheet. Reads
  "Import Database" and "removed sites" as the service account, keeps them
  in memory for five minutes, answers `/api/match` by domain, and appends
  one row to "Import Database" on `/api/accept`. Who is asking comes from
  the Cloudflare Access token, as in the desk. `scripts/probar-worker.mjs`
  tests it with Google replaced by a stand-in (18 checks).

## Run

    node scripts/probar-listas.mjs
    node scripts/probar-worker.mjs
    python3 -m http.server 8000 --directory src   # then open http://localhost:8000/

`src/index.html` also works opened straight from disk. Without the Worker
the page stays on sample rows or a CSV loaded in the browser.

## Where it is published

**GitHub Pages**, by `.github/workflows/pages.yml` on every push to `main`
(Gary, 08/10: publish on GitHub, not on Cloudflare; the page will be included
in the desk later). Pages serves `src/index.html` as a static site, so the
Worker does not run there: the page works on sample rows or on a CSV loaded
in the browser, and shows the row Accept would write. The example list and
the sample rows are invented, because the site is public.

The Cloudflare deploy (`deploy.yml`, `wrangler.jsonc`, `src/worker.js`) is
kept for the move into the desk and runs only by hand. It needs
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets, and
the Worker needs `SHEET_ID`, `GOOGLE_SA` (secret) and `ACCESS_AUD`.

## The copy of the database (Gary, 09/10)

Gary's two points from the call of 09/10: the team loads a CSV or Excel
export of the sheet so the list is always matched against the latest data,
with a live sheet and a refresh button as a later step; and the full
database stays visible for reference. And: "no live override function
should be accessible here", so this page never writes.

In the bar, the seal opens the database panel. Export the sheet as .xlsx
(both tabs come along: "Import Database" and "removed sites", found by
name) or as .csv (main tab; removed sites as a second .csv) and load it.
The rows stay in the browser (IndexedDB) and come back on the next visit,
so the file is loaded once per export, not once per visit, until it is
replaced or forgotten with the button. A workbook of the sheet's size
(103,393 rows) loads in about 9 s and comes back in 2 s. The Database screen then shows it.
Accept builds the rows; a person pastes them into the sheet. The live
sheet with refresh is the Worker's job (`src/worker.js`, read-only
routes) and waits for the service account and the move into the desk.

## Senad's process (09/10)

Four sender types in the rail: Publisher, Exclusive, Broker, Unsure. From a
Broker or Unsure list only sites already in the database are updated; new
ones get Webmaster, Ask or Reject, never Accept. A webmaster's list over a
broker's row is a "Broker conversion": the row is flagged and the exported
row says which row it replaces. A webmaster's row is never replaced by a
broker's offer. A site on removed sites shows its reason and can be
Restored; the row says so. Details and sources in BRIEF.md.

## Exporting the rows (Gary, 09/10)

Gary's second point of the afternoon: "an export option like in the desk",
and the database copy is not needed for that. Under the result, "Rows
Accept will write" has Copy, Download CSV and Download .xlsx (the sheet's
45 columns, the tab named "Import Database", prices as numbers); the
webmaster block has the same three in the BROKER OUTREACH layout. The file
is named `ljc-lists-accepted-<date>` or `ljc-lists-webmaster-<date>`, like
the desk's `ljc-ready-<date>.csv`. With no database copy loaded every site
is new and the rows export the same; the copy only tells which sites are
already in the sheet.

## Not yet

Google Sheet links as list input (they need the service account). A real
write to the copy: the Worker is tested against a stand-in only, until the
key arrives. The move into the desk: planned in INTEGRATION.md, not started.
