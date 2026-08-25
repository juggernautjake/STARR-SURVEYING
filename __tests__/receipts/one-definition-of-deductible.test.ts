// __tests__/receipts/one-definition-of-deductible.test.ts — P2.2c's guard, ahead of P2.2c.
//
// P2.2c exists because of the `effectiveHours` defect: four files summed raw hours while a fifth
// summed the approver's adjustment, and the two disagreed across the very decision that created
// them. It is written as a repair — "one definition, before the first screen reads `total_cents`
// again" — but the split has NOT happened here. Measured 2026-08-25: exactly one function in the
// tree converts a `tax_deductible_flag` into a number.
//
// So the valuable half of P2.2c is not the relocation, it is this: fail the moment a second one
// appears. A guard written while the count is one is worth more than a reconciliation written after
// it is two, and it costs nothing to keep.
//
// ── THE 50 IS WRITTEN DOWN TWICE, AND ONLY ONE OF THEM IS ARITHMETIC ────────────────────────────
//
// `deductibleFraction()` returns 0.5. `lib/finance/tax-summary.ts` separately tells a person
// "Deductible at 50% — meals and entertainment limit". The second is prose, so it is invisible to
// any search for a computation, and its own comment says exactly why it is spelled out: *"partial
// without the number is the kind of thing that gets re-derived wrongly at filing time."*
//
// Two copies of one constant, one of which a grep for arithmetic will never find. That is the
// effectiveHours shape before it has cost anything. If the limit ever changes, this test is what
// points at the sentence after somebody changes the fraction.

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { code } from '../helpers/source';
import { deductibleFraction, deductibleCents, DEDUCTIBLE_FRACTION } from '@/lib/finance/tax-summary';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Every `.ts`/`.tsx` under `app` and `lib`, which is where receipt money is decided. */
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

const SOURCES = [...walk('app'), ...walk('lib')];

// `code()` is the shared stripper — this file used to carry its own copy, and that copy had the
// bug every hand-rolled version has: it eats the rest of any line containing `//` inside a string,
// so `'https://x'` becomes `'https:`. Harmless for a positive match and quietly fatal for a
// negative one, which is most of what this file asserts.

describe('the move changed nothing about the numbers', () => {
  // P2.2c relocated a function; a relocation that alters a tax figure is not a relocation. The old
  // form was a `switch` whose `default:` arm caught `review` and everything else. The new form is a
  // map plus `?? 0`, and the two must agree on every input the old one could receive — including the
  // ones nobody writes down: an unknown string, null, undefined, and the empty string.
  it('gives the same fraction the switch did, for every flag and every non-flag', () => {
    expect(deductibleFraction('full')).toBe(1.0);
    expect(deductibleFraction('partial_50')).toBe(0.5);
    expect(deductibleFraction('none')).toBe(0.0);
    expect(deductibleFraction('review')).toBe(0.0);

    for (const notAFlag of ['', 'FULL', 'partial', 'deductible', null, undefined]) {
      expect(deductibleFraction(notAFlag), `unknown flag ${JSON.stringify(notAFlag)}`).toBe(0);
    }
  });

  it('deductibleCents rounds once, in the definition', () => {
    // The route used to write `Math.round(total * deductibleFraction(flag))` inline. Rounding is
    // part of what "deductible" MEANS -- cents are integers -- and a half-cent that rounds one way
    // here and another way in the next screen is a discrepancy nobody can explain at filing time.
    expect(deductibleCents(1001, 'partial_50')).toBe(501);   // 500.5 → 501, once, here
    expect(deductibleCents(1000, 'partial_50')).toBe(500);
    expect(deductibleCents(1234, 'full')).toBe(1234);
    expect(deductibleCents(1234, 'none')).toBe(0);
    expect(deductibleCents(1234, 'review')).toBe(0);
    // A missing total is zero, not NaN: a receipt with no amount must not poison a whole report.
    expect(deductibleCents(null, 'full')).toBe(0);
    expect(deductibleCents(undefined, 'full')).toBe(0);
  });

  it('and nothing deducts more than the receipt', () => {
    // A fraction above 1 would claim more than was spent. Cheap to assert, and the kind of thing a
    // future "120% for X" would sail past review on.
    for (const [flag, f] of Object.entries(DEDUCTIBLE_FRACTION)) {
      expect(f, flag).toBeGreaterThanOrEqual(0);
      expect(f, flag).toBeLessThanOrEqual(1);
    }
  });
});

describe('deductibility has one definition', () => {
  it('and exactly one place turns the flag into a number', () => {
    // The signature of a converter: it names the flag AND pairs it with a fraction. A <select>
    // option, a type union and a prose summary all mention `partial_50` and none of them is a
    // definition — so the match is on the pairing, not on the word.
    const converters = SOURCES.filter((f) => {
      const c = code(read(f));
      if (!c.includes('partial_50')) return false;
      return /case\s+'partial_50':[\s\S]{0,120}?return\s+0?\.\d/.test(c)   // the old switch form
        || /partial_50:\s*0?\.\d/.test(c);                                  // the map form it became
    });

    // P2.2c moved it out of the route handler. A definition inside a route is one nobody else can
    // import, so the second author writes their own — which is the whole defect this guards.
    expect(converters).toEqual(['lib/finance/tax-summary.ts']);
  });

  it('and the sentence a person reads is DERIVED from that number, not typed again', () => {
    // This is the half that nearly got away. The arithmetic had one home; the CONSTANT did not —
    // `summarise()` separately told a person "Deductible at 50%", and prose is invisible to any
    // search for a computation. Two copies of one number, one of which nobody would think to check.
    // Read as CODE. The first version of this assertion checked the raw file and failed on the
    // comment two lines above it, which quotes the old sentence to explain why it is gone — the
    // sixth time in this plan that prose about a rule was read as the rule. `code()` exists here for
    // exactly that, and the earlier assertions already use it.
    const lib = code(read('lib/finance/tax-summary.ts'));
    expect(lib).toMatch(/partial_50:\s*0\.5,/);
    expect(lib).toMatch(/Deductible at \$\{asPercent\(DEDUCTIBLE_FRACTION\.partial_50\)\}%/);
    // And no literal survives in the code, so changing the fraction cannot leave the sentence behind.
    expect(lib).not.toMatch(/Deductible at 50%/);
  });

  it('and every file that knows the flag at all is one somebody chose', () => {
    // Not a style rule — a tripwire. Adding `partial_50` to a seventh file is exactly how a second
    // definition arrives, and this makes that an edit somebody has to make deliberately.
    const knows = SOURCES.filter((f) => read(f).includes('partial_50')).sort();
    expect(knows).toEqual([
      'app/admin/receipts/_tabs/QueueTab.tsx',            // the control a person sets it with
      'app/api/admin/receipts/[id]/route.ts',             // the write path's documented enum
      'lib/finance/tax-summary.ts',                       // the type, the fraction, and the sentence
      'lib/receipts/deep-read.ts',                        // what the AI may propose
      'lib/receipts/edit.ts',                             // what an edit may set
    ]);
    // Six before P2.2c. The tax-summary ROUTE dropped off the list entirely: it now imports the
    // fraction instead of holding one, which is the whole point of the move.
  });
});
