// worker/src/adapters/tyler-results-parser.ts — Tyler renders cards, not a table (plan R39).
//
// Every earlier probe reported "0 rows" on a page that was showing fourteen documents, because it
// queried for `<tr>`. Tyler's Self-Service results are list items:
//
//   li.ss-search-row
//     h1                                    "2025028512 • DEED OF TRUST"
//     a[href^="/web/document/"]              /web/document/DOC516S3422?search=DOCSEARCH402S1
//     div.searchResultFourColumn
//       ul.selfServiceSearchResultColumn
//         li                                 "Recording Date"          ← label
//         li.selfServiceSearchResultCollapsed "10/23/2025 08:40 AM"    ← value
//
// The label/value pairing is what makes this parseable without depending on column order — the same
// decision as the Kofile header mapping, for the same reason.
//
// The legal descriptions are the reason this county matters to a surveyor. McLennan returns things
// like "Subdivision: FARWELL HEIGHTS ADDITION Lot: 13 Block: 17" and "Survey Name: N D HAMMIL
// Acres: 0.40" — subdivision, lot, block, survey name and acreage, straight off the index.

import type { ParsedRow } from './kofile-results-parser.js';

/** "Showing page 1 of 1 for 14 Total Results" */
export const RESULT_BANNER = /Showing page (\d+) of (\d+) for ([\d,]+) Total Results/i;

export interface ResultBanner {
  page: number;
  pages: number;
  total: number;
}

export function parseBanner(text: string): ResultBanner | null {
  const m = RESULT_BANNER.exec(text ?? '');
  if (!m) return null;
  return { page: Number(m[1]), pages: Number(m[2]), total: Number(m[3].replace(/,/g, '')) };
}

/** One card, already flattened by the page-side extractor. */
export interface TylerCard {
  /** The h1: "<instrument> • <document type>". */
  heading: string;
  /** Label → value, from the card's four-column block. */
  fields: Record<string, string>;
  /** href of the View Document link, if present. */
  documentHref?: string;
}

/** Split "2025028512 • DEED OF TRUST".
 *
 *  The separator is a bullet surrounded by non-breaking spaces. Splitting on a plain space would
 *  make the document type start at "•", and splitting on the first space would cut instrument
 *  numbers that contain one. */
export function splitHeading(heading: string): { instrumentNumber: string; documentType: string } {
  const h = (heading ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const i = h.indexOf('•');
  if (i < 0) return { instrumentNumber: h, documentType: '' };
  return { instrumentNumber: h.slice(0, i).trim(), documentType: h.slice(i + 1).trim() };
}

/** Tyler stacks multiple parties in one cell, one per line, and labels the count in the header
 *  ("Grantor (3)"). Splitting on commas would break "SMITH, JAMES T" into two people. */
export function splitParties(value: string): string[] {
  return (value ?? '')
    .split(/\r?\n|\s{2,}|(?<=[a-z])(?=[A-Z]{2,}\s)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '-');
}

/** Label lookup that tolerates the "(3)" party counts and casing. */
function fieldFor(fields: Record<string, string>, want: RegExp): string {
  for (const [k, v] of Object.entries(fields)) if (want.test(k.replace(/\s*\(\d+\)\s*$/, '').trim())) return v;
  return '';
}

/** Tyler prints the recording date with a time: "10/23/2025 08:40 AM". The time is dropped — a
 *  chain of title is ordered by day, and keeping it invites string comparisons that sort wrong. */
export function recordingDate(value: string): string {
  const m = /^(\d{1,2}\/\d{1,2}\/\d{4})/.exec((value ?? '').trim());
  return m ? m[1] : (value ?? '').trim();
}

export interface TylerParsedRow extends ParsedRow {
  /** Tyler's internal document id, from the View Document link — needed to fetch the image later. */
  documentId?: string;
}

const DOC_ID = /\/web\/document\/([^/?#]+)/i;

export function parseCard(card: TylerCard): TylerParsedRow | null {
  const { instrumentNumber, documentType } = splitHeading(card.heading);
  // A card with no instrument number is a template or a spacer row, not a document.
  if (!instrumentNumber || !/\d/.test(instrumentNumber)) return null;

  const grantors = splitParties(fieldFor(card.fields, /^grantor$/i));
  const grantees = splitParties(fieldFor(card.fields, /^grantee$/i));
  const legal = fieldFor(card.fields, /^legal description$/i).replace(/\s+/g, ' ').trim();

  return {
    instrumentNumber,
    documentType,
    recordingDate: recordingDate(fieldFor(card.fields, /^recording date$/i)),
    grantors,
    grantees,
    legalDescription: legal || undefined,
    documentId: DOC_ID.exec(card.documentHref ?? '')?.[1],
  };
}

export interface TylerParseReport {
  rows: TylerParsedRow[];
  banner: ResultBanner | null;
  cardsSeen: number;
  /** True when the banner's total disagrees with what we parsed on this page. */
  countMismatch: boolean;
}

export function parseResults(cards: TylerCard[], pageText: string): TylerParseReport {
  const rows = cards.map(parseCard).filter((r): r is TylerParsedRow => r !== null);
  const banner = parseBanner(pageText);

  // On a single-page result set the banner total should equal the rows parsed. A mismatch means
  // cards were dropped, and silently returning fewer documents than the county reported is how a
  // chain of title loses a link.
  const countMismatch = !!banner && banner.pages === 1 && banner.total !== rows.length;

  return { rows, banner, cardsSeen: cards.length, countMismatch };
}

export function describeParse(report: TylerParseReport, county: string): string {
  const parts: string[] = [];
  if (report.banner) {
    parts.push(`${county}: page ${report.banner.page}/${report.banner.pages}, ${report.banner.total} total result(s); parsed ${report.rows.length}.`);
  } else {
    parts.push(`${county}: parsed ${report.rows.length} document(s) from ${report.cardsSeen} card(s); NO results banner found.`);
  }
  if (report.countMismatch) {
    parts.push(
      `MISMATCH: the portal reported ${report.banner?.total} results but ${report.rows.length} parsed. ` +
        `Documents were dropped — treat this page as incomplete, not as the full answer.`,
    );
  }
  return parts.join(' ');
}
