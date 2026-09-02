import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// A2 — Milam's address search returned "0 total, 0 deed-relevant" from six variants.
//
// Not because the county has no records. `buildTylerUrl` asked `searchType=quickSearch`, which is
// the indexed PARTY-NAME search, and a street address is not a party name. Six wrong questions,
// reported as an answer. The broad keyword sweep is the mode that can see an address in a legal
// description or in OCR text — kofile-clerk-adapter.ts measured them against each other on this very
// county, 5,484 against 220,777 for one term.
//
// Offline by design: hitting a county server on every CI run is the politeness rule this worker has
// a concurrency ceiling to honour. What is checkable for free is that the two modes produce
// DIFFERENT URLs and that the fallback is actually reached.

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'src/services/bell-clerk.ts'),
  'utf8',
);

describe('the address search asks the index that can hold an address', () => {
  it('buildTylerUrl takes a mode', () => {
    expect(SRC).toContain("mode: 'name' | 'keyword' = 'name'");
  });

  it('the mode changes the URL — CONTROL for everything below', () => {
    // If both modes built the same URL the fallback would be twelve identical requests, and every
    // other assertion here would still pass.
    expect(SRC).toContain("`&keywordSearch=${mode === 'keyword'}` +");
  });

  it('defaults to the name index, so grantor/grantee lookups are unchanged', () => {
    // The name index is correct for the searches that dominate a run. Only the ADDRESS search was
    // asking it the wrong question.
    expect(SRC).toMatch(/mode: 'name' \| 'keyword' = 'name'/);
  });

  it('tries every variant against the name index BEFORE any keyword sweep', () => {
    const at = SRC.indexOf('const attempts');
    expect(at, 'the attempt list is gone').toBeGreaterThan(-1);
    const block = SRC.slice(at, at + 400);
    const nameAt = block.indexOf("mode: 'name' as const");
    const kwAt = block.indexOf("mode: 'keyword' as const");
    expect(nameAt).toBeGreaterThan(-1);
    expect(kwAt).toBeGreaterThan(-1);
    expect(nameAt, 'the passes are interleaved, so a cheap answer costs a broad sweep first')
      .toBeLessThan(kwAt);
  });

  it('skips the keyword pass entirely once anything has been captured', () => {
    // The cost control. Without this, a county that answers the narrow search pays for twelve page
    // loads at ~12s each instead of six.
    expect(SRC).toContain("if (mode === 'keyword' && allCaptured.length > 0) continue;");
  });

  it('the loop actually passes the mode through to the URL', () => {
    // Wiring, not intent: an attempt list carrying a mode nothing reads would satisfy the rest.
    expect(SRC).toContain('buildTylerUrl(baseUrl, searchTerm, 0, mode)');
  });

  it('says which mode it is trying, so a future log can be read', () => {
    // The Milam log could not distinguish "asked wrong" from "nothing there". This is what makes the
    // next one legible.
    expect(SRC).toMatch(/\$\{mode\} search/);
  });
});
