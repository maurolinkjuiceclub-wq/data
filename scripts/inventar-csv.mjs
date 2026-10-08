#!/usr/bin/env node
/* Writes an invented CSV in the 2026 layout of "Import Database", for
   measuring the page with a sheet-sized file. Deterministic: the same rows
   every run. Nothing in it is real. The measurements in BRIEF.md ("Database
   screen", 08/10) were taken with the default 103,393 rows.

   Usage:  node scripts/inventar-csv.mjs [rows] [out.csv]
           default 103393 rows to ./full.csv (gitignored) */
import fs from "node:fs";

const N = parseInt(process.argv[2] || "103393", 10);
const OUT = process.argv[3] || "full.csv";
const cols = ["Type", "TLD", "Domain", "Webmaster Contact", "Webmaster Extra Contact", "Contact Name", "IP Address",
  "Ahrefs \nDomain Rating", "Ahrefs \nReferring Domains", "Ahrefs \nOrganic Traffic", "Ahrefs \nURL Rating", "Ahrefs\nTop 3 Keywords", "Ahrefs\nTop 4-10 Keywords",
  "Majestic\nTrust Flow", "Majestic\nCitation Flow", "MOZ\nSpam Score", "MOZ\nDomain Authority", "Semrush \nAuthority Score", "TF / CF", "RD / OT",
  "Buying Casino", "Buying Unlicensed Casino", "Buying Crypto", "Buying Forex", "Buying CBD", "Buying Dating", "Buying General",
  "Casino", "Unlicensed \nCasino", "Crypto", "Forex", "CBD", "Dating", "General",
  "Sponsor Tag Type", "Link Type", "Placement", "Price Validity", "Admin Comments", "User Comments", "Last Updated",
  "Main Country", "Main Country Traffic", "Domain Language", "Website Topic"];
const q = s => '"' + String(s).replace(/"/g, '""') + '"';
const C = ["Spain", "Germany", "Argentina", "France", "Italy", "United Kingdom", "Mexico", "Netherlands", "Sweden", "Poland"];
const L = ["Spanish", "German", "English", "French", "Italian", "Dutch", "Swedish", "Polish"];
const T = ["News / Magazine", "Business / Finance", "Other / General", "Sports / General", "Entertainment / Gaming"];
const out = fs.createWriteStream(OUT);
out.write(cols.map(q).join(",") + "\n");
for(let i = 0; i < N; i++){
  const r = new Array(cols.length).fill("");
  r[0] = i % 9 === 0 ? "Broker" : (i % 13 === 0 ? "" : "Publisher"); r[1] = ".example"; r[2] = "site-" + i + ".example";
  r[3] = "wm" + (i % 4000) + "@mail.example"; r[5] = "Name " + (i % 700); r[6] = "10.0." + (i % 255) + "." + (i % 200);
  r[7] = i % 90; r[8] = i % 5000; r[9] = i % 90000; r[13] = i % 60; r[14] = i % 70; r[18] = (i % 120) + "%"; r[19] = (i % 300) + "%";
  r[20] = i % 3 ? 100 + i % 900 : ""; r[22] = i % 4 ? 90 + i % 500 : ""; r[26] = 60 + i % 400; r[27] = i % 3 ? 200 + i % 900 : ""; r[33] = 120 + i % 400;
  r[34] = i % 5 === 0 ? "rel=sponsored" : ""; r[35] = "Do follow"; r[36] = i % 2 ? "permanent" : "1 Year"; r[37] = i % 7 === 0 ? "Fixed" : "";
  r[38] = i % 11 === 0 ? "Unlicensed Casinos Accepted" : ""; r[40] = "0" + (1 + i % 9) + "/0" + (1 + i % 9) + "/2026";
  r[41] = C[i % 10]; r[42] = i % 50000; r[43] = L[i % 8]; r[44] = T[i % 5];
  out.write(r.map(q).join(",") + "\n");
}
out.end(() => console.log(`wrote ${OUT}: ${N} rows, ${cols.length} columns`));
