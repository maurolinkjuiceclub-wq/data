# Site lists

A page for the offers that publishers and brokers send as lists of sites
with prices. Paste the list, match it against the database ("Import
Database" sheet), decide every row, and let Accept write the accepted row.

Separate project from the outreach desk (`proto2`), decided 07/10/2026.
It shares the desk's look (tokens, type) but none of its code or deploy.

## What is here

- `src/index.html`: the screen. EN/ES. Until the sheet is connected it
  matches against sample rows marked as examples, or a CSV loaded in the
  browser.
- `src/site-lists.js`: parser (text, tab or CSV table, header optional),
  domain and price normalisation, index of the database with the
  "removed sites" exclusion, grouping into changed / unknown / unchanged /
  removed, Broker hint, and the row Accept writes. Plain ES module, no DOM.
- `scripts/probar-listas.mjs`: 56 checks. `node scripts/probar-listas.mjs
  path/to/copy.csv` also indexes a real CSV copy and prints a summary.
- `BRIEF.md`: the plan, the decisions (Mauro, 06/10), Gary's answers, the
  glossary of the database's columns, and what is still open.

## Run

    node scripts/probar-listas.mjs
    python3 -m http.server 8000 --directory src   # then open http://localhost:8000/

`src/index.html` loads `site-lists.js` as a module, so it needs to be served,
not opened as a file.

## Not yet

Reading and writing the Google Sheet. Waiting on a service account shared on
the copy as Editor (asked Gary 06/10 and 07/10). Then a Worker reads both
tabs, caches them, answers lookups and writes one row on Accept.
