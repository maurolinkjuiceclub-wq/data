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
  /* A list marker before the domain ("1.", "1)", "-", "•", "*", "·") is
     not part of it (review of 16/10: numbered and bulleted lists lost every
     site). Curly quotes and brackets around it neither. */
  s = s.replace(/^(?:\(?\d{1,3}[.)]\s+|[-–—•*·▪●◦»>]+\s*)+/, "");
  /* A note in brackets after the name: "rfi.ro (rfi.fr/ro)", "x.com (DR
     45)". Only when a name stands before it: "(example.com)" is a domain
     in brackets, not an empty name with a note. */
  s = s.replace(/^(\S.*?)\s*\([^()]*\)\s*$/, "$1");
  s = s.replace(/^[\s"'“”‘’«»<(\[]+|[\s"'“”‘’«»>)\]:;,.]+$/g, "");
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

/* A bare number that is not a price even though it looks like one: a phone
   number (on a line that says "Tel", "Mobile", "+34 …", with a leading zero
   or above 99,999), a date ("31.12.2026") or a year. With a currency sign a number is
   a price whatever its shape. Review of 16/10: a signature's phone number
   had become the agency's price. */
const PHONE_LINE = /(^|\s|:)(tel|tél|telefon|tel[eé]fono|phone|ph|mobile|mob|m[oó]vil|cell?|celular|handy|fax|whatsapp|viber|skype)\.?\s*:?\s*\+?\(?\d|(^|\s)\+\d{1,4}[\s.-]?\d|(^|\s)\(\+?\d{1,4}\)\s?\d/i;
export function bareNotPrice(cell, line){
  const c = String(cell || "").trim();
  if(!/^[\d.,\s]+$/.test(c)) return false;
  const p = parsePrice(c);
  if(!p || p.amount > 99999 || /^0\d/.test(c)) return true;   /* 1234567, 0049… */
  if(/^(19|20)\d\d$/.test(c)) return true;
  return PHONE_LINE.test(String(line || ""));
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
const GREY = /gr[ae]y[ -]?(niches?|markets?|hat)/i;
const NICHE_WORDS = [
  ["unlicensedCasino", /unlicen[cs]ed|sin licencia|offshore|curacao/i],
  ["casino", /casino|gambling|gl[üu]cksspiel|betting|wetten|apuestas|igaming|poker|slots?|juego/i],
  ["crypto", /crypto|cripto|krypto|bitcoin|blockchain/i],
  ["forex", /forex|trading|finance|finanzen|finanzas/i],
  ["cbd", /\bcbd\b|cannabis|hemp|vape|hanf/i],
  ["dating", /dating|adult|citas/i],
  ["general", /general|allgemein|mainstream|normal|standard|regular|price|precio|preis|cost|article|artikel|articol|guest ?post|gastbeitrag|advertorial/i],
  /* "Gambling & Grey Niches" (MM Group Media, 09/10): grey is everything
     that is not mainstream, so the price fills the four grey columns too. */
  ["crypto", GREY], ["forex", GREY], ["cbd", GREY], ["dating", GREY]
];
/* A column for a product that is not an article carries no Buying price:
   link insertions, brand mentions, banners, niche edits. Its cells stay as
   labelled terms so the person still sees them. */
const NOT_ARTICLE = /link\s*insert|insertion|brand\s*mention|banner|niche\s*edit|homepage|sidebar|press\s*release|social/i;
export function nicheOf(header){
  return nichesOf(header)[0] || null;
}
/* Every niche a header names, in the order they appear: "Vape-CBD-Crypto"
   is [cbd, crypto] and a price under it fills both Buying columns. */
export function nichesOf(header){
  const h = String(header || "");
  if(NOT_ARTICLE.test(h)) return [];
  const found = NICHE_WORDS.map(([niche, re]) => { const m = re.exec(h); return m ? [m.index, niche] : null; })
    .filter(Boolean).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const once = found.filter((n, i) => found.indexOf(n) === i);
  /* "PRICE / ARTICLE Advertorial (GAMBLING)" is casino, not casino and
     general: the general words only count when no niche is named. */
  const specific = once.filter(n => n !== "general");
  return specific.length ? specific : once;
}

/* ---------- parsing a list ---------- */

/* Splits pasted text into rows of cells. Tabs, then ";", then "," when a
   line has them; otherwise whitespace runs. */
function splitRows(text){
  /* Lists pasted from an email often put every site on one line, separated
     by " · ", " | " or " ; ". Those become rows; a piece with no domain of
     its own ("| 500 EUR", "; permanent") stays with the piece before it. */
  const hasDomain = p => p.split(/\s+/).some(tok => normaliseDomain(tok));
  const lines = [];
  for(const raw of String(text || "").replace(/\r/g, "").split("\n")){
    let cur = null;
    for(const p of raw.split(/\s[·•|]\s|\s;\s/)){
      if(cur !== null && !hasDomain(p)) cur += " | " + p;
      else { if(cur !== null) lines.push(cur); cur = p; }
    }
    if(cur !== null) lines.push(cur);
  }
  /* Leading tabs stay: a sheet row whose first cell is empty must keep its
     column positions. Trailing whitespace goes. */
  const clean = lines.map(l => l.replace(/^ +/, "").replace(/\s+$/, "")).filter(Boolean);
  /* The separator is decided per line (review of 16/10): a line with tabs is
     a sheet row, a line without is prose even when the text carries a table
     too (Reply hands over several messages at once). ";" or "," count as
     separators when most lines without tabs have them; a comma inside
     brackets or in prose ("General 300 EUR, Casino 500 EUR") does not. */
  const plain = clean.filter(l => !l.includes("\t"));
  const csvComma = l => { const o = l.replace(/\([^()]*\)/g, ""); return /,\S/.test(o) || (o.split(",").length > 2); };
  const sep = plain.filter(l => l.includes(";")).length > plain.length / 2 ? ";" : plain.filter(csvComma).length > plain.length / 2 ? "," : null;
  /* Words in brackets are one cell ("(DR 45)", "(dofollow, permanent)"):
     their spaces are protected while the line is split and put back after.
     A bracket with " / " inside is a header ("(Allgemein / Glücksspiel /
     Vape-CBD-Crypto)") and splits as before. */
  const guard = l => l.replace(/\([^()\/|]*\)/g, m => m.replace(/\s/g, "\u0001"));
  /* ", " splits too when a domain follows ("a.com, b.com - 300 EUR"). */
  const prose = l => guard(l).split(/\s{2,}|\s[-–—\/:|]\s|\s+(?=[€$£]?\s?\d)|,\s+(?=[\w-]+\.[a-z])/i).map(c => c.replace(/\u0001/g, " "));
  return clean.map(l => {
    /* A tab row is marked: the column mapping a tab header gives applies to
       tab rows only, a prose line in the same text is read by position. */
    if(l.includes("\t")){ const cells = splitCsvLine(l, "\t").map(c => c.trim()); cells.tab = true; return cells; }
    if(!sep || !l.includes(sep)) return prose(l).map(c => c.trim()).filter(Boolean);
    /* A comma-separated line is usually a CSV row, but "a.com, b.com - 300
       EUR" is prose with a comma: a cell that is neither a domain nor a
       price is split again like prose. */
    /* Tab rows keep their empty cells: a sheet with merged header cells
       ("Ahrefs" over DR, RD, Traffic) has blanks, and the column index must
       still match the row below. */
    return splitCsvLine(l, sep).map(c => c.trim()).filter(Boolean)
      .flatMap(c => (!normaliseDomain(c) && !isPriceCell(c) && /\s/.test(c)) ? prose(c).map(x => x.trim()).filter(Boolean) : [c]);
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
  let columns = null;   /* niches per cell index, when the header names the domain column */
  let headers = null;   /* the header's words per cell index, to label the other cells */
  let domainCol = -1;   /* the header's domain column: a sheet row is one site */
  let headerTab = false; /* the header came from a tab row: prose lines ignore its columns */
  let order = null;     /* niches in order of the prices, when it does not ("General / Casino / CBD") */
  let group = [];       /* domains named on a line without prices; the price lines below belong to them */
  let signedOff = false;
  let pending = null;   /* a price line above its domains: "£100 football / £150 any other links" */
  let skip = 0;
  const tabbed = /\t/.test(String(text || ""));
  /* A header row has no domain and no price with a currency; a bare number
     ("427" sites) is allowed. */
  const noOffer = cells => !cells.some(c => normaliseDomain(c)) && !cells.some(c => findPrice(c));
  const isHeader = cells => cells.some(c => /domain|dominio|site|web|url/i.test(c) && !nicheOf(c)) && cells.some(c => nichesOf(c).length);
  const setHeader = cells => {
    columns = cells.map(nichesOf); headers = cells.map(c => c.replace(/\s+/g, " ").trim()); order = null; headerTab = !!cells.tab;
    domainCol = cells.findIndex(c => /domain|dominio|site|web|url/i.test(c) && !nicheOf(c));
  };
  /* Header rows of a sheet joined into one: a merged cell is carried across
     its blanks wherever a row below has something, and the rows are read
     top-down per column, so "PRICE / ARTICLE (EUR)" over "Special Content"
     over "Advertorial (GAMBLING)" is one column name. */
  const joinHeader = part => {
    const n = Math.max(...part.map(r => r.length));
    const carry = part.map(() => "");   /* per row, across the columns */
    const out = [];
    for(let j = 0; j < n; j++){
      const words = [];
      part.forEach((r, k) => {
        let c = (r[j] || "").replace(/\s+/g, " ").trim();
        if(c) carry[k] = c; else if(part.slice(k + 1).some(x => (x[j] || "").trim())) c = carry[k];
        if(c) words.push(c);
      });
      out.push(words.join(" "));
    }
    return out;
  };
  rows.forEach((cells, i) => {
    if(skip){ skip--; return; }
    const line = cells.filter(Boolean).join(" ");
    /* A pasted thread holds several messages (mattbarltd, 09/10: the list
       was two replies down). A message header ends the signature of the
       one above and starts reading again. */
    if(MSG_HEAD.test(line)){ signedOff = false; group = []; pending = null; columns = null; headers = null; order = null; domainCol = -1; skipped.push({ line: i + 1, text: line }); return; }
    /* A sheet header on several rows (MM Group Media: two; librawebcorp:
       three under a title row, 09/10). Rows without an offer at the top of a
       sheet are joined; the join that names the most niche columns wins; a
       row with one cell (a title, a year) is skipped but not joined. */
    if(tabbed && !group.length && noOffer(cells)){
      const block = [cells];
      while(i + block.length < rows.length && block.length < 6 && noOffer(rows[i + block.length])) block.push(rows[i + block.length]);
      /* A line of conditions above or under the header ("All links dofollow
         and permanent") is not part of it: it is kept for listTermsOf. */
      const isTermsRow = r => !r.some(c => nichesOf(c).length) && /dofollow|do-?\s?follow|no-?\s?follow|permanent|dauerhaft|sponsored|valid|fixed|festpreis/i.test(r.join(" "));
      let best = null;
      for(let n = 1; n <= block.length; n++){
        const part = block.slice(0, n).filter(r => r.filter(Boolean).length > 1 && !isTermsRow(r));
        if(!part.length) continue;
        const joined = joinHeader(part);
        if(!isHeader(joined)) continue;
        const score = joined.filter(c => nichesOf(c).length).length;
        if(!best || score >= best.score) best = { n, joined, score };
      }
      if(best){
        best.joined.tab = true; setHeader(best.joined); skip = best.n - 1;
        block.slice(0, best.n).forEach((r, k) => { if((r.filter(Boolean).length <= 1 && /\p{L}/u.test(r.join(""))) || isTermsRow(r)) skipped.push({ line: i + k + 1, text: r.filter(Boolean).join(" ") }); });
        return;
      }
    }
    /* After "Thanks," / "Best regards" / "Multumesc" what follows is a
       signature: its domain and phone are not an offer. */
    if(signedOff){ skipped.push({ line: i + 1, text: line }); return; }
    if(SIGN_OFF.test(line) && line.length <= 40 && !/:$/.test(line) && !cells.some(c => normaliseDomain(c))){ signedOff = true; pending = null; skipped.push({ line: i + 1, text: line }); return; }
    /* One site per sheet row: the header's domain column when there is one;
       otherwise the first cell of each host, so a "Sample Post" URL on the
       same site is not a second item. */
    /* A link to a Google Sheet or Drive file is where a list lives, not a site. */
    /* Our own domain, quoted from our email under theirs, is never a site. */
    let domIdxs = cells.map((c, j) => { const d = normaliseDomain(c); return d && !/^(docs|drive|sheets)\.google\.com$/.test(d.domain) && !/(^|\.)linkjuiceclub\.com$/.test(d.domain) ? j : -1; }).filter(j => j >= 0);
    /* One item per domain cell; a note in brackets after the name ("x.com
       (DR 45)") goes to the terms, so metricsOf reads it. */
    const noteOf = c => { const m = String(c).match(/^\S.*?\s*\(([^()]*)\)\s*$/); return m ? m[1].trim() : ""; };
    const mkItem = (j, prices, terms) => { const d = normaliseDomain(cells[j]); return { domain: d.domain, path: d.path, raw: cells[j], prices, terms: [noteOf(cells[j]), terms].filter(Boolean).join(" | "), line: i + 1 }; };
    if(domIdxs.length > 1){
      if(domainCol >= 0 && domIdxs.includes(domainCol)) domIdxs = [domainCol];
      else { const seen = new Set(); domIdxs = domIdxs.filter(j => { const h = normaliseDomain(cells[j]).domain; if(seen.has(h)) return false; seen.add(h); return true; }); }
    }
    /* A bare one- or two-digit number is a metric (DR, DA), unless the header
       puts that column under a niche: "40" under Advertorial (GAMBLING). */
    /* The columns of a tab header do not apply to a prose line of the same
       text ("gamma.com - 300 EUR" under a table: the price is general, not
       whatever the table's second column was). */
    const cols = (columns && headerTab && !cells.tab) ? null : columns;
    const priceIdxs = cells.map((c, j) => isPriceCell(c) && !bareNotPrice(c, line) && (!/^\d{1,2}$/.test(c.trim()) || (cols && cols[j] && cols[j].length)) ? j : -1).filter(j => j >= 0);

    if(!domIdxs.length){
      const niches = cells.map(nicheOf);
      /* A header names niches and carries no price. One that also names the
         domain column maps by index and may appear again (a second sheet);
         one that does not maps by position and is taken once. */
      const namesDomain = cells.some(c => /domain|dominio|site|web|url/i.test(c) && !nicheOf(c));
      /* In pasted prose a sentence can name niches and "websites" without
         being a header ("which other niche links are accepted: Crypto,
         Forex?", Senad, 04/02): a header has short cells, most of them a
         niche or the domain column, and no sentence punctuation. */
      const headerLike = tabbed || (cells.length >= 2 && cells.every(c => c.length <= 60 && !/^[-•*]|^(no|not|non|without|nicht|kein|sin|fără)\b/i.test(c)) && !/[?!.]$/.test(line) &&
        cells.filter(c => nichesOf(c).length || /^(domain|dominio|site|website|web|url)s?$/i.test(c)).length >= Math.max(2, cells.length - 1));
      if(headerLike && niches.some(Boolean) && !priceIdxs.length && (namesDomain || (!columns && !order && !group.length))){
        if(namesDomain) setHeader(cells);
        else order = cells.map(nichesOf).filter(a => a.length);
        return;
      }
      /* A price line above its domains: "£100 football links / £150 any
         other links", then the sites, one per line (mattbarltd, 09/10). Each
         price takes the niches its words name; "any other links", "all
         links" or a lone price is general; a topical price ("football") is
         kept in the terms only. The next prose line closes it. */
      if(!group.length){
        const found = pricesOfLine(line);
        if(found.length && !columns && !order){
          const prices = {};
          found.forEach((f, k) => {
            let niches = nichesOf(f.label);
            if(!niches.length && (/\bany other\b|\ball links\b|\bother links\b|^all\b|^other\b|\brest\b/i.test(f.label) || found.length === 1)) niches = ["general"];
            niches.forEach(n => { if(!prices[n]) prices[n] = f.price; });
          });
          pending = { prices, text: line };
          skipped.push({ line: i + 1, text: line });
          return;
        }
        pending = null;
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
    /* Domains with no price on their line take the price line above them,
       or open a group for the price lines below. */
    if(!priceIdxs.length){
      /* The price is on the line but not alone in its cell: "150 GBP +
         VAT", "450 EUR casino / 250 EUR general", "300 € per article",
         "300 EUR (casino 500 EUR)" (review of 16/10: these lost the price
         and the text). Each price takes the niches its words name, after
         or before it; the first without a niche is general; what is not a
         price stays as the terms. */
      const rest = cells.filter((c, j) => !domIdxs.includes(j)).join(" | ");
      const own = pricesOfLine(rest);
      if(own.length){
        const prices = {};
        own.forEach(f => {
          const after = nichesOf(f.label);
          let niches = after.filter(n => n !== "general");
          if(!niches.length && after.includes("general")) niches = ["general"];   /* "250 EUR general", "300 € per article" */
          if(!niches.length) niches = nichesOf(f.before).filter(n => n !== "general");   /* "(casino 500 EUR)" */
          if(!niches.length && !prices.general) niches = ["general"];
          niches.forEach(n => { if(!prices[n]) prices[n] = f.price; });
        });
        let leftover = rest; own.forEach(f => { leftover = leftover.replace(f.text, " "); });
        leftover = leftover.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").replace(/\(\s*\)/g, "").replace(/\s*\|\s*/g, " | ").replace(/^[\s|\/,;:–—-]+|[\s|\/,;:–—-]+$/g, "").replace(/\s{2,}/g, " ").trim();
        group = []; pending = null;
        domIdxs.forEach(j => items.push(mkItem(j, Object.assign({}, prices), leftover)));
        return;
      }
      if(pending){
        domIdxs.forEach(j => items.push(mkItem(j, Object.assign({}, pending.prices), pending.text)));
        return;
      }
      group = domIdxs.map(j => { const it = mkItem(j, {}, ""); items.push(it); return it; });
      return;
    }
    group = []; pending = null;   /* a priced row closes the price line above */
    const guessing = !cols && !order;
    const made = domIdxs.map(j => mkItem(j, {}, ""));
    const terms = [];
    /* Under a header, a cell that is not a price for a niche is shown with
       its column name: "Ahrefs DR: 44", "Link Insert Normal: 110 €". */
    const labelled = (j, c, isPrice) => {
      if(!headers || !headers[j] || !cols) return c;
      /* "casino: no" for a refusal under a niche column; a second price for
         the same niche keeps its column name ("... Advertorial (branding): 145"). */
      if(columns[j] && columns[j].length) return (isPrice ? headers[j] : columns[j].join("+")) + ": " + c;
      if(/^\d{1,2}$/.test(headers[j]) || /terms|notes?|comments?|conditions|remarks|info|observa/i.test(headers[j])) return c;
      return headers[j] + ": " + c;
    };
    let nth = 0;
    cells.forEach((c, j) => {
      if(domIdxs.includes(j)) return;
      const p = isPriceCell(c) && !bareNotPrice(c, line) && !(guessing && /^\d{1,2}$/.test(c.trim())) ? parsePrice(c) : null;
      if(p){
        /* A header decides the niche: by column when it names the domain
           column, by position otherwise. Without a header the first price is
           general and the second casino; a third is kept as a term. */
        const target = cols ? cols[j] : order ? order[nth] : (nth === 0 ? "general" : nth === 1 ? "casino" : null);
        nth++;
        const niches = Array.isArray(target) ? target : target ? [target] : [];
        let used = false;
        for(const it of made){
          const free = niches.filter(n => !it.prices[n]);
          if(free.length){ free.forEach(n => { it.prices[n] = p; }); used = true; }
        }
        if(!used) terms.push(labelled(j, c, true));
      }else if(c){
        terms.push(labelled(j, c));
      }
    });
    made.forEach(it => { it.terms = [it.terms, ...terms].filter(Boolean).join(" | "); items.push(it); });
  });
  /* A domain named without any price, and nothing below it, stays as an
     item with no price: the person sees it and decides. */
  return { items, skipped, columns: columns ? columns.map(a => a.length ? a.join("+") : null) : (order ? order.map(a => a.join("+")) : null) };
}
/* The start of a message inside a pasted thread, in the mail clients and
   languages seen so far. */
const MSG_HEAD = /^(from|de|von|da|šalje|od|poslano|sent|enviado|gesendet|wysłano|date|to|an|prima|para)\s*:|^on .{3,80} wrote:?$|^el .{3,80} escribi[oó]:?$|^am .{3,80} schrieb.{0,40}:?$|^le .{3,80} a écrit ?:?$|^-{2,}\s*(original|forwarded|mensaje original|ursprüngliche)/i;
/* Every price in a line, each with the words that follow it up to the next
   price: "£100 football links / £150 any other links". */
function pricesOfLine(line){
  const re = /(?:€|\$|£|\beur(?:os?)?\b|\busd\b|\bgbp\b)\s*\d[\d.,]*|\d[\d.,]*\s*(?:€|\$|£|\beur(?:os?)?\b|\busd\b|\bgbp\b)/gi;
  const hits = []; let m;
  while((m = re.exec(line))) hits.push([m.index, m[0]]);
  const clean = s => s.replace(/^[\s\/|·,;:()–—-]+|[\s\/|·,;:()–—-]+$/g, "").trim();
  return hits.map(([at, txt], k) => {
    const end = k + 1 < hits.length ? hits[k + 1][0] : line.length;
    const start = k ? hits[k - 1][0] + hits[k - 1][1].length : 0;
    /* The words after the price up to the next price or an opening bracket
       (a new clause: "300 EUR (casino 500 EUR)"), and the words before it
       back to the previous price or a closing bracket. */
    const label = clean(line.slice(at + txt.length, end).split("(")[0]);
    const before = clean(line.slice(start, at).split(")").pop());
    return { price: parsePrice(txt), label, before, text: txt };
  }).filter(f => f.price);
}
/* The line is short (a sign-off, not "Thanks for your interest, here are
   our sites:"), has no domain, and ends the message: what follows is the
   signature. Extended on 16/10 after Swedish, German, Italian, French,
   Portuguese, Dutch and Polish sign-offs let a signature's phone number
   become a price. */
const SIGN_OFF = /^(thanks|thank you|many thanks|thx|best|all the best|best regards|best wishes|kind regards|warm regards|regards|sincerely|yours|cheers|take care|have a (nice|great|good)|saludos|gracias|un saludo|un cordial saludo|atentamente|cordialmente|quedo atent|multumesc|mulțumesc|cu stima|cu stimă|cu respect|o zi (buna|bună)|mit freundlichen|mit besten|freundliche gr|viele grüße|viele gruesse|beste grüße|liebe grüße|herzliche grüße|schöne grüße|sonnige grüße|grüße|gruß|lg|vg|mfg|cordialement|bien cordialement|bien à vous|bonne journée|amicalement|salutations|cordiali saluti|distinti saluti|un saluto|saluti|a presto|buona giornata|cumprimentos|atenciosamente|com os melhores|abraço|obrigad[oa]|met vriendelijke|vriendelijke groet|groeten|hartelijke groet|vänliga hälsningar|med vänlig|vänligen|hälsningar|mvh|med venlig|venlig hilsen|hilsen|vennlig hilsen|ystävällisin|terveisin|pozdrawiam|z poważaniem|serdecznie|s pozdravem|s pozdravom|üdvözlettel|s uvažavanjem|lijep pozdrav|srdačan pozdrav|pozdrav)\b/i;

/* A sheet read as rows of cells (SheetJS sheet_to_json with header: 1, or
   any 2D array) becomes the tab-separated text parseList reads. Empty rows
   are dropped; numbers keep their value. Several sheets are joined, each
   with a blank line between them; each sheet's own header row resets the
   column mapping. No title line: "Sheet: Prices" would read as a header. */
export function tableToList(rows){
  const lines = (rows || []).map(r => (r || []).map(c => c == null ? "" : String(c).replace(/\t|\n/g, " ").trim()).join("\t")).filter(l => l.replace(/\t/g, "").trim());
  return lines.join("\n");
}

/* ---------- a PDF's text ----------
   pdf.js gives the text of a page as items with a position (transform[4],
   transform[5]) and a width, in no useful order and with no lines. This
   rebuilds lines from the baselines and, when the page is a table (drivar.de
   price list, 09/10), its columns from the x positions, as tab-separated
   rows, so parseList reads it like a sheet. A long cell wrapped onto the
   next line ("https://motion-drive-" over "vermietung.de") is glued back to
   its row. */
export function pdfTextOf(items){
  const rows = [];
  for(const it of items || []){
    if(!it || !it.str || !it.str.trim() || !it.transform) continue;
    const y = it.transform[5], x = it.transform[4];
    let row = null;
    for(const r of rows){ if(Math.abs(r.y - y) < 2.5){ row = r; break; } }
    if(!row){ row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x, s: it.str, w: it.width || 0 });
  }
  rows.sort((a, b) => b.y - a.y);
  rows.forEach(r => {
    r.parts.sort((a, b) => a.x - b.x);
    /* A glyph the font maps wrongly: in the drivar.de PDF every "f" came as
       a one-letter item "E" between lowercase letters ("rundElug.com").
       A lone capital E glued to lowercase letters on both sides is an f. */
    r.parts.forEach((p, k) => {
      const a = r.parts[k - 1], b = r.parts[k + 1];
      const before = !a || (/[a-z\/.-]$/.test(a.s) && p.x - (a.x + a.w) < 1.5);   /* or the line starts with it ("Einden.com" under "https://mentor-") */
      if(p.s === "E" && b && before && b.s.length > 1 && /^[a-z]/.test(b.s) && b.x - (p.x + p.w) < 1.5) p.s = "f";
    });
    /* Touching items are one word; a gap is a space. */
    const merged = [];
    for(const p of r.parts){
      const last = merged[merged.length - 1];
      if(last && p.x - (last.x + last.w) < 1.5 && !/\s$/.test(last.s) && !/^\s/.test(p.s)){ last.s += p.s; last.w = p.x + p.w - last.x; }
      else merged.push({ x: p.x, s: p.s, w: p.w });
    }
    r.parts = merged.map(p => ({ x: p.x, w: p.w, s: p.s.replace(/\s+/g, " ").trim() })).filter(p => p.s);
  });
  /* A table: at least three rows with four or more cells. Its columns are
     the x positions of the row with most cells (the header, usually); each
     cell goes to the nearest column start. Otherwise prose: words joined. */
  const wide = rows.filter(r => r.parts.length >= 4);
  if(wide.length < 3) return rows.map(r => r.parts.map(p => p.s).join(" ")).join("\n");
  const template = wide.reduce((a, b) => b.parts.length > a.parts.length ? b : a, wide[0]);
  const cols = template.parts.map(p => p.x);
  /* A cell belongs to the column whose start is the last one at or before
     it, so a right-aligned number stays under its header. */
  const colOf = x => { let k = 0; while(k + 1 < cols.length && x >= cols[k + 1] - 1.5) k++; return k; };
  const table = rows.map(r => {
    const cells = cols.map(() => "");
    r.parts.forEach(p => { const k = colOf(p.x); cells[k] = cells[k] ? cells[k] + " " + p.s : p.s; });
    return cells;
  });
  /* A wrapped cell: a row of one or two cells, no digit, each under a cell
     of the row above, which has digits (a data row). It continues that row:
     a domain or a word cut at "-" or "/" without a space, anything else
     with one. */
  const out = [];
  for(const cells of table){
    const filled = cells.map((c, k) => c ? k : -1).filter(k => k >= 0);
    const prev = out[out.length - 1];
    const isUrl = c => /^(https?:\/\/|www\.)|\.[a-z]{2,}(\/|$)/i.test(c);
    /* Under a domain, only a piece that continues it: the domain was cut
       ("-", "/", ".") or the piece carries a dot ("shop.de"). "Inclusive"
       under the last row is a note, not a domain. */
    const fits = k => !isUrl(prev[k]) || /[-\/.]$/.test(prev[k]) || (/\./.test(cells[k]) && /^[a-z]/.test(cells[k]));
    const continues = prev && filled.length && filled.length <= 2 && !cells.some(c => /\d/.test(c)) && prev.some(c => /\d/.test(c)) && filled.every(k => prev[k] && fits(k));
    if(continues){
      filled.forEach(k => { const glue = /[-\/.]$/.test(prev[k]) || isUrl(prev[k]) ? "" : " "; prev[k] += glue + cells[k]; });
      continue;
    }
    out.push(cells);
  }
  /* A row with one cell is a line of prose (title, note): no tabs. */
  return out.map(cells => cells.filter(Boolean).length <= 1 ? cells.filter(Boolean).join("") : cells.join("\t")).join("\n");
}

/* ---------- the same site twice in one list ---------- */

/* A list can name a site twice (two blocks, www and bare, a second sheet).
   The items are merged into the first: a niche the first lacks takes the
   later price; a niche priced differently in both is a conflict the person
   has to see. Returns the merged items and what was merged. */
export function mergeDuplicates(items){
  const byDomain = new Map(); const out = []; const dupes = [];
  for(const it of items){
    const first = byDomain.get(it.domain);
    if(!first){ byDomain.set(it.domain, it); out.push(it); continue; }
    let d = dupes.find(x => x.domain === it.domain);
    if(!d){ d = { domain: it.domain, count: 1, conflicts: [] }; dupes.push(d); }
    d.count++;
    for(const n in it.prices){
      if(!first.prices[n]) first.prices[n] = it.prices[n];
      else if(first.prices[n].amount !== it.prices[n].amount || first.prices[n].currency !== it.prices[n].currency) d.conflicts.push({ niche: n, first: first.prices[n], other: it.prices[n] });
    }
    if(it.terms && it.terms !== first.terms) first.terms = [first.terms, it.terms].filter(Boolean).join(" | ");
  }
  return { items: out, dupes };
}

/* ---------- metrics the list carries, age of a row ---------- */

/* "Ahrefs DR: 44 | RD: 1102 | Avg Traffic: 18176 | DA: 35 | Links: 3.570"
   as labelled terms become numbers: Senad decides on "sellable metrics",
   so the page shows them and flags the rows under the team's threshold. */
export function metricsOf(terms){
  const t = String(terms || "");
  /* "18.2k", "1,2M": a suffix multiplies. The two-letter names are taken
     in capitals only ("da" is a word in Italian and Portuguese; "links:
     300 €" is a price, not referring domains). */
  const num = (s, suf) => { let n = parseFloat(String(s).replace(/\.(?=\d{3}\b)/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", ".")); if(!Number.isFinite(n)) return null; if(/k/i.test(suf || "")) n *= 1000; if(/m/i.test(suf || "")) n *= 1000000; return n; };
  const grab = (...res) => { for(const re of res){ const m = t.match(re); if(m) return num(m[1], m[2]); } return null; };
  const N = "\\s*:?\\s*(\\d[\\d.,]*)\\s*([kKmM])?\\b";
  const out = {
    dr: grab(new RegExp("\\bDR" + N), new RegExp("\\bdomain rating" + N, "i")),
    da: grab(new RegExp("\\bDA" + N), new RegExp("\\bdomain authority" + N, "i")),
    rd: grab(new RegExp("\\bRD" + N), new RegExp("\\breferring domains" + N, "i")),
    traffic: grab(new RegExp("\\b(?:avg\\.? traffic|organic traffic|traffic)" + N, "i"), new RegExp("\\bOT" + N)),
    tf: grab(new RegExp("\\bTF" + N), new RegExp("\\btrust flow" + N, "i")),
    cf: grab(new RegExp("\\bCF" + N), new RegExp("\\bcitation flow" + N, "i"))
  };
  return Object.values(out).some(v => v != null) ? out : null;
}
/* Which of the team's minimums a row misses: {dr: 20} against metrics. */
export function belowThreshold(metrics, min){
  if(!metrics || !min) return [];
  return ["dr", "da", "rd", "traffic", "tf", "cf"].filter(k => min[k] != null && min[k] !== "" && metrics[k] != null && metrics[k] < Number(min[k]));
}
/* Months since a sheet date (31/12/2025, 2025-12-31); null when unreadable. */
export function monthsSince(dateStr, today = new Date()){
  const s = String(dateStr || "").trim();
  let m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  let d = null;
  if(m) d = new Date(Number(m[3].length === 2 ? "20" + m[3] : m[3]), Number(m[2]) - 1, Number(m[1]));
  else { m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if(m) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); }
  if(!d || isNaN(d)) return null;
  /* 13/13/2025 or 12/31/2026 would roll over in Date: not a date we know. */
  if(d.getMonth() !== Number(m[2]) - 1) return null;
  return Math.max(0, (today.getFullYear() - d.getFullYear()) * 12 + today.getMonth() - d.getMonth() - (today.getDate() < d.getDate() ? 1 : 0));
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
  type: ["Publisher", "Exclusive", "Broker", "Unsure"],   /* Senad, 09/10 */
  linkType: ["Do follow", "No follow"],
  placement: ["1 Year", "2 Years", "permanent"],
  priceValidity: ["Fixed", "Not fixed"],   /* or a date */
  sponsorTag: ["", "Marked by WM", "rel=sponsored"]
};
/* Senad, 09/10: Publisher (the site's owner) and Exclusive (an agent who
   answers for one site) are the site's own side; Broker (reseller) and
   Unsure (might be one) are not. A site from a reseller is never added
   when the webmaster's row exists; a webmaster's row replaces a reseller's
   ("Broker conversion"). */
export function isReseller(type){ return /^(broker|unsure)$/i.test(String(type || "").trim()); }
/* The phrases Admin Comments takes, from Senad's sheet "Admin and User
   Comments" (09/10); "(SQUARE)" and "COUNTRY" are filled in by hand. */
export const ADMIN_COMMENTS = ["Unlicensed Casinos Accepted", "Casino - Only Betting Sites", "Only Licensed Betting Sites", "Casino - Only Affiliate Sites", "Affiliate Casinos Accepted", "No Affiliates", "No Competitor Links", "Placed in (Square) Category", "Placed in (Square) Section", "Only Licensed Casinos", "Only “COUNTRY” Licensed Casinos", "Only Licensed Casinos in “COUNTRY”", "Only Licensed Companies", "Only “COUNTRY” Licensed Betting Sites", "Written by WM", "Marked as “(SQUARE)”", "Marked with “(SQUARE)”", "Indexing is not guaranteed", "Article must be related to \"(SQUARE)\"", "Article relevant to \"(SQUARE)\"", "NO INDEX", "REMOVED FROM THE LIST", "UNRESPONSIVE"];
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

/* ---------- the database screen's filter, shared by page and Worker ----------
   One predicate, one search string, one facet count: the page filters the
   rows it holds and the Worker filters the sheet, and the two must agree
   (review of 08/10: they had drifted). */

/* The text a search looks in: domain, contacts and name, lowercase. */
export function searchText(row){
  return (String(row.Domain || "") + " " + senderOf(row) + " " + String(row["Contact Name"] || "") + " " + String(row["Webmaster Extra Contact"] || "")).toLowerCase();
}

/* A row ready for the screen: normalised headers plus `_q` (search text) and
   `_type` (Type, trimmed). Done once where rows enter, never per keystroke. */
export function prepareRow(raw){
  const r = normaliseRow(raw);
  r._q = searchText(r);
  r._type = String(r.Type || "").trim();
  return r;
}

/* A metric cell as a number: 44, "1,250", "18.2k", "1,2M" → 44, 1250,
   18200, 1200000; null when empty or not a number. */
export function numberOf(v){
  if(v == null || v === "") return null;
  if(typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = String(v).trim().replace(/\s+/g, "").match(/^([\d.,]+)([kKmM])?$/);
  if(!m) return null;
  let n = parseFloat(m[1].replace(/\.(?=\d{3}\b)/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", "."));
  if(!Number.isFinite(n)) return null;
  if(/k/i.test(m[2] || "")) n *= 1000;
  if(/m/i.test(m[2] || "")) n *= 1000000;
  return n;
}
const METRIC_COLUMN = { dr: "Ahrefs Domain Rating", traffic: "Ahrefs Organic Traffic", rd: "Ahrefs Referring Domains" };

/* Filters: {q, type, country, lang, niche, minDr, minTraffic}. type "-"
   means blank Type. A minimum leaves out the rows without the metric (an
   offer should not carry a site nobody measured). The row may be prepared
   or not; unprepared rows are read field by field. */
export function rowMatchesFilters(r, f){
  const type = r._type != null ? r._type : String(r.Type || "").trim();
  if(f.type === "-" ? type !== "" : f.type && type !== f.type) return false;
  if(f.country && String(r["Main Country"] || "") !== f.country) return false;
  if(f.lang && String(r["Domain Language"] || "") !== f.lang) return false;
  if(f.niche && BUYING_COLUMN[f.niche] && !String(r[BUYING_COLUMN[f.niche]] ?? "").trim()) return false;
  for(const [k, col] of [["minDr", METRIC_COLUMN.dr], ["minTraffic", METRIC_COLUMN.traffic]]){
    if(f[k] == null || f[k] === "") continue;
    const n = numberOf(r[col]);
    if(n == null || n < Number(f[k])) return false;
  }
  const q = String(f.q || "").trim().toLowerCase();
  if(q && !(r._q != null ? r._q : searchText(r)).includes(q)) return false;
  /* Senad's offer process (13/10): the last step is topicality. */
  const topic = String(f.topic || "").trim().toLowerCase();
  if(topic && !String(r["Website Topic"] || "").toLowerCase().includes(topic)) return false;
  return true;
}

/* The order the offers screen asks for: "dr", "traffic", "rd" (highest
   first) or "price:<niche>" (cheapest first); anything else keeps the
   source order. Rows without the value go last. Returns a new array. */
export function sortRows(rows, sort){
  const s = String(sort || "");
  let key = null, asc = false;
  if(METRIC_COLUMN[s]){ key = r => numberOf(r[METRIC_COLUMN[s]]); }
  else if(/^price:/.test(s) && BUYING_COLUMN[s.slice(6)]){ const col = BUYING_COLUMN[s.slice(6)]; key = r => { const p = parsePrice(r[col]); return p ? p.amount : null; }; asc = true; }
  if(!key) return rows.slice();
  return rows.map((r, i) => [key(r), i, r]).sort((a, b) => {
    if(a[0] == null && b[0] == null) return a[1] - b[1];
    if(a[0] == null) return 1; if(b[0] == null) return -1;
    return (asc ? a[0] - b[0] : b[0] - a[0]) || a[1] - b[1];
  }).map(x => x[2]);
}

/* ---------- offers to clients (Tim, 13/10: "offers we send to clients,
   that is now done manually") ----------
   One row per site, in the columns of the 2024 offer sheets (LJC -
   Igaming.com: domain, metrics, price, comments). The price is the
   publisher's price for the niche as recorded, unless the person typed
   another one; a margin rule is not applied until the team gives one. */
export const OFFER_COLUMNS = ["Domain", "Country", "Language", "DR", "RD", "Traffic", "Topic", "Price", "Casino", "Crypto", "CBD", "General", "Sponsor Tag", "Link Type", "Placement", "Comments"];
/* The sell columns of the database (what we charge), by niche. */
export const SELL_COLUMN = { casino: "Casino", unlicensedCasino: "Unlicensed Casino", crypto: "Crypto", forex: "Forex", cbd: "CBD", dating: "Dating", general: "General" };
/* The price an offer starts from: our sell price for the niche when the
   database has one (BRIEF, "Sell prices (what we charge): Casino …
   General", Gary's formulas); the Buying price only as a fallback, and the
   screen says which one it is. Review of 16/10: until then the client was
   offered our cost price. Returns {amount, source: "sell" | "buy"} or null. */
export function offerPriceOf(row, niche){
  const sell = parsePrice(row[SELL_COLUMN[niche]]);
  if(sell && sell.amount > 0) return { amount: sell.amount, source: "sell" };
  const buy = parsePrice(row[BUYING_COLUMN[niche]]);
  return buy ? { amount: buy.amount, source: "buy" } : null;
}
export function offerPrice(row, niche){
  const p = offerPriceOf(row, niche);
  return p ? p.amount : null;
}
/* The yes/no per niche, the sponsor tag and the terms are the columns of
   the 2024 Latam mastersheet the team builds offers from by hand (read
   13/10): "Casino Yes No", "Sponsor Tag Yes No", "Article Comments". */
export function rowForOffer(row, o){
  const n = c => { const v = numberOf(row[c]); return v == null ? "" : v; };
  const yes = niche => String(row[BUYING_COLUMN[niche]] ?? "").trim() ? "Yes" : "No";
  const tag = String(row["Sponsor Tag Type"] || "").trim();
  return { Domain: String(row.Domain || ""), Country: String(row["Main Country"] || ""), Language: String(row["Domain Language"] || ""),
    DR: n("Ahrefs Domain Rating"), RD: n("Ahrefs Referring Domains"), Traffic: n("Ahrefs Organic Traffic"), Topic: String(row["Website Topic"] || ""),
    Price: o && o.price != null && o.price !== "" ? Number(o.price) : (offerPrice(row, o && o.niche) ?? ""),
    Casino: yes("casino"), Crypto: yes("crypto"), CBD: yes("cbd"), General: yes("general"),
    "Sponsor Tag": tag ? tag : "No", "Link Type": String(row["Link Type"] || ""), Placement: String(row["Placement"] || ""),
    Comments: String((o && o.comment) || "") };
}

/* Countries and languages present, most frequent first. */
export function facetsOf(rows){
  const c = new Map(), l = new Map();
  for(const r of rows){ const a = String(r["Main Country"] || "").trim(), b = String(r["Domain Language"] || "").trim(); if(a) c.set(a, (c.get(a) || 0) + 1); if(b) l.set(b, (l.get(b) || 0) + 1); }
  const top = m => [...m.entries()].sort((x, y) => y[1] - x[1]).map(x => x[0]);
  return { countries: top(c), languages: top(l) };
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
export function matchList(items, index, { sender, brokerHintAt = 10, senderCount, senderType = "Publisher" } = {}){
  const groups = { unchanged: [], changed: [], unknown: [], removed: [], missing: [] };
  const mail = String(sender || "").trim().toLowerCase();
  /* senderCount comes from the Worker, which sees the whole sheet; the
     local index only sees the rows it was given. */
  const known = senderCount != null ? senderCount : (mail ? (index.bySender.get(mail) || []).length : 0);
  const brokerHint = known >= brokerHintAt ? known : 0;
  for(const item of items){
    const hit = index.byDomain.get(item.domain) || [];
    const gone = index.removed.get(item.domain) || [];
    const types = hit.map(h => String(h.row.Type || "").trim());
    /* A webmaster's list over a reseller's rows replaces them; a reseller's
       list over a webmaster's row changes nothing (Senad, 09/10). */
    const conversion = !isReseller(senderType) && types.length > 0 && types.every(isReseller);
    const keepWebmaster = isReseller(senderType) && types.some(tp => tp && !isReseller(tp));
    const base = { item, rows: hit.map(h => h.row), rowIndexes: hit.map(h => h.index), brokerHint, conversion, keepWebmaster };
    if(gone.length){ groups.removed.push({ ...base, removedRows: gone.map(g => g.row) }); continue; }
    if(!hit.length){ groups.unknown.push(base); continue; }
    const diffs = hit.map(h => priceDiff(item, h.row));
    const allEqual = diffs.every(d => d.length === 0);
    if(allEqual) groups.unchanged.push({ ...base, diffs });
    else groups.changed.push({ ...base, diffs, sameSender: !!mail && hit.some(h => senderOf(h.row) === mail) });
  }
  /* Senad, 09/10: "if a site is no longer present on the list provided by
     either a Webmaster or Broker, we put that site in the Removed Sites
     tab". The sender's rows that this list does not name. */
  if(mail){
    const listed = new Set(items.map(i => i.domain));
    for(const d of (index.bySender.get(mail) || [])){
      if(listed.has(d)) continue;
      const hit = index.byDomain.get(d) || [];
      if(!hit.length) continue;
      groups.missing.push({ item: { domain: d, path: "", raw: d, prices: {}, terms: "" }, rows: hit.map(h => h.row), rowIndexes: hit.map(h => h.index), brokerHint, conversion: false, keepWebmaster: false, missing: true });
    }
  }
  return groups;
}

/* The "removed sites" tab has the database's columns without the two
   Unlicensed Casino ones (read 07/10). A row moving there keeps its data,
   gets the reason first in Admin Comments and today's date. */
export const REMOVED_COLUMNS = DB_COLUMNS.filter(c => !/Unlicensed Casino/.test(c));
export function rowForRemoved(row, { reason = "REMOVED FROM THE LIST", listLabel = "", today = new Date(), note = "" } = {}){
  const d = String(today.getDate()).padStart(2, "0"), m = String(today.getMonth() + 1).padStart(2, "0"), y = today.getFullYear();
  const out = Object.fromEntries(REMOVED_COLUMNS.map(c => [c, row[c] == null ? "" : String(row[c])]));
  out["Admin Comments"] = [reason, String(row["Admin Comments"] || "").trim()].filter(Boolean).join("\n");
  out["User Comments"] = [String(row["User Comments"] || "").trim(), listLabel && `missing from list ${listLabel}`, note && String(note).trim()].filter(Boolean).join("; ");
  out["Last Updated"] = `${d}/${m}/${y}`;
  return out;
}

/* ---------- terms, as the database's fixed values ---------- */

/* Reads the free text of an item ("do follow, permanent, prices valid until
   31.12.2026, marked as Werbung") into the fixed values of the sheet. Empty
   string means the list did not say. `adminComments` holds only the phrases
   the team uses. */
/* "31.12.2026", "31-12-2026" or "2026-12-31" as the sheet writes dates:
   31/12/2026 (Senad, 09/10). Anything else is kept as written. */
export function sheetDate(s){
  let m = String(s).match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2}|\d{4})$/);
  if(m) return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3].length === 2 ? "20" + m[3] : m[3]}`;
  m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m) return `${m[3].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[1]}`;
  return String(s);
}
export function termsOf(item){
  const text = item.terms || "";
  const t = text.toLowerCase();
  const notMarked = /not marked as sponsored|not marked or tagged|no sponsored (tag|label)|without (a |any )?sponsored|not tagged as sponsored|nicht als (werbung|anzeige) (markiert|gekennzeichnet)|sin (etiqueta|marca) (de )?patrocin/.test(t);
  const marked0 = notMarked ? null : text.match(/(?:marked\s+as|marcat(?:\s+cu)?|gekennzeichnet\s+als|marcado\s+como)\s+["“'(]?([\p{L}\d-]+)[)"”']?/iu);
  /* "marked as sponsored" is the rel=sponsored tag, not a marking by the
     webmaster: no Admin Comments entry for it (review of 16/10). */
  const marked = marked0 && !/^sponsored$/i.test(marked0[1]) ? marked0 : null;
  const sponsorTag = notMarked ? "" : /rel=sponsored|sponsored (tag|link)s? (is |are )?(mandatory|required|added|used|included|obligator)|with (a |the )?sponsored (tag|link)|marked as sponsored|as sponsored/.test(t) ? "rel=sponsored" : (marked || /marked by (the )?(wm|webmaster)/.test(t)) ? "Marked by WM" : "";
  /* "permanent placement on request", "do-follow instead of no-follow:
     +99€" (drivar.de, 09/10) are options, not the included terms: a clause
     that says so is left out when reading link type and placement. */
  const t2 = t.replace(/[^.|\n,;]*(on request|auf anfrage|a petición|la cerere|optional|surcharge|aufpreis|extra charge|\+\s?\d)[^.|\n,;]*/g, " ");
  const linkType = /no-?\s?follow/.test(t2) ? "No follow" : /do-?\s?follow|dofollow/.test(t2) ? "Do follow" : "";
  const placement = /permanent|lifetime|forever|dauerhaft|permanente|pe viata|pe viață|for life/.test(t2) ? "permanent" : /2\s*(years?|jahre|años)|24\s*(months?|monate)/.test(t2) ? "2 Years" : /1\s*(year|jahr|año)|12\s*months?/.test(t2) ? "1 Year" : "";
  const until = text.match(/valid(?:o|a)?s?\s*(?:until|hasta|till|bis)\s*([\d.\/-]+)/i);
  const priceValidity = until ? sheetDate(until[1].replace(/[.\/-]+$/, "")) : /\bfixed\b|\bfijo\b|\bfest(e|er|es|en|preis)?\b/.test(t) ? "Fixed" : /not fixed|negotiable|negociable|verhandelbar/.test(t) ? "Not fixed" : "";
  const adminComments = [];
  if(marked) adminComments.push(`Marked as "${marked[1]}"`);
  if(item.prices && item.prices.unlicensedCasino) adminComments.push(`Unlicensed Casinos - ${formatPrice(item.prices.unlicensedCasino)} EUR`);
  else if(/unlicen[cs]ed casinos? accepted/.test(t)) adminComments.push("Unlicensed Casinos Accepted");
  else if(/only (properly |duly )?licen[cs]ed|no (any )?illegal gambling|non[- ]?gamstop|gambling \(legal\)|licen[cs]ed (casinos?|gambling|operators?) only/.test(t)) adminComments.push("Only Licensed Casinos");
  if(/written by (the )?(wm|webmaster)/.test(t)) adminComments.push("Written by WM");
  if(/no ?index\b/.test(t)) adminComments.push("NO INDEX");
  if(/index(ing|ación|ierung)?\s+(is\s+)?(not|cannot be|can'?t be|can not be|isn'?t)\s+guarante|no (se )?garantiza (la )?indexaci|indexierung (wird )?nicht garantiert/.test(t)) adminComments.push("Indexing is not guaranteed");
  if(/\bno (promotional or )?affiliates?\b/.test(t)) adminComments.push("No Affiliates");
  if(/no competitor('?s)? (links?|sites?|backlinks?|brands?)/.test(t)) adminComments.push("No Competitor Links");
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
export function rowForAccept(item, { type = "Publisher", sender = "", contactName = "", who = "", listLabel = "", today = new Date(), conversion = false, restored = false, note = "" } = {}){
  const d = String(today.getDate()).padStart(2, "0"), m = String(today.getMonth() + 1).padStart(2, "0"), y = today.getFullYear();
  const row = Object.fromEntries(DB_COLUMNS.map(c => [c, ""]));
  row.Type = FIXED.type.includes(type) ? type : "Publisher";
  row.Domain = item.domain;
  row.TLD = tldOf(item.domain);
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
  /* The database is in EUR (Gary, 06/10). A price given in another currency
     is written as given and said so, never converted here. */
  const foreign = NICHES.map(n => item.prices[n]).filter(p => p && p.currency && p.currency !== "EUR").map(p => p.currency).filter((c, i, a) => a.indexOf(c) === i);
  /* Senad, 09/10: a webmaster's row replaces a reseller's ("Broker
     conversion"); a site on removed sites comes back when a new list or a
     reply confirms it. Both are said in the row, so the person who pastes
     it knows what to remove or restore by hand. */
  row["User Comments"] = [who && `Accepted by ${who}`, listLabel && `from list ${listLabel}`, foreign.length && `Prices in ${foreign.join("/")}, not converted`,
    conversion && `Broker conversion: replaces the row from ${typeof conversion === "string" ? conversion : "the broker"}`,
    restored && `Restored from removed sites${typeof restored === "string" && restored ? " (" + restored + ")" : ""}`,
    note && String(note).trim()].filter(Boolean).join("; ");
  row["Last Updated"] = `${d}/${m}/${y}`;
  return row;
}

/* The TLD column: the registrable suffix, ".com" for blog.example.com and
   ".co.uk" for example.co.uk (two-part suffixes as the lists use them).
   Review of 16/10: before, a subdomain gave ".example.com". */
export function tldOf(domain){
  const parts = String(domain || "").toLowerCase().split(".").filter(Boolean);
  if(parts.length < 2) return "";
  const last2 = parts.slice(-2).join(".");
  return "." + (parts.length > 2 && /^(co|com|org|net|gov|gob|edu|ac|ne|or|go|mil|info|biz|sch|nhs|ltd|plc|me|web)\.[a-z]{2}$/.test(last2) ? last2 : parts[parts.length - 1]);
}

/* The 2026 database writes prices as bare numbers in EUR (1100, 250), read
   on 07/10. The 2024 Latam copy wrote "€ 400.00"; parsePrice reads both. */
export function formatPrice(p){
  return Number.isInteger(p.amount) ? String(p.amount) : p.amount.toFixed(2);
}
