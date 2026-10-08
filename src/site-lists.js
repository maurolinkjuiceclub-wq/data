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
  /* A path starts at "/", "?" or "#". Whitespace means this is prose, not a
     domain ("b.com - 300 EUR"). */
  const cut = s.search(/[\/?#]/);
  let path = "";
  if(cut >= 0){ path = s.slice(cut); s = s.slice(0, cut); }
  if(/\s/.test(s)) return null;
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

/* A price anywhere in a sentence, when the currency is next to the number:
   "35 EUR + TVA", "costs € 400 per article", "100€/post". Null when the
   line only has bare numbers (a bare number in prose is rarely a price). */
export function findPrice(line){
  const m = String(line || "").match(/(€|\$|£|\beur(?:os?)?\b|\busd\b|\bgbp\b)\s*(\d[\d.,]*\d|\d)|(\d[\d.,]*\d|\d)\s*(€|\$|£|\beur(?:os?)?\b|\busd\b|\bgbp\b)/i);
  if(!m) return null;
  const p = parsePrice(m[0]);
  return p ? { ...p, text: m[0] } : null;
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
  const prose = l => l.split(/\s{2,}|\s[-–\/:]\s|\s+(?=[€$£]?\s?\d)/);
  return lines.map(l => {
    if(!sep) return prose(l).map(c => c.trim()).filter(Boolean);
    /* A comma-separated line is usually a CSV row, but "a.com, b.com - 300
       EUR" is prose with a comma: a cell that is neither a domain nor a
       price is split again like prose. */
    return splitCsvLine(l, sep).map(c => c.trim()).filter(Boolean)
      .flatMap(c => (sep !== "\t" && !normaliseDomain(c) && !isPriceCell(c) && /\s/.test(c)) ? prose(c).map(x => x.trim()).filter(Boolean) : [c]);
  });
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
  let group = [];       /* domains named on a line without prices; the price lines below belong to them */
  let signedOff = false;
  rows.forEach((cells, i) => {
    const line = cells.join(" ");
    /* After "Thanks," / "Best regards" / "Multumesc" what follows is a
       signature: its domain and phone are not an offer. */
    if(signedOff){ skipped.push({ line: i + 1, text: line }); return; }
    if(SIGN_OFF.test(line) && !cells.some(c => normaliseDomain(c))){ signedOff = true; skipped.push({ line: i + 1, text: line }); return; }
    const domIdxs = cells.map((c, j) => normaliseDomain(c) ? j : -1).filter(j => j >= 0);
    const priceIdxs = cells.map((c, j) => isPriceCell(c) && !/^\d{1,2}$/.test(c.trim()) ? j : -1).filter(j => j >= 0);
    const inlinePrices = priceIdxs.length ? priceIdxs : (!columns && !order ? [] : priceIdxs);
    if(!domIdxs.length){
      const niches = cells.map(nicheOf);
      /* A header names niches and carries no price. One that also names the
         domain column maps by index and may appear again (a second sheet);
         one that does not maps by position and is taken once. */
      const namesDomain = cells.some(c => /domain|dominio|site|web|url/i.test(c) && !nicheOf(c));
      if(niches.some(Boolean) && !priceIdxs.length && (namesDomain || (!columns && !order && !group.length))){
        if(namesDomain){ columns = niches; order = null; }
        else order = cells.map(nichesOf).filter(a => a.length);
        return;
      }
      /* A price line under a group of domains: "1. Articol SEO - 35 EUR",
         "Bet / Casino - 100 EUR + TVA". The niche comes from the words on
         the line, general when none; the first price per niche wins. */
      const inProse = group.length && !priceIdxs.length ? findPrice(line) : null;
      if(group.length && (priceIdxs.length || inProse)){
        const p = priceIdxs.length ? parsePrice(cells[priceIdxs[0]]) : inProse;
        const found = nichesOf(line).filter(n => n !== "general");
        const niches = found.length ? found : ["general"];
        for(const it of group){
          niches.forEach(n => { if(!it.prices[n]) it.prices[n] = p; });
          it.terms = [it.terms, line].filter(Boolean).join(" | ");
        }
        return;
      }
      if(group.length && !priceIdxs.length && /dofollow|do-?follow|nofollow|permanent|pe viata|lifetime|marcat|marked|sponsored|valid/i.test(line)){
        for(const it of group) it.terms = [it.terms, line].filter(Boolean).join(" | ");
        skipped.push({ line: i + 1, text: line });   /* also a list-wide statement */
        return;
      }
      skipped.push({ line: i + 1, text: line });
      return;
    }
    /* Domains with no price on their line open a group. */
    if(!priceIdxs.length){
      group = domIdxs.map(j => {
        const d = normaliseDomain(cells[j]);
        const it = { domain: d.domain, path: d.path, raw: cells[j], prices: {}, terms: "", line: i + 1 };
        items.push(it); return it;
      });
      return;
    }
    group = [];
    const guessing = !columns && !order;
    const made = domIdxs.map(j => { const d = normaliseDomain(cells[j]); return { domain: d.domain, path: d.path, raw: cells[j], prices: {}, terms: "", line: i + 1 }; });
    const terms = [];
    let nth = 0;
    cells.forEach((c, j) => {
      if(domIdxs.includes(j)) return;
      const p = isPriceCell(c) && !(guessing && /^\d{1,2}$/.test(c.trim())) ? parsePrice(c) : null;
      if(p){
        /* A header decides the niche: by column when it names the domain
           column, by position otherwise. Without a header the first price is
           general and the second casino; a third is kept as a term. */
        const target = columns ? columns[j] : order ? order[nth] : (nth === 0 ? "general" : nth === 1 ? "casino" : null);
        nth++;
        const niches = Array.isArray(target) ? target : target ? [target] : [];
        let used = false;
        for(const it of made){
          const free = niches.filter(n => !it.prices[n]);
          if(free.length){ free.forEach(n => { it.prices[n] = p; }); used = true; }
        }
        if(!used) terms.push(c);
      }else if(c){
        terms.push(c);
      }
    });
    made.forEach(it => { it.terms = terms.join(" | "); items.push(it); });
  });
  /* A domain named without any price, and nothing below it, stays as an
     item with no price: the person sees it and decides. */
  return { items, skipped, columns: columns || (order ? order.map(a => a.join("+")) : null) };
}
const SIGN_OFF = /^(thanks|thank you|many thanks|best|best regards|kind regards|regards|cheers|saludos|gracias|un saludo|atentamente|multumesc|mulțumesc|cu stima|mit freundlichen|viele grüße|beste grüße|lg|cordialement|met vriendelijke|vänliga hälsningar|mvh)\b/i;

/* A sheet read as rows of cells (SheetJS sheet_to_json with header: 1, or
   any 2D array) becomes the tab-separated text parseList reads. Empty rows
   are dropped; numbers keep their value. Several sheets are joined, each
   with a blank line between them; each sheet's own header row resets the
   column mapping. No title line: "Sheet: Prices" would read as a header. */
export function tableToList(rows){
  const lines = (rows || []).map(r => (r || []).map(c => c == null ? "" : String(c).replace(/\t|\n/g, " ").trim()).join("\t")).filter(l => l.replace(/\t/g, "").trim());
  return lines.join("\n");
}

/* ---------- the database side ---------- */

/* Column names of "Import Database" as the sheet has them, read through the
   Drive connector on 07/10/2026. In the sheet several carry a line break or
   a double space ("Ahrefs \nDomain Rating", "Unlicensed \nCasino"); here they
   are written in one line and matched through `headerKey`, which collapses
   whitespace and case. "removed sites" has 43 of these (no Unlicensed
   Casino) and spells "Majestic Citatian Flow"; headerKey tolerates that too. */
export const DB_COLUMNS = ["Type", "TLD", "Domain", "Webmaster Contact", "Webmaster Extra Contact", "Contact Name", "IP Address",
  "Ahrefs Domain Rating", "Ahrefs Referring Domains", "Ahrefs Organic Traffic", "Ahrefs URL Rating", "Ahrefs Top 3 Keywords", "Ahrefs Top 4-10 Keywords",
  "Majestic Trust Flow", "Majestic Citation Flow", "MOZ Spam Score", "MOZ Domain Authority", "Semrush Authority Score", "TF / CF", "RD / OT",
  "Buying Casino", "Buying Unlicensed Casino", "Buying Crypto", "Buying Forex", "Buying CBD", "Buying Dating", "Buying General",
  "Casino", "Unlicensed Casino", "Crypto", "Forex", "CBD", "Dating", "General",
  "Sponsor Tag Type", "Link Type", "Placement", "Price Validity", "Admin Comments", "User Comments", "Last Updated",
  "Main Country", "Main Country Traffic", "Domain Language", "Website Topic"];

/* "Ahrefs \nDomain Rating" and "Ahrefs  Domain Rating" are the same column. */
export function headerKey(h){
  return String(h || "").toLowerCase().replace(/\s+/g, " ").trim().replace("citatian", "citation");
}
const KEY_TO_COLUMN = new Map(DB_COLUMNS.map(c => [headerKey(c), c]));

/* Renames a row read from the sheet (or a CSV of it) to the one-line column
   names above, so the rest of the module can use `row["Buying Casino"]`.
   Columns the module does not know are kept as they are. */
export function normaliseRow(row){
  const out = {};
  for(const k in row){ out[KEY_TO_COLUMN.get(headerKey(k)) || k] = row[k]; }
  return out;
}

/* Fixed values the database accepts (CLAUDE.md of the desk, Gary 07/10, and
   the sample rows of 07/10). Anything else goes to a comment, not a column. */
export const FIXED = {
  type: ["Publisher", "Broker"],
  linkType: ["Do follow", "No follow"],
  placement: ["1 Year", "2 Years", "permanent"],
  priceValidity: ["Fixed", "Not fixed"],   /* or a date */
  sponsorTag: ["", "Marked by WM", "rel=sponsored"]
};
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
  (rows || []).forEach((raw, i) => {
    const r = normaliseRow(raw);
    const d = normaliseDomain(r.Domain || r.domain);
    if(!d) return;
    add(byDomain, d.domain, { row: r, index: i });
    add(bySender, senderOf(r), d.domain);
  });
  const removedSet = new Map();
  (removed || []).forEach((raw, i) => {
    const r = normaliseRow(raw);
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

/* ---------- terms, as the database's fixed values ---------- */

/* Reads the free text of an item ("do follow, permanent, prices valid until
   31.12.2026, marked as Werbung") into the fixed values of the sheet. Empty
   string means the list did not say. `adminComments` holds only the phrases
   the team uses. */
export function termsOf(item){
  const text = item.terms || "";
  const t = text.toLowerCase();
  const marked = text.match(/(?:marked\s+as|marcat(?:\s+cu)?|gekennzeichnet\s+als|marcado\s+como)\s+["“'(]?([\p{L}\d-]+)[)"”']?/iu);
  const sponsorTag = /rel=sponsored|sponsored tag|sponsored link/.test(t) ? "rel=sponsored" : (marked || /marked by (the )?(wm|webmaster)/.test(t)) ? "Marked by WM" : "";
  const linkType = /no-?\s?follow/.test(t) ? "No follow" : /do-?\s?follow|dofollow/.test(t) ? "Do follow" : "";
  const placement = /permanent|lifetime|forever|dauerhaft|permanente|pe viata|pe viață|for life/.test(t) ? "permanent" : /2\s*(years?|jahre|años)/.test(t) ? "2 Years" : /1\s*(year|jahr|año)|12\s*months?/.test(t) ? "1 Year" : "";
  const until = text.match(/valid(?:o|a)?s?\s*(?:until|hasta|till|bis)\s*([\d.\/-]+)/i);
  const priceValidity = until ? until[1] : /fixed|fijo|fest/.test(t) ? "Fixed" : /not fixed|negotiable|negociable|verhandelbar/.test(t) ? "Not fixed" : "";
  const adminComments = [];
  if(marked) adminComments.push(`Marked as "${marked[1]}"`);
  if(item.prices && item.prices.unlicensedCasino) adminComments.push(`Unlicensed Casinos - ${formatPrice(item.prices.unlicensedCasino)} EUR`);
  else if(/unlicen[cs]ed casinos? accepted/.test(t)) adminComments.push("Unlicensed Casinos Accepted");
  else if(/only licen[cs]ed/.test(t)) adminComments.push("Only Licensed Casinos");
  if(/written by (the )?(wm|webmaster)/.test(t)) adminComments.push("Written by WM");
  if(/no ?index/.test(t)) adminComments.push("NO INDEX");
  return { sponsorTag, linkType, placement, priceValidity, adminComments };
}

/* Terms the email states once for the whole list ("Do-Follow-Links ·
   Dauerhafte Veröffentlichung"), read from the lines parseList skipped.
   Applied to every item that says nothing itself. */
export function listTermsOf(parsed){
  const text = (parsed.skipped || []).map(l => l.text).join(" | ");
  const f = termsOf({ terms: text, prices: {} });
  f.text = text;
  f.any = !!(f.linkType || f.placement || f.priceValidity || f.sponsorTag || f.adminComments.length);
  return f;
}

/* Fills an item's empty terms from the list's. Returns a copy; `inherited`
   says the terms came from the list, not the row. */
export function withListTerms(item, listTerms){
  if(!listTerms || !listTerms.any) return item;
  if(!item.terms) return { ...item, terms: listTerms.text, inherited: true };
  /* The row says something, but not everything: add the list's text so the
     missing fixed values (a "pe viata" line after the groups) are read too. */
  const own = termsOf(item);
  const missing = ["linkType", "placement", "priceValidity", "sponsorTag"].some(k => !own[k] && listTerms[k]);
  if(!missing || item.terms.includes(listTerms.text)) return item;
  return { ...item, terms: item.terms + " | " + listTerms.text, inheritedPartly: true };
}

/* Offered minus recorded, per niche, for a changed row: {niche, offered,
   inDatabase, delta, pct}. pct is relative to the recorded price. */
export function priceDelta(diffs){
  return (diffs || []).map(d => {
    const a = d.offered ? d.offered.amount : null, b = d.inDatabase ? d.inDatabase.amount : null;
    const delta = a != null && b != null ? a - b : null;
    return { ...d, delta, pct: delta != null && b ? Math.round(delta / b * 100) : null };
  });
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
  row.Type = FIXED.type.includes(type) ? type : "Publisher";
  row.Domain = item.domain;
  row.TLD = "." + item.domain.split(".").slice(1).join(".");
  row["Webmaster Contact"] = sender;
  row["Contact Name"] = contactName;
  for(const niche of NICHES){
    const p = item.prices[niche];
    if(p) row[BUYING_COLUMN[niche]] = formatPrice(p);
  }
  const fixed = termsOf(item);
  row["Sponsor Tag Type"] = fixed.sponsorTag;
  row["Link Type"] = fixed.linkType || "Do follow";
  row["Placement"] = fixed.placement;
  row["Price Validity"] = fixed.priceValidity;
  const admin = fixed.adminComments.slice();
  row["Admin Comments"] = admin.join("\n");
  /* User Comments is the team's, by hand: here only who accepted and from
     which list, so the row can be traced. */
  row["User Comments"] = [who && `Accepted by ${who}`, listLabel && `from list ${listLabel}`].filter(Boolean).join("; ");
  row["Last Updated"] = `${d}/${m}/${y}`;
  return row;
}

/* The 2026 database writes prices as bare numbers in EUR (1100, 250), read
   on 07/10. The 2024 Latam copy wrote "€ 400.00"; parsePrice reads both. */
export function formatPrice(p){
  return Number.isInteger(p.amount) ? String(p.amount) : p.amount.toFixed(2);
}
