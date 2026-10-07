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
import { normaliseDomain, parsePrice, parseList, indexDatabase, matchList, rowForAccept, nicheOf, DB_COLUMNS, headerKey, normaliseRow, FIXED } from "../src/site-lists.js";

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
caso("row user comment traces the accept", fila["User Comments"] === "Accepted by mauro@linkjuiceclub.com; from list gamma 06/10", fila["User Comments"]);
caso("row admin comments only fixed phrases", fila["Admin Comments"] === "", fila["Admin Comments"]);
const filaBeta = rowForAccept(beta, {});
caso("row validity date", filaBeta["Price Validity"] === "31.12.2026", filaBeta["Price Validity"]);
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

console.log(`${casos - fallos} of ${casos} checks passed`);
process.exit(fallos ? 1 : 0);
