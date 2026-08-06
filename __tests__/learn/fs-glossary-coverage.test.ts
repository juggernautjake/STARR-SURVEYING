// __tests__/learn/fs-glossary-coverage.test.ts
//
// Owner, 2026-08-06: *"create static definitions for the terms for all of the words and terms that
// need definitions. Go through the modules."*
//
// ── WHAT "NEEDS A DEFINITION" TURNED OUT TO MEAN ────────────────────────────────────────────────
//
// The lesson renderer marks every `**bolded**` run as a clickable term. Extracting them from the FS
// seeds found 1,551 distinct runs — and roughly two thirds are not terms at all: emphasis
// (`**not**`), formulas (`**H = h − N**`), angle values (`**112°00′25″**`), bare numbers
// (`**43,560**`), calculator keys (`**▸DMS**`) and section headings (`**Solution.**`).
//
// So the job had two halves, and this file guards both: the real terminology resolves from the
// curated glossary, and the rest never opens a popup to ask an AI to define it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { lookupTerm, looksLikeTerm } from '@/lib/learn/fsGlossary';

/** Every `**bolded**` run in the FS lesson seeds — exactly what becomes clickable. */
function boldRunsFromSeeds(): Map<string, number> {
  const dir = path.join(process.cwd(), 'seeds');
  const counts = new Map<string, number>();
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.sql') || !/fs_prep|fs_exam|fs_module|learn/i.test(f)) continue;
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/\*\*(.+?)\*\*/gs)) {
      const t = m[1].replace(/\s+/g, ' ').replace(/''/g, "'").trim();
      if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return counts;
}

const RUNS = boldRunsFromSeeds();

describe('the extraction this glossary was built from', () => {
  it('still finds the lesson content', () => {
    // If a seed rename silently emptied this, every assertion below would pass vacuously.
    expect(RUNS.size).toBeGreaterThan(1000);
  });
});

describe('core FS terminology resolves from the glossary', () => {
  // One representative from each exam domain — a click on any of these must never cost an AI call.
  const MUST_DEFINE = [
    'accuracy', 'precision', 'standard deviation', 'most probable value', 'error propagation',
    'benchmark', 'turning point', 'height of instrument', 'two-peg test', 'orthometric height',
    'geoid undulation', 'ellipsoidal height', 'curvature and refraction',
    'azimuth', 'bearing', 'back-azimuth', 'zenith angle', 'magnetic declination',
    'electronic distance measurement', 'slope distance', 'horizontal distance',
    'traverse', 'latitude', 'departure', 'linear misclosure', 'compass rule', 'northing', 'easting',
    'area by coordinates', 'average end area', 'prismoidal formula', 'shrinkage', 'swell',
    'point of curvature', 'point of tangency', 'degree of curve', 'middle ordinate', 'sag curve',
    'gnss', 'carrier phase', 'integer ambiguity', 'multipath', 'rtk', 'cors', 'opus',
    'dilution of precision', 'state plane coordinate system', 'scale factor', 'combined factor',
    'convergence', 'grid distance', 'ground distance', 'conformal projection',
    'public land survey system', 'township', 'section', 'aliquot part', 'lost corner',
    'proportionate measurement', 'government lot', 'bearing tree',
    'metes and bounds', 'lot and block', 'dignity of calls', 'senior rights', 'accretion',
    'avulsion', 'riparian rights', 'easement', 'adverse possession', 'chain of title',
    'principal point', 'photogrammetry', 'metadata', 'monument',
  ];

  it.each(MUST_DEFINE)('defines "%s"', (term) => {
    const hit = lookupTerm(term);
    expect(hit, `"${term}" has no curated definition`).toBeTruthy();
    expect(hit!.definition.length).toBeGreaterThan(40);
  });
});

describe('the phrasings lessons actually use', () => {
  // Authors write terms the way they read in a sentence. Each of these appears bolded in the seeds
  // in a form the glossary does not key directly; the lookup has to reach it anyway.
  const VARIANTS: Array<[string, string]> = [
    ['Backsight (BS)', 'backsight'],
    ['EDM (electronic distance measurement)', 'edm'],
    ['electronic distance measurement', 'edm'],
    ['height-of-instrument (HI) method', 'height of instrument'],
    ['Compass (Bowditch) rule', 'compass rule'],
    ['Closed-loop (polygon) traverse', 'closed loop traverse'],
    ['orthometric height H', 'orthometric height'],
    ['geoid undulation N', 'geoid undulation'],
    ['ellipsoidal height h', 'ellipsoidal height'],
    ['Back-azimuth', 'back-azimuth'],
    ['aliquot parts', 'aliquot part'],
    ['State Plane', 'state plane coordinate system'],
    ['metes-and-bounds', 'metes and bounds'],
    ['Taping (chaining)', 'taping'],
    ['normal (Gaussian) distribution', 'normal distribution'],
    ['PLSS', 'public land survey system'],
    ['DOP', 'dilution of precision'],
    ['cubic yards', 'cubic yard'],
  ];

  it.each(VARIANTS)('"%s" resolves to the %s entry', (written, canonical) => {
    const hit = lookupTerm(written);
    expect(hit, `"${written}" did not resolve`).toBeTruthy();
    // Compared through `lookupTerm` rather than by string: several of these legitimately land on a
    // shorter synonym entry (EDM has its own, older entry), and what matters is that the student
    // gets the right definition, not which key it happens to be filed under.
    expect(hit!.definition).toBe(lookupTerm(canonical)!.definition);
  });
});

describe('things that are bolded but are not terms', () => {
  // Each of these is bolded somewhere in the seeds. Opening a definition popup for them asks the
  // model to define something with no definition — and it answers anyway, which is the failure.
  const NOT_TERMS = [
    'not', 'never', 'larger', 'moves', 'negative', 'added', 'cancels', 'too high', 'long',
    '43,560', '40 acres', '−100.00', '27', '0.80 miles',
    'H = h − N', 'PC = PI − T', 'C = 0.0240·F²', 'HI = Elev + BS',
    '112°00′25″', '330°30′00″', '70°30′15″',
    'x̄', 'L', 'h', 'r',
    'Solution.', 'Given:', 'Always run the arithmetic check', 'Memorize the three core relations',
    '▸DMS', 'P▸R', 'R▸P',
  ];

  it.each(NOT_TERMS)('does not open a popup for "%s"', (text) => {
    expect(looksLikeTerm(text)).toBe(false);
  });

  it('a curated term always opens, whatever it looks like', () => {
    // The glossary outranks every heuristic — a real entry is never filtered out by shape.
    expect(looksLikeTerm('OPUS')).toBe(true);
    expect(looksLikeTerm('DOP')).toBe(true);
    expect(looksLikeTerm('PLSS')).toBe(true);
  });

  it('still lets an unlisted but plausible term through to the AI fallback', () => {
    // The filter is a floor on nonsense, not a whitelist — a real term nobody has curated yet must
    // still reach the define route rather than being silently swallowed.
    expect(looksLikeTerm('theodolite')).toBe(true);
    expect(looksLikeTerm('plane table')).toBe(true);
  });
});

describe('glossary integrity', () => {
  it('every alias points at an entry that exists', () => {
    // An alias aimed at a missing key returns null silently — the definition simply never appears.
    const src = fs.readFileSync(path.join(process.cwd(), 'lib', 'learn', 'fsGlossary.ts'), 'utf8');
    const targets = [...src.matchAll(/^\s*'[^']+':\s*'([^']+)',/gm)].map((m) => m[1]);
    expect(targets.length).toBeGreaterThan(50);
    const broken = [...new Set(targets)].filter((t) => !lookupTerm(t));
    expect(broken, `aliases pointing nowhere:\n  ${broken.join('\n  ')}`).toEqual([]);
  });

  it('covers a real share of what students actually click', () => {
    // A RATCHET, weighted by how often each run appears so common terms count for more than rare
    // ones. Measured 48.1% at the sweep, against 275 entries; it was 97 entries before.
    //
    // The floor is 45 rather than something aspirational because the un-curated remainder is not
    // 275 more surveying terms — it is one-off phrasings ("corrected and reduced", "distance or
    // setup count", "two reciprocal operations") that a lesson author bolded once. Writing
    // dictionary entries for those would pad this number and teach nobody anything, and the AI
    // fallback already handles them well. RAISE this when a real batch of terminology is added;
    // never lower it to make a change fit.
    let defined = 0, definable = 0;
    for (const [text, n] of RUNS) {
      if (!looksLikeTerm(text)) continue;      // not a term — correctly never asked
      definable += n;
      if (lookupTerm(text)) defined += n;
    }
    const pct = (defined / definable) * 100;
    expect(pct, `curated coverage fell to ${pct.toFixed(1)}% of clickable term occurrences`).toBeGreaterThan(45);
  });

  it('has grown well past the glossary it replaced', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'lib', 'learn', 'fsGlossary.ts'), 'utf8');
    const entries = [...src.matchAll(/\{ term: '([^']+)'/g)].length;
    expect(entries).toBeGreaterThanOrEqual(270);
  });

  it('defines no term twice', () => {
    // Duplicate keys silently overwrite in the lookup Map, so the file can disagree with itself
    // while every test still passes. Forty of these appeared during the sweep.
    const src = fs.readFileSync(path.join(process.cwd(), 'lib', 'learn', 'fsGlossary.ts'), 'utf8');
    const terms = [...src.matchAll(/\{ term: '([^']+)'/g)].map((m) => m[1]);
    const dupes = terms.filter((t, i) => terms.indexOf(t) !== i);
    expect([...new Set(dupes)], `defined more than once:\n  ${[...new Set(dupes)].join('\n  ')}`).toEqual([]);
  });

  it('has no alias that can never be reached', () => {
    // An alias whose key is itself an entry is dead code — the entry always wins first.
    const src = fs.readFileSync(path.join(process.cwd(), 'lib', 'learn', 'fsGlossary.ts'), 'utf8');
    const terms = new Set([...src.matchAll(/\{ term: '([^']+)'/g)].map((m) => m[1]));
    const shadowed = [...src.matchAll(/^\s*'([^']+)':\s*'([^']+)',/gm)]
      .filter((m) => terms.has(m[1]) && m[1] !== m[2])
      .map((m) => `'${m[1]}' → '${m[2]}'`);
    expect(shadowed, `aliases shadowed by an entry of the same name:\n  ${shadowed.join('\n  ')}`).toEqual([]);
  });
});
