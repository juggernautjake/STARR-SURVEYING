// worker/src/__tests__/bell-capture-is-bounded.test.ts — E5d wiring.
//
// `mapBounded` has its own tests. This file asserts the thing those cannot see: that the Bell clerk
// scraper actually USES it. A concurrency helper nothing calls is the defect this repository keeps
// finding — authored, correct, and doing nothing.
//
// ── WHAT WAS AND WAS NOT CONVERTED ──────────────────────────────────────────────────────────────
//
// Converted: the plat, deed and "other" capture loops in the subdivision search. All three are flat
// lists of instrument numbers with no running cap and no `break`, so capturing them a few at a time
// and assembling in input order is provably the same output.
//
// NOT converted, deliberately: the owner-search loop. It carries
// `if (documents.length >= maxDocs) break` — a cap that depends on how many documents have been
// pushed SO FAR. Making that concurrent changes which documents get captured before the cap trips,
// which is a behaviour change dressed as a performance change. It needs its own slice, with the
// filter pass separated from the capture pass first.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'src/counties/bell/scrapers/clerk-scraper.ts'),
  'utf8',
);

describe('the scraper captures a few at a time, not one at a time', () => {
  it('imports the bounded helper', () => {
    expect(SRC).toContain("from '../../../infra/bounded-map.js'");
  });

  it('all three subdivision capture passes go through it', () => {
    for (const v of ['platCaptures', 'deedCaptures', 'otherCaptures']) {
      expect(SRC, `${v} should come from captureInstruments`).toContain(`const ${v} = await captureInstruments(`);
    }
  });

  it('captureInstruments is bounded — it goes through mapBounded, not Promise.all', () => {
    // ── THE MUTATION THAT SURVIVED THE FIRST PASS ────────────────────────────────────────────
    //
    // The original assertion was a regex looking for `Promise.all(` near a document list, and it
    // missed the single most dangerous edit available: replacing the `mapBounded` call INSIDE
    // `captureInstruments` with `Promise.all(instruments.map(…))` wrapped in per-item try/catch.
    // That version keeps input order, keeps per-item errors, passes every other test in this file —
    // and fires every request at the county at once, which is the exact thing this slice exists to
    // prevent. The regex missed it because it spelled `Instruments` with a capital I and the
    // mutation used the lowercase parameter name.
    //
    // So this asserts the helper's BODY positively rather than trying to enumerate the ways it
    // could be wrong. There is one call, and it is the bounded one.
    const at = SRC.indexOf('async function captureInstruments(');
    expect(at, 'the helper should exist').toBeGreaterThan(-1);
    const body = SRC.slice(at, SRC.indexOf('\n}', at));

    expect(body, 'the capture must go through the bounded helper').toContain('await mapBounded(');
    expect(body, 'unbounded concurrency against a small county server').not.toContain('Promise.all');
  });
});

describe('the conversion did not change what gets captured', () => {
  it('still gates on captureImages', () => {
    // The gate moved from `if (captureImages)` around the try/catch to the argument itself. If it
    // were dropped, every run would capture images whether or not it asked to — slow, and for the
    // metadata-only paths, pointless.
    expect(SRC.match(/captureImages \? \w+Instruments : \[\]/g)?.length)
      .toBe(3);
  });

  it('still reports a per-document failure without losing the others', () => {
    // Errors used to be caught per item by the try/catch. They are now carried back per index; the
    // assembly loop logs them in the same words. A batch that abandons nine documents because the
    // tenth timed out would be a regression, not a speed-up.
    for (const label of ['Plat', 'Deed', 'Other']) {
      expect(SRC).toContain(`✗ ${label} \${instrNum}: image capture failed: \${capErr}`);
    }
  });

  it('assembles in input order, so plats still precede deeds', () => {
    // `documents` is read by a surveyor. Completion order would reshuffle a report by whichever
    // county page answered first.
    const plat = SRC.indexOf('platInstruments.entries()');
    const deed = SRC.indexOf('deedInstruments.entries()');
    const other = SRC.indexOf('otherInstruments.entries()');
    expect(plat).toBeGreaterThan(-1);
    expect(deed).toBeGreaterThan(plat);
    expect(other).toBeGreaterThan(deed);
  });

  it('an empty list costs nothing', () => {
    expect(SRC).toContain('if (instruments.length === 0) return { images: [], errors: [] };');
  });
});

describe('the owner-search loop was left sequential on purpose', () => {
  it('still carries the running cap that makes it order-dependent', () => {
    // If this ever stops being true, the reason for excluding it has gone and it should be
    // converted too. A deferral that no longer applies should not sit silently in a file.
    expect(
      SRC,
      'the owner-search cap is why that loop was not converted — see the header of this file',
    ).toContain('if (documents.length >= maxDocs) break;');
  });
});
