// worker/src/services/texasfile-names.ts — the owner-name queries TexasFile actually answers
//
// The CAD prints an owner as "CAFFREY, BARBARA SPEER & ADRIANNE CAFFERY EVERS" — two parties, a
// comma form, middle names. TexasFile's name field answered that string with 0 rows three times on
// the 2026-09-07 run, while "CAFFREY BARBARA" answers with 39. This turns one CAD owner string into
// the ordered list of queries worth trying: each party, surname-first without the comma, then the
// natural order, then the surname alone (widest), business entities as written. Pure; tested on the
// live string.

const ENTITY_RE = /\b(?:LLC|L\.?L\.?C\.?|LP|L\.?P\.?|LTD|INC|CORP(?:ORATION)?|COMPANY|CO|TRUST|TRUSTEES?|ESTATE|CHURCH|BANK|ASSOCIATION|ASSN|PARTNERSHIP|HOLDINGS?|PROPERTIES|INVESTMENTS?|ENTERPRISES?|GROUP|FOUNDATION|CITY OF|COUNTY OF|STATE OF|UNIVERSITY|SCHOOL)\b/i;
/** Suffixes and marital/plural markers that are not part of a searchable name. */
const NOISE_RE = /\b(?:ETUX|ET UX|ETAL|ET AL|ETVIR|ET VIR|DECD|DEC'D|DECEASED|JR|SR|II|III|IV|MR|MRS|MS|DR)\b\.?/gi;

/** Split a CAD owner string into its parties ("A & B", "A AND B", "A; B"). */
export function ownerParties(owner: string): string[] {
  return owner
    .split(/\s*(?:&|\bAND\b|;|\/)\s*/i)
    .map((s) => s.replace(NOISE_RE, ' ').replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 2);
}

/** "CAFFREY, BARBARA SPEER" → { last: 'CAFFREY', first: 'BARBARA', middle: ['SPEER'] };
 *  "ADRIANNE CAFFERY EVERS" → { last: 'EVERS', first: 'ADRIANNE', middle: ['CAFFERY'] }. */
export function splitPersonName(party: string): { last: string; first: string; middle: string[] } | null {
  const p = party.toUpperCase().replace(/\s+/g, ' ').trim();
  if (!p) return null;
  if (p.includes(',')) {
    const [last, rest = ''] = p.split(',').map((s) => s.trim());
    const [first = '', ...middle] = rest.split(' ').filter(Boolean);
    return last ? { last, first, middle } : null;
  }
  const parts = p.split(' ').filter(Boolean);
  if (parts.length === 1) return { last: parts[0]!, first: '', middle: [] };
  return { last: parts[parts.length - 1]!, first: parts[0]!, middle: parts.slice(1, -1) };
}

/**
 * The queries to try, in order, for one CAD owner string. Each party contributes: "LAST FIRST"
 * (TexasFile's own display order), "FIRST LAST", "LAST, FIRST", and "LAST" — de-duplicated, the
 * widest last. A business entity is tried as written, then without its trailing entity word.
 */
/** One query per party (at most `max`), in TexasFile's own "LAST FIRST" order — what the discovery
 *  pass submits, since every query is a login + navigation. An entity is queried as written. */
export function primaryNameQueries(owner: string | null | undefined, max = 2): string[] {
  const out: string[] = [];
  const add = (s: string) => { const v = s.replace(/\s+/g, ' ').trim().toUpperCase(); if (v && !out.includes(v)) out.push(v); };
  for (const party of ownerParties(owner ?? '')) {
    if (out.length >= max) break;
    if (ENTITY_RE.test(party)) { add(party); continue; }
    const n = splitPersonName(party);
    if (!n) continue;
    add(n.first ? `${n.last} ${n.first}` : n.last);
  }
  return out;
}

export function texasFileNameVariants(owner: string | null | undefined): string[] {
  const out: string[] = [];
  const add = (s: string) => { const v = s.replace(/\s+/g, ' ').trim().toUpperCase(); if (v && !out.includes(v)) out.push(v); };
  if (!owner?.trim()) return out;
  const parties = ownerParties(owner);
  const surnames: string[] = [];
  for (const party of parties) {
    if (ENTITY_RE.test(party)) {
      add(party);
      const bare = party.replace(/\s*\b(?:LLC|LP|LTD|INC|CORP|CO|COMPANY)\b\.?\s*$/i, '');
      if (bare !== party) add(bare);
      continue;
    }
    const n = splitPersonName(party);
    if (!n) continue;
    if (n.first) {
      add(`${n.last} ${n.first}`);
      add(`${n.first} ${n.last}`);
      add(`${n.last}, ${n.first}`);
    }
    if (n.last.length >= 3) surnames.push(n.last);
  }
  for (const s of surnames) add(s);
  return out;
}
