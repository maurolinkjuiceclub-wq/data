# Putting Site lists into the desk

Gary, 08/10: "deploy it fully on GitHub so I can view it. Then we will
include it with the LJC Outreach (Mesa). Make sure you don't host on
Cloudflare as it will be separate." This is the plan for that second step,
written before it starts so the day it starts is a day of work, not a week.
Nothing here is done yet; nothing here touches the desk until Gary says so.

## What moves, and where

| Piece of this project | Goes to | How |
|---|---|---|
| `src/site-lists.js` (parser, matcher, filter, Accept row) | `proto2/src/site-lists.js` | Copied as is. The desk's Worker and page both import or inline it. Tests go along (`probar-listas.mjs`). |
| `src/page/` (the screen) | A new tab **Lists** in `mesa.html`, next to Send, Reply, Our outreach, Data | The desk inlines the module the way it inlines the phrase banks (`scripts/embed-bancos.mjs`). The screen's HTML and CSS drop their own bar and language switch and use the desk's `.bar`, `.apptab`, `.lang` and tokens; the styles already share the same token names. |
| `src/worker.js` routes `/api/status`, `/api/match`, `/api/rows`, `/api/accept` | `proto2/src/worker.js` | Added as routes under `/api/lists/…`. The Google token, the sheet cache and the append are self-contained functions; they move with their tests (`probar-worker.mjs` becomes part of the desk's). |
| `GOOGLE_SA`, `SHEET_ID`, `ACCESS_AUD` | The desk's Worker | `wrangler secret put GOOGLE_SA` on the desk; `SHEET_ID` as a var; `ACCESS_AUD` is already the desk's. |
| `.github/workflows/pages.yml`, `deploy.yml`, `wrangler.jsonc` here | Retired | The desk's deploy covers it. This repository stays as history and as the place the brief lives, or is archived. |

## What the desk already has that this reuses

- **Identity**: `identidad(req, env)` in the desk's Worker verifies the
  Access token. The Lists routes call it instead of their own copy.
- **Secrets and config**: the desk's `wrangler.jsonc` and GitHub secrets.
- **Tabs with counters**: `.apptab` with `.n`. Lists shows the number of
  rows still undecided on the open list.
- **Theme and language**: the desk's dark/light and EN/ES switches; the
  screen's strings (the `T` table in `src/page/app.js`) join the desk's
  dictionary.
- **Deploy gate**: `comprobar-mesa.js`, `auditar.js`, `auditar-en.js`; the
  two test scripts here join that list in `deploy.yml` and `deploy.mjs`.

## What changes in behaviour when it is inside

- The page stops carrying sample rows and the CSV panel: the Worker reads
  the sheet, so the Database screen is always live. Keep the CSV loader only
  as a fallback if Gary wants it.
- Accept writes to the sheet at once (decision 2). Until Gary points
  `SHEET_ID` at the real sheet it writes to the copy.
- Reply and Lists meet: a reply that carries a list ("here are our other
  sites") gets a button "Open as list" that hands the email body to Lists
  with the sender filled in. That is the bridge Gary described on 06/10
  ("Site lists are big lists received by publishers"). One screen reads
  mail, the other decides rows; neither duplicates the other.
- The 44-column "Database row" that Reply builds today and the 45-column
  row Lists writes have to be one thing. Lists uses the sheet's own header
  (read live), so the right move is for Reply's row to be built by
  `rowForAccept` too. Decide this with Gary before coding: it is the one
  place the two projects overlap.

## Order of work, about one day

1. Copy `site-lists.js` and its tests into the desk; wire the tests into
   the gate. Half an hour.
2. Add the Worker routes under `/api/lists/`, using the desk's `identidad`;
   move `probar-worker.mjs` cases. Two hours.
3. Add the Lists tab: paste the screen's body into a new `<section>`, its
   CSS into the desk's stylesheet with the desk's tokens, its script into
   the desk's; remove its own bar and switches. Two hours.
4. Set `GOOGLE_SA` and `SHEET_ID` on the desk's Worker; open the tab against
   the copy; run the starmagazines acceptance test (decision 5). One hour.
5. The Reply bridge ("Open as list"). One hour.
6. Update README and HANDOVER of the desk; archive this repository or keep
   it as the brief's home. Half an hour.

## What to ask Gary before step 1

- Does the Lists tab live behind the same Access application and hostname
  as the desk? (Expected yes.)
- Which sheet does `SHEET_ID` point at on day one, the copy or the real one?
- Who owns the row format: the sheet's header as read live (this project's
  position) or the 44 columns Reply uses today?
