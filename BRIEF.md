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
2. **Written 08/10, not yet live.** `src/worker.js`: service-account token
   signed with WebCrypto, both tabs read through the Sheets API and kept in
   memory five minutes, `/api/match` by normalised domain with the sender's
   row count, `/api/accept` appends one row in the sheet's own column order
   and names who accepted from the Access token. 18 checks against a
   stand-in for Google. The page uses it when served next to it: the seal
   shows the sheet's row count and read time, Accept writes at once and the
   row is marked "Written to the sheet". Waiting on Gary for the key
   (`GOOGLE_SA`), the Cloudflare secrets on this repository, and the Access
   application for the hostname.
3. **Screen done 07/10**, as its own page, not a desk tab: `src/site-lists.html`,
   served at `/lists/` next to the desk behind the same Cloudflare Access, EN/ES,
   the desk's tokens and type. Form on a rail, one table with group tabs
   (changed / unknown / unchanged / removed / all), three-way decision per row,
   Broker badge on database rows, the Accept row folded at the foot. Until the
   Worker reads the sheet it matches against sample rows or a CSV loaded in
   the browser, and Accept shows the row instead of writing it. Decided with
   Mauro on 06/10: style of the desk, not a copy of its bar or tabs.
4. Acceptance test with starmagazines on the copy.

## What Senad's Drive shows (read 07/10)

Two files owned by senad.linkjuiceclub@gmail.com, shared with Mauro:

- **"Latam Outreach — Simon"** (sheet). Tabs: *Database* (5,470 rows in the
  database's column layout, 43 columns, no Unlicensed Casino yet), *BROKER
  OUTREACH* (1,803 rows: Domain, Country, Date Sent, WhatsApp, Contact Email,
  Alternative contact, Replied?, Database?, Additional Comments), *BROKER +
  UNSURE SITES* (3,660 rows in the database layout, Type blank / Broker /
  Exclusive), *OUTREACH NEW SITES* (3,578 rows, same tracking columns plus
  Status Email), *Templates*, *Old Mauro Broker Sites*.
- **"Broker/ Normal Outreach"** (doc). Email templates for the broker case:
  "[Website] was recently presented to us by a third party": write to the
  webmaster directly and ask whether they manage partnerships; "Better
  Price": when the site is listed cheaper on a platform, ask the webmaster to
  match; closings for "prices are good", "got a discount", "no discount".

So the broker workflow, as far as the files show it: a broker's list is a
source of *leads*, not of prices. Each site goes to BROKER + UNSURE SITES,
the team writes to the real webmaster, and the direct price is what enters
the Database. The broker's price is kept as the ceiling to negotiate under.
This matches decision 3 (the broker's offer is shown, the person decides)
and sharpens it: for an unknown domain from a broker, the natural action is
"write to the webmaster", not "accept the broker's price". **Confirmed by
Senad, 07/10 09:05**: "Yes, and we tend to contact the real webmaster of the
sites the broker provided or individual sites provided by them." He is
writing the full process in a Google Doc; the rest of this section waits for
it.

## The 2026 headers, verified 07/10

Read through the Drive connector, first row of "Import Database": 45 columns
A to AS. Several headers carry a line break or a double space in the sheet
("Ahrefs \nDomain Rating", "Unlicensed \nCasino", "Semrush  Authority Score"),
so the module matches headers by collapsed whitespace, not by exact text.
"removed sites" has 43 columns (no Unlicensed Casino) and spells "Majestic
Citatian Flow". Prices are **bare numbers in EUR** (1100, 250), not "€ 400.00"
as in the 2024 Latam copy; `formatPrice` now writes bare numbers. Fixed
values seen in the rows: Type blank / Publisher / Broker; Link Type "Do
follow"; Placement "permanent", "1 Year", "2 Years"; Price Validity "Fixed";
Sponsor Tag Type "Marked by WM", "rel=sponsored". Admin Comments phrases:
"Unlicensed Casinos - 1100 EUR", "Unlicensed Casinos Accepted", "Only
Licensed Casinos", "Written by WM", "NON-Gamstop Casinos - 500 EUR",
"REMOVED FROM THE LIST". User Comments: "Unlicensed Casinos Accepted",
"Marked as \"Bet\"", "Only Licensed Casinos". The Buying Unlicensed Casino
column is empty in every sample row; the unlicensed price lives in Admin
Comments today.

## Screen, second pass (07/10, after Senad)

- The sender is **Publisher or Broker**, chosen on the rail and remembered.
  On a broker list the first decision is **Webmaster** (write to the real
  owner), the banner says the broker's price is the ceiling, and an accepted
  row gets Type = Broker.
- Four decisions per row: Accept, Webmaster, Ask, Reject.
- Changed rows show the **difference against the recorded price** per niche:
  "+70 · 35% above" in amber, "−30 · 15% below" in green.
- Terms are shown as the sheet's **fixed values** (Do follow, permanent,
  Fixed, Marked by WM) read from the row's text, or inherited from a line
  the email states once for the whole list, marked "whole list".
- Two folded outputs at the foot: the rows Accept will write, previewed in
  the sheet's columns, and the sites to write to the webmaster in the
  BROKER OUTREACH layout of Senad's sheet (Domain, Contact Email, Additional
  Comments with what the broker offered). Both copy as tab-separated.

## Parser hardened on the desk's real lists (08/10)

Run over the five lists the desk received on 05/10: starmagazines (33, one
line with middle dots and a German header), stylingguiden (34, "domain -
300 EUR" per line), promodesk (4 Romanian sites in two groups with numbered
price options below each group and a signature), spanienforum and rivonhome
(answers, not lists). What broke and was fixed, each with a check:

- Domains named on a line without prices open a **group**; the price lines
  below ("1. Articol SEO - 35 EUR + TVA", "Bet / Casino - 100 EUR") feed
  every domain of the group, the niche read from the words on the line.
- A price inside a sentence ("35 EUR + TVA") is found even when the cell is
  not a pure price (`findPrice`).
- A line with niche words and a price is an offer, not a header.
- After a sign-off ("Multumesc", "Best regards", "Saludos") the rest is a
  signature: its domain is not an offer.
- A list-wide statement after the groups ('Articolele raman pe site "pe
  viata"') reaches every row, also rows that already have terms of their own.
- "b.com - 300 EUR" is prose, not a domain with a path.
- Romanian and German markings ("Marcat ADVERTORIAL", "Marcat cu (P)")
  become Sponsor Tag Type = Marked by WM with the marking in Admin Comments.

**Files (08/10).** The rail takes the file they sent: .xlsx/.xls through
SheetJS 0.18.5 loaded from cdnjs only when needed (every sheet becomes rows,
a header row with a Domain column maps the niches by column and a second
sheet's header resets it), .csv/.txt read as text, and since the afternoon
of 08/10 .pdf through pdf.js 4.10.38 from cdnjs, also only when needed: the
text of each page is rebuilt line by line from the glyph positions (a PDF has
no lines of its own) and dropped into the box, so a rate card like the one
businessamlive sent on 05/10 is read like a pasted email. Tested in Chromium
with a two-sheet fixture, a CSV and a one-page rate card (3 domains, 3
niches, "valid until 31.12.2026." read without the final dot). Still open:
Google Sheet links, which need the service account. 96 checks. Asked Senad
for real examples on 07/10.

**Senad's examples (09/10).** Four lists, one per shape: an Excel from
bogdan@librawebcorp.com and a PDF from paul@drivar.de (both as Slack file
links, which this session cannot open), a Google Sheet from
orders@mmgroupmedia.com, and an email body from contact@mattbarltd.co.uk
(sent to a mailbox this session does not see; the outreach@ mailbox has
nothing from them). The Google Sheet could be read through the Drive
connector: "MM Group Media - Websites", 427 sites on the main tab plus
"Added this Week", "Added this Month", a "Tier 2.0" tab of 362 sites and a
"How to Order" tab of prose. It is a broker list. Its header is on two rows
with merged cells ("Guest Post" over "Normal | Gambling & Grey Niches", the
same for Link Insert and Brand Mentions, "Ahrefs" over DR, RD, Avg Traffic,
Main Country), prices are "190 €", and a "Sample Post" column carries a URL
on the same site. Against that shape the parser of 08/10 failed three ways:
it read RD and traffic as the prices, missed the real ones, and made the
Sample Post URL a second item. Fixed the same day, with the shape (domains
invented) in the tests: a two-row header is merged, the upper row carried
across its blanks; a sheet row is one site, the header's domain column or
the first cell per host; a cell under a column that is not a niche is kept
as a labelled term ("Ahrefs DR: 44", "Link Insert Normal: 110 €") instead
of a bare number; tab rows keep their empty cells and leading tabs so the
columns line up. Two mappings to confirm with Gary: **"Gambling & Grey
Niches" fills Casino and the four grey columns (Crypto, Forex, CBD,
Dating)** with the same price, and **Link Insert, Brand Mentions and
Homepage Banner are not Buying prices** (the database records the article
price); both are visible on the row before anyone accepts. The other three
examples are still to be tested when the files arrive.

**The librawebcorp Excel (09/10, afternoon).** Mauro downloaded it from
Slack and attached it. Two sheets, "Sites" (1,027 rows, 66 merged cells)
and an empty "TIER 2". It is a publisher's own price list: a title row with
the year, then a header on three rows ("PRICE / ARTICLE (EUR)" merged over
six columns; "Standard Content" and "Special Content" under it; then the
product per column: SEO native, Advertorial branding, Advertorial GAMBLING,
Advertorial FINANCE (banks, loans, trading, crypto), Advertorial MEDICAL
(cbd), Advertorial Adult), then MARKINGS & TAGS, Additional info, link
insertion and brand mention prices, DA and PA. Prices are bare two-digit
numbers (40, 45) with the currency only in the header; "no" where a niche is
refused; one domain cell reads "rfi.ro (rfi.fr/ro)"; sixteen lines of notes
at the bottom. Against it the parser of the morning gave 876 items, 645 of
them without a price, because it merged only two header rows, took a
two-digit number for a metric, and read "PRICE / ARTICLE ... (GAMBLING)" as
general and casino at once. Fixed the same afternoon: at the top of a
sheet, the rows without an offer are joined and the join naming the most
niche columns wins (a one-cell row such as the year is skipped, not
joined); a two-digit number under a niche column is a price; a header
naming a niche drops the general words ("price", "standard"); a refusal
under a niche column reads "casino: no"; a second price for a niche already
filled keeps its column name; a domain with a second name in brackets keeps
the first; the disclaimer about "sponsored tags ... non-binding" no longer
sets rel=sponsored for the whole list, while "only properly licensed
websites" gives Only Licensed Casinos and "one dofollow link" gives Do
follow. Result: 877 items, every one with a price, 13 note lines skipped.
SEO native is taken as the General price and the branded advertorial is
shown as a term; worth confirming with Gary. Shape in the tests with
invented domains. 113 checks.

Loaded into the page in Chromium (SheetJS from the local copy, since cdnjs
is not reachable from the sandbox): file to 877 rows on screen in 1.2 s, 25
MB of memory. A decision then redrew the whole table, about a second per
click; now it redraws its own row, the counter and the outputs through one
listener on the result area: 2 to 5 ms per click, measured in the page.

**The mattbarltd thread (09/10, evening).** Mauro pasted the whole thread
Senad forwarded: Senad's reply on top (headers in Bosnian), Matt's answer
on niches, Senad's questions, and two replies down Matt's list of 03/02:
twenty UK sports sites in blocks, each block a price line above its
domains ("£100 football links / £150 any other links"), prices in pounds
plus VAT, then the conditions (dofollow, "not marked as sponsored or
tagged", permanent, no adult, CBD or non-gamstop links), then Senad's
first email with our signature. The parser read nothing: the first "Best
regards" closed the whole text, and had it not, Senad's question ("which
other niche links are accepted: Crypto, Forex?") would have been taken as
a header, "not marked as sponsored" as rel=sponsored, "lifestyle" as Fixed
and "football links" as "all links". Fixed the same evening: a message
header (From:, On ... wrote:, Šalje:, De:, Von:) reopens reading and drops
the header of the message above; a price line standing above domains gives
them its prices, each price taking the niches its words name, "any other
links", "all links" or a lone price being general and a topical price
("football") staying in the terms; in prose a header needs short cells,
most of them niches, and no sentence punctuation; "not marked as
sponsored" is no sponsor tag; "no illegal gambling" and "non-gamstop"
give Only Licensed Casinos; the words are matched whole. Result: 20 items,
each with the "any other links" price in GBP, Do follow, permanent, no tag,
Only Licensed Casinos. The database is in EUR (Gary): a price in another
currency is shown with it on the row ("150 GBP") and written as given with
"Prices in GBP, not converted" in User Comments; converting is a decision
for Gary, not the page. Matt's second email says the sensitive niches
(gambling, crypto, forex) take the "any other links" price: the page does
not infer that across messages, the person reads it in the terms and
decides. Shape in the tests with invented domains.

**The drivar.de PDF (09/10, night).** Mauro attached it. Three pages, a
table per page: Domain, Category, Links, DA, PA, TF, CF, Article Link,
Homepage Link, 48 sites, prices "599€", header on two rows ("Article" over
"Link"), a title and "Last updated: 01.11.2024" above, notes below
("Inclusive: min. 24 months online, No advertising marking, No-follow",
discounts, "Optional: do-follow link instead of no-follow: +99€, Casino,
crypto etc. +25%, permanent placement on request"). pdf.js hands the text
over as items with a position and no lines; long cells wrap onto the next
line ("https://motion-drive-" over "vermietung.de", "Driving" over
"school"); and the font maps every "f" to a lone "E" ("rundElug.com",
"proEi.com"). Read as lines, the parser made 23 items out of the wrapped
halves with the Links count as the price. Fixed the same night, in the
module so the page and the tests share it (`pdfTextOf`): items on one
baseline form a line and touching items a word; a page with three or more
rows of four or more cells is a table whose columns are the x positions of
the widest row, each cell going to the nearest column, written out with
tabs so parseList reads it like a sheet; a short row without digits under
a data row continues it, glued without a space when the cell above is a cut
domain and the piece carries a dot, with a space otherwise, and never when
it is a note ("Inclusive"); a lone capital E glued to lowercase letters or
a URL separator on both sides is an f. "Article" joins the general words.
In termsOf a clause that is an option ("on request", "+99€", "surcharge")
is left out when reading link type and placement, so this list is No
follow and 2 Years, not permanent and Do follow. Result: 48 items, every
one with its Article price, metrics and the Homepage price as labelled
terms, 12 note lines. Two things for Gary: this publisher is nofollow by
default and dofollow costs +99€ per link, so the dofollow price the
database wants is Article + 99 and the page does not add that up; and
"Casino, crypto etc. +25%" is likewise shown, not computed. Shape in the
tests with invented domains.

## Where it lives (Gary, 08/10)

"Yes please just deploy it fully on GitHub so I can view it. Then we will
include it with the LJC Outreach (Mesa). Make sure you don't host on
Cloudflare as it will be separate." So: GitHub Pages for review, then the
page goes into the desk and the sheet access (the Worker written on 08/10)
moves into the desk's Worker. The example data on the public page is
invented. This replaces the "own Cloudflare deploy" line of the build order.

## Database screen (Gary, 08/10: "show the full database here")

A second screen, switched from the bar: the whole database, read only.
Search by domain, contact or name; filters by Type, country, language and
"priced for" niche; the removed sites tab; 14 columns by default or all 45.
Only the rows on screen are drawn. Measured 08/10 in Chromium with an
invented CSV of the sheet's size (103,393 rows, 45 columns, 30 MB): load
and index 2.7 s, open the screen 1.2 s, search 40 ms, country filter 65 ms,
jump to row 90,000 in 113 ms, 45 columns 143 ms, matching a 33-site list
150 ms, 228 MB of browser memory. Gary asked on 08/10 whether it handles
the 100k database: yes, with those numbers. After the review of 08/10 (rows
prepared once where they enter, filter shared with the Worker): load 3.7 s,
open the screen 123 ms, search 49 ms, country filter 123 ms, 215 MB. The
CSV comes from `node scripts/inventar-csv.mjs`, deterministic and invented. A row opens a detail panel
with its 45 fields. Rows come from the CSV or sample rows in the browser,
or from the Worker's `/api/rows` (filters, paging, facets) when served
next to it. Writing stays on Accept, as agreed.

Small things, 08/10 afternoon: the screen (List or Database) and the
Database filters are remembered in the browser; a domain on the list opens
its record in the Database screen with one click.

## Not in scope unless asked

Automatic quality checks of a site (traffic, DR), scraping the publisher's
pages, writing to the Sheet without a person's click, sending any email.
