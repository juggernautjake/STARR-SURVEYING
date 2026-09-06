// worker/src/research/property-search-inputs.ts — main vs supplemental inputs + relevance (plan H1).
//
// The operator gives a property's ID and address (the MAIN keys that drive the search) and, optionally,
// supplemental identifiers: instrument numbers, key names, volume/page, plat cabinet/slide. The owner's
// rule (2026-09-05): the more supplemental info entered, the more chance some of it won't line up, so it
// is taken WITH A GRAIN OF SALT — used to search and to raise confidence, but NEVER a reason to reject a
// document. A document that matches the correct property ID and/or address is relevant and viable; a
// supplemental match is a bonus, a supplemental mismatch is not a veto. Pure, unit-tested.

import { normText } from './cross-source-match.js';

export interface VolumePage {
  volume?: string;
  book?: string;
  page?: string;
}

export interface CabinetSlide {
  cabinet?: string;
  slide?: string;
}

export interface PropertySearchInputs {
  county: string;
  // ── Main keys — drive the search; a document matching these is relevant. ──
  propertyId?: string;
  address?: string;
  // ── Supplemental — searched + confidence, grain of salt, never a reject reason. ──
  instrumentNumbers?: string[];
  ownerNames?: string[];
  volumePages?: VolumePage[];
  cabinetSlides?: CabinetSlide[];
  subdivision?: string;
  lot?: string;
  block?: string;
}

/** A document's identifiers, as much as a source publishes. */
export interface DocIdentifiers {
  propertyId?: string;
  address?: string;
  instrument?: string;
  volume?: string;
  book?: string;
  page?: string;
  cabinet?: string;
  slide?: string;
  /** grantor/grantee and any other names on the record. */
  ownerNames?: string[];
  subdivision?: string;
  lot?: string;
  block?: string;
}

export interface RelevanceResult {
  relevant: boolean;
  /** Which MAIN keys matched (`propertyId` / `address`). */
  mainMatches: string[];
  /** Which SUPPLEMENTAL identifiers matched. */
  supplementalMatches: string[];
  /** 0..1 — a main match is strong; supplemental matches add. */
  confidence: number;
  reason: string;
}

const normId = (s?: string): string => (s ?? '').trim().toLowerCase();
const normInstr = (s?: string): string => (s ?? '').replace(/\D/g, '');
const normVal = (s?: string): string => (s ?? '').replace(/[^0-9a-z]/gi, '').toLowerCase();
const normAddr = (s?: string): string => (s ?? '').toLowerCase().replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim();

function namesAgree(a?: string, b?: string): boolean {
  const na = normText(a);
  const nb = normText(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** First run of digits in a string — a street/parcel number for a loose address compare. */
function leadingNumber(s: string): string {
  return (s.match(/\d+/)?.[0]) ?? '';
}

function addressAgrees(a?: string, b?: string): boolean {
  const na = normAddr(a);
  const nb = normAddr(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Share the street number AND at least one street word — tolerant of "St" vs "Street", city/zip noise.
  const numA = leadingNumber(na);
  const numB = leadingNumber(nb);
  if (numA && numA === numB) {
    const wordsA = new Set(na.split(' ').filter((w) => w.length > 2 && !/^\d+$/.test(w)));
    const wordsB = nb.split(' ').filter((w) => w.length > 2 && !/^\d+$/.test(w));
    if (wordsB.some((w) => wordsA.has(w))) return true;
  }
  return false;
}

function matchesVolumePage(vp: VolumePage, doc: DocIdentifiers): boolean {
  const wantVol = normVal(vp.volume ?? vp.book);
  const docVol = normVal(doc.volume ?? doc.book);
  const wantPage = normVal(vp.page);
  const docPage = normVal(doc.page);
  return !!wantVol && !!wantPage && wantVol === docVol && wantPage === docPage;
}

function matchesCabinetSlide(cs: CabinetSlide, doc: DocIdentifiers): boolean {
  const wantCab = normVal(cs.cabinet);
  const docCab = normVal(doc.cabinet);
  const wantSlide = normVal(cs.slide);
  const docSlide = normVal(doc.slide);
  // Slide can carry a suffix ("166-APR"); a prefix match on the normalised slide is enough.
  const slideOk = !!wantSlide && !!docSlide && (wantSlide === docSlide || docSlide.startsWith(wantSlide) || wantSlide.startsWith(docSlide));
  return !!wantCab && wantCab === docCab && slideOk;
}

/**
 * Decide whether a document is relevant to the property being researched, per the owner's rule: relevant
 * iff it matches a MAIN key (property id / address) OR an exact supplemental identifier (instrument /
 * volume-page / cabinet-slide). Softer supplemental signals (names, subdivision, lot) only ADD
 * confidence — they never make an otherwise-unmatched document relevant, and a mismatch never rejects.
 */
export function documentRelevance(doc: DocIdentifiers, inputs: PropertySearchInputs): RelevanceResult {
  const mainMatches: string[] = [];
  const supplementalMatches: string[] = [];

  if (inputs.propertyId && doc.propertyId && normId(doc.propertyId) === normId(inputs.propertyId)) mainMatches.push('propertyId');
  if (addressAgrees(inputs.address, doc.address)) mainMatches.push('address');

  if (doc.instrument && (inputs.instrumentNumbers ?? []).some((i) => normInstr(i) && normInstr(i) === normInstr(doc.instrument))) supplementalMatches.push('instrument');
  if ((inputs.volumePages ?? []).some((vp) => matchesVolumePage(vp, doc))) supplementalMatches.push('volumePage');
  if ((inputs.cabinetSlides ?? []).some((cs) => matchesCabinetSlide(cs, doc))) supplementalMatches.push('cabinetSlide');
  if ((doc.ownerNames ?? []).length > 0 && (inputs.ownerNames ?? []).some((n) => (doc.ownerNames ?? []).some((dn) => namesAgree(n, dn)))) supplementalMatches.push('name');
  if (inputs.subdivision && doc.subdivision && namesAgree(inputs.subdivision, doc.subdivision)) supplementalMatches.push('subdivision');
  if (inputs.lot && doc.lot && normVal(inputs.lot) === normVal(doc.lot)) supplementalMatches.push('lot');

  const strongSupplemental = supplementalMatches.some((m) => m === 'instrument' || m === 'volumePage' || m === 'cabinetSlide');
  const relevant = mainMatches.length > 0 || strongSupplemental;

  const w: Record<string, number> = { propertyId: 0.6, address: 0.4, instrument: 0.5, volumePage: 0.4, cabinetSlide: 0.4, name: 0.15, subdivision: 0.15, lot: 0.1 };
  let confidence = 0;
  for (const m of [...mainMatches, ...supplementalMatches]) confidence += w[m] ?? 0;
  confidence = Math.min(1, confidence);

  const reason = relevant
    ? `matched ${[...mainMatches, ...supplementalMatches].join(', ')}`
    : 'no property-id / address / instrument / volume-page / cabinet match';

  return { relevant, mainMatches, supplementalMatches, confidence, reason };
}
