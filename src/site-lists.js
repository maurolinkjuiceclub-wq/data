/* Site lists: parse what a publisher or broker sends, match it against the
   database, group the result. Plain ES module, no DOM, no network: the Worker
   imports it to answer lookups and the desk inlines it for the Lists tab.
   Tests: node scripts/probar-listas.mjs

   Vocabulary (BRIEF.md):
   - an OFFER is the buying price per niche plus terms; the sell price is not
     touched here;
   - the DATABASE is the "Import Database" tab, one row per domain, plus the
     "removed sites" tab, which is an exclusion list;
   - matching is by normalised domain; several senders for one domain is the
     normal case. */

/* ---------- domains ---------- */

/* Registrable domain of whatever a person pasted: a URL, "www.x.com/path",
   "X.COM", "x.com/es" (the Latam copy keeps language paths; they are kept as
   `path` and dropped from `domain`). Returns null when it is not a domain. */
export function normaliseDomain(raw){
  if(raw == null) return null;
  let s = String(raw).trim().toLowerCase();
  if(!s) return null;
  s = s.replace(/^[\s"'<(\[]+|[\s"'>)\]:;,.]+$/g, "");
  s = s.replace(/^(?:https?:)?\/\//, "");
  s = s.replace(/^www\d?\./, "");
  const cut = s.search(/[\/?#\s]/);
  let path = "";
  if(cut >= 0){ path = s.slice(cut); s = s.slice(0, cut); }
  s = s.replace(/:\d+$/, "");
  if(s.startsWith("mailto:") || s.includes("@")) return null;
  if(!/^[\p{L}\p{N}][\p{L}\p{N}.-]*\.[\p{L}]{2,}$/u.test(s)) return null;
  if(s.includes("..")) return null;
  return { domain: s, path: path.replace(/\/+$/, "") };
}

/* ---------- prices ---------- */

const CURRENCY = { "€": "EUR", "eur": "EUR", "euro": "EUR", "euros": "EUR", "$": "USD", "usd": "USD", "£": "GBP", "gbp": "GBP" };

/* "€ 400.00", "€ 9,999.99", "€ 99,99", "$999.99", "400€", "EUR 400",
   "400 eur", "1.200,00 €". Returns {amount, currency, text} or null.
   The currency defaults to EUR only when a bare number is given, because
   Gary (06/10) says every price in the database is EUR. */
export function parsePrice(raw){
  if(raw == null) return null;
  const text = String(raw).trim();
  if(!text) return null;
  const m = text.match(/(€|\$|£|\beur(?:os?)?\b|\busd\b|\bgbp\b)?\s*(\d[\d.,\s]*\d|\d)\s*(€|\$|£|\beur(?:os?)?\b|\busd\b|\bgbp\b)?/i);
  if(!m) return null;
  const cur = CURRENCY[(m[1] || m[3] || "").toLowerCase()] || "EUR";
  let num = m[2].replace(/\s/g, "");
  /* Decide which separator is decimal: the last one, if followed by exactly
     two digits; otherwise all separators are thousands. */
  const last = Math.max(num.lastIndexOf(","), num.lastIndexOf("."));
  if(last >= 0 && num.length - last - 1 === 2){
    num = num.slice(0, last).replace(/[.,]/g, "") + "." + num.slice(last + 1);
  }else{
    num = num.replace(/[.,]/g, "");
  }
  const amount = Number(num);
  if(!isFinite(amount)) return null;
  return { amount, currency: cur, text };
}

/* True when the cell is a price and nothing else: "€ 400.00", "400 eur",
   "1.200,00 €". "Prices valid until 31.12.2026" or "DR 45" are not. */
export function isPriceCell(raw){
  const text = String(raw || "").trim();
  if(!text || !parsePrice(text)) return false;
  const rest = text.replace(/€|\$|£|\beur(?:os?)?\b|\busd\b|\bgbp\b/gi, "").replace(/[\d.,\s]/g, "");
  return rest === "";
}

/* ---------- niches ---------- */

/* The seven Buying columns of the database, and the words lists use for them. */
export const NICHES = ["casino", "unlicensedCasino", "crypto", "forex", "cbd", "dating", "general"];
const NICHE_WORDS = [
  ["unlicensedCasino", /unlicen[cs]ed|sin licencia|offshore|curacao/i],
  ["casino", /casino|gambling|gl[üu]cksspiel|betting|wetten|apuestas|igaming|poker|slots?|juego/i],
  ["crypto", /crypto|cripto|krypto|bitcoin|blockchain/i],
  ["forex", /forex|trading|finance|finanzen|finanzas/i],
  ["cbd", /\bcbd\b|cannabis|hemp|vape|hanf/i],
  ["dating", /dating|adult|citas/i],
  ["general", /general|allgemein|mainstream|normal|standard|regular|price|precio|preis|cost/i]
];
export function nicheOf(header){
  return nichesOf(header)[0] || null;
}
/* Every niche a header names, in the order they appear: "Vape-CBD-Crypto"
   is [cbd, crypto] and a price under it fills both Buying columns. */
export function nichesOf(header){
  const h = String(header || "");
  return NICHE_WORDS.map(([niche, re]) => { const m = re.exec(h); return m ? [m.index, niche] : null; })
    .filter(Boolean).sort((a, b) => a[0] - b[0]).map(x => x[1]);
}

/* ---------- parsing a list ---------- */

/* Splits pasted text into rows of cells. Tabs, then ";", then "," when a
   line has them; otherwise whitespace runs. */
function splitRows(text){
  /* Lists pasted from an email often put every site on one line, separated
     by " · " or " ; ". Those become rows first. */
  const flat = String(text || "").replace(/\r/g, "").replace(/\s[·•|]\s|\s;\s/g, "\n");
  const lines = flat.split("\n").map(l => l.trim()).filter(Boolean);
  const sep = lines.some(l => l.includes("\t")) ? "\t" : lines.filter(l => l.includes(";")).length > lines.length / 2 ? ";" : lines.filter(l => l.includes(",")).length > lines.length / 2 ? "," : null;
  return lines.map(l => (sep ? splitCsvLine(l, sep) : l.split(/\s{2,}|\s[-–\/:]\s|\s+(?=[€$£]?\s?\d)/)).map(c => c.trim()).filter(Boolean));
}
function splitCsvLine(line, sep){
  const out = []; let cur = ""; let q = false;
  for(let i = 0; i < line.length; i++){
    const ch = line[i];
    if(ch === '"'){ if(q && line[i + 1] === '"'){ cur += '"'; i++; } else q = !q; }
    else if(ch === sep && !q){ out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/* A list in, items out. Each item: {domain, path, raw, prices:{niche:{amount,
   currency,text}}, terms, line}. `terms` keeps the words that are neither a
   domain nor a price ("do follow, permanent", "sponsored tag").
   A header row (no domain, niche words) names the price columns. Without a
   header, the first price on a line is `general`, the second `casino`. */
export function parseList(text){
  const rows = splitRows(text);
  const items = [];
  const skipped = [];
  let columns = null;   /* niche per cell index, when the header names the domain column */
  let order = null;     /* niches in order of the prices, when it does not ("General / Casino / CBD") */
  rows.forEach((cells, i) => {
    const domIdx = cells.findIndex(c => normaliseDomain(c));
    if(domIdx < 0){
      const niches = cells.map(nicheOf);
      if(niches.some(Boolean) && !columns && !order){
        if(cells.some(c => /domain|dominio|site|web|url/i.test(c) && !nicheOf(c))) columns = niches;
        else order = cells.map(nichesOf).filter(a => a.length);
        return;
      }
      skipped.push({ line: i + 1, text: cells.join(" ") });
      return;
    }
    const d = normaliseDomain(cells[domIdx]);
    const prices = {};
    const terms = [];
    let nth = 0;
    cells.forEach((c, j) => {
      if(j === domIdx) return;
      /* Without a header a bare one- or two-digit number is more likely a
         metric (DR 45) than a price; with a header the position decides. */
      const guessing = !columns && !order;
      const p = isPriceCell(c) && !(guessing && /^\d{1,2}$/.test(c.trim())) ? parsePrice(c) : null;
      if(p){
        /* A header decides the niche: by column when it names the domain
           column, by position otherwise. Without a header the first price is
           general and the second casino; a third is kept as a term. */
        const target = columns ? columns[j] : order ? order[nth] : (nth === 0 ? "general" : nth === 1 ? "casino" : null);
        nth++;
        const niches = Array.isArray(target) ? target : target ? [target] : [];
        const free = niches.filter(n => !prices[n]);
        if(free.length) free.forEach(n => { prices[n] = p; });
        else terms.push(c);
      }else if(c){
        terms.push(c);
      }
    });
    items.push({ domain: d.domain, path: d.path, raw: cells[domIdx], prices, terms: terms.join(" | "), line: i + 1 });
  });
  return { items, skipped, columns: columns || (order ? order.map(a => a.join("+")) : null) };
}

/* ---------- the database side ---------- */

/* Column names of "Import Database" as the sheet has them (06/10). */
export const DB_COLUMNS = ["Type", "TLD", "Domain", "Webmaster Contact", "Webmaster Extra Contact", "Contact Name", "IP Address",
  "Ahrefs DR", "Ahrefs Referring Domains", "Ahrefs Organic Traffic", "Ahrefs URL Rating", "Ahrefs Top 3 Keywords", "Ahrefs Top 4-10 Keywords",
  "Majestic TF", "Majestic CF", "MOZ Spam Score", "MOZ DA", "Semrush AS", "TF/CF", "RD/OT",
  "Buying Casino", "Buying Unlicensed Casino", "Buying Crypto", "Buying Forex", "Buying CBD", "Buying Dating", "Buying General",
  "Casino", "Unlicensed Casino", "Crypto", "Forex", "CBD", "Dating", "General",
  "Sponsor Tag Type", "Link Type", "Placement", "Price Validity", "Admin Comments", "User Comments", "Last Updated",
  "Main Country", "Main Country Traffic", "Domain Language", "Website Topic"];
export const BUYING_COLUMN = { casino: "Buying Casino", unlicensedCasino: "Buying Unlicensed Casino", crypto: "Buying Crypto", forex: "Buying Forex", cbd: "Buying CBD", dating: "Buying Dating", general: "Buying General" };

/* The contact column: "Webmaster Contact" in 2026, "Contact email" in the
   2024 copies. */
export function senderOf(row){
  return String(row["Webmaster Contact"] || row["Contact email"] || row.email || "").trim().toLowerCase();
}

/* Builds the lookup from rows ({column: value} objects, as the Worker reads
   them). `removed` are the rows of the "removed sites" tab. Several rows may
   share a domain: all are kept. */
export function indexDatabase(rows, removed){
  const byDomain = new Map();
  const bySender = new Map();
  const add = (map, k, v) => { if(!k) return; const a = map.get(k); if(a) a.push(v); else map.set(k, [v]); };
  (rows || []).forEach((r, i) => {
    const d = normaliseDomain(r.Domain || r.domain);
    if(!d) return;
    add(byDomain, d.domain, { row: r, index: i });
    add(bySender, senderOf(r), d.domain);
  });
  const removedSet = new Map();
  (removed || []).forEach((r, i) => {
    const d = normaliseDomain(r.Domain || r.domain);
    if(d) add(removedSet, d.domain, { row: r, index: i });
  });
  return { byDomain, bySender, removed: removedSet, size: byDomain.size };
}

/* Compares an item's prices with the row's Buying columns. Returns the list
   of niches with a difference, each {niche, offered, inDatabase}. A price the
   list does not mention is not a difference. */
export function priceDiff(item, row){
  const diffs = [];
  for(const niche of NICHES){
    const offered = item.prices[niche];
    if(!offered) continue;
    const have = parsePrice(row[BUYING_COLUMN[niche]]);
    if(!have || have.amount !== offered.amount || have.currency !== offered.currency){
      diffs.push({ niche, offered, inDatabase: have });
    }
  }
  return diffs;
}

/* Matches a parsed list against the index. Groups:
   - unchanged: in the database, every offered price equal;
   - changed: in the database, at least one price differs (or none recorded);
   - unknown: not in the database;
   - removed: in "removed sites" (shown apart, never written as new).
   `sender` is the email the list came from; when the database already has it
   on `brokerHintAt` or more domains, `brokerHint` is set on every item. */
export function matchList(items, index, { sender, brokerHintAt = 10 } = {}){
  const groups = { unchanged: [], changed: [], unknown: [], removed: [] };
  const mail = String(sender || "").trim().toLowerCase();
  const known = mail ? (index.bySender.get(mail) || []).length : 0;
  const brokerHint = known >= brokerHintAt ? known : 0;
  for(const item of items){
    const hit = index.byDomain.get(item.domain) || [];
    const gone = index.removed.get(item.domain) || [];
    const base = { item, rows: hit.map(h => h.row), rowIndexes: hit.map(h => h.index), brokerHint };
    if(gone.length){ groups.removed.push({ ...base, removedRows: gone.map(g => g.row) }); continue; }
    if(!hit.length){ groups.unknown.push(base); continue; }
    const diffs = hit.map(h => priceDiff(item, h.row));
    const allEqual = diffs.every(d => d.length === 0);
    if(allEqual) groups.unchanged.push({ ...base, diffs });
    else groups.changed.push({ ...base, diffs, sameSender: !!mail && hit.some(h => senderOf(h.row) === mail) });
  }
  return groups;
}

/* ---------- the row that Accept writes ---------- */

/* Builds a full row (array in DB_COLUMNS order) for an unknown domain the
   person accepted, or the changed cells for a known one. Only Buying columns,
   terms, contact and bookkeeping are filled; metrics stay empty for the team.
   `who` is the desk user's email, `listLabel` names the list ("starmagazines
   05/10"). Nothing here touches the sheet: the Worker does, on Accept. */
export function rowForAccept(item, { type = "Publisher", sender = "", contactName = "", who = "", listLabel = "", today = new Date() } = {}){
  const d = String(today.getDate()).padStart(2, "0"), m = String(today.getMonth() + 1).padStart(2, "0"), y = today.getFullYear();
  const row = Object.fromEntries(DB_COLUMNS.map(c => [c, ""]));
  row.Type = type;
  row.Domain = item.domain;
  row.TLD = "." + item.domain.split(".").slice(1).join(".");
  row["Webmaster Contact"] = sender;
  row["Contact Name"] = contactName;
  for(const niche of NICHES){
    const p = item.prices[niche];
    if(p) row[BUYING_COLUMN[niche]] = formatPrice(p);
  }
  const t = item.terms.toLowerCase();
  row["Sponsor Tag Type"] = /no-?follow/.test(t) ? "nofollow" : /sponsored/.test(t) ? "sponsored" : /do-?\s?follow|dofollow/.test(t) ? "dofollow" : "";
  row["Link Type"] = /insert|niche edit|link insertion|inserci/.test(t) ? "Link insertion" : /guest|art[ií]culo|article|post/.test(t) ? "Guest post" : "";
  row["Placement"] = /home\s?page|portada/.test(t) ? "Homepage" : "";
  const until = t.match(/valid(?:o|a)?s?\s*(?:until|hasta|till)\s*([\d.\/-]+)/);
  row["Price Validity"] = until ? until[1] : /permanent|permanente/.test(t) ? "permanent" : "";
  row["Admin Comments"] = [who && `Accepted by ${who}`, listLabel && `from list ${listLabel}`, item.terms && `terms: ${item.terms}`].filter(Boolean).join("; ");
  row["Last Updated"] = `${d}/${m}/${y}`;
  return row;
}

/* The database writes prices as text, "€ 400.00" in the 2024 copy. */
export function formatPrice(p){
  const sym = p.currency === "USD" ? "$" : p.currency === "GBP" ? "£" : "€";
  return `${sym} ${p.amount.toFixed(2)}`;
}
