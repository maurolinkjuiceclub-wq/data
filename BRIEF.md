# Brief: Offers page for site lists (draft, 06/10)

Written before any code, as agreed on 05/10. Nothing here is built. The
open questions at the end decide what gets built; until they are answered
this page is a plan, not a promise.

## The request, verbatim

From the team, 06/10 07:11:

> tell simon to build a page for offers connected with database and site
> lists
> https://docs.google.com/spreadsheets/d/1ZyoUsX9RtaK3FgopDE92AXC8OSa6X2AH8qIdFPqI8rg/edit?gid=0#gid=0
> here is our copy of database
> Site lists are big lists received by publishers, we still need to check
> them one by one and match the data. Not sure how you can automate that,
> but you can make a page for it

## What I understand (to be confirmed)

- **A site list** is what a publisher or reseller sends with many domains and
  a price each. On 05/10 alone: starmagazines (33 sites), stylingguiden (34),
  spanienforum (21), rivonhome (9), promodesk (4). They arrive as text in the
  email, as a table, as an attached PDF or Excel, or as a link to a Google
  Sheet or Drive file.
- **The database** is the Google Sheet above: one row per publisher domain
  with contact, prices per niche, link type, placement, label.
- **The job today**, by hand: for every domain in a list, look it up in the
  database; if it is there, compare price and terms and note what changed;
  if it is not, decide whether it is a real publisher or a reseller row, and
  only then add it. The house rule stands: a long list is usually a reseller
  and every domain is verified separately.
- **The page** would take a list, split it into domains and prices, match
  each domain against the database and show three groups: known and
  unchanged, known with a difference, unknown. A person decides row by row;
  the page records the decision. It does not write to the database on its
  own.

## What the page can and cannot automate

Can: parse the list into domains and prices, normalise domains (www, http,
trailing slash), find the row in the database, show the differences side by
side, keep the decision and who took it, export the accepted rows in the
database's column order.

Cannot: decide that a domain is a real publisher, verify the site's quality,
or confirm a price the publisher never wrote. Those stay with the person.

## Dependencies on others, day one

| Need | Who | State |
|---|---|---|
| Read the Google Sheet | Gary | **Decided 06/10: no export.** Gary: "You cannot export it as we are updating this sheet everyday." The page reads the sheet live (see "How the page gets the data"). Needs Gary to share the sheet with a service account or create an OAuth client. |
| Which copy is the source of truth | Gary | **Answered 06/10.** The sheet is the import file for "our platform". Rows in "removed sites" are kept in the sheet but not imported. The copy we were given is for working safely; the page reads, never writes. |
| Where the page lives | Mauro / Gary | Inside the desk (a new tab in `src/mesa.html`, behind Cloudflare Access) or a separate page? |
| Who uses it | Mauro | Everyone who handles replies, or one person who checks lists? |

## Open questions (answer these and the brief is done)

1. What does "offer" mean here: the publisher's price offer (what Reply
   already captures), or an offer we make to a client?
2. Source of truth: the Sheet, the desk, or both? If the Sheet, does the
   page write to it or export rows for somebody to paste?
3. Matching rule: by domain only? What happens when the same domain comes
   from two senders with two prices?
4. What is "done" for a list: every row decided, or only the unknown ones?
5. Done for the project: which list, checked end to end on the page, counts
   as the acceptance test?

## What the sheet contains (read 06/10 through the Drive connector)

"Copy of Import Database 2026", owner gary.linkjuiceclub@gmail.com, 11.6 MB,
created 06/10 11:17 and shared at 12:18. Two tabs:

| Tab | Range | Rows (header included) |
|---|---|---|
| Import Database | A1:AS103394 | 103,394 |
| removed sites | A1:AQ25684 | 25,684 |

Row counts come from the sheet's own range, not from counting rows one by
one: the data itself could not be exported (see above).

Columns of "Import Database", in order:

- Identity: Type (Publisher / Broker), TLD, Domain, Webmaster Contact,
  Webmaster Extra Contact, Contact Name, IP Address.
- Metrics: Ahrefs DR, Ahrefs Referring Domains, Ahrefs Organic Traffic,
  Ahrefs URL Rating, Ahrefs Top 3 Keywords, Ahrefs Top 4-10 Keywords,
  Majestic TF, Majestic CF, MOZ Spam Score, MOZ DA, Semrush AS, TF/CF, RD/OT.
- **Cost prices** (what we pay): Buying Casino, Buying Unlicensed Casino,
  Buying Crypto, Buying Forex, Buying CBD, Buying Dating, Buying General.
- **Sell prices** (what we charge): Casino, Unlicensed Casino, Crypto, Forex,
  CBD, Dating, General.
- Terms: Sponsor Tag Type, Link Type, Placement, Price Validity.
- Notes: Admin Comments, User Comments, Last Updated (dd/mm/yyyy).
- Classification: Main Country, Main Country Traffic, Domain Language,
  Website Topic.

Two things this settles:

- The database already separates **buying** (publisher's price to us) from
  **selling** (our price to the client). A site list from a publisher feeds
  the Buying columns only. The seven niches are fixed: Casino, Unlicensed
  Casino, Crypto, Forex, CBD, Dating, General. The desk's Reply tab records
  prices per category too, so the two vocabularies have to be mapped once.
- Type = Publisher / Broker is already a column. Mauro, 06/10: a **Broker**
  is someone who resells other people's sites at a higher price; a
  **Publisher** owns the site. The house rule "a long list is usually a
  reseller" therefore maps to Type = Broker, and the page asks that question
  for every unknown domain. A Broker's price is a ceiling, not the
  publisher's price.

Related sheets seen in the same Drive, not read in depth:

- "Website Scraping Sheet" (Gary, 14.4 MB, edited 06/10 12:22): tabs Kamran,
  Ahmed, Broker Task, Client Task, Import Brokers, Import Task, Normal
  Outreach (34k rows), plus KEYWORDS, ONLY RELEVANT WEBSITE TOPICS,
  IRRELEVANT WEBSITE TOPICS. This looks like where lists are worked today,
  by person. Worth asking Gary before designing the page.
- "Outreach Site Options" (Gary, 5 MB): one tab per country with SERP and
  Ahrefs domain lists. Prospecting, not pricing.
- "Latam Database (Dummy)" and "Training Database 2024": older copies with
  the same shape, useful as small test data if the big one stays unexportable.

## Glossary of the database's columns (checked on the web, 06/10)

Standard SEO and link-building vocabulary, verified against public sources.
"Internal" marks a column whose meaning only Gary can confirm.

| Column | Meaning | Source |
|---|---|---|
| Type: Publisher / Broker | Publisher owns the site. Broker resells other people's sites at a higher price (Mauro, 06/10). Industry data puts a guest post at about $295 bought direct and about $461 through a vendor. | [BuzzStream pricing](https://www.buzzstream.com/blog/link-building-pricing/) |
| Ahrefs DR | Domain Rating, 0 to 100: strength of the whole domain's backlink profile relative to Ahrefs' index. Link popularity, not traffic. | [Ahrefs glossary](https://ahrefs.com/blog/ahrefs-seo-metrics/) |
| Ahrefs URL Rating | Same idea for a single page. | [Ahrefs glossary](https://ahrefs.com/blog/ahrefs-seo-metrics/) |
| Ahrefs Referring Domains | Number of distinct websites linking to the domain. | [Ahrefs glossary](https://ahrefs.com/blog/ahrefs-seo-metrics/) |
| Ahrefs Organic Traffic | Estimated monthly visits from search, from the keywords the site ranks for in the top 100. | [Ahrefs help](https://help.ahrefs.com/en/articles/5373022-understanding-the-metrics-in-the-dashboard-overview) |
| Ahrefs Top 3 / Top 4-10 Keywords | Count of keywords ranking in positions 1 to 3 and 4 to 10. | Ahrefs Site Explorer |
| Majestic TF / CF | Trust Flow (quality of linking sites) and Citation Flow (quantity of links), 0 to 100. | [Majestic blog](https://blog.majestic.com/case-studies/using-majestic-citation-flow-trust-flow-check-quality-link-prospects/) |
| TF/CF | Ratio TF divided by CF. Healthy at 0.5 or above, warning sign below 0.25. | [Majestic blog](https://blog.majestic.com/company/why-your-trust-flow-score-may-change/) |
| MOZ DA | Domain Authority, 1 to 100, Moz's prediction of ranking ability from link data. | [Moz DA guide](https://www.rhinorank.io/blog/the-ultimate-moz-da-guide/) |
| MOZ Spam Score | Likelihood (percent) that search engines treat the site as spam. | [DA, PA, Spam Score](https://www.iconnectdm.com/blog/da-pa-spam-score-seo/) |
| Semrush AS | Authority Score, 0 to 100, combining backlinks, organic traffic and spam signals. | [Semrush](https://www.semrush.com/free-tools/website-authority-checker/) |
| RD/OT | Referring Domains divided by Organic Traffic. **Internal**: the direction and threshold are the company's. | ask Gary |
| Buying Casino ... Buying General | Cost price per niche, what the publisher charges us. | Mauro, 05/10 to 06/10 |
| Casino ... General | Sell price per niche, what we charge the client. | same |
| Unlicensed Casino | Casinos without a licence in the player's country, typically on an offshore (Curacao-type) licence. Many publishers refuse them, so it is priced apart from Casino. | [Curacao licence](https://track360.io/glossary/curacao-license) |
| Crypto, Forex, CBD, Dating | Restricted niches that mainstream publishers often refuse or surcharge. | [Casino link building](https://nuoptima.com/casino-link-building) |
| Sponsor Tag Type | The rel attribute the publisher puts on the link: none, nofollow, sponsored, ugc. Google asks paid links to carry rel="sponsored"; nofollow is still accepted. The desk records only dofollow prices, so this column is where "dofollow" is written. | [Google: qualify outbound links](https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links) |
| Link Type | Guest post (new article with our link) or niche edit / link insertion (link added to an existing article). | [Guest post marketplaces](https://blog.linkforce.io/guest-post-marketplace/) |
| Placement | Where the link sits: homepage, inner page, in-content, sidebar. | [Marketplaces compared](https://www.feedthebot.org/blog/link-building-marketplaces/) |
| Price Validity | Not an industry term. **Internal**: how long the quoted price holds. Format unknown. | ask Gary |
| Admin Comments / User Comments | **Internal**: who writes which. | ask Gary |
| Last Updated | dd/mm/yyyy, date the row was last touched. | sample rows |
| Main Country, Main Country Traffic, Domain Language, Website Topic | Audience country and its share of traffic, language, topic. The "Website Scraping Sheet" has tabs listing relevant and irrelevant topics. | sample rows |

What this changes for the page: Sponsor Tag Type is the column that encodes
the house rule "only dofollow prices are recorded", so a list that says
"nofollow only" or "sponsored tag mandatory" is recorded in that column and
not as a Buying price. Unlicensed Casino is its own niche, not a flag on
Casino.

## Gary's answers, 06/10 (verbatim where it matters)

1. Export: "You cannot export it as we are updating this sheet everyday."
2. Where lists come from: "They are provided in the email replies from our
   clients. Either from a provided google sheet/xlsx file or from the email
   itself." (Here "clients" are the publishers and brokers who answer our
   outreach, which is what the desk's Reply tab already receives.)
3. Accepted rows: "The outreach team does, and these needs to be checked ONE
   by ONE by a team member to make sure that the site essentially added to
   database makes sense. Considering that lists can include the same sites
   but from different brokers/publishers."
4. RD/OT, Price Validity, Admin/User Comments: "All are written by the team
   internally. Analyze the sheet and you will see what thresholds and values
   are added."
5. Removed sites: "simply sites that are not removed from the actual import,
   and are not included when we import this file to our platform."
6. Currency: EUR for all prices.

Consequences: the sheet is a live import file for a platform, so the page
reads it live and never writes to it; "removed sites" is an exclusion list
the matcher must consult (a removed domain offered again is a flag, not a
new row); duplicates across brokers and publishers are the normal case, not
an edge case; and the one-by-one human check is the product, the page only
removes the lookup work around it.

## What the 2024 Latam copy shows about values (read 06/10)

The 2026 sheet cannot be exported, so the conventions below come from
"Latam Database (Dummy)" (Gary, 2,751 rows, 2024 schema with fewer
columns). Counted with a script over the CSV export, not by eye.

- **Prices** are text, not numbers: "€ 400.00" (1,428 rows), "€ 9,999.99"
  with thousands separator (41), "$999.99" (55), "€ 99,99" with a decimal
  comma (17), "£999.99" (3). The parser must accept all of these and keep
  the currency; Gary says EUR, the data says mostly EUR.
- **Terms** live in a free-text comment: "do follow, permanent" (1,631),
  "do follow, 2 Years" (86), "do follow, 1 Year" (33), "NO-FOLLOW,
  permanent" (17). The 2026 columns Link Type, Sponsor Tag Type and Price
  Validity are this comment split into fields. "Prices valid until
  31.12.2024" appears inside the comment 11 times: that is what Price
  Validity holds, a date.
- **Removed** was a comment too: "REMOVED FROM THE LIST" (32) and "REMOVED
  FROM LIST" (12). In 2026 it is the "removed sites" tab.
- **Dates** are dd/mm/yyyy and a few bare years ("2021").
- **Metrics** (2,182 rows with values): DR median 26, three quarters under
  39; RD median 426; organic traffic median 142 with a long tail. No
  explicit threshold column; RD/OT in 2026 is a derived ratio the page can
  compute but should not judge.
- **Brokers are visible as contacts with many domains**: one Gmail address
  on 137 rows, a newspaper's traffic desk on 109, purolink on 67, colorvivo
  on 44 (colorvivo is a reseller the desk already knows). The page can flag
  "this sender already has N domains in the database" as a Broker hint.
- **Duplicates**: 16 domains appear twice in 2,751 rows even in a curated
  copy, so matching has to be on the normalised domain, not on the cell.
- Homepage links and banners are priced separately in free text ("Homepage
  link - 473 EUR/ Permanent", "Banner - 800 EUR / Month"). Out of scope for
  the matcher; keep the text.

## How the page gets the data

Export is ruled out, so the page reads the sheet live. Two ways:

1. **Service account (chosen).** Gary creates a Google service account
   and shares the copy with its email as Editor (decision 2 below). The Worker holds the key
   as a Cloudflare secret and answers lookups ("is domain X in Import
   Database or removed sites, and with which row?"). Users need nothing new;
   this mirrors how outreach@ reads the mailboxes. The Worker caches the
   sheet for a few minutes so 103k rows are not re-read per lookup.
2. **Per-user OAuth.** Gary creates an OAuth client; each user signs in with
   Google in the browser, like Microsoft today. More setup per person, and
   every user needs access to the sheet.

Either way the Claude Code environment still cannot reach Google: analysis
of the 2026 data happens through the Worker once it reads the sheet, or
through a sample copy Gary shares.

## Decisions (Mauro, 06/10)

Confirmed in writing: "1 si, 2 que se escriba sola, 3 si, 4 si, 5 si".

1. **Offer** = the publisher's buying price per niche plus terms (link type,
   placement, sponsor tag, validity). Not the sell price.
2. **The page writes to the Sheet itself**, but only when a person clicks
   Accept on a row. Nothing is written on import, on match, or by default.
   Each write fills the Sheet's columns in order, sets Last Updated = today
   and Admin Comments = who accepted it and from which list. Development and
   the acceptance test run against "Copy of Import Database 2026"; Gary
   switches the service account to the real sheet when he is satisfied.
   Domains found in "removed sites" are shown as removed and never written
   as new.
3. **Matching** by normalised domain (lowercase, no protocol, no www, no
   path). The same domain from several senders is the normal case: every
   offer is shown side by side with the existing row, the person keeps one,
   the other sender is recorded as Broker.
4. **A list is done** when every row has a decision: accept, reject, or ask
   the publisher. Unknown rows are not done until someone has looked at the
   site.
5. **Acceptance test** = the starmagazines list of 05/10 (33 sites, in the
   desk already) matched end to end on the page, accepted rows written to
   the copy of the Sheet and checked by Mauro.

Because of decision 2 the service account needs **Editor**, not Viewer, on
the copy, and the Worker is the only thing that holds the key.

## Build order

1. **Done 06/10.** `src/site-lists.js`: parser (text, tab or CSV table, with
   or without a header row), domain and price normalisation, index of the
   database with the "removed sites" exclusion, grouping into unchanged /
   changed / unknown / removed, Broker hint from the sender's domain count,
   and the row Accept writes. `node scripts/probar-listas.mjs` runs 51
   checks; with the path of the 2024 Latam CSV it also indexes the real copy
   (2,751 rows, 2,187 domains, 17 duplicated, 1,557 prices all parsed).
2. Worker: read both tabs through the Sheets API with the service account,
   cache for a few minutes, answer lookups; write one row on Accept. Waiting
   on Gary (asked 06/10 and 07/10: service account as Editor on the copy,
   which platform imports the sheet and what it validates, how a list is
   handled today).
3. **Screen done 07/10**, as its own page, not a desk tab: `src/site-lists.html`,
   served at `/lists/` next to the desk behind the same Cloudflare Access, EN/ES,
   the desk's tokens and type. Form on a rail, one table with group tabs
   (changed / unknown / unchanged / removed / all), three-way decision per row,
   Broker badge on database rows, the Accept row folded at the foot. Until the
   Worker reads the sheet it matches against sample rows or a CSV loaded in
   the browser, and Accept shows the row instead of writing it. Decided with
   Mauro on 06/10: style of the desk, not a copy of its bar or tabs.
4. Acceptance test with starmagazines on the copy.

## Not in scope unless asked

Automatic quality checks of a site (traffic, DR), scraping the publisher's
pages, writing to the Sheet without a person's click, sending any email.
