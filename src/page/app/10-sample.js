/* ---------- sample database (2026 layout, marked rows are examples) ---------- */
const SAMPLE_DB = [
  r("Publisher","sternmagazin.example","redaktion@sternmagazin.example","",{general:"99",casino:"249",cbd:"170",crypto:"170"},"dofollow","Guest post","permanent","Example row: same prices as the list"),
  r("Publisher","nordlicht-magazin.example","redaktion@sternmagazin.example","",{general:"99",casino:"199",cbd:"150",crypto:"150"},"dofollow","Guest post","permanent","Example row: casino and CBD were cheaper"),
  r("Broker","alpenblick-news.example","deals@linkdealers.example","Max",{general:"149",casino:"349"},"dofollow","Guest post","31/12/2026","Example row from a broker"),
  r("Publisher","technikwelt.example","redaktion@technikwelt.example","Petra",{general:"99",casino:"449",cbd:"249",crypto:"249"},"dofollow","Guest post","permanent","Example row"),
  r("Publisher","fussball-arena.example","jof@fussball-arena.example","Jozef",{casino:"400",general:"300"},"dofollow","Guest post","permanent","Example row"),
  r("Broker","deals-a.example","deals@linkdealers.example","Max",{general:"120"},"dofollow","Link insertion","permanent","Example row"),
  r("Broker","deals-b.example","deals@linkdealers.example","Max",{general:"120"},"dofollow","Link insertion","permanent","Example row"),
  r("Broker","deals-c.example","deals@linkdealers.example","Max",{general:"120"},"dofollow","Link insertion","permanent","Example row")
];
const SAMPLE_REMOVED = [ r("Publisher","rheinreport.example","redaktion@sternmagazin.example","",{general:"89"},"dofollow","Guest post","permanent","Example: removed, thin content") ];
function r(type, domain, mail, name, buying, tag, link, validity, comment){
  const row = Object.fromEntries(DB_COLUMNS.map(c => [c, ""]));
  row.Type = type; row.Domain = domain; row.TLD = "." + domain.split(".").slice(1).join(".");
  row["Webmaster Contact"] = mail; row["Contact Name"] = name;
  for(const k in buying) row[BUYING_COLUMN[k]] = buying[k];
  row["Sponsor Tag Type"] = tag; row["Link Type"] = link; row["Price Validity"] = validity;
  row["Admin Comments"] = comment; row["Last Updated"] = "05/10/2026";
  return row;
}

/* An example list in the shape of a real one (33 sites on one line, a
   German header, prices as "99 € / 269 € / 180 €"). The sites and the
   sender are invented: the page is public. */
const STAR = `Unsere verfügbaren Webseiten und Preise (Allgemein / Glücksspiel / Vape-CBD-Crypto):
nordlicht-magazin.example 99 € / 269 € / 180 € · alpenblick-news.example 99 / 249 / 170 · rheinreport.example 89 / 249 / 170 · stadtgefluester.example 99 / 249 / 170 · sternmagazin.example 99 € / 249 € / 170 € · glanzpost.example 88 / 249 / 170 · klartextblog.example 89 / 239 / 160 · tagesglanz.example 99 / 269 / 180 · kurierwelt.example 95 / 249 / 170 · denkraum.example 88 / 239 / 160 · blickpunkt-insider.example 99 / 259 / 180 · promiradar.example 95 / 269 / 180 · weltschau.example 88 / 239 / 160 · neuzeit-magazin.example 99 / 259 / 170 · wissenswert.example 89 / 249 / 160 · blickreport.example 95 / 269 / 180 · technikwelt.example 99 / 449 / 249 · insiderpost.example 99 / 449 / 249 · tagesblatt-online.example 99 / 400 / 200 · heutejournal.example 99 / 349 / 249 · wochenmagazin.example 99 / 349 / 220 · publikum-news.example 99 / 349 / 170 · jetmagazin.example 99 / 249 / 170 · smartjournal.example 99 / 249 / 170 · netzheute.example 99 / 249 / 170 · reportwelt.example 99 / 249 / 170 · presseradar.example 99 / 249 / 170 · visionsblatt.example 99 / 249 / 170 · lebensreport.example 99 / 249 / 170 · flashnews.example 99 / 249 / 170 · themenkern.example 99 / 249 / 170 · fokusprima.example 99 / 249 / 170 · biowissen-at.example 99 / 400 / 200

Unsere Leistungen: Dauerhafte Veröffentlichung von Gastbeiträgen · Do-Follow-Links · Verschiedene Nischen, darunter Krypto, Gambling, CBD und Vape`;
