// worker/src/services/texasfile-rows.ts — TexasFile result rows, parsed by COLUMN, not by regex over text
//
// ── WHAT WAS WRONG (found 2026-09-07 on the worker, against the live site) ─────────────────────
//
// The redesigned TexasFile SPA injects a `<style>` element inside every result row (the tooltip on the
// Purchase button carries its own CSS). The old parser read `row.textContent`, which INCLUDES that CSS,
// and ran its date / "7+ digit instrument" / "Pages:" regexes over `.t035e8771 { color: #fff; … }`.
// Every plat came back with no cabinet, slide or date; every deed with no instrument, book, volume,
// page, grantor, grantee or legal description. A name search for the owner returned 39 rows and the
// buy took the first one — a lien on a different subdivision — because nothing could tell them apart.
//
// The rows are clean and columnar. Clerk records: Date Filed | Type | Number | Book | Volume | Page |
// Grantor | Grantee | Legal Desc.  Plats: Filed Date | Subdivision Name | Number | Cabinet/Volume |
// Slide/Page | Description. So the browser side extracts each row's cells + headers + tooltip + detail
// row as plain strings (with styles removed), and THIS module — pure, unit-tested against rows copied
// verbatim from the live site — turns them into a `TexasFileResult`.
//
// ── EDGE CASES THIS HANDLES ───────────────────────────────────────────────────────────────────────
//   • TexasFile lists a 2004 deed as number "34968"; Bell CAD calls the same deed "2004034968". The
//     canonical form is year + 6-digit sequence, so clustering, ranking and the library dedup agree.
//   • "-" means empty. Legal descriptions carry several lots ("Lot: 3 … Lot: 4"), partial lots, letter
//     blocks, and rural forms ("Abstract: 123 Survey: …"). Plat names are abbreviated ("WINNIE MAE ADD").
//   • Headers may be absent (a mobile layout, a future change) → positional fallback per product.
//   • Pages + price come from the Purchase tooltip ("Click to purchase 3 pages for $3.00") or the
//     detail row ("Pages: 3"); a plat is $10 flat whatever its page count.

import type { TexasFileResult } from './texasfile-buy.js';

/** What the browser hands over per result row — strings only, so it crosses page.evaluate. */
export interface RawTexasFileRow {
  guid: string;
  headers: string[];
  cells: string[];
  tooltip: string;
  detail: string;
  /** The row shows a Download button and no Purchase button: the account already owns it
   *  (2026-09-07 — an owned plat vanished from our results because we keyed on Purchase buttons,
   *  and the run would have bought the duplicate row for another $10). */
  owned?: boolean;
}

export type TexasFileProduct = 'instrument' | 'plat';

/** Where each field sits when the table has no readable headers (index into `cells`). */
const POSITIONAL: Record<TexasFileProduct, Record<string, number>> = {
  instrument: { date: 1, type: 2, number: 3, book: 4, volume: 5, page: 6, grantor: 7, grantee: 8, legal: 9 },
  plat: { date: 1, name: 2, number: 3, volume: 4, page: 5, description: 6 },
};

/** Header text → field. Matched case-insensitively on a fragment so a wording tweak still lands. */
const HEADER_FIELDS: Array<[RegExp, string]> = [
  [/date/i, 'date'],
  [/^type$/i, 'type'],
  [/number/i, 'number'],
  [/^book$/i, 'book'],
  [/cabinet|volume/i, 'volume'],
  [/slide|page/i, 'page'],
  [/grantor/i, 'grantor'],
  [/grantee/i, 'grantee'],
  [/legal/i, 'legal'],
  [/subdivision name|^name$/i, 'name'],
  [/description/i, 'description'],
];

const blank = (s: string | undefined | null): string | null => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return !t || t === '-' || t === '—' ? null : t;
};

/** The row's cells keyed by field, by header when the headers line up with the cells, else by position. */
export function fieldsOf(raw: RawTexasFileRow, product: TexasFileProduct): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const byHeader = raw.headers.length === raw.cells.length && raw.headers.some((h) => /date/i.test(h));
  if (byHeader) {
    raw.headers.forEach((h, i) => {
      const hit = HEADER_FIELDS.find(([re]) => re.test(h.trim()));
      if (hit && !(hit[1] in out)) out[hit[1]] = blank(raw.cells[i]);
    });
  } else {
    for (const [field, i] of Object.entries(POSITIONAL[product])) out[field] = blank(raw.cells[i]);
  }
  return out;
}

/** "11/23/2020" | "2020-11-23" → the year, or null. */
export function yearOf(date: string | null | undefined): string | null {
  const m = (date ?? '').match(/(\d{4})-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/(\d{4})/);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

/**
 * Bell's canonical instrument: YYYY + six-digit sequence. TexasFile's Number column shows the short
 * sequence for older filings ("34968" on a 2004 deed); the CAD, the clerk and our library carry
 * "2004034968". Ten-digit numbers are already canonical; a short number with no date stays as is.
 */
export function canonicalInstrument(number: string | null | undefined, dateFiled: string | null | undefined): string | null {
  const digits = (number ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length >= 10) return digits;
  const year = yearOf(dateFiled);
  if (year && digits.length <= 6) return `${year}${digits.padStart(6, '0')}`;
  return digits;
}

/** Do two instrument numbers name the same filing? Exact digits, or a short sequence against its
 *  year-prefixed form ("34968" ≡ "2004034968"). A sequence shorter than four digits never matches by
 *  suffix — too many filings share a tail that short. */
export function instrumentsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = (a ?? '').replace(/\D/g, '');
  const db = (b ?? '').replace(/\D/g, '');
  if (!da || !db) return false;
  if (da === db) return true;
  const [long, short] = da.length >= db.length ? [da, db] : [db, da];
  if (long.length < 10 || short.length > 6 || short.length < 4) return false;
  return long.endsWith(short.padStart(6, '0')) || long.endsWith(short);
}

export interface ParsedLegal {
  subdivision?: string;
  lots: string[];
  block?: string;
  abstract?: string;
  survey?: string;
}

/** "Lot: 3 Block: 1 Subdivision: WINNIE MAE ADDITION Lot: 4 More Info" → the identifiers. */
export function parseLegal(text: string | null | undefined): ParsedLegal {
  const t = (text ?? '').replace(/\s+/g, ' ').replace(/\bMore Info\b/gi, '').trim();
  const lots = [...t.matchAll(/\bLots?:\s*([A-Z0-9][A-Z0-9-]*)/gi)].map((m) => m[1]!.toUpperCase());
  const block = t.match(/\bBlock:\s*([A-Z0-9][A-Z0-9-]*)/i)?.[1]?.toUpperCase();
  const stop = '(?=\\s+(?:Lots?|Block|Abstract|Survey|Acres|Tract|Section|Phase|Unit|Subdivision):|$)';
  const subdivision = t.match(new RegExp(`\\bSubdivision:\\s*(.+?)${stop}`, 'i'))?.[1]?.trim();
  const abstract = t.match(new RegExp(`\\bAbstract:\\s*(.+?)${stop}`, 'i'))?.[1]?.trim();
  const survey = t.match(new RegExp(`\\bSurvey:\\s*(.+?)${stop}`, 'i'))?.[1]?.trim();
  return {
    ...(subdivision ? { subdivision: normaliseSubdivisionName(subdivision) } : {}),
    lots: [...new Set(lots)],
    ...(block ? { block } : {}),
    ...(abstract ? { abstract } : {}),
    ...(survey ? { survey } : {}),
  };
}

/** The recorded name and the CAD's name for one subdivision differ by abbreviation ("WINNIE MAE ADD"
 *  vs "WINNIE MAE ADDITION"). One spelling, so every comparison downstream agrees. */
export function normaliseSubdivisionName(name: string | null | undefined): string {
  return (name ?? '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\bADDN?\b\.?/g, 'ADDITION')
    .replace(/\bSUBD?\b\.?/g, 'SUBDIVISION')
    .replace(/\bESTS?\b\.?/g, 'ESTATES')
    .replace(/\bHTS\b\.?/g, 'HEIGHTS')
    .replace(/\bPH\b\.?\s*(?=\d)/g, 'PHASE ')
    .replace(/\bSEC\b\.?\s*(?=\d)/g, 'SECTION ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Is this plat row the plat for the parcel's subdivision? (plan PLATS_FIRST_AND_VIEWER 1.5 — "really
 * determine if we are finding the correct subdivision plat".) At buy time the evidence is the plat
 * index itself: its Subdivision Name against the CAD's legal-description subdivision, both
 * normalised ("WINNIE MAE ADD" ≡ "WINNIE MAE ADDITION"), plus the cabinet/slide and filing date the
 * row states. `exact` = the names agree; `partial` = one contains the other (a replat / phase of the
 * same subdivision, or a survey-name hit); `none` = a different name — logged, and left for the
 * Analyze run's reading of the page itself to confirm.
 */
export function platMatchVerdict(
  row: Pick<TexasFileResult, 'name' | 'subdivision' | 'bookVolPage' | 'date'>,
  targetSubdivision: string | null | undefined,
): { verdict: 'exact' | 'partial' | 'none' | 'unchecked'; line: string } {
  const rowName = normaliseSubdivisionName(row.name ?? row.subdivision ?? '');
  const target = normaliseSubdivisionName(targetSubdivision ?? '');
  const where = [row.bookVolPage ? `cabinet/slide ${row.bookVolPage}` : null, row.date ? `filed ${row.date}` : null].filter(Boolean).join(', ');
  if (!target || !rowName) {
    return { verdict: 'unchecked', line: `Plat filed (${rowName || 'unnamed'}${where ? `; ${where}` : ''}) — no subdivision to check it against; the Analyze run reads the page.` };
  }
  if (rowName === target) {
    return { verdict: 'exact', line: `Plat verified: the index names "${rowName}", the CAD legal description names "${target}"${where ? ` — ${where}` : ''}.` };
  }
  if (rowName.includes(target) || target.includes(rowName)) {
    return { verdict: 'partial', line: `Plat likely right: the index names "${rowName}" vs the CAD's "${target}" (a phase/replat or a wider name)${where ? ` — ${where}` : ''}; the Analyze run confirms from the page.` };
  }
  return { verdict: 'none', line: `Plat NOT verified: the index names "${rowName}" but the CAD legal description names "${target}"${where ? ` — ${where}` : ''}. Check it before relying on it.` };
}

/** Pages + price from the Purchase tooltip or the detail row. */
export function parsePagesAndPrice(tooltip: string, detail: string): { pages: number | null; priceUsd: number | null } {
  const tip = tooltip.match(/purchase\s+(\d+)\s+pages?\s+for\s+\$\s*([\d,]+(?:\.\d+)?)/i);
  if (tip) return { pages: Number(tip[1]), priceUsd: Number(tip[2]!.replace(/,/g, '')) };
  const price = tooltip.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  const pages = (tooltip + ' ' + detail).match(/\bPages?:\s*(\d+)/i);
  return { pages: pages ? Number(pages[1]) : null, priceUsd: price ? Number(price[1]!.replace(/,/g, '')) : null };
}

/** One raw row → a TexasFileResult. Never throws: an unreadable row is a result with nulls. */
export function parseTexasFileRow(raw: RawTexasFileRow, product: TexasFileProduct): TexasFileResult {
  const f = fieldsOf(raw, product);
  const { pages, priceUsd } = parsePagesAndPrice(raw.tooltip, raw.detail);
  const date = f.date ?? null;
  const text = [...raw.cells.slice(1), raw.detail].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 240);

  const owned = raw.owned === true;
  if (product === 'plat') {
    const name = f.name ? normaliseSubdivisionName(f.name) : null;
    const cab = f.volume;
    const slide = f.page;
    return {
      guid: raw.guid,
      owned,
      instrument: canonicalInstrument(f.number, date),
      instrumentRaw: f.number,
      bookVolPage: cab && slide ? `${cab}/${slide}` : null,
      volume: cab,
      page: slide,
      pages,
      priceUsd,
      type: 'plat',
      date,
      name,
      subdivision: name,
      lots: [],
      description: f.description ?? null,
      text,
    };
  }

  const legal = parseLegal(f.legal);
  const countyType = raw.detail.match(/County Type:\s*(.+?)(?:\s+Additional|$)/i)?.[1]?.trim();
  return {
    guid: raw.guid,
    owned,
    instrument: canonicalInstrument(f.number, date),
    instrumentRaw: f.number,
    bookVolPage: f.volume && f.page ? `${f.volume}/${f.page}` : null,
    book: f.book,
    volume: f.volume,
    page: f.page,
    pages,
    priceUsd,
    type: f.type ?? (countyType && countyType !== '-' ? countyType : null),
    countyType: countyType && countyType !== '-' ? countyType : null,
    date,
    grantor: f.grantor,
    grantee: f.grantee,
    legal: f.legal,
    subdivision: legal.subdivision ?? null,
    lots: legal.lots,
    block: legal.block ?? null,
    abstract: legal.abstract ?? null,
    survey: legal.survey ?? null,
    text,
  };
}

/**
 * Runs INSIDE the page (page.evaluate serialises it — no outer references). Returns one raw row per
 * Purchase button: the table headers, the row's cells with every injected `<style>`/tooltip removed,
 * the tooltip's own sentence, and the detail row that follows (rowspan layout), de-duplicated by GUID.
 */
export function extractTexasFileRawRows(): RawTexasFileRow[] {
  const rows: RawTexasFileRow[] = [];
  const clean = (el: Element | null): string => {
    if (!el) return '';
    const c = el.cloneNode(true) as Element;
    c.querySelectorAll('style, script, .__react_component_tooltip').forEach((n) => n.remove());
    return (c.textContent || '').replace(/\s+/g, ' ').trim();
  };
  // Every action button on a result row carries value "14:<GUID>" (Purchase, Cart, My File,
  // Download). Keying on ANY of them — not only Purchase — is what keeps an already-owned document
  // (Download button, no Purchase button) in the results.
  const buttons = Array.from(document.querySelectorAll('button[value^="14:"], button[name="btnPurchaseFromSearch"], button[data-for^="Purchase-"]'));
  const rowsSeen = new Set<Element>();
  for (const b of buttons) {
    const row = b.closest('tr');
    if (!row || rowsSeen.has(row)) continue;
    rowsSeen.add(row);
    const value = b.getAttribute('value') || '';
    const dataFor = b.getAttribute('data-for') || '';
    const holder = b.closest('[id^="purchaseButton"]');
    const guid = value.replace(/^\d+:/, '') || dataFor.replace(/^[A-Za-z]+-/, '') || (holder ? holder.id.replace('purchaseButton', '') : '');
    if (!/^[0-9a-f-]{30,}$/i.test(guid)) continue;
    const purchaseBtn = row.querySelector('button[name="btnPurchaseFromSearch"], button[data-for^="Purchase-"]');
    const downloadBtn = row.querySelector('button[data-for^="Download-"]');
    const table = row.closest('table');
    const headers = table ? Array.from(table.querySelectorAll('thead th, tr th')).map((th) => clean(th)) : [];
    const cells = Array.from(row.children).filter((el) => el.tagName === 'TD').map((td) => clean(td));
    const tipHost = (purchaseBtn ?? b).parentElement;
    const tipEl = tipHost ? tipHost.querySelector('.__react_component_tooltip') : null;
    const tipDiv = tipEl ? tipEl.querySelector(':scope > div') : null;
    const tooltip = tipDiv ? (tipDiv.textContent || '').replace(/\s+/g, ' ').trim() : '';
    const next = row.nextElementSibling;
    const detail = next && !next.querySelector('button[value^="14:"]') ? clean(next) : '';
    rows.push({ guid: guid.toUpperCase(), headers, cells, tooltip, detail, owned: !purchaseBtn && !!downloadBtn });
  }
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.guid) ? false : (seen.add(r.guid), true)));
}
