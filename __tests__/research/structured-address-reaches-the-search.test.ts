import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  composeAddress,
  splitStreetLine,
  canLocateProperty,
  cadSearchTerms,
  describeAddressInput,
  hasStructuredParts,
  splitFullAddress,
} from '@/lib/research/property-address';

// ── THE DEFECT THIS CLOSES, MEASURED ────────────────────────────────────────────────────────────
//
// The create form collected street, city, county, state and ZIP in five boxes. The create route
// joined four of them —
//
//     [property_address, city, state, zip].filter(Boolean).join(', ')
//
// — into `"123 MAIN ST, TEMPLE, TX, 76501"`, kept only that, and copied city and ZIP into
// `analysis_metadata`, which the pipeline route does not select. The worker received one string and
// tried to take it apart again, in THREE places. On 2026-09-02 every one of them was run against
// the exact string this app produces:
//
//   services/address-normalizer.ts   parseAddress()            → streetName "MAIN ST, TEMPLE, TX, 76501"
//   services/address-utils.ts        manualParse()             → streetName "MAIN ST, TEMPLE, TX, 76501"
//   counties/bell/.../cad-scraper.ts parseAddressComponents()  → city stripped only for 15 Bell towns
//
// The first two both require `TX 76501` and the app emitted `TX, 76501`. One comma. That street
// name went into the county appraisal district's street-name search box, matched nothing, and the
// run reported that the district had no record of a property that exists.
//
// The fix is not a better regex. It is to stop discarding what the operator typed.

const APP_JOIN = (street: string, city: string, state: string, zip: string) =>
  [street, city, state, zip].filter(Boolean).join(', ');

describe('the composed line is one a parser can read back', () => {
  it('joins state and ZIP with a SPACE, which is the whole bug', () => {
    const line = composeAddress({
      streetNumber: '123', streetName: 'MAIN ST', city: 'TEMPLE', state: 'TX', zip: '76501',
    });
    expect(line).toBe('123 MAIN ST, TEMPLE, TX 76501');
    // The old join, for contrast. Keeping it in the test is what stops someone "tidying"
    // composeAddress back into a uniform join and re-opening this.
    expect(APP_JOIN('123 MAIN ST', 'TEMPLE', 'TX', '76501')).toBe('123 MAIN ST, TEMPLE, TX, 76501');
    expect(line).not.toBe(APP_JOIN('123 MAIN ST', 'TEMPLE', 'TX', '76501'));
  });

  it('and the worker parser that failed on the old format accepts the new one', () => {
    // The actual pattern from worker/src/services/address-utils.ts manualParse(), transcribed.
    // This is the assertion the whole change rests on, so it tests the real shape, not a paraphrase.
    const full = /^(.+?),\s*([^,]+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/i;

    expect(APP_JOIN('123 MAIN ST', 'TEMPLE', 'TX', '76501')).not.toMatch(full);

    const composed = composeAddress({
      streetNumber: '123', streetName: 'MAIN ST', city: 'TEMPLE', state: 'TX', zip: '76501',
    });
    const m = composed.match(full);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('123 MAIN ST');
    expect(m![2]).toBe('TEMPLE');
    expect(m![4]).toBe('76501');
  });

  it('drops what is missing instead of leaving empty commas', () => {
    expect(composeAddress({ streetName: 'CR 218', county: 'Milam', state: 'TX' })).toBe('CR 218, TX');
    expect(composeAddress({})).toBe('');
  });

  it('keeps the unit with the street, where a person reading it expects it', () => {
    expect(composeAddress({ streetNumber: '400', streetName: 'AVE H', unit: 'Suite 200', city: 'TEMPLE' }))
      .toBe('400 AVE H Suite 200, TEMPLE');
  });
});

describe('splitting a street line', () => {
  it('separates the number from the name', () => {
    expect(splitStreetLine('3779 W FM 436')).toEqual({
      streetNumber: '3779', streetName: 'W FM 436', unit: '',
    });
  });

  it('handles a number with a letter', () => {
    expect(splitStreetLine('123A ELM ST').streetNumber).toBe('123A');
  });

  it('takes a trailing unit off the name', () => {
    const r = splitStreetLine('400 AVE H SUITE 200');
    expect(r.streetName).toBe('AVE H');
    expect(r.unit).toBe('SUITE 200');
  });

  it('CONTROL: does NOT mistake a street whose name contains a unit word', () => {
    // "UNIVERSITY" begins with UNIT. An unanchored match would eat it and search for "N".
    const r = splitStreetLine('900 N UNIVERSITY DR');
    expect(r.streetName).toBe('N UNIVERSITY DR');
    expect(r.unit).toBe('');
  });

  it('a rural road with no number keeps its whole name', () => {
    expect(splitStreetLine('CR 218')).toEqual({ streetNumber: '', streetName: 'CR 218', unit: '' });
  });

  it('NEVER claims a city — that is the failure being removed', () => {
    // If this ever returned city "TEMPLE", the split would be re-creating the parser it replaces.
    const r = splitStreetLine('123 MAIN ST');
    expect(Object.keys(r).sort()).toEqual(['streetName', 'streetNumber', 'unit']);
  });

  it('STOPS AT THE FIRST COMMA — found in a browser, not by the 32 tests above it', () => {
    // Pasting a whole address into the street box left `streetName` as
    // "MAIN ST, WACO, TX, 76701" — the exact string this whole change exists to keep out of a
    // county search box, reproduced in the field meant to prevent it. The worker's copy of this
    // function already stopped at the comma; the two had drifted in BEHAVIOUR while the drift
    // guard only compared field names.
    for (const line of [
      '123 MAIN ST, WACO, TX, 76701',
      '123 MAIN ST, TEMPLE, TX 76501',
      '500 ELM ST, GEORGETOWN, TX, 78626',
    ]) {
      const r = splitStreetLine(line);
      expect(r.streetName, `"${r.streetName}" from "${line}"`).not.toContain(',');
      expect(r.streetName).not.toMatch(/\bTX\b/);
      expect(r.streetName).not.toMatch(/\d{5}/);
    }
  });
});

describe('a pasted full address fills every field it can', () => {
  // Discarding the city and ZIP silently would be its own small betrayal: a street field that
  // accepts a paste and keeps a third of it.
  it('recovers city, state and ZIP into their own fields', () => {
    expect(splitFullAddress('123 MAIN ST, WACO, TX, 76701')).toEqual({
      streetNumber: '123', streetName: 'MAIN ST', unit: '', city: 'WACO', state: 'TX', zip: '76701',
    });
  });

  it('handles the state and ZIP as one segment', () => {
    const a = splitFullAddress('3779 W FM 436, Belton, TX 76513');
    expect(a.city).toBe('Belton');
    expect(a.state).toBe('TX');
    expect(a.zip).toBe('76513');
  });

  it('handles a city segment carrying its own state and ZIP', () => {
    const a = splitFullAddress('400 AVE H, TEMPLE TX 76501');
    expect(a.city).toBe('TEMPLE');
    expect(a.zip).toBe('76501');
  });

  it('CONTROL: a bare street line still yields the street and nothing invented', () => {
    expect(splitFullAddress('CR 218')).toEqual({
      streetNumber: '', streetName: 'CR 218', unit: '', city: '', state: '', zip: '',
    });
  });

  it('round-trips through composeAddress unchanged', () => {
    // The property that matters: split then compose must not lose or move anything, or the preview
    // shows one address and the run searches another.
    const line = '3779 W FM 436, Belton, TX 76513';
    const a = splitFullAddress(line);
    expect(composeAddress({
      streetNumber: a.streetNumber, streetName: a.streetName, unit: a.unit,
      city: a.city, state: a.state, zip: a.zip,
    })).toBe(line);
  });
});

describe('what counts as enough to run', () => {
  it('a parcel ID alone is enough — it is the strongest input there is', () => {
    expect(canLocateProperty({ parcelId: '123456' })).toBe(true);
  });

  it('a street name alone is enough — rural parcels have no number', () => {
    expect(canLocateProperty({ streetName: 'CR 218' })).toBe(true);
  });

  it('a city alone is NOT — that is a search for a town', () => {
    expect(canLocateProperty({ city: 'TEMPLE', state: 'TX', zip: '76501' })).toBe(false);
  });
});

describe('the terms handed to a county CAD form', () => {
  const terms = cadSearchTerms({
    streetNumber: '400', streetName: 'ave h', unit: 'Suite 200', city: 'temple', zip: '76501',
  });

  it('are the parts, separately, because that is how the forms ask', () => {
    expect(terms.streetNumber).toBe('400');
    expect(terms.streetName).toBe('AVE H');
    expect(terms.city).toBe('TEMPLE');
  });

  it('EXCLUDE the unit, which turns a match into a miss', () => {
    // Appraisal records are keyed to the parcel, not the apartment.
    expect(JSON.stringify(terms)).not.toMatch(/Suite/i);
  });

  it('never contain a comma — a comma here means a city leaked into the street', () => {
    for (const v of Object.values(terms)) {
      if (typeof v === 'string') expect(v, `"${v}" carries a comma`).not.toContain(',');
    }
  });
});

describe('the run log says what it was given', () => {
  it('names what is missing, not only what is present', () => {
    const s = describeAddressInput({ streetName: 'CR 218', county: 'Milam' });
    expect(s).toMatch(/street name/);
    expect(s).toMatch(/Not supplied:.*city/);
    // Six weeks later, "why did this come back empty" is unanswerable if the log recorded only the
    // fields that happened to be filled.
  });

  it('says so plainly when nothing was supplied', () => {
    expect(describeAddressInput({})).toMatch(/No property identifiers/);
  });
});

describe('hasStructuredParts decides which path the worker takes', () => {
  it('is false for a legacy project that only has a flattened line', () => {
    expect(hasStructuredParts({ parcelId: '123' })).toBe(false);
  });
  it('is true once any address part is present', () => {
    expect(hasStructuredParts({ city: 'TEMPLE' })).toBe(true);
  });
});

// ── THE CALLERS. THE PART THAT ACTUALLY SHIPS ───────────────────────────────────────────────────
//
// A model with perfect behaviour that nothing imports is this repo's signature defect and has been
// found here more than a dozen times. These read the real files.

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/**
 * Source with comments removed. Necessary because the create route's own comment QUOTES the old
 * flattening join verbatim, so the `not.toMatch` below would fail against the fix that removed it.
 *
 * The block-comment opener is anchored to the start of a line. The obvious `\/\*[\s\S]*?\*\/` is
 * wrong, and was caught being wrong in the worker's copy of this test: an `Accept: ＊/＊;q=0.8`
 * header string opens a comment the regex closes 83 lines later, deleting real code. In a
 * `not.toMatch` assertion that failure mode is SILENT — the deleted region cannot match, so the
 * test passes and proves nothing.
 *
 * Line comments use `[^\n\r]*`: these files are CRLF and `$` in multiline mode sits before `\n`,
 * one character past where `.*` can reach.
 */
const code = (p: string) => {
  const raw = read(p);
  const stripped = raw
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
  if (!stripped.includes('import')) {
    throw new Error(`comment stripping destroyed ${p}: ${raw.length} chars in, ${stripped.length} out`);
  }
  return stripped;
};

describe('the create route stores the parts', () => {
  const ROUTE = code('app/api/admin/research/route.ts');

  it('CONTROL: the stripper kept the code and dropped the prose', () => {
    // Without this, an over-eager strip makes the `not.toMatch` below pass by deleting the region
    // it examines — a green test that proves the opposite of what it says.
    expect(ROUTE, 'stripping ate the insert').toContain("from('research_projects')");
    expect(ROUTE, 'stripping left the comment that quotes the old join').not.toContain('one comma');
  });

  it('no longer flattens with the join that broke the parsers', () => {
    expect(ROUTE, 'the comma-joined address is back').not.toMatch(
      /\[\s*property_address[^\]]*\]\s*\.filter\(Boolean\)\s*\.join\(', '\)/,
    );
    expect(ROUTE).toContain('composeAddress(structured)');
  });

  it('writes every part as its own column', () => {
    for (const col of ['street_number:', 'street_name:', 'unit:', 'city:', 'zip:', 'intake_notes:']) {
      expect(ROUTE, `${col} is not inserted`).toContain(col);
    }
  });

  it('falls back to description with || and NOT ??, which an empty string defeats', () => {
    // Found by creating a real project through the form and reading the row back: the notes landed
    // in `description` and `intake_notes` came out NULL. The form holds `intake_notes: ''` in its
    // state and spreads the whole object, so the field arrives as an EMPTY STRING — which `??`
    // keeps, because it falls back only on null and undefined. The fallback existed and could never
    // fire, and the operator's context still did not reach the AI.
    expect(ROUTE, '?? cannot fall back from an empty string').not.toContain('intake_notes ?? description');
    expect(ROUTE).toContain('intake_notes || description');
  });

  it('accepts them on PATCH too, or the columns rot after creation', () => {
    // The exact defect recorded for `job_id`: settable at creation only, from one screen, and wrong
    // forever after.
    expect(ROUTE).toContain("['street_name', 'street_name']");
    expect(ROUTE).toContain('touchesAddress');
  });
});

describe('the pipeline route carries them to the worker', () => {
  const ROUTE = code('app/api/admin/research/[projectId]/pipeline/route.ts');

  it('SELECTS the columns — the step that made city and ZIP invisible before', () => {
    for (const col of ['street_number', 'street_name', 'city', 'zip', 'intake_notes']) {
      expect(ROUTE, `${col} is not selected, so the worker cannot receive it`).toMatch(
        new RegExp(`\\.select\\('[^']*\\b${col}\\b`),
      );
    }
  });

  it('sends addressParts on the payload', () => {
    expect(ROUTE).toContain('addressParts');
    expect(ROUTE).toMatch(/const payload = \{[\s\S]{0,400}addressParts/);
  });

  it('and sends intake_notes down the channel that reaches the AI', () => {
    expect(ROUTE).toMatch(/operatorNotes: \[[\s\S]{0,200}intake_notes/);
  });
});

describe('the form asks for the parts', () => {
  const TAB = read('app/admin/research/_tabs/ProjectsTab.tsx');

  it('has a separate street number and street name input', () => {
    expect(TAB).toContain('id="np-street-number"');
    expect(TAB).toContain('id="np-street-name"');
  });

  it('composes the preview with the SAME function the server uses', () => {
    // Two implementations of "what will we search for" is how the card and the run come to
    // disagree about which property this is.
    expect(TAB).toContain("from '@/lib/research/property-address'");
    expect(TAB).toContain('composeAddress({');
  });

  it('submits the parts, not just the flattened line', () => {
    expect(TAB).toContain('street_number:');
    expect(TAB).toContain('street_name:');
  });

  it('uses the existing signed-URL uploader rather than a second one', () => {
    expect(TAB).toContain('uploadDocuments(');
    expect(TAB).toContain('validateFiles(');
  });

  it('does NOT navigate away over a failed upload', () => {
    // Routing immediately would render the warning for one frame and unmount it, and the operator
    // would start a run believing the AI had documents it does not have.
    expect(TAB).toContain('if (uploadFailed)');
  });
});
