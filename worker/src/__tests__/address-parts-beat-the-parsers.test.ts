import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveAddressParts,
  splitStreetLine,
  hasUsableParts,
} from '../research/address-parts.js';

// ── WHY THE WORKER STOPPED GUESSING ─────────────────────────────────────────────────────────────
//
// Three parsers in this worker tried to reconstruct a street name from the single flattened string
// the app sent. On 2026-09-02 all three were run against the exact format the app produces —
// "123 MAIN ST, TEMPLE, TX, 76501" — and all three failed, because each expects "TX 76501" and the
// app joined the state and ZIP with a comma like every other component.
//
// What came out was:
//
//     streetName = "MAIN ST, TEMPLE, TX, 76501"
//
// and that went into the county appraisal district's street-name search box. Nothing matches it.
// The run then reported that the district holds no record of the property.
//
// Seed 624 keeps the parts the operator typed. This module prefers them, falls back to parsing
// when a project predates the columns, and — the part that matters — SAYS WHICH IT DID.

const ROOT = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('the operator wins over the parser', () => {
  it('uses the entered parts verbatim', () => {
    const r = resolveAddressParts(
      { streetNumber: '3779', streetName: 'W FM 436', city: 'Belton', state: 'TX', zip: '76513' },
      'whatever the flattened line happens to say',
    );
    expect(r.source).toBe('entered');
    expect(r.streetNumber).toBe('3779');
    expect(r.streetName).toBe('W FM 436');
    expect(r.city).toBe('Belton');
  });

  it('the flattened line is IGNORED when parts exist, even if they disagree', () => {
    // The parts are the corrected value. A flattened line that still says something else is stale
    // by definition — it is composed FROM the parts.
    const r = resolveAddressParts({ streetName: 'ELM ST', city: 'Waco' }, '999 OLD WRONG RD, Temple, TX, 76501');
    expect(r.streetName).toBe('ELM ST');
    expect(r.city).toBe('Waco');
  });

  it('splits a street left whole in one box', () => {
    const r = resolveAddressParts({ streetName: '123 MAIN ST', city: 'TEMPLE' }, '');
    expect(r.streetNumber).toBe('123');
    expect(r.streetName).toBe('MAIN ST');
  });

  it('says plainly that nothing was inferred', () => {
    const r = resolveAddressParts({ streetName: 'CR 218', city: 'Cameron' }, '');
    expect(r.statement).toMatch(/Nothing was inferred/i);
  });
});

describe('the fallback still runs, and admits it is guessing', () => {
  it('CONTROL: a legacy project still gets usable search terms', () => {
    // Refusing to search would be worse than a guess. Without this, "always fall back to nothing"
    // would satisfy every other assertion here.
    const r = resolveAddressParts(null, '3779 W FM 436, Belton, TX 76513');
    expect(r.source).toBe('parsed');
    expect(r.streetNumber).toBe('3779');
    expect(r.streetName).toBe('W FM 436');
    expect(r.city).toBe('Belton');
  });

  it('handles the comma-before-ZIP format the old parsers all choked on', () => {
    const r = resolveAddressParts(null, '123 MAIN ST, TEMPLE, TX, 76501');
    expect(r.streetName).toBe('MAIN ST');
    expect(r.city).toBe('TEMPLE');
    expect(r.zip).toBe('76501');
  });

  it('a city NEVER ends up inside the street name', () => {
    // The single assertion that would have caught the original defect. Every county, not just the
    // fifteen Bell-area towns the old stripper knew.
    for (const line of [
      '123 MAIN ST, WACO, TX, 76701',
      '500 ELM ST, GEORGETOWN, TX 78626',
      '77 OAK DR, ROUND ROCK, TX, 78664',
    ]) {
      const r = resolveAddressParts(null, line);
      expect(r.streetName, `"${r.streetName}" from "${line}"`).not.toMatch(/,/);
      expect(r.streetName).not.toMatch(/\bTX\b/);
      expect(r.streetName).not.toMatch(/\d{5}/);
    }
  });

  it('the statement warns that the street was GUESSED', () => {
    const r = resolveAddressParts(null, '123 MAIN ST, WACO, TX, 76701');
    expect(r.statement).toMatch(/GUESSED/);
    expect(r.statement).toMatch(/first thing to check/i);
  });

  it('says so when there was no address at all', () => {
    expect(resolveAddressParts(null, '').statement).toMatch(/No address was supplied/);
  });
});

describe('hasUsableParts', () => {
  it('is false for the empty object a pre-624 project sends', () => {
    // The route sends `addressParts` even when empty, so an old worker build and an old project can
    // be told apart. An empty object must not look like real input.
    expect(hasUsableParts({})).toBe(false);
    expect(hasUsableParts({ state: 'TX' })).toBe(false);
    expect(hasUsableParts(null)).toBe(false);
  });
  it('is true once a street, city or ZIP is present', () => {
    expect(hasUsableParts({ streetName: 'CR 218' })).toBe(true);
  });
});

describe('splitStreetLine is narrower than what it replaces', () => {
  it('stops at the first comma instead of swallowing the city', () => {
    expect(splitStreetLine('123 MAIN ST, TEMPLE, TX, 76501').streetName).toBe('MAIN ST');
  });
  it('CONTROL: a unit word inside a street name is left alone', () => {
    expect(splitStreetLine('900 N UNIVERSITY DR').unit).toBe('');
  });
});

// ── THE TWO COPIES OF THE MODEL MUST NOT DRIFT ──────────────────────────────────────────────────

describe('the worker and app agree on the field names', () => {
  it('AddressParts here matches StructuredAddress in the app', () => {
    // The worker and the app are separate builds and cannot share a module. What they CAN share is
    // a test that fails the moment one side renames a field — otherwise the app would send
    // `street` and the worker would read `streetName` and get undefined, silently, forever.
    const appSrc = fs.readFileSync(
      path.join(ROOT, '..', 'lib', 'research', 'property-address.ts'), 'utf8',
    );
    const fields = (src: string, iface: string) => {
      const body = src.split(`interface ${iface} {`)[1]?.split('\n}')[0] ?? '';
      // Strip comments first — prose in a doc block has matched this kind of probe before.
      return body
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .split('\n')
        .map((l) => l.trim().match(/^([A-Za-z]+)\??:/)?.[1])
        .filter(Boolean)
        .sort();
    };

    const app = fields(appSrc, 'StructuredAddress');
    const worker = fields(read('src/research/address-parts.ts'), 'AddressParts');

    // CONTROL: if the extraction found nothing, an equality check on two empty arrays would pass
    // and prove the opposite of what it claims.
    expect(app.length, 'extracted no fields from the app interface').toBeGreaterThan(4);
    expect(worker.length, 'extracted no fields from the worker interface').toBeGreaterThan(4);

    // The app additionally carries `county` and `parcelId`, which the worker receives by other
    // routes. Every field the WORKER expects must exist on the app side.
    for (const f of worker) {
      expect(app, `the app no longer sends "${f}"`).toContain(f);
    }
  });
});

// ── THE CALLERS ─────────────────────────────────────────────────────────────────────────────────

describe('the parts reach every place that used to guess', () => {
  /**
   * Source with comments removed, so a probe cannot match prose that merely QUOTES the old code —
   * which has happened here repeatedly.
   *
   * The block-comment opener is anchored to the start of a line. The obvious `\/\*[\s\S]*?\*\/`
   * is WRONG and was caught doing exactly this: `cad-scraper.ts` sends an
   *
   *     'Accept': 'text/html,...,＊/＊;q=0.8'
   *
   * header, and the `*` `/` `*` in that string opens a comment the regex then closes 83 lines
   * later, deleting the real code this test is looking for. The test failed claiming the wiring
   * was missing when the wiring was there — a false negative from a probe that could not have
   * produced a positive.
   *
   * Line comments use `[^\n\r]*` rather than `.*$`: these files are CRLF, and `$` in multiline
   * mode matches before `\n`, so `.*` stops at the `\r` and the anchor never lines up.
   */
  const code = (p: string) => {
    const raw = read(p);
    const stripped = raw
      .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
      .replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
    // CONTROL. If the stripper ever eats real code again, fail here — where the message says what
    // happened — instead of in an assertion that reads like missing wiring.
    if (!stripped.includes('import')) {
      throw new Error(`comment stripping destroyed ${p}: ${raw.length} chars in, ${stripped.length} out`);
    }
    return stripped;
  };

  it('CONTROL: stripping keeps the code and drops the prose', () => {
    const src = code('src/counties/bell/scrapers/cad-scraper.ts');
    expect(src, 'the Accept-header false comment ate the file again').toContain('parseAddressComponents');
    expect(src).not.toContain('fifteen Bell-area towns');
  });

  it('index.ts takes addressParts off the request and passes it on', () => {
    const src = code('src/index.ts');
    expect(src).toMatch(/const \{ projectId, address, addressParts,/);
    expect(src).toMatch(/addressParts,/);
  });

  it('the router forwards it to BOTH the Bell orchestrator and the generic pipeline', () => {
    // Two adapt sites, and a value dropped at either one reaches the door and stops. That has
    // happened here often enough to be worth two assertions.
    const src = code('src/counties/router.ts');
    expect(src.match(/addressParts: input\.addressParts/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('Stage 0 of the generic pipeline is given them', () => {
    expect(code('src/services/pipeline.ts'))
      .toContain('normalizeAddress(input.address, logger, input.addressParts)');
  });

  it('normalizeAddress lets them override what it parsed', () => {
    const src = code('src/services/address-utils.ts');
    expect(src).toContain('resolveAddressParts');
    expect(src).toContain('result.parsed.streetName = resolved.streetName');
  });

  it('the Bell CAD scraper uses them instead of its fifteen-town city stripper', () => {
    const src = code('src/counties/bell/scrapers/cad-scraper.ts');
    expect(src).toContain('hasUsableParts(addressParts)');
    // The old parser must remain as the fallback — deleting it would break every pre-624 project.
    expect(src).toContain('parseAddressComponents(address)');
  });

  it('and the Bell orchestrator actually hands them to the scraper', () => {
    expect(code('src/counties/bell/orchestrator.ts')).toContain('addressParts: input.addressParts');
  });
});
