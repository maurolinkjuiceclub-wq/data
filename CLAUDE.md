# House rules — Site lists

Separate project from the outreach desk (`proto2`). Same team, same rules
of evidence; none of the desk's code is shared, only its look.

1. **Brief before code.** `BRIEF.md` holds the decisions. A change that
   contradicts a decision there is discussed first, not built first.
2. **An identifier is checked against its source** before it is written:
   column names against the sheet, counts against a script run, never
   carried forward from a document.
3. **The page never writes without a click.** Nothing is written to the
   sheet on import, on match, or by default. Only Accept writes, one row.
4. **Removed sites come back only on purpose.** A domain in the "removed
   sites" tab is shown as removed, with its reason. The only way to write it
   is Restore, and the row then says "Restored from removed sites" (Senad,
   09/10: a site on a new list, or confirmed again, is restored).
5. **Testing means running it.** `node scripts/probar-listas.mjs` before
   every push, and the page opened in a browser, both languages.
6. **English is written in English.** Interface, documentation and commit
   messages in English. Record data (notes written while reading mail) may
   stay in Spanish.
7. **No email is sent from here.** Ever.
