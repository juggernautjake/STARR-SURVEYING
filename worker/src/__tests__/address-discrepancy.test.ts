import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { compareAddress, discrepancyLogLine } from '../research/address-discrepancy.js';

// ── WHY THIS IS NOT AN INTAKE CHECK ─────────────────────────────────────────────────────────────
//
// The slice was written as "warn when city and ZIP disagree", from the 2026-09-03 run: the operator
// entered "11780 FM 2484, Belton, TX 76513"; the parcel is at "11780 FM2484, Salado, TX 76571".
//
// Checked before building. Belton IS a Bell County city. 76513 IS a Bell County ZIP. Salado and
// 76571 are both Bell too. The entered pair is internally consistent, geographically sensible, and
// would have passed every check writable against the data available at intake. It is simply not
// this property's address.
//
// Only a source that knows where the parcel actually is can tell you — and two became available in
// the same session: Google geocoding (B1) and the parcel centroid (B2).

const FM2484 = {
  enteredCity: 'Belton',
  enteredZip: '76513',
  resolvedCity: 'Salado',
  resolvedZip: '76571',
  resolvedAddress: '11780 FM2484, Salado, TX 76571, USA',
  source: 'Google',
};

describe('the real 2026-09-03 case', () => {
  const d = compareAddress(FM2484);

  it('is a WARNING, because the ZIP differs', () => {
    // A different ZIP is a different postal area — a materially different place.
    expect(d.level).toBe('warn');
    expect(d.fields).toEqual(['city', 'zip']);
  });

  it('names both readings and picks neither', () => {
    // It cannot tell a typo from a rural mailing-address convention, and a system that guessed
    // would eventually guess wrong on somebody's boundary survey.
    expect(d.message).toMatch(/typo in the address/);
    expect(d.message).toMatch(/county records simply use a different town/);
    expect(d.message).toMatch(/Belton 76513/);
    expect(d.message).toMatch(/Salado 76571/);
  });

  it('says what is at stake', () => {
    expect(d.message).toMatch(/this run is about the wrong property/);
  });
});

describe('what it does NOT report', () => {
  it('CONTROL: a matching address produces nothing at all', () => {
    // Without this, "always warn" would satisfy every assertion above.
    const d = compareAddress({ enteredCity: 'Belton', enteredZip: '76513', resolvedCity: 'Belton', resolvedZip: '76513', source: 'Google' });
    expect(d.level).toBe('none');
    expect(d.message).toBe('');
    expect(discrepancyLogLine(d)).toBeNull();
  });

  it('says nothing when the operator entered no city or ZIP', () => {
    // An operator who left the field blank has not disagreed with anything. Telling them "the city
    // differs" when they entered none is noise that trains people to ignore the real ones.
    const d = compareAddress({ resolvedCity: 'Salado', resolvedZip: '76571', source: 'Google' });
    expect(d.level).toBe('none');
  });

  it('ignores a ZIP+4 difference — same postal area', () => {
    const d = compareAddress({ enteredZip: '76513-5438', resolvedZip: '76513', enteredCity: 'Belton', resolvedCity: 'Belton', source: 'Google' });
    expect(d.level).toBe('none');
  });

  it('ignores case and spacing on the city', () => {
    const d = compareAddress({ enteredCity: '  harker  heights ', resolvedCity: 'Harker Heights', source: 'Google' });
    expect(d.level).toBe('none');
  });

  it('a different city at the SAME ZIP is only a note', () => {
    // Rural Texas does this constantly — one town's mailing address, another's situs.
    const d = compareAddress({ enteredCity: 'Belton', enteredZip: '76513', resolvedCity: 'Morgans Point Resort', resolvedZip: '76513', source: 'Google' });
    expect(d.level).toBe('note');
    expect(d.fields).toEqual(['city']);
    expect(d.message).toMatch(/Probably nothing/);
  });
});

describe('it is actually consulted — assert the CALLER', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'services', 'address-utils.ts'), 'utf8');
  const code = raw.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');

  it('CONTROL: stripping kept the code and dropped the prose', () => {
    expect(code).toContain('compareAddress');
    expect(code).not.toContain('boundary survey');
  });

  it('compares what was entered against what Google resolved', () => {
    expect(code).toContain('compareAddress({');
    expect(code).toContain('enteredCity: parts?.city');
    expect(code).toContain('resolvedCity: g.result.city');
  });

  it('only when the operator actually supplied parts to compare', () => {
    expect(code).toMatch(/if \(hasUsableParts\(parts\)\) \{[\s\S]{0,120}compareAddress/);
  });

  it('and surfaces it in the run log', () => {
    expect(code).toContain("logger.warn('Stage0C', line)");
  });
});
