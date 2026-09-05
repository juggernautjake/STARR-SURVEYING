// worker/src/research/acquisition-wantlist.ts — what the Gather run tries to obtain, in order (G3)
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// The Gather run is not driven by confidence discrepancies (that is `purchase-recommender.ts`, a
// different job). It works through a fixed WANT-LIST the owner named: for the subject property and
// for every adjoiner, get the plats/drawings first and then the most-recent deed with bearings &
// calls. This module turns the parcel + adjoiner facts the pipeline already has into that ordered
// list, with the search keys each want needs (book/vol/page, name, subdivision/lot). It is pure so
// the ordering and the "most recent deed" selection can be unit-tested without a run.
//
// The list is consumed free-FIRST (G5 tries each want on free county sources) and only then does
// TexasFile fill the gaps (G4), so the order here is also the spend order: plats before deeds,
// subject before adjoiners.

export type WantTarget = 'subject' | 'adjoiner';
export type WantKind = 'plat' | 'recent_deed';

export interface KnownDoc {
  type: string;
  instrument?: string;
  book?: string;
  page?: string;
  /** ISO (YYYY-MM-DD) or US (MM/DD/YYYY). Used to pick the most-recent deed. */
  recordingDate?: string;
  /** A grantor/grantee name, if the record carried one. */
  name?: string;
}

export interface SubjectInput {
  ownerName?: string;
  legalDescription?: string;
  subdivision?: string;
  lot?: string;
  knownDocuments?: KnownDoc[];
}

export interface AdjoinerInput {
  id: string;
  ownerName?: string;
  legalDescription?: string;
  situsAddress?: string;
}

export interface Want {
  /** Global order the Gather run works the list in (0 first). */
  order: number;
  target: WantTarget;
  /** Which adjoiner this is for, when target === 'adjoiner'. */
  adjoinerId?: string;
  kind: WantKind;
  /** The category the document will be filed under. */
  documentType: 'plat' | 'deed';
  /** Human label for logs / the UI. */
  label: string;
  // ── search keys (any that could be derived; a consumer uses whichever the source accepts) ──
  name?: string;
  book?: string;
  page?: string;
  instrument?: string;
  subdivision?: string;
  lot?: string;
  /** For a deed want, the date of the record we chose (so a consumer can confirm it is the latest). */
  recordingDate?: string;
}

/** Build the ordered Gather want-list from the subject + adjoiner facts. */
export function buildWantList(input: { subject: SubjectInput; adjoiners?: AdjoinerInput[] }): Want[] {
  const wants: Want[] = [];
  const subj = input.subject ?? {};
  const subjSubLot = { subdivision: subj.subdivision, lot: subj.lot, ...parseSubdivisionLot(subj.legalDescription) };

  // 1. Subject plat / drawing — prefer a known plat's own citation, else search by subdivision/lot/name.
  const knownPlat = (subj.knownDocuments ?? []).find((d) => isPlat(d.type));
  wants.push({
    order: 0,
    target: 'subject',
    kind: 'plat',
    documentType: 'plat',
    label: 'Subject property plat / drawing',
    name: knownPlat?.name ?? subj.ownerName,
    book: knownPlat?.book,
    page: knownPlat?.page,
    instrument: knownPlat?.instrument,
    subdivision: subjSubLot.subdivision,
    lot: subjSubLot.lot,
  });

  // 2. Subject most-recent deed (bearings & calls) — the newest deed we know of, else a name search.
  const subjDeed = mostRecentDeed(subj.knownDocuments);
  wants.push({
    order: 1,
    target: 'subject',
    kind: 'recent_deed',
    documentType: 'deed',
    label: 'Subject property most-recent deed',
    name: subjDeed?.name ?? subj.ownerName,
    book: subjDeed?.book,
    page: subjDeed?.page,
    instrument: subjDeed?.instrument,
    recordingDate: subjDeed?.recordingDate,
  });

  // 3. Adjoiner plats first (all of them), then 4. adjoiner most-recent deeds — plats outrank deeds
  //    globally, so every adjoiner plat is ordered before any adjoiner deed.
  const adjoiners = input.adjoiners ?? [];
  let order = 2;
  for (const adj of adjoiners) {
    const sl = parseSubdivisionLot(adj.legalDescription);
    wants.push({
      order: order++,
      target: 'adjoiner',
      adjoinerId: adj.id,
      kind: 'plat',
      documentType: 'plat',
      label: `Adjoiner plat / drawing — ${adj.ownerName ?? adj.id}`,
      name: adj.ownerName,
      subdivision: sl.subdivision,
      lot: sl.lot,
    });
  }
  for (const adj of adjoiners) {
    wants.push({
      order: order++,
      target: 'adjoiner',
      adjoinerId: adj.id,
      kind: 'recent_deed',
      documentType: 'deed',
      label: `Adjoiner most-recent deed — ${adj.ownerName ?? adj.id}`,
      name: adj.ownerName,
    });
  }

  return wants;
}

/** The known deed with the newest recording date (ties: keep the first seen). Null if none. */
export function mostRecentDeed(docs?: KnownDoc[]): KnownDoc | null {
  const deeds = (docs ?? []).filter((d) => isDeed(d.type));
  if (deeds.length === 0) return null;
  return deeds.reduce((best, d) => (dateValue(d.recordingDate) > dateValue(best.recordingDate) ? d : best));
}

/** Pull a subdivision name and lot number out of a free-text legal description, best-effort. */
export function parseSubdivisionLot(legal?: string): { subdivision?: string; lot?: string } {
  if (!legal) return {};
  const out: { subdivision?: string; lot?: string } = {};
  const lot = legal.match(/\bLOTS?\s+([0-9]+[A-Z]?)/i);
  if (lot) out.lot = lot[1];
  // "…, OAK HILLS SUBDIVISION" / "OAK HILLS ADDITION" / "OAK HILLS ADDN" / "RIVER OAKS ESTATES".
  // The name is the words immediately before the keyword — cut off any "Lot N,", ", " or " of "
  // prefix so we keep the subdivision, not the lot clause that led into it.
  const sub = legal.match(/([A-Za-z0-9 .'&-]+?)\s+(?:SUBDIVISION|ADDITION|ADDN|ESTATES)\b/i);
  if (sub) {
    const name = sub[1]
      .split(/,|\bof\b|\bin\b/i)
      .pop()!
      .replace(/^\s*lots?\s+\d+[a-z]?\s*/i, '')
      .trim();
    if (name) out.subdivision = name;
  }
  return out;
}

function isPlat(type?: string): boolean {
  return /\b(plat|survey|drawing|map)\b/i.test(type ?? '');
}
function isDeed(type?: string): boolean {
  return /\bdeed\b/i.test(type ?? '');
}

/** Comparable value for a recording date; unknown/invalid sorts oldest. Accepts ISO or MM/DD/YYYY. */
function dateValue(raw?: string): number {
  if (!raw) return -Infinity;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3]);
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return Date.UTC(+us[3], +us[1] - 1, +us[2]);
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : -Infinity;
}
