import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Plan 1.1/1.2 — the TexasFile PLAT search.
//
// The 1401 North East St supervised run (2026-09-06) exposed the gap: the engine only searched
// `/county-clerk-records/` (deeds/liens) and NEVER `/plat-records/`, so the WINNIE MAE ADDITION plats
// — which TexasFile has at $10 and the free plat repo could not get (HTTP 403) — were invisible and the
// run bought $0 of them. `searchTexasFilePlats` closes that. The browser parts need a real page, so this
// pins the structural facts a wrong edit would silently break (wrong endpoint, buying during a search,
// wrong result type).

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'src/services/texasfile-buy.ts'),
  'utf8',
);
const fnBody = (name: string): string => {
  const start = SRC.indexOf(`export async function ${name}`);
  if (start < 0) throw new Error(`${name} not found`);
  // Up to (but not into) the NEXT top-level export, so a window can't bleed into a sibling function.
  const nextExport = SRC.indexOf('\nexport ', start + 10);
  const end = nextExport < 0 ? SRC.length : nextExport;
  return SRC.slice(start, end);
};

describe('searchTexasFilePlats hits the PLAT product, not the deed records', () => {
  const fn = fnBody('searchTexasFilePlats');

  it('navigates to /plat-records/, not /county-clerk-records/', () => {
    expect(fn).toContain('/plat-records/');
    expect(fn).not.toContain('/county-clerk-records/');
  });

  it('fills the plat form by its visible placeholders (subdivision / volume-cabinet / page-slide / file)', () => {
    expect(fn).toContain("'subdivision'");
    expect(fn).toContain("'cabinet'");
    expect(fn).toContain("'slide'");
    expect(fn).toContain('byPlaceholder');
  });

  it('types the results as PLATS and parses the purchase buttons', () => {
    expect(fn).toContain("type: 'plat'");
    expect(fn).toContain('btnPurchaseFromSearch');
    expect(fn).toContain('data-for^="Purchase-"');
  });

  it('is SEARCH-ONLY — it never purchases', () => {
    expect(fn).not.toContain('purchaseTexasFile(');
    expect(fn).not.toContain('purchaseApiUrl(');
  });

  it('reads the plat searchId from the results URL', () => {
    expect(fn).toContain('plat-records\\/(\\d+)\\/');
  });
});

describe('searchTexasFilePlatsDocuments is the search-only wrapper', () => {
  const fn = fnBody('searchTexasFilePlatsDocuments');

  it('logs in, then runs the plat search, and never buys', () => {
    expect(fn).toContain('loginTexasFile(');
    expect(fn).toContain('searchTexasFilePlats(');
    expect(fn).not.toContain('purchaseTexasFile(');
  });

  it('returns [] on a failed sign-in and never throws (search must not sink a run)', () => {
    expect(fn).toContain("could not sign in");
    expect(fn).toContain('return [];');
    expect(fn).toContain('catch (err)');
  });
});
