// __tests__/learn/approved-calculators.test.ts — the guard that would have caught the 30Xa bug.
//
// For months the TI-30Xa emulator ran the TI-36X Pro's engine. The 30Xa is immediate-execution and
// the Pro is expression-entry — opposite ways of taking input — so it was training `SIN 45` on a
// machine that wants `45 SIN`. Nothing failed, because nothing had written down that the two
// differ, and a wrong emulator produces plausible numbers.
//
// So: every model records its entry model and the engine it runs on. A model that borrows another
// model's engine must say why, and the two must agree about entry. That is the check.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  APPROVED_CALCULATORS, ENTRY_MODELS, approvedCalculator, enginesInUse, NCEES_LIST_REVIEWED,
} from '@/lib/calculators/approved';
import { CALCULATOR_MODELS } from '@/app/admin/components/calculator/CalculatorProvider';

const ROOT = process.cwd();

describe('the list itself', () => {
  it('has no duplicate keys', () => {
    const keys = APPROVED_CALCULATORS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every entry says which of the three entry models it uses', () => {
    for (const c of APPROVED_CALCULATORS) {
      expect(ENTRY_MODELS[c.entry], `${c.key}: unknown entry model '${c.entry}'`).toBeTruthy();
    }
  });

  it('every entry explains the NCEES rule that permits it', () => {
    // The rule is by model-name PREFIX for TI and Casio and by exact model for HP, and somebody
    // choosing a calculator needs to know which — buying a TI-34 because "TI calculators are fine"
    // is a discovery best not made at the test centre door.
    for (const c of APPROVED_CALCULATORS) {
      expect(c.rule.length, `${c.key} has no rule`).toBeGreaterThan(30);
      expect(c.notes.length, `${c.key} has no notes`).toBeGreaterThan(40);
    }
  });

  it('records when the list was last checked, in a parseable form', () => {
    // A page that says "approved" without saying "as of when" claims a currency nobody verified.
    expect(NCEES_LIST_REVIEWED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isFinite(Date.parse(NCEES_LIST_REVIEWED))).toBe(true);
  });

  it('is findable by key, and safe for one that does not exist', () => {
    expect(approvedCalculator('ti-30xa')?.label).toBe('TI-30Xa');
    expect(approvedCalculator('ti-92')).toBeUndefined();
  });
});

describe('THE GUARD — a shared engine must be explained, and must agree about entry', () => {
  it('every model that borrows another model\'s engine says why', () => {
    for (const c of APPROVED_CALCULATORS) {
      const ownEngine = `${c.key}/engine`;
      if (c.engine === ownEngine) continue;
      expect(
        c.sharesEngineBecause,
        `${c.key} runs ${c.engine} instead of its own engine and does not say why. ` +
        'That is exactly how the TI-30Xa came to be running the TI-36X Pro engine.',
      ).toBeTruthy();
      expect((c.sharesEngineBecause ?? '').length).toBeGreaterThan(40);
    }
  });

  it('models sharing an engine share an entry model', () => {
    // The whole bug in one assertion. An immediate-execution machine may not run an
    // expression-entry engine, whatever else the two have in common.
    for (const [engine, models] of enginesInUse()) {
      const entries = new Set(models.map((m) => m.entry));
      expect(
        entries.size,
        `${engine} is shared by ${models.map((m) => `${m.key} (${m.entry})`).join(', ')} — ` +
        'these do not take input the same way, so one of them is being taught wrong.',
      ).toBe(1);
    }
  });

  it('every named engine file exists', () => {
    // A renamed or deleted engine would otherwise leave this list quietly describing something
    // that is not there.
    for (const c of APPROVED_CALCULATORS) {
      const file = path.join(ROOT, 'lib', 'calculators', 'models', `${c.engine}.ts`);
      expect(fs.existsSync(file), `${c.key}: no engine at ${c.engine}.ts`).toBe(true);
    }
  });

  it('the component for each model imports the engine this list names', () => {
    // The list is only worth anything if it describes what the code actually does. This reads the
    // components and checks.
    const dir = path.join(ROOT, 'app', 'admin', 'components', 'calculator', 'models');
    const sources = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => ({ file: f, src: fs.readFileSync(path.join(dir, f), 'utf8') }));

    for (const c of APPROVED_CALCULATORS) {
      // The component that imports an engine AND renders this model's keypad data.
      const owner = sources.find((s) => s.src.includes(`models/${c.key}/keypad-data`));
      expect(owner, `no component renders the ${c.key} keypad`).toBeTruthy();
      expect(
        owner!.src.includes(`models/${c.engine}'`) || owner!.src.includes(`models/${c.engine}"`),
        `${owner!.file} renders the ${c.key} keypad but does not import ${c.engine}, ` +
        'which is what this list claims it runs.',
      ).toBe(true);
    }
  });
});

describe('the list and the emulator agree about what exists', () => {
  it('every approved calculator has an emulator registered', () => {
    const keys = new Set(CALCULATOR_MODELS.map((m) => m.key as string));
    for (const c of APPROVED_CALCULATORS) {
      expect(keys.has(c.key), `${c.key} is on the approved list with no emulator`).toBe(true);
    }
  });

  it('labels match, so the reference page and the calculator picker name the same thing', () => {
    // Two names for one calculator is a small thing that makes a reference feel untrustworthy.
    for (const c of APPROVED_CALCULATORS) {
      const model = CALCULATOR_MODELS.find((m) => m.key === c.key);
      expect(model?.label, `${c.key}: picker says "${model?.label}", list says "${c.label}"`).toBe(c.label);
    }
  });

  it('only the TI-30Xa claims to be audited, because only it has been', () => {
    // An honest status. When another model's keys are catalogued and its entry model verified
    // against its engine, flip it here — and this assertion is what makes somebody notice they
    // have to, rather than leaving a half-finished audit looking finished.
    const audited = APPROVED_CALCULATORS.filter((c) => c.audited).map((c) => c.key);
    expect(audited).toEqual(['ti-30xa']);
  });
});
