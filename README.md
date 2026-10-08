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

## Not yet

PDF rate cards and Google Sheet links as list input. A real write to the
copy: the Worker is tested against a stand-in only, until the key arrives.
