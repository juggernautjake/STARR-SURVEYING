// Every key on the TI-30Xa, documented.
//
// Owner, 2026-09-20: "We need to catalogue all of the commands and everything for whatever
// calculators we use so that we can fully learn what each button does and what each combination of
// buttons do. I need to become very familiar and quick with the calculator."
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TI_30XA_CATALOGUE, TI_30XA_DRILLS, CATALOGUE_GROUPS, docFor } from '@/lib/calculators/models/ti-30xa/catalogue';
import { TI_30XA_KEYPAD } from '@/lib/calculators/models/ti-30xa/keypad-data';

describe('the catalogue covers the real device', () => {
  it('documents every key that is actually on the keypad', () => {
    // The keypad was rebuilt from a photograph, so it is the authority on which keys exist. A key
    // somebody can press and find nothing written about is the gap this file exists to close.
    const onDevice = TI_30XA_KEYPAD.map((k) => k.id);
    const undocumented = onDevice.filter((id) => !docFor(id));
    expect(undocumented, `no documentation for: ${undocumented.join(', ')}`).toEqual([]);
  });

  it('does not document keys the device does not have', () => {
    // Except `n`, which is 2nd EE rather than a key of its own and is catalogued as a command.
    const onDevice = new Set(TI_30XA_KEYPAD.map((k) => k.id));
    const phantom = TI_30XA_CATALOGUE.map((k) => k.id).filter((id) => !onDevice.has(id) && id !== 'n');
    expect(phantom, `documented but not on the keypad: ${phantom.join(', ')}`).toEqual([]);
  });

  it('documents the 2nd function wherever the key face prints one', () => {
    const missing: string[] = [];
    for (const key of TI_30XA_KEYPAD) {
      if (!key.shiftLabel) continue;
      const doc = docFor(key.id);
      // Digits print no useful second function; everything else that prints one should explain it.
      if (doc && !doc.second && doc.group !== 'entry') missing.push(`${key.id} (${key.shiftLabel})`);
    }
    expect(missing, `2nd function printed but not explained: ${missing.join(', ')}`).toEqual([]);
  });

  it('puts every key in a group the browser knows how to show', () => {
    const known = new Set(CATALOGUE_GROUPS.map((g) => g.id));
    const orphans = TI_30XA_CATALOGUE.filter((k) => !known.has(k.group)).map((k) => k.id);
    expect(orphans).toEqual([]);
  });
});

describe('what it actually teaches', () => {
  it('says what each key does, in words', () => {
    // `plain` keys are exempt: there is genuinely nothing to say about a 7 beyond that it is a
    // seven, and padding ten entries with invented detail would teach somebody to stop reading the
    // ones that matter.
    const empty = TI_30XA_CATALOGUE
      .filter((k) => !k.plain && k.does.trim().length < 20)
      .map((k) => k.id);
    expect(empty, `too thin to be useful: ${empty.join(', ')}`).toEqual([]);
  });

  it('warns about the thing that actually catches people out on this model', () => {
    // The 30Xa is algebraic and single-line: the angle goes in BEFORE the function key. Somebody
    // arriving from a TI-36X Pro types SIN 30 and gets a wrong answer with no warning at all.
    const sin = docFor('sin')!;
    expect(sin.does).toContain('FIRST');
    expect(sin.trap).toContain('36X Pro');
  });

  it('separates the DRG mode change from the DRG conversion', () => {
    // Different operations, one key, and confusing them costs an hour.
    const drg = docFor('mode')!;
    expect(drg.second?.label).toBe('DRG►');
    expect(drg.trap).toContain('different operations');
  });

  it('is honest about the keys a surveyor will not use', () => {
    // A catalogue that claimed every key was essential would be one nobody trusts on the keys that
    // are.
    const hyp = docFor('hyp')!;
    expect(hyp.trap).toContain('never wanted in surveying');
  });

  it('ties the keys that matter to what they are for', () => {
    for (const id of ['sin', 'cos', 'tan', 'sqrt', 'xsq', 'sigma', 'pow', 'ee', 'sto']) {
      expect(docFor(id)?.surveyUse, `${id} should say why a surveyor reaches for it`).toBeTruthy();
    }
  });

  it('gives a sequence that can be tried immediately, not just prose', () => {
    const withExamples = TI_30XA_CATALOGUE.filter((k) => k.example).length;
    expect(withExamples).toBeGreaterThanOrEqual(10);
  });
});

describe('the drills', () => {
  it('start with checking the angle mode', () => {
    // Because a calculator in radians produces wrong answers that look entirely reasonable, and it
    // is the first thing to do on sitting down.
    expect(TI_30XA_DRILLS[0]!.id).toBe('check-drg');
  });

  it('cover the computations the exam actually repeats', () => {
    const ids = TI_30XA_DRILLS.map((d) => d.id);
    for (const must of ['inverse', 'dms', 'stats', 'curve']) {
      expect(ids, `no drill for ${must}`).toContain(must);
    }
  });

  it('say why each one is worth learning, and what it should produce', () => {
    for (const d of TI_30XA_DRILLS) {
      expect(d.why.length, `${d.id} has no reason`).toBeGreaterThan(30);
      expect(d.press.length, `${d.id} has no keystrokes`).toBeGreaterThan(1);
      expect(d.result.length, `${d.id} does not say what appears`).toBeGreaterThan(5);
    }
  });
});

describe('where it lives', () => {
  it('is kept apart from the device layout', () => {
    // keypad-data.ts describes the plastic and was rebuilt from a photograph; this is the manual.
    // Keeping them apart means the layout can be corrected without touching the teaching.
    const keypad = readFileSync('lib/calculators/models/ti-30xa/keypad-data.ts', 'utf8');
    expect(keypad).not.toContain('surveyUse');
    expect(keypad).not.toContain('TI_30XA_CATALOGUE');
  });
});
