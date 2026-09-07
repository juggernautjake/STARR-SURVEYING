// worker/src/research/subdivision-name.ts — ONE parser for "which subdivision is this lot in"
//
// ── WHY ONE ─────────────────────────────────────────────────────────────────────────────────────
//
// Three copies of this existed (bell-county-classifier, counties/bell/scrapers/plat-scraper,
// services/county-plats), each covering a different subset of the shapes a CAD legal description
// takes. The Bell run used the plat-scraper copy, which needed a KEYWORD (ADDITION / SUBDIVISION /
// ESTATES …) or the space form "LOT N BLK M NAME" — so a residential subdivision named without one
// ("NORTH BELTON, BLOCK 12, LOT 4") produced NO subdivision, and with no subdivision there is no
// plat search. The subdivision name is the key to the plat; getting it is the whole game for a
// residential lot. Every shape seen on Bell CAD, plus the ones the other two copies handled, lives
// here, and the three exports delegate.
//
// ── SHAPES ──────────────────────────────────────────────────────────────────────────────────────
//   "WINNIE MAE ADDITION, BLOCK 001, LOT 4, PT 3, (E 34' OF 3)"   Bell CAD, the common form
//   "NORTH BELTON, BLOCK 12, LOT 4"                                 no keyword in the name
//   "SUNRIDGE ESTATES PHASE 2, BLOCK A, LOT 3"                     keep the phase
//   "LOT 3, BLOCK A, SUNRIDGE ESTATES"                             reversed
//   "LOT 5 BLK 2 OAK CREEK ADDN"                                    space form, abbreviated
//   "WINNIE MAE ADDITION LOT 4 BLK 1"                               name first, space form
//   "WINNIE MAE ADDITION, LOT 4"                                    no block
//   "A0123 J SMITH SURVEY, ACRES 10.5" / "BUSINESS PERSONAL …"     NOT a platted lot → null

import { normaliseSubdivisionName } from '../services/texasfile-rows.js';

const LOT = String.raw`LOTS?\s+[\dA-Z][\dA-Z-]*`;
const BLOCK = String.raw`(?:BLK|BLOCK)\s+[\dA-Z][\dA-Z-]*`;

/** The subdivision a legal description places the parcel in, normalised, or null when it is not a
 *  platted lot (an abstract/survey tract, personal property, minerals) or nothing parses. */
export function extractSubdivisionName(legalDescription: string | null | undefined): string | null {
  if (!legalDescription) return null;
  const desc = legalDescription.replace(/\s+/g, ' ').trim().toUpperCase();
  if (!desc) return null;

  // Not a platted lot.
  if (/^BUSINESS\s+PERSONAL\s+PROPERTY/.test(desc)) return null;
  if (/^MINERAL/.test(desc)) return null;
  const hasPlatWord = /\b(?:ADDITION|ADDN?|SUBDIVISION|SUBD?|ESTATES?|ESTS?|HEIGHTS|HTS|VILLAGE|RANCH|ACRES\s+ADDITION|REPLAT|PHASE|SECTION|UNIT|LOT|BLOCK|BLK)\b/.test(desc);
  if (/^(?:ABSTRACT|ABS|A\d{3,}|SURVEY)\b/.test(desc) && !hasPlatWord) return null;

  const accept = (raw: string | undefined): string | null => {
    if (!raw) return null;
    let name = raw.trim()
      .replace(/^(?:LOTS?|BLK|BLOCK)\s+[\dA-Z-]+\s*,?\s*/i, '')   // a stray leading "LOT 3"
      .replace(/[,\s]+$/, '')
      .replace(/\s*\(.*$/, '')                                      // "(E 34' OF 3)"
      .trim();
    if (name.length < 3 || /^\d+(?:\.\d+)?$/.test(name)) return null;
    if (new RegExp(`^(?:${LOT}|${BLOCK})$`).test(name)) return null;
    name = normaliseSubdivisionName(name);
    return name || null;
  };

  // 1. "NAME, BLOCK X, …" / "NAME, LOT Y, …" — the name is everything before the first lot/block clause.
  const commaFirst = desc.match(new RegExp(`^(.+?)\\s*,\\s*(?:${BLOCK}|${LOT})\\b`));
  if (commaFirst) {
    const name = accept(commaFirst[1]);
    if (name) return name;
  }

  // 2. Reversed: "LOT 3, BLOCK A, NAME" / "BLOCK A, LOT 3, NAME".
  const reversed = desc.match(new RegExp(`^(?:${LOT}|${BLOCK})\\s*,\\s*(?:${LOT}|${BLOCK})\\s*,\\s*(.+?)(?:\\s*,.*)?$`))
    ?? desc.match(new RegExp(`^(?:${LOT}|${BLOCK})\\s*,\\s*(.+?)(?:\\s*,.*)?$`));
  if (reversed) {
    const name = accept(reversed[1]);
    if (name) return name;
  }

  // 3. Space forms: "LOT 5 BLK 2 NAME" and "NAME LOT 4 BLK 1" / "NAME BLK 1 LOT 4".
  const spaceAfter = desc.match(new RegExp(`^(?:${LOT}\\s+${BLOCK}|${BLOCK}\\s+${LOT})\\s+(.+?)(?:\\s*,.*)?$`));
  if (spaceAfter) {
    const name = accept(spaceAfter[1]);
    if (name) return name;
  }
  const spaceBefore = desc.match(new RegExp(`^(.+?)\\s+(?:${LOT}|${BLOCK})\\b`));
  if (spaceBefore) {
    const name = accept(spaceBefore[1]);
    if (name) return name;
  }

  // 4. A keyword name with no lot/block clause at all ("OAK CREEK ADDITION" / "… SUBDIVISION, ACRES 2").
  const keyword = desc.match(/^(.+?\b(?:ADDITION|ADDN?|SUBDIVISION|SUBD?|ESTATES?|ESTS?|HEIGHTS|HTS|VILLAGE|RANCH|REPLAT)(?:\s+(?:NO\.?\s*)?\d+[A-Z]?)?(?:\s+(?:PHASE|PH|SECTION|SEC|UNIT)\s*\d+[A-Z]?)?)\b/);
  if (keyword) {
    const name = accept(keyword[1]);
    if (name) return name;
  }

  return null;
}
