#!/usr/bin/env node
/* Checks src/site-lists.js: domains, prices, parsing a pasted list, matching
   against an in-memory database, the row Accept would write. No network.

   Fixtures are synthetic but copy the formats counted in the 2024 Latam copy
   on 06/10 ("€ 400.00", "€ 9,999.99", "€ 99,99", "$999.99", "do follow,
   permanent", "Prices valid until 31.12.2024").

   Usage:  node scripts/probar-listas.mjs [path/to/real-copy.csv]
   With a CSV path it also indexes that file and prints a summary; the file
   stays where it is, nothing is written. Exit code 1 when a case fails. */
import fs from "node:fs";
import { normaliseDomain, parsePrice, parseList, nichesOf, pdfTextOf, isReseller, sheetDate, ADMIN_COMMENTS, rowForRemoved, REMOVED_COLUMNS, metricsOf, belowThreshold, monthsSince, mergeDuplicates, indexDatabase, matchList, rowForAccept, nicheOf, DB_COLUMNS, headerKey, normaliseRow, FIXED, termsOf, priceDelta, listTermsOf, withListTerms, findPrice, tableToList, prepareRow, rowMatchesFilters, facetsOf, searchText, numberOf, sortRows, rowForOffer, offerPrice, offerPriceOf, OFFER_COLUMNS, tldOf, bareNotPrice } from "../src/site-lists.js";

let fallos = 0, casos = 0;
function caso(nombre, ok, detalle){
  casos++;
  if(ok) return;
  fallos++;
  console.log("FAIL " + nombre + (detalle !== undefined ? "\n     " + JSON.stringify(detalle) : ""));
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* --- domains --- */
caso("plain", eq(normaliseDomain("example.com"), { domain: "example.com", path: "" }));
caso("url with www and path", eq(normaliseDomain("https://www.Example.com/blog/"), { domain: "example.com", path: "/blog" }));
caso("language path kept", eq(normaliseDomain("acefootball.com/es"), { domain: "acefootball.com", path: "/es" }));
caso("subdomain kept", normaliseDomain("news.example.co.uk").domain === "news.example.co.uk");
caso("email is not a domain", normaliseDomain("jof@acefootball.com") === null);
caso("price is not a domain", normaliseDomain("€ 400.00") === null);
caso("trailing punctuation", normaliseDomain("example.com,").domain === "example.com");

/* --- prices --- */
caso("€ 400.00", eq(parsePrice("€ 400.00").amount, 400));
caso("€ 9,999.99", eq(parsePrice("€ 9,999.99").amount, 9999.99));
caso("€ 99,99 decimal comma", eq(parsePrice("€ 99,99").amount, 99.99));
caso("$999.99 usd", eq([parsePrice("$999.99").amount, parsePrice("$999.99").currency], [999.99, "USD"]));
caso("£999.99 gbp", parsePrice("£999.99").currency === "GBP");
caso("400€ suffix", eq([parsePrice("400€").amount, parsePrice("400€").currency], [400, "EUR"]));
caso("EUR 400", parsePrice("EUR 400").amount === 400);
caso("1.200,00 €", parsePrice("1.200,00 €").amount === 1200);
caso("1.200 thousands", parsePrice("1.200").amount === 1200);
caso("bare number defaults EUR", parsePrice("350").currency === "EUR");
caso("no number", parsePrice("do follow") === null);

/* --- niches --- */
caso("niche casino", nicheOf("Casino price") === "casino");
caso("niche unlicensed before casino", nicheOf("Unlicensed casino") === "unlicensedCasino");
caso("niche general", nicheOf("General") === "general");
caso("niche none", nicheOf("Domain") === null);

/* --- parsing a pasted list --- */
const texto = `Domain\tGeneral\tCasino\tNotes
www.alpha.com\t€ 300.00\t€ 400.00\tdo follow, permanent
beta.es/\t150\t\tPrices valid until 31.12.2026
https://gamma.net/blog\t€ 99,99\t$999.99\tsponsored tag mandatory
Thanks, let me know`;
const parsed = parseList(texto);
caso("header detected", eq(parsed.columns, [null, "general", "casino", null]));
caso("three items", parsed.items.length === 3, parsed.items.map(i => i.domain));
caso("thanks line skipped", parsed.skipped.length === 1 && /Thanks/.test(parsed.skipped[0].text));
const alpha = parsed.items[0];
caso("alpha prices by header", alpha.prices.general.amount === 300 && alpha.prices.casino.amount === 400);
caso("alpha terms", alpha.terms === "do follow, permanent");
const beta = parsed.items[1];
caso("beta bare price is general", beta.prices.general.amount === 150 && !beta.prices.casino);
const gamma = parsed.items[2];
caso("gamma decimal comma and usd", gamma.prices.general.amount === 99.99 && gamma.prices.casino.currency === "USD");

const sinCabecera = parseList(`alpha.com - 300€\nbeta.es: 150 EUR\n  gamma.net   € 1,200.00   do follow`);
caso("no header: first price general", sinCabecera.items.length === 3 && sinCabecera.items[0].prices.general.amount === 300, sinCabecera.items);
caso("no header: gamma 1200", sinCabecera.items[2].prices.general.amount === 1200 && /do follow/.test(sinCabecera.items[2].terms));

const csv = parseList(`domain,price\n"delta.com","€ 250.00"\n"epsilon.org","€ 1,100.00"`);
caso("csv quoted cells", csv.items.length === 2 && csv.items[1].prices.general.amount === 1100, csv.items);

/* --- matching --- */
const db = [
  { Domain: "alpha.com", "Webmaster Contact": "a@alpha.com", "Buying General": "€ 300.00", "Buying Casino": "€ 400.00" },
  { Domain: "beta.es", "Webmaster Contact": "broker@lists.com", "Buying General": "€ 120.00" },
  { Domain: "www.beta.es", "Webmaster Contact": "owner@beta.es", "Buying General": "€ 150.00" },
  { Domain: "zeta.com", "Webmaster Contact": "broker@lists.com", "Buying General": "€ 10.00" },
  { Domain: "eta.com", "Webmaster Contact": "broker@lists.com" }
];
const removed = [{ Domain: "gamma.net", "Admin Comments": "spam" }];
const idx = indexDatabase(db, removed);
caso("index size by normalised domain", idx.size === 4, idx.size);
caso("two rows for beta.es", idx.byDomain.get("beta.es").length === 2);

const g = matchList(parsed.items, idx, { sender: "owner@beta.es" });
caso("alpha unchanged", g.unchanged.length === 1 && g.unchanged[0].item.domain === "alpha.com");
caso("beta changed (one row differs)", g.changed.length === 1 && g.changed[0].item.domain === "beta.es");
caso("beta diff lists the broker row only", g.changed[0].diffs[0].length === 1 && g.changed[0].diffs[1].length === 0, g.changed[0].diffs);
caso("beta same sender flagged", g.changed[0].sameSender === true);
caso("gamma removed, not unknown", g.removed.length === 1 && g.unknown.length === 0);
caso("no broker hint for owner", g.unchanged[0].brokerHint === 0);

const gb = matchList(parsed.items, idx, { sender: "broker@lists.com", brokerHintAt: 3 });
caso("broker hint when sender has many domains", gb.unchanged[0].brokerHint === 3);

const gu = matchList(parseList("omega.io 500").items, idx);
caso("unknown domain", gu.unknown.length === 1 && gu.unknown[0].rows.length === 0);

/* --- the row Accept writes --- */
const fila = rowForAccept(gamma, { sender: "g@gamma.net", contactName: "Gina", who: "mauro@linkjuiceclub.com", listLabel: "gamma 06/10", today: new Date(2026, 9, 6) });
caso("row has every column", eq(Object.keys(fila), DB_COLUMNS));
caso("row type and tld", fila.Type === "Publisher" && fila.TLD === ".net" && fila.Domain === "gamma.net");
caso("row buying prices as bare numbers", fila["Buying General"] === "99.99" && fila["Buying Casino"] === "999.99", [fila["Buying General"], fila["Buying Casino"]]);
caso("row sell prices empty", fila.General === "" && fila.Casino === "");
caso("row sponsored tag", fila["Sponsor Tag Type"] === "rel=sponsored", fila["Sponsor Tag Type"]);
caso("row date dd/mm/yyyy", fila["Last Updated"] === "06/10/2026");
caso("row user comment traces the accept", fila["User Comments"] === "Accepted by mauro@linkjuiceclub.com; from list gamma 06/10; Prices in USD, not converted", fila["User Comments"]);
caso("row admin comments only fixed phrases", fila["Admin Comments"] === "", fila["Admin Comments"]);
const filaBeta = rowForAccept(beta, {});
caso("row validity date", filaBeta["Price Validity"] === "31/12/2026", filaBeta["Price Validity"]);
const filaAlpha = rowForAccept(alpha, {});
caso("row Do follow and permanent placement", filaAlpha["Link Type"] === "Do follow" && filaAlpha["Placement"] === "permanent" && filaAlpha["Sponsor Tag Type"] === "", [filaAlpha["Link Type"], filaAlpha["Placement"]]);
caso("row integer price", filaAlpha["Buying General"] === "300" && filaAlpha["Buying Casino"] === "400");

/* --- the 2026 headers, with their line breaks and double spaces --- */
caso("headerKey collapses whitespace", headerKey("Ahrefs \nDomain Rating") === headerKey("Ahrefs  Domain Rating") && headerKey("Unlicensed \nCasino") === "unlicensed casino");
caso("headerKey tolerates Citatian", headerKey("Majestic\nCitatian Flow") === "majestic citation flow");
const sheetRow = normaliseRow({ "Type": "Broker", "Domain": "tgtube.co.uk", "Ahrefs \nDomain Rating": "49", "Buying Casino": "500", "Unlicensed \nCasino": "", "Majestic\nCitatian Flow": "26" });
caso("normaliseRow maps sheet headers", sheetRow["Ahrefs Domain Rating"] === "49" && sheetRow["Majestic Citation Flow"] === "26" && sheetRow["Buying Casino"] === "500", sheetRow);
const idxSheet = indexDatabase([{ "Domain": "tgtube.co.uk", "Webmaster Contact": "x@y.z", "Buying  Casino": "500" }], []);
const gSheet = matchList(parseList("tgtube.co.uk 500").items, idxSheet);
caso("sheet row with bare price matches as changed (general vs casino)", gSheet.changed.length === 1 && gSheet.changed[0].diffs[0][0].niche === "general", gSheet.changed[0] && gSheet.changed[0].diffs);
const gSheet2 = matchList(parseList("Domain\tCasino\ntgtube.co.uk\t500").items, idxSheet);
caso("sheet row with bare price matches as unchanged", gSheet2.unchanged.length === 1, gSheet2);
const marked = rowForAccept(parseList("alpha.com\t300\tarticle marked as \"Werbung\"; unlicensed casinos accepted; written by WM").items[0], {});
caso("Marked by WM with the marking in Admin Comments", marked["Sponsor Tag Type"] === "Marked by WM" && marked["Admin Comments"] === "Marked as \"Werbung\"\nUnlicensed Casinos Accepted\nWritten by WM", marked["Admin Comments"]);
caso("FIXED lists", FIXED.placement.includes("2 Years") && FIXED.linkType.includes("No follow"));


/* --- the starmagazines email of 05/10, as it came --- */
const star = parseList(`Unsere verfügbaren Webseiten und Preise (Allgemein / Glücksspiel / Vape-CBD-Crypto):
neuheute.ch 99 € / 269 € / 180 € · foxinsider.fr 99 / 249 / 170 · esblog.fr 89 / 249 / 170 · technologer.de 99 / 449 / 249 · biowissen.at 99 / 400 / 200

Unsere Leistungen: Dauerhafte Veröffentlichung von Gastbeiträgen · Do-Follow-Links`);
caso("star: five sites", star.items.length === 5, star.items.map(i => i.domain));
caso("star: header positional", eq(star.columns, ["general", "casino", "cbd+crypto"]), star.columns);
caso("star: neuheute prices", star.items[0].prices.general.amount === 99 && star.items[0].prices.casino.amount === 269 && star.items[0].prices.cbd.amount === 180 && star.items[0].prices.crypto.amount === 180, star.items[0]);
caso("star: bare numbers", star.items[3].prices.casino.amount === 449 && star.items[3].prices.cbd.amount === 249);
caso("star: services line skipped", star.skipped.length >= 1);

/* --- terms and deltas --- */
const tf = termsOf({ terms: "do follow, 2 Years, prices valid until 31.12.2026, no index", prices: {} });
caso("termsOf fixed values", eq([tf.linkType, tf.placement, tf.priceValidity, tf.sponsorTag], ["Do follow", "2 Years", "31/12/2026", ""]), tf);
/* A rate card read from a PDF (08/10): the sentence ends after the date, and
   the dot must not travel into Price Validity. */
const tp = parseList("Rate card 2026 - Example Media\n\nDomain / General / Casino / Crypto\nalpha-rates.example 250 EUR / 450 EUR / 400 EUR\nbeta-rates.example 180 EUR / 300 EUR / 280 EUR\n\nAll links dofollow, permanent. Prices valid until 31.12.2026.");
const tpl = listTermsOf(tp);
caso("PDF rate card: domains and columns", eq(tp.items.map(i => [i.domain, i.prices.general.amount, i.prices.casino.amount, i.prices.crypto.amount]), [["alpha-rates.example", 250, 450, 400], ["beta-rates.example", 180, 300, 280]]), tp.items);
/* A broker sheet with a two-row header (shape of the Google Sheet Senad
   sent on 09/10, domains invented): merged group cells blank after the
   first, "Normal" and "Gambling & Grey Niches" under Guest Post, Link
   Insert and Brand Mentions, a Sample Post URL on the same site, Ahrefs
   metrics as bare numbers, prices as "190 €". One item per row, general
   and the grey columns from Guest Post only, the rest as labelled terms. */
const mmRows = [
  ["Category", "Websites", "orders@broker.example", "Ahrefs", "", "", "", "Guest Post", "", "Link Insert", "", "Brand Mentions", "", "Homepage Banner"],
  ["", "427", "Sample Post", "DR", "RD", "Avg Traffic", "Main Country", "Normal", "Gambling & Grey Niches", "Normal", "Gambling & Grey Niches", "Normal", "Gambling & Grey Niches", "Per Month"],
  ["Gambling", "dice-one.example", "", 44, 1102, 18176, "India", "190 €", "290 €", "110 €", "170 €", "110 €", "170 €", "200 €"],
  ["Sports", "gear-two.example", "https://gear-two.example/top-slots-for-multiplayer-fun/", 47, 1334, 11189, "Mexico", "150 €", "230 €", "90 €", "140 €", "90 €", "140 €", "150 €"]
];
const mm = parseList(tableToList(mmRows));
caso("two-row header: one item per sheet row", mm.items.length === 2 && mm.skipped.length === 0, mm.items.map(i => i.domain).concat(mm.skipped.map(x => x.text)));
caso("two-row header: Guest Post Normal is general, grey niches fill the grey columns", eq(mm.items.map(i => [i.prices.general.amount, i.prices.casino.amount, i.prices.crypto.amount, i.prices.forex.amount, i.prices.cbd.amount, i.prices.dating.amount]), [[190, 290, 290, 290, 290, 290], [150, 230, 230, 230, 230, 230]]), mm.items.map(i => i.prices));
caso("two-row header: metrics are not prices", !mm.items.some(i => Object.values(i.prices).some(p => p.amount > 1000)), mm.items[0].prices);
caso("two-row header: metrics and other products as labelled terms", /Ahrefs DR: 44 \| Ahrefs RD: 1102/.test(mm.items[0].terms) && /Link Insert Normal: 110 €/.test(mm.items[0].terms) && /Homepage Banner Per Month: 200 €/.test(mm.items[0].terms), mm.items[0].terms);
caso("two-row header: the Sample Post URL is a term, not a second site", /Sample Post: https:\/\/gear-two\.example/.test(mm.items[1].terms) && mm.items[1].domain === "gear-two.example", mm.items[1]);
caso("two-row header: pasted from the sheet with tabs reads the same", eq(parseList(mmRows.map(r => r.join("\t")).join("\n")).items.map(i => [i.domain, i.prices.general.amount]), [["dice-one.example", 190], ["gear-two.example", 150]]));
caso("grey niches alone name the four grey columns", eq(nichesOf("Grey niches"), ["crypto", "forex", "cbd", "dating"]), nichesOf("Grey niches"));
caso("a link insertion column is not a Buying price", eq(nichesOf("Link Insert Gambling & Grey Niches"), []));
/* The broker's "How to Order" sheet follows the list: its prose carries the
   list-wide terms and its bulk prices are nobody's offer. */
const mmAll = parseList(tableToList(mmRows.concat([[], ["By email"], ["Each post includes one permanent dofollow link to your preferred target URL."], ["We do not label posts as sponsored or guest posts, unless you specifically request it."], ["5 orders in bulk", "100€"], ["Above pricing is final and no negotiation is accepted."]])));
const mmTerms = listTermsOf(mmAll);
caso("broker's How to Order sheet: still two items, terms permanent and Do follow", mmAll.items.length === 2 && mmTerms.placement === "permanent" && mmTerms.linkType === "Do follow", [mmAll.items.length, mmTerms]);
/* A publisher's price sheet with a title row and a three-row header (shape
   of the Excel bogdan@librawebcorp.com sent, 09/10, domains invented):
   "PRICE / ARTICLE (EUR)" merged over six columns, "Standard Content" and
   "Special Content" under it, then the product per column; prices as bare
   two-digit numbers; "no" where a niche is refused; a domain cell with a
   second name in brackets. */
const libraRows = [
  ["", "", "", 2026],
  ["Category/Region", "Website", "PRICE / ARTICLE (EUR)", "", "", "", "", "", "MARKINGS & TAGS  *", "Additional info", "PRICE / LINK INSERTION (EUR)", "", "DA", "PA"],
  ["", "", "Standard Content", "Special Content", "", "", "", "", "", "", "Standard Content", "Special Content", "", ""],
  ["", "", "SEO            (no brand, native)", "Advertorial (branding)", "Advertorial (GAMBLING)", "Advertorial (FINANCE: banks, loans, trading, crypto, insurances)", "Advertorial (MEDICAL: cbd, supplements, health)", "Advertorial (Adult Content)", "", "", "", "", "", ""],
  ["NEWS / REGION A", "ziarul-unu.example", 40, 40, 45, 40, 40, "no", "category/advertoriale", "", 40, 40, 35, 39],
  ["", "radio-doi.example (radio-doi.example/ro)", 105, 105, "no", "no", "no", "no", "Editorial Team decision", "1 link/article", "no", "no", 59, 50],
  [],
  ["For gambling-related content (betting or casino), only properly licensed websites are eligible for promotion in guest posts"],
  ["* ) Details regarding the marking or tagging of articles — including sponsored tags and other content-labeling methods — are provided for guidance only and are non-binding."],
  ["For websites with only one dofollow link/article included, articles with 2/3 links will be taxed double/triple"]
];
const li = parseList(tableToList(libraRows));
const liTerms = listTermsOf(li);
caso("three-row header under a title: two items, nothing but the notes skipped", li.items.length === 2 && li.skipped.length === 3, [li.items.map(i => i.domain), li.skipped]);
caso("three-row header: SEO is general, the products map casino, forex+crypto, cbd, dating", eq(li.columns.slice(2, 8), ["general", "general", "casino", "forex+crypto", "cbd", "dating"]), li.columns);
caso("three-row header: two-digit prices under niche columns are prices", eq([li.items[0].prices.general.amount, li.items[0].prices.casino.amount, li.items[0].prices.forex.amount, li.items[0].prices.crypto.amount, li.items[0].prices.cbd.amount, li.items[0].prices.dating], [40, 45, 40, 40, 40, undefined]), li.items[0].prices);
caso("three-row header: a refusal reads as the niche's name", /dating: no/.test(li.items[0].terms) && /casino: no \| forex\+crypto: no \| cbd: no \| dating: no/.test(li.items[1].terms), li.items[1].terms);
caso("three-row header: the branded advertorial keeps its column name, DA and PA are labelled", /Advertorial \(branding\): 40/.test(li.items[0].terms) && /DA: 35 \| PA: 39/.test(li.items[0].terms), li.items[0].terms);
caso("a domain with a second name in brackets", li.items[1].domain === "radio-doi.example", li.items[1].domain);
caso("notes: Do follow and Only Licensed Casinos, no sponsored tag from a disclaimer", liTerms.linkType === "Do follow" && eq(liTerms.adminComments, ["Only Licensed Casinos"]) && liTerms.sponsorTag === "", liTerms);
caso("a specific niche beats the general words in one header", eq(nichesOf("PRICE / ARTICLE (EUR) Special Content Advertorial (GAMBLING)"), ["casino"]));
/* A pasted thread (shape of the mattbarltd emails Senad forwarded, 09/10,
   domains invented): the list is two replies down, a price line stands
   above its domains, prices are in pounds, our own signature is quoted. */
const thread = parseList(`From: Publisher <contact@mattbar.example>
Sent: Tuesday, February 3, 2026 5:08 PM
Subject: Re: Article Placement

Hi,

I've included a list of the sites where we accept guest posts below. All prices are + VAT where applicable.

£100 football links / £150 any other links
tales-one.example
tempo-two.example

£100 all links
euro-three.example

Links are dofollow and not marked as sponsored or tagged.  Posts and links are permanent.
- No adult, CBD, non-gamstop / no-kyc related links
- No lifestyle fluff

Kind Regards

Matt

On Tue, 3 Feb at 4:03 PM , Senad Tiro <senad@linkjuiceclub.com> wrote:
Hello,
Apart from Sports Betting and Casino, which other niche links are accepted: Crypto, Forex?
Best regards,
Website: https://www.linkjuiceclub.com`);
const thTerms = listTermsOf(thread);
caso("thread: three sites, our signature is not one, the question is not a header", eq(thread.items.map(i => i.domain), ["tales-one.example", "tempo-two.example", "euro-three.example"]) && thread.columns === null, [thread.items.map(i => i.domain), thread.columns]);
caso("thread: 'any other links' is the general price, in pounds, the topical price stays a term", eq(thread.items.map(i => [i.prices.general.amount, i.prices.general.currency]), [[150, "GBP"], [150, "GBP"], [100, "GBP"]]) && /£100 football links/.test(thread.items[0].terms), thread.items.map(i => i.prices));
caso("thread: dofollow, permanent, not marked as sponsored, only licensed, no Fixed from 'lifestyle'", thTerms.linkType === "Do follow" && thTerms.placement === "permanent" && thTerms.sponsorTag === "" && eq(thTerms.adminComments, ["Only Licensed Casinos"]) && thTerms.priceValidity === "", thTerms);
const gbpRow = rowForAccept(withListTerms(thread.items[0], thTerms), { sender: "contact@mattbar.example", listLabel: "mattbar 03/02" });
caso("a price in pounds is written as given and said so", gbpRow["Buying General"] === "150" && /Prices in GBP, not converted/.test(gbpRow["User Comments"]) && gbpRow["Sponsor Tag Type"] === "" && gbpRow.Placement === "permanent", gbpRow);
/* A PDF table as pdf.js hands it over (shape of the drivar.de price list,
   09/10, domains invented): items with x, y and width; a two-row header;
   a domain wrapped onto the next line; an "f" the font gives as a lone "E";
   a note under the last row. */
const it = (s, x, y, w) => ({ str: s, transform: [1, 0, 0, 1, x, y], width: w });
const pdfItems = [
  it("Price list", 146, 758, 60),
  it("Domain", 81, 689, 43), it("Category", 204, 689, 49), it("DA", 314, 689, 16), it("Article", 411, 689, 37), it("Homepage", 458, 689, 59),
  it("Link", 411, 675, 25), it("Link", 458, 675, 25),
  it("https://alpha-one.example", 81, 652, 120), it("Auto", 204, 652, 24), it("24", 314, 652, 13), it("599€", 411, 652, 27), it("2.990€", 458, 652, 37),
  it("https://beta-two-", 81, 629, 100), it("Driving", 204, 629, 40), it("33", 314, 629, 13), it("499€", 411, 629, 27), it("2.490€", 458, 629, 37),
  it("rental.example", 81, 615, 74), it("school", 204, 615, 30),
  it("https://mein-rund", 81, 592, 90), it("E", 171, 592, 5), it("lug.example", 176, 592, 25), it("Sport", 204, 592, 30), it("17", 314, 592, 13), it("399€", 411, 592, 27), it("1.990€", 458, 592, 37),
  it("Inclusive", 81, 560, 45),
  it("• min. 24 months online", 81, 546, 110),
  it("• No-follow", 81, 532, 50),
  it("5. permanent online placement on request", 81, 518, 180),
  it("1. do-follow link instead of no-follow link: +99€", 81, 504, 200)
];
const pdfTxt = pdfTextOf(pdfItems);
const pdfLines = pdfTxt.split("\n");
caso("pdf table: columns by x, two header rows, wrapped domain and category glued", eq(pdfLines.slice(0, 5), ["Price list", "Domain\tCategory\tDA\tArticle\tHomepage", "\t\t\tLink\tLink", "https://alpha-one.example\tAuto\t24\t599€\t2.990€", "https://beta-two-rental.example\tDriving school\t33\t499€\t2.490€"]), pdfLines);
caso("pdf table: a lone E between letters is an f; a note under the last row is prose", pdfLines[5] === "https://mein-rundflug.example\tSport\t17\t399€\t1.990€" && pdfLines[6] === "Inclusive", pdfLines.slice(5, 7));
const pdfParsed = parseList(pdfTxt);
const pdfTerms = listTermsOf(pdfParsed);
caso("pdf table parsed: Article is general, Homepage Link a labelled term, metrics labelled", pdfParsed.items.length === 3 && eq(pdfParsed.items.map(i => i.prices.general.amount), [599, 499, 399]) && /Homepage Link: 2\.990€/.test(pdfParsed.items[0].terms) && /DA: 24/.test(pdfParsed.items[0].terms) && !pdfParsed.items[0].prices.casino, pdfParsed.items);
caso("pdf notes: No follow and 2 Years are what is included; permanent on request and do-follow at a surcharge are not", pdfTerms.linkType === "No follow" && pdfTerms.placement === "2 Years", pdfTerms);
caso("pdf prose page: words joined into lines", eq(pdfTextOf([it("Rate", 50, 700, 20), it("card", 73, 700, 20), it("alpha.example 250 EUR", 50, 684, 100)]), "Rate card\nalpha.example 250 EUR"));
caso("a Google Sheets link is not a site", parseList("https://docs.google.com/spreadsheets/d/abc/edit?gid=0#gid=0").items.length === 0);
/* Review of 09/10 (six findings). */
const rv1 = termsOf({ terms: "do follow, permanent, prices +19% VAT", prices: {} });
caso("review: an option clause ends at a comma, real terms stay", rv1.linkType === "Do follow" && rv1.placement === "permanent", rv1);
const rv1b = termsOf({ terms: "do follow permanent, sponsored tag optional", prices: {} });
caso("review: 'sponsored tag optional' keeps dofollow and permanent", rv1b.linkType === "Do follow" && rv1b.placement === "permanent", rv1b);
const rv2 = parseList("All links dofollow and permanent\nDomain\tCasino\tGeneral\na.example\t300\t200");
const rv2t = listTermsOf(rv2);
caso("review: a terms line above a sheet header is kept for the list", rv2.items.length === 1 && rv2t.linkType === "Do follow" && rv2t.placement === "permanent", [rv2.items.length, rv2t, rv2.skipped]);
const rv2b = parseList("Domain\tCasino\tGeneral\n\tdofollow\tpermanent\na.example\t300\t200");
caso("review: a terms row under the header is not joined into it", rv2b.items.length === 1 && rv2b.items[0].prices.casino.amount === 300 && listTermsOf(rv2b).placement === "permanent", [rv2b.items, rv2b.skipped]);
const rv3 = parseList("Our prices start at 100 EUR.\na.example - 200 EUR\nb.example - 300 EUR\nc.example");
caso("review: a priced row closes the price line above; an unpriced domain after it has no price", !rv3.items.find(i => i.domain === "c.example").prices.general && rv3.items[0].prices.general.amount === 200, rv3.items);
caso("review: Festpreis is Fixed", termsOf({ terms: "Festpreis, dofollow, dauerhaft", prices: {} }).priceValidity === "Fixed");
const rv5 = pdfTextOf([it("Domain", 50, 700, 40), it("DA", 200, 700, 15), it("Price", 300, 700, 30), it("Terms", 380, 700, 30), it("a.example", 50, 680, 50), it("45", 200, 680, 12), it("99 €", 345, 680, 25), it("permanent", 380, 680, 50), it("b.example", 50, 660, 50), it("12", 200, 660, 12), it("149 €", 340, 660, 30), it("permanent", 380, 660, 50), it("c.example", 50, 640, 50), it("7", 200, 640, 6), it("199 €", 340, 640, 30), it("permanent", 380, 640, 50)]);
caso("review: a right-aligned number stays under its header", rv5.split("\n")[1] === "a.example\t45\t99 €\tpermanent", rv5);
caso("review: a lone E before a single glyph is left alone", pdfTextOf([it("E", 50, 700, 6), it("m", 56, 700, 6), it("ail", 62, 700, 15), it("x", 100, 700, 5), it("y", 105, 700, 5), it("z", 110, 700, 5), it("1", 200, 700, 5), it("2", 300, 700, 5), it("a", 50, 680, 5), it("b", 100, 680, 5), it("c", 200, 680, 5), it("d", 300, 680, 5), it("e", 50, 660, 5), it("f", 100, 660, 5), it("g", 200, 660, 5), it("h", 300, 660, 5)]).startsWith("Email"));
/* Senad's document of 09/10: four sender types, broker conversion, no new
   sites from a reseller, removed sites restored on purpose, dates as the
   sheet writes them, the Admin Comments phrases. */
caso("types: Broker and Unsure are resellers, Publisher and Exclusive are not", isReseller("Broker") && isReseller(" unsure ") && !isReseller("Publisher") && !isReseller("Exclusive") && !isReseller(""));
caso("FIXED types are the four", eq(FIXED.type, ["Publisher", "Exclusive", "Broker", "Unsure"]));
const idxTypes = indexDatabase([
  Object.assign(Object.fromEntries(DB_COLUMNS.map(c => [c, ""])), { Type: "Broker", Domain: "viabroker.example", "Webmaster Contact": "deals@broker.example", "Buying General": "300" }),
  Object.assign(Object.fromEntries(DB_COLUMNS.map(c => [c, ""])), { Type: "Publisher", Domain: "direct.example", "Webmaster Contact": "owner@direct.example", "Buying General": "100" })
].map(prepareRow), [Object.assign(Object.fromEntries(DB_COLUMNS.map(c => [c, ""])), { Type: "Publisher", Domain: "gone.example", "Admin Comments": "REMOVED FROM THE LIST" })].map(prepareRow));
const fromWm = matchList(parseList("viabroker.example\t250\ndirect.example\t120\nnew.example\t90\ngone.example\t80").items, idxTypes, { sender: "owner@direct.example", senderType: "Publisher" });
caso("a webmaster's list over a broker's row is a broker conversion", fromWm.changed.find(e => e.item.domain === "viabroker.example").conversion === true && fromWm.changed.find(e => e.item.domain === "direct.example").conversion === false, fromWm.changed.map(e => [e.item.domain, e.conversion]));
const fromBroker = matchList(parseList("viabroker.example\t250\ndirect.example\t120\nnew.example\t90").items, idxTypes, { sender: "deals@broker.example", senderType: "Unsure" });
caso("a reseller's list over a webmaster's row keeps the webmaster's", fromBroker.changed.find(e => e.item.domain === "direct.example").keepWebmaster === true && fromBroker.changed.find(e => e.item.domain === "viabroker.example").keepWebmaster === false, fromBroker.changed.map(e => [e.item.domain, e.keepWebmaster]));
const convRow = rowForAccept(fromWm.changed.find(e => e.item.domain === "viabroker.example").item, { type: "Exclusive", sender: "owner@direct.example", conversion: "deals@broker.example" });
caso("the converted row says which row it replaces, and Exclusive is a valid type", convRow.Type === "Exclusive" && /Broker conversion: replaces the row from deals@broker\.example/.test(convRow["User Comments"]), convRow);
const restRow = rowForAccept(fromWm.removed[0].item, { restored: "REMOVED FROM THE LIST" });
caso("a restored row says so, with the reason", /Restored from removed sites \(REMOVED FROM THE LIST\)/.test(restRow["User Comments"]), restRow["User Comments"]);
caso("dates as the sheet writes them", eq([sheetDate("31.12.2026"), sheetDate("1-7-26"), sheetDate("2026-12-31"), sheetDate("end of year")], ["31/12/2026", "01/07/2026", "31/12/2026", "end of year"]));
const acNotes = termsOf({ terms: "Indexing cannot be guaranteed. No promotional or affiliate content. No competitor links.", prices: {} }).adminComments;
caso("admin comments from Senad's sheet: indexing, affiliates, competitors", eq(acNotes, ["Indexing is not guaranteed", "No Affiliates", "No Competitor Links"]) && acNotes.every(c => ADMIN_COMMENTS.includes(c)), acNotes);
/* The sender's rows a list no longer names go to removed sites (Senad). */
const idxMiss = indexDatabase([
  Object.assign(Object.fromEntries(DB_COLUMNS.map(c => [c, ""])), { Type: "Publisher", Domain: "kept.example", "Webmaster Contact": "wm@kept.example", "Buying General": "100" }),
  Object.assign(Object.fromEntries(DB_COLUMNS.map(c => [c, ""])), { Type: "Publisher", Domain: "dropped.example", "Webmaster Contact": "wm@kept.example", "Buying General": "80", "Admin Comments": "Written by WM", "Buying Unlicensed Casino": "500" }),
  Object.assign(Object.fromEntries(DB_COLUMNS.map(c => [c, ""])), { Type: "Publisher", Domain: "other.example", "Webmaster Contact": "x@other.example", "Buying General": "70" })
].map(prepareRow), []);
const gm = matchList(parseList("kept.example\t100").items, idxMiss, { sender: "WM@kept.example" });
caso("missing: the sender's other rows, not other senders'", eq(gm.missing.map(e => e.item.domain), ["dropped.example"]) && gm.unchanged.length === 1, gm.missing);
caso("missing: without a sender there is nothing to miss", matchList(parseList("kept.example\t100").items, idxMiss, {}).missing.length === 0);
const rr = rowForRemoved(gm.missing[0].rows[0], { listLabel: "kept 09/10", today: new Date(2026, 9, 9) });
caso("removed row: 43 columns, no Unlicensed Casino, reason first, today's date", Object.keys(rr).length === 43 && !("Buying Unlicensed Casino" in rr) && rr["Admin Comments"] === "REMOVED FROM THE LIST\nWritten by WM" && rr["Last Updated"] === "09/10/2026" && rr["Buying General"] === "80" && /missing from list kept 09\/10/.test(rr["User Comments"]), rr);
caso("REMOVED_COLUMNS is the sheet's removed tab", REMOVED_COLUMNS.length === 43 && REMOVED_COLUMNS.includes("Majestic Citation Flow"));
caso("review 12/10: a guarantee of indexing is not the comment", eq(termsOf({ terms: "Indexing is guaranteed within 48h. We have no competitor in this niche.", prices: {} }).adminComments, []));
caso("review 12/10: the negations still read", eq(termsOf({ terms: "Indexing isn't guaranteed; no competitor links please", prices: {} }).adminComments, ["Indexing is not guaranteed", "No Competitor Links"]));
caso("a note goes to User Comments of the accepted row and of the removed row", /only sports content$/.test(rowForAccept(parseList("alpha.example\t100").items[0], { note: " only sports content " })["User Comments"]) && /; keep an eye$/.test(rowForRemoved({ Domain: "x.example" }, { listLabel: "l", note: "keep an eye" })["User Comments"]));
const mt = metricsOf("Category: Auto | Ahrefs DR: 44 | RD: 1.102 | Avg Traffic: 18176 | DA: 35 | PA: 39 | Link Insert Normal: 110 €");
caso("metrics read from labelled terms", eq([mt.dr, mt.rd, mt.traffic, mt.da, mt.tf], [44, 1102, 18176, 35, null]), mt);
caso("metrics: none in plain terms", metricsOf("do follow, permanent") === null);
caso("below threshold names the metrics that miss", eq(belowThreshold(mt, { dr: 50, traffic: "" }), ["dr"]) && eq(belowThreshold(mt, { dr: 20, traffic: 20000 }), ["traffic"]) && eq(belowThreshold(mt, {}), []));
caso("months since a sheet date", monthsSince("05/10/2025", new Date(2026, 9, 12)) === 12 && monthsSince("2026-04-12", new Date(2026, 9, 12)) === 6 && monthsSince("", new Date()) === null);
const md = mergeDuplicates(parseList("a.example\t100\nwww.a.example\t\t300\nb.example\t50\na.example\t120").items);
caso("a site twice in one list is merged into the first; a different price is a conflict", md.items.length === 2 && md.items[0].prices.general.amount === 100 && md.dupes.length === 1 && md.dupes[0].count === 3 && md.dupes[0].conflicts.length === 2 && md.dupes[0].conflicts.every(c => c.niche === "general") && md.dupes[0].conflicts[1].other.amount === 120, md);
const md2 = mergeDuplicates(parseList("Domain\tGeneral\tCasino\na.example\t100\t\na.example\t\t300").items);
caso("a second line fills the niche the first lacks", md2.items.length === 1 && md2.items[0].prices.general.amount === 100 && md2.items[0].prices.casino.amount === 300 && md2.dupes[0].conflicts.length === 0, md2);
caso("no duplicates: nothing merged", mergeDuplicates(parseList("a.example\t100\nb.example\t50").items).dupes.length === 0);
caso("review 12/10: traffic with k or M suffix, no RD from 'links: 300 €', no DA from Italian 'da'", eq([metricsOf("Traffic: 18.2k").traffic, metricsOf("Traffic 18K").traffic, metricsOf("Traffic: 1,2M").traffic], [18200, 18000, 1200000]) && metricsOf("2 links: 300 €") === null && metricsOf("Articolo sponsorizzato da 150€") === null && metricsOf("DA: 35 | RD: 1102").rd === 1102);
caso("review 12/10: impossible dates are not dates", monthsSince("13/13/2025") === null && monthsSince("12/31/2026") === null && monthsSince("31/12/2025", new Date(2026, 9, 12)) === 9);
caso("PDF rate card: list terms without the final dot", eq([tpl.linkType, tpl.placement, tpl.priceValidity], ["Do follow", "permanent", "31/12/2026"]), tpl);
caso("termsOf admin NO INDEX", eq(tf.adminComments, ["NO INDEX"]));
caso("termsOf empty when silent", eq(termsOf({ terms: "", prices: {} }).linkType, ""));
const pd = priceDelta([{ niche: "casino", offered: { amount: 269 }, inDatabase: { amount: 199 } }, { niche: "cbd", offered: { amount: 100 }, inDatabase: null }]);
caso("priceDelta", pd[0].delta === 70 && pd[0].pct === 35 && pd[1].delta === null, pd);
const pdGbp = priceDelta([{ niche: "general", offered: { amount: 100, currency: "GBP" }, inDatabase: { amount: 120 } }, { niche: "general", offered: { amount: 100, currency: "EUR" }, inDatabase: { amount: 120 } }]);
caso("priceDelta: a price in another currency is not compared with the EUR one", pdGbp[0].delta === null && pdGbp[0].pct === null && pdGbp[1].delta === -20 && pdGbp[1].pct === -17, pdGbp);

/* --- list-wide terms --- */
const lt = listTermsOf(star);
caso("list terms from the skipped lines", lt.any && lt.linkType === "Do follow" && lt.placement === "permanent", lt);
const inh = withListTerms(star.items[0], lt);
caso("item inherits list terms", inh.inherited === true && termsOf(inh).placement === "permanent" && star.items[0].terms === "");
const own = withListTerms({ terms: "no follow", prices: {} }, lt);
caso("item with own terms keeps them and fills the gaps from the list", termsOf(own).linkType === "No follow" && termsOf(own).placement === "permanent" && own.inheritedPartly === true, own);

/* --- a price inside a sentence --- */
caso("findPrice 35 EUR + TVA", findPrice("1. Articol SEO fara brand - 35 EUR + TVA.").amount === 35);
caso("findPrice € 400 per article", findPrice("it costs € 400 per article").amount === 400);
caso("findPrice none for bare numbers", findPrice("2 linkuri dofollow, 24h") === null);

/* --- grouped offers, as promodesk sent on 05/10 --- */
const promo = parseList(`Buna Eszter,

Va rog sa gasiti mai jos oferta noastra:

Familist.ro / BodyGeek.ro / DreamGeek.ro
1. Articol SEO fara brand - 35 EUR + TVA. Marcat ADVERTORIAL sub titlu. 2 linkuri dofollow.
2. Articol Brand Mention - 50 EUR + TVA.
4. Bet / Casino / Videochat / Alcool / Sex Shop / IFN / Banci - 100 EUR + TVA. 2 linkuri dofollow.

Destepti.ro
1. Brand Mention - 140 EUR + TVA. Marcat cu (P) in titlu. 1 link dofollow
3. Bet / Casino / Videochat / Sex Shop / IFN / Banci - 300 EUR + TVA.

Articolele raman pe site "pe viata".

Multumesc,
Gabriel Ion
PROMOdesk.ro — Link Building & SEO (since 2006)
+40 726 488 874`);
caso("promodesk: four domains, not the signature", eq(promo.items.map(i => i.domain), ["familist.ro", "bodygeek.ro", "dreamgeek.ro", "destepti.ro"]), promo.items.map(i => i.domain));
caso("promodesk: group prices general and casino", promo.items[0].prices.general.amount === 35 && promo.items[0].prices.casino.amount === 100 && promo.items[2].prices.casino.amount === 100, promo.items[0].prices);
caso("promodesk: second group", promo.items[3].prices.general.amount === 140 && promo.items[3].prices.casino.amount === 300, promo.items[3].prices);
caso("promodesk: no header false positive", promo.columns === null, promo.columns);
const pt = termsOf(promo.items[0]);
caso("promodesk: dofollow, marked ADVERTORIAL", pt.linkType === "Do follow" && pt.sponsorTag === "Marked by WM" && pt.adminComments[0] === 'Marked as "ADVERTORIAL"', pt);
const promoLT = listTermsOf(promo);
caso("promodesk: 'pe viata' after the groups becomes permanent for every site", termsOf(withListTerms(promo.items[0], promoLT)).placement === "permanent" && termsOf(withListTerms(promo.items[3], promoLT)).placement === "permanent", promoLT);
caso("domain with a space is prose", normaliseDomain("b.com - 300 EUR") === null);
const styling = parseList("Here are some of the websites we have available:\nstylingguiden.se - 300 EUR\ncasinosisters.com - 450 EUR\nsushilidingö.se - 200 EUR");
caso("stylingguiden: three sites, general prices", styling.items.length === 3 && styling.items[1].prices.general.amount === 450 && styling.items[2].domain === "sushilidingö.se", styling.items);
const multi = parseList("a.com, b.com - 300 EUR");
caso("two domains with one price share it", multi.items.length === 2 && multi.items[1].prices.general.amount === 300, multi.items);

/* --- a sheet as rows --- */
const sheet = tableToList([["Domain", "DR", "General", "Casino"], ["alpha.com", 45, 300, 450], [], ["beta.es", 32, "€ 150", ""]]) + "\n\n" + tableToList([["Site", "Price"], ["delta.fr", 120]]);
const fromSheet = parseList(sheet);
caso("tableToList: header by column, DR ignored, blank row dropped", fromSheet.items.length === 3 && fromSheet.items[0].prices.general.amount === 300 && fromSheet.items[0].prices.casino.amount === 450 && !fromSheet.items[0].prices.crypto, fromSheet.items);
caso("tableToList: euro text cell", fromSheet.items[1].prices.general.amount === 150 && !fromSheet.items[1].prices.casino, fromSheet.items[1]);
caso("tableToList: second sheet header resets the columns", fromSheet.items[2].domain === "delta.fr" && fromSheet.items[2].prices.general.amount === 120, fromSheet.items[2]);

/* --- the database screen's filter, shared by page and Worker --- */
const prep = prepareRow({ "Type": " Broker ", "Domain": "x.com", "Webmaster Contact": "A@X.com", "Webmaster Extra Contact": "b@y.com", "Contact Name": "Ana", "Main Country": "Spain", "Domain Language": "Spanish", "Buying  Casino": "500" });
caso("prepareRow: type trimmed, search text has all four fields", prep._type === "Broker" && prep._q.includes("a@x.com") && prep._q.includes("b@y.com") && prep._q.includes("ana") && prep._q.includes("x.com"), prep);
const blank = prepareRow({ Domain: "y.com", Type: "" });
caso("filter: blank type", rowMatchesFilters(blank, { type: "-" }) && !rowMatchesFilters(prep, { type: "-" }) && rowMatchesFilters(prep, { type: "Broker" }));
caso("filter: country, language, niche", rowMatchesFilters(prep, { country: "Spain", lang: "Spanish", niche: "casino" }) && !rowMatchesFilters(prep, { niche: "cbd" }) && !rowMatchesFilters(prep, { country: "Italy" }));
caso("filter: search by extra contact, case-insensitive", rowMatchesFilters(prep, { q: "B@Y.COM" }) && !rowMatchesFilters(prep, { q: "nobody" }));
caso("filter: works on an unprepared row too", rowMatchesFilters({ Domain: "z.com", Type: "Publisher", "Webmaster Contact": "c@z.com" }, { type: "Publisher", q: "c@z" }));
const fac = facetsOf([prep, blank, prepareRow({ Domain: "w.com", "Main Country": "Spain", "Domain Language": "English" })]);
caso("facets: most frequent first", eq(fac.countries, ["Spain"]) && eq(fac.languages, ["Spanish", "English"]), fac);
caso("searchText equals prepared _q", searchText(prep) === prep._q);

/* --- optional: a real copy --- */
const ruta = process.argv[2];
if(ruta){
  const text = fs.readFileSync(ruta, "utf8");
  const rows = csvToObjects(text);
  const i2 = indexDatabase(rows, []);
  const dup = [...i2.byDomain.values()].filter(v => v.length > 1).length;
  const senders = [...i2.bySender.entries()].filter(([k]) => k).sort((a, b) => b[1].length - a[1].length).slice(0, 5);
  console.log(`real copy: ${rows.length} rows, ${i2.size} domains, ${dup} duplicated, top senders ${senders.map(([k, v]) => k + "=" + v.length).join(", ")}`);
  const bad = rows.filter(r => !normaliseDomain(r.Domain)).map(r => r.Domain);
  console.log(`domains not parsed: ${bad.length}${bad.length ? " e.g. " + JSON.stringify(bad.slice(0, 8)) : ""}`);
  const priceCol = Object.keys(rows[0]).find(k => /casino or betting|buying general/i.test(k));
  if(priceCol){
    const vals = rows.map(r => r[priceCol]).filter(Boolean);
    const unparsed = vals.filter(v => !parsePrice(v));
    console.log(`${priceCol}: ${vals.length} values, ${unparsed.length} not parsed${unparsed.length ? " e.g. " + JSON.stringify(unparsed.slice(0, 8)) : ""}`);
  }
}
function csvToObjects(text){
  const lines = text.replace(/\r/g, "").split("\n");
  const rows = []; let cur = []; let cell = ""; let q = false; let head = null;
  for(const line of lines){
    let i = 0;
    for(; i < line.length; i++){
      const ch = line[i];
      if(ch === '"'){ if(q && line[i + 1] === '"'){ cell += '"'; i++; } else q = !q; }
      else if(ch === "," && !q){ cur.push(cell); cell = ""; }
      else cell += ch;
    }
    if(q){ cell += "\n"; continue; }
    cur.push(cell); cell = "";
    if(!head) head = cur; else if(cur.length > 1) rows.push(Object.fromEntries(head.map((h, j) => [h, cur[j] ?? ""])));
    cur = [];
  }
  return rows;
}

/* --- offers to clients (Tim, 13/10) --- */
{
  caso("numberOf: plain, thousands, k and M suffixes, empty, text", numberOf(44) === 44 && numberOf("1,250") === 1250 && numberOf("18.2k") === 18200 && numberOf("1,2M") === 1200000 && numberOf("") === null && numberOf("n/a") === null, [numberOf("1,250"), numberOf("18.2k"), numberOf("1,2M")]);
  const rows = [
    prepareRow({ Domain: "a.com", "Ahrefs Domain Rating": 44, "Ahrefs Organic Traffic": "12k", "Buying Casino": 400, "Buying General": 300 }),
    prepareRow({ Domain: "b.com", "Ahrefs Domain Rating": "30", "Ahrefs Organic Traffic": 900, "Buying Casino": 250 }),
    prepareRow({ Domain: "c.com", "Buying Casino": "150 €" }),
    prepareRow({ Domain: "d.com", "Ahrefs Domain Rating": 60, "Ahrefs Organic Traffic": 50000, "Buying General": 120 })
  ];
  const hit = f => rows.filter(r => rowMatchesFilters(r, f)).map(r => r.Domain);
  caso("min DR keeps the rows at or above it and drops the unmeasured", JSON.stringify(hit({ minDr: 40 })) === JSON.stringify(["a.com", "d.com"]), hit({ minDr: 40 }));
  caso("min traffic reads the k suffix", JSON.stringify(hit({ minTraffic: 10000 })) === JSON.stringify(["a.com", "d.com"]), hit({ minTraffic: 10000 }));
  caso("an empty minimum is no filter", hit({ minDr: "", minTraffic: null }).length === 4);
  caso("minimum plus niche: priced for casino with DR 40+", JSON.stringify(hit({ minDr: 40, niche: "casino" })) === JSON.stringify(["a.com"]), hit({ minDr: 40, niche: "casino" }));
  const topical = [prepareRow({ Domain: "t1.com", "Website Topic": "Sports news" }), prepareRow({ Domain: "t2.com", "Website Topic": "Finance" }), prepareRow({ Domain: "t3.com" })];
  caso("topic filter: substring of Website Topic, case-insensitive, unset topics out", JSON.stringify(topical.filter(r => rowMatchesFilters(r, { topic: "sport" })).map(r => r.Domain)) === JSON.stringify(["t1.com"]) && topical.filter(r => rowMatchesFilters(r, { topic: "" })).length === 3);
  caso("sortRows dr: highest first, unmeasured last, source order kept otherwise", JSON.stringify(sortRows(rows, "dr").map(r => r.Domain)) === JSON.stringify(["d.com", "a.com", "b.com", "c.com"]), sortRows(rows, "dr").map(r => r.Domain));
  caso("sortRows price:casino: cheapest first, unpriced last", JSON.stringify(sortRows(rows, "price:casino").map(r => r.Domain)) === JSON.stringify(["c.com", "b.com", "a.com", "d.com"]), sortRows(rows, "price:casino").map(r => r.Domain));
  caso("sortRows with an unknown key keeps the order and copies the array", JSON.stringify(sortRows(rows, "x").map(r => r.Domain)) === JSON.stringify(rows.map(r => r.Domain)) && sortRows(rows, "") !== rows);
  caso("offerPrice: the niche's price as a number, null when none", offerPrice(rows[2], "casino") === 150 && offerPrice(rows[2], "general") === null);
  const o = rowForOffer(rows[0], { niche: "casino", comment: "homepage" });
  caso("rowForOffer: the offer's columns, metrics as numbers, the niche's price", JSON.stringify(Object.keys(o)) === JSON.stringify(OFFER_COLUMNS) && o.DR === 44 && o.Traffic === 12000 && o.Price === 400 && o.Comments === "homepage" && o.RD === "", o);
  caso("rowForOffer: yes/no per niche, sponsor tag and terms as the 2024 mastersheet", o.Casino === "Yes" && o.General === "Yes" && o.Crypto === "No" && o["Sponsor Tag"] === "No" && rowForOffer(prepareRow({ Domain: "e.com", "Sponsor Tag Type": "rel=sponsored", "Link Type": "Do follow", Placement: "permanent" }), {})["Sponsor Tag"] === "rel=sponsored" && rowForOffer(prepareRow({ Domain: "e.com", "Link Type": "Do follow", Placement: "permanent" }), {}).Placement === "permanent", o);
  caso("rowForOffer: a typed price wins over the sheet's", rowForOffer(rows[0], { niche: "casino", price: "350" }).Price === 350 && rowForOffer(rows[0], { niche: "casino", price: 0 }).Price === 0);
  caso("rowForOffer: no price for the niche leaves the cell empty", rowForOffer(rows[3], { niche: "casino" }).Price === "");
}

/* --- review of 16/10: the shapes that lost sites or invented prices --- */
{
  const doms = txt => parseList(txt).items.map(i => i.domain);
  const gen = txt => parseList(txt).items.map(i => i.prices.general ? i.prices.general.amount : null);
  caso("numbered list: 1. 2. 3.", eq(doms("1. alpha.com - 300 EUR\n2. beta.com - 250 EUR\n3. gamma.com - 200 EUR"), ["alpha.com", "beta.com", "gamma.com"]) && eq(gen("1. alpha.com - 300 EUR\n2. beta.com - 250 EUR"), [300, 250]), doms("1. alpha.com - 300 EUR\n2. beta.com - 250 EUR"));
  caso("numbered list: 1) 2)", eq(gen("1) alpha.com 300 EUR\n2) beta.com 250 EUR"), [300, 250]));
  caso("dash and asterisk bullets", eq(doms("- alpha.com 300 EUR\n* beta.com 250 EUR\n– gamma.com 200 EUR"), ["alpha.com", "beta.com", "gamma.com"]));
  const bullets = parseList("• alpha.com – 300€ (dofollow, permanent)\n• beta.com – 250€ (nofollow)");
  caso("bullet points: both sites, each with its own price and terms", eq(bullets.items.map(i => [i.domain, i.prices.general.amount, termsOf(i).linkType]), [["alpha.com", 300, "Do follow"], ["beta.com", 250, "No follow"]]), bullets.items);
  caso("em dash after the domain", eq(gen("alpha.com — 300 EUR"), [300]));
  const note = parseList("alpha.com (DR 45) - 300 EUR").items[0];
  caso("a note in brackets after the domain is kept, and read as a metric", note.domain === "alpha.com" && note.prices.general.amount === 300 && /DR 45/.test(note.terms) && metricsOf(note.terms).dr === 45, note);
  caso("domain in brackets and in curly quotes", eq(doms("(alpha.com) 300 EUR\n“beta.com” 250 EUR"), ["alpha.com", "beta.com"]));
  caso("normaliseDomain: markers and quotes", normaliseDomain("1. alpha.com").domain === "alpha.com" && normaliseDomain("• beta.com").domain === "beta.com" && normaliseDomain("«gamma.com»").domain === "gamma.com" && normaliseDomain("(delta.com)").domain === "delta.com" && normaliseDomain("1337.io").domain === "1337.io" && eq(normaliseDomain("rfi.ro (rfi.fr/ro)"), { domain: "rfi.ro", path: "" }));
  caso("several domains on one line, comma separated", eq(doms("alpha.com, beta.com, gamma.com: 300 EUR each"), ["alpha.com", "beta.com", "gamma.com"]) && eq(gen("alpha.com, beta.com, gamma.com: 300 EUR each"), [300, 300, 300]));
  /* The price on the domain's own line, not alone in its cell. */
  const own = s => parseList(s).items[0];
  caso("150 GBP + VAT", own("site-a.com - 150 GBP + VAT").prices.general.currency === "GBP" && own("site-a.com - 150 GBP + VAT").prices.general.amount === 150 && own("site-a.com - 150 GBP + VAT").terms === "+ VAT");
  const vat = own("site-b.de 120 EUR + VAT (dofollow, permanent)");
  caso("120 EUR + VAT (dofollow, permanent): price, and the terms read", vat.prices.general.amount === 120 && termsOf(vat).linkType === "Do follow" && termsOf(vat).placement === "permanent", vat);
  const two = own("site-c.net – 450 EUR casino / 250 EUR general");
  caso("450 EUR casino / 250 EUR general", two.prices.casino.amount === 450 && two.prices.general.amount === 250, two);
  const par = own("site-e.com - 300 EUR (casino 500 EUR)");
  caso("300 EUR (casino 500 EUR): general and casino", par.prices.general.amount === 300 && par.prices.casino.amount === 500, par);
  caso("300 EUR casino: casino only", own("site-f.com 300 EUR casino").prices.casino.amount === 300 && !own("site-f.com 300 EUR casino").prices.general);
  caso("300 € per article is general", own("site-g.com - 300 € per article").prices.general.amount === 300);
  caso("site | 300 EUR | 500 EUR on one line: general and casino", own("site-h.com | 300 EUR | 500 EUR").prices.general.amount === 300 && own("site-h.com | 300 EUR | 500 EUR").prices.casino.amount === 500);
  caso("a domain with no price at all still opens a group", eq(doms("site-z.com\n1. Articol SEO - 35 EUR"), ["site-z.com"]) && own("site-z.com\n1. Articol SEO - 35 EUR").prices.general.amount === 35);
  /* Signatures and phone numbers. */
  const sig = s => doms(`site-x.com 300 EUR\n${s}\nAnna Berg\nwww.anna-agency.example\nTel +46 70 123 45 67\nMobile: 0049 171 1234567`);
  for(const s of ["Med vänlig hälsning", "Liebe Grüße", "Mit besten Grüßen", "Cordiali saluti", "Bien cordialement", "Cumprimentos", "All the best", "Sincerely", "Warm regards", "Pozdrawiam", "Vriendelijke groet", "Hälsningar", "Best regards,", "Saludos cordiales"]) caso("sign-off ends the message: " + s, eq(sig(s), ["site-x.com"]), sig(s));
  caso("a sign-off is a short line: 'Thanks for your interest, here are our sites:' is not one", eq(doms("Thanks for your interest, here are our sites:\nalpha.com 300 EUR"), ["alpha.com"]));
  const phone = parseList("site-y.com 300 EUR\nour-agency.example\nTel. 0049 171 1234567\nContact: +34 600 123 456");
  caso("phone numbers are not prices, even without a sign-off", phone.items.every(i => !i.prices.general || i.prices.general.amount === 300), phone.items);
  caso("bareNotPrice: phone line, long number, leading zero, year; a priced cell is a price", bareNotPrice("123", "Tel +46 70 123 45 67") && bareNotPrice("1234567", "x") && bareNotPrice("0049", "x") && bareNotPrice("2024", "x") && !bareNotPrice("300", "site.com 300") && !bareNotPrice("€ 1,200.00", "x") && !bareNotPrice("1,200.00", "x"));
  const year = own("site-q.com 2024 300 EUR");
  caso("a year on the line is not the price", year.prices.general.amount === 300 && /2024/.test(year.terms), year);
  /* Separator per line: a table and prose in one text. */
  const mixed = parseList("Domain\tCasino\tGeneral\nalpha.com\t300\t200\nbeta.com\t350\t250\n\nAnd two more:\ngamma.com - 300 EUR\ndelta.com - 250 EUR");
  caso("tab rows and prose lines in one text: all four sites", eq(mixed.items.map(i => i.domain), ["alpha.com", "beta.com", "gamma.com", "delta.com"]) && mixed.items[0].prices.casino.amount === 300 && mixed.items[2].prices.general.amount === 300, mixed.items);
  caso("a comma inside brackets or in prose is not a CSV separator", eq(gen("a.com - 300 EUR (dofollow, permanent)\nb.com - 250 EUR (dofollow, permanent)"), [300, 250]));
  /* Terms. */
  caso("marked as sponsored: the tag, no Admin Comments entry", termsOf({ terms: "dofollow, permanent, marked as sponsored", prices: {} }).sponsorTag === "rel=sponsored" && termsOf({ terms: "dofollow, permanent, marked as sponsored", prices: {} }).adminComments.length === 0);
  caso("marked as Werbung still gives Marked by WM and the comment", termsOf({ terms: "marked as Werbung", prices: {} }).sponsorTag === "Marked by WM" && eq(termsOf({ terms: "marked as Werbung", prices: {} }).adminComments, ['Marked as "Werbung"']));
  /* TLD. */
  caso("tldOf: registrable suffix", tldOf("blog.example.com") === ".com" && tldOf("example.co.uk") === ".co.uk" && tldOf("news.example.co.uk") === ".co.uk" && tldOf("gamma.net") === ".net" && tldOf("site.com.br") === ".com.br");
  caso("rowForAccept TLD of a subdomain", rowForAccept({ domain: "blog.example.com", prices: {} }).TLD === ".com");
  /* Offers: the sell price first. */
  const sellRow = prepareRow({ Domain: "s.com", "Buying Casino": 400, Casino: 800, "Buying General": 300 });
  caso("offerPriceOf: our sell price when the database has it, the cost price only as fallback", eq(offerPriceOf(sellRow, "casino"), { amount: 800, source: "sell" }) && eq(offerPriceOf(sellRow, "general"), { amount: 300, source: "buy" }) && offerPriceOf(sellRow, "cbd") === null && offerPrice(sellRow, "casino") === 800);
  caso("rowForOffer uses the sell price", rowForOffer(sellRow, { niche: "casino" }).Price === 800 && rowForOffer(sellRow, { niche: "general" }).Price === 300);
  caso("a sell column at 0 or empty falls back to the cost price", offerPriceOf(prepareRow({ Domain: "z.com", "Buying Casino": 400, Casino: 0 }), "casino").source === "buy" && offerPriceOf(prepareRow({ Domain: "z.com", "Buying Casino": 400, Casino: "" }), "casino").amount === 400);
  /* Our own domain, quoted under theirs, is never a site. */
  caso("our quoted signature is not a site", eq(doms("site-w.com 300 EUR\nOn 5 Oct 2026 Mauro wrote:\n> Mauro Fernandez\n> linkjuiceclub.com"), ["site-w.com"]));
}

console.log(`${casos - fallos} of ${casos} checks passed`);
process.exit(fallos ? 1 : 0);
