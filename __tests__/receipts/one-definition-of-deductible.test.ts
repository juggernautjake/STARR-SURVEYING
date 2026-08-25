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

/** Comments stripped: this file is about code, and prose about the rule must not read as the rule. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('deductibility has one definition', () => {
  it('and exactly one place turns the flag into a number', () => {
    // The signature of a converter: it names the flag AND returns a fraction for it. A <select>
    // option, a type union and a prose summary all mention `partial_50` and none of them is a
    // definition — so the match is on the pairing, not on the word.
    const converters = SOURCES.filter((f) => {
      const c = code(read(f));
      if (!c.includes("'partial_50'")) return false;
      return /case\s+'partial_50':[\s\S]{0,120}?return\s+0?\.\d/.test(c);
    });

    expect(converters).toEqual(['app/api/admin/finances/tax-summary/route.ts']);
  });

  it('and the fraction and the sentence still agree', () => {
    // If these two ever disagree, a report and the sentence explaining it are telling a person two
    // different things about the same receipt — and the sentence is the one nobody will re-check.
    const fraction = code(read('app/api/admin/finances/tax-summary/route.ts'));
    expect(fraction).toMatch(/case\s+'partial_50':\s*return\s+0\.5;/);

    const prose = read('lib/finance/tax-summary.ts');
    expect(prose).toMatch(/Deductible at 50%/);
  });

  it('and every file that knows the flag at all is one somebody chose', () => {
    // Not a style rule — a tripwire. Adding `partial_50` to a seventh file is exactly how a second
    // definition arrives, and this makes that an edit somebody has to make deliberately.
    const knows = SOURCES.filter((f) => read(f).includes('partial_50')).sort();
    expect(knows).toEqual([
      'app/admin/receipts/_tabs/QueueTab.tsx',            // the control a person sets it with
      'app/api/admin/finances/tax-summary/route.ts',      // the one converter
      'app/api/admin/receipts/[id]/route.ts',             // the write path's documented enum
      'lib/finance/tax-summary.ts',                       // the sentence, and the type
      'lib/receipts/deep-read.ts',                        // what the AI may propose
      'lib/receipts/edit.ts',                             // what an edit may set
    ]);
  });
});
