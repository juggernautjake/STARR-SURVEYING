// worker/src/__tests__/purchase-gate.test.ts — the switch that spends money (plan C3).
//
// The defect this guards against is not a wrong answer. It is a right answer nobody asked for:
// `mayRunBuyDocuments` was correct, careful, well-commented, and called from no line of code in the
// worker. So the last describe block reads index.ts and checks the CALL SITES, because a test that
// only exercised this module would have passed just as happily on the day the switch did nothing.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveEffectiveSettings,
  decidePurchase,
  describeSkippedPurchase,
} from '../research/purchase-gate.js';

describe('resolveEffectiveSettings — most specific source wins', () => {
  it('prefers the live run over everything', () => {
    const r = resolveEffectiveSettings({ allowPaidDocuments: false }, { allowPaidDocuments: true }, true);
    expect(r.source).toBe('live-run');
    expect(r.settings.allowPaidDocuments).toBe(false);
  });

  it('falls back to the run record when no pipeline is in memory', () => {
    // The common case: Phase 9 is a separate HTTP call, so the in-memory pipeline is usually gone
    // by the time a purchase happens.
    const r = resolveEffectiveSettings(null, { allowPaidDocuments: false }, true);
    expect(r.source).toBe('run-record');
    expect(r.settings.allowPaidDocuments).toBe(false);
  });

  it('falls back to the project default when the run recorded no settings', () => {
    const r = resolveEffectiveSettings(null, {}, false);
    expect(r.source).toBe('project-default');
    expect(r.settings.allowPaidDocuments).toBe(false);
  });

  it('treats an EMPTY settings object as carrying no instruction', () => {
    // `{}` is the column default. Reading it as "settings exist, so use them" would let an empty
    // object outrank the project's real switch.
    const r = resolveEffectiveSettings({}, {}, true);
    expect(r.source).toBe('project-default');
  });

  it('keeps allowPaidDocuments:false — the value truthiness would destroy', () => {
    // `settings.allowPaidDocuments || projectDefault` would turn every OFF back ON. The one value
    // that must survive is the falsy one.
    const r = resolveEffectiveSettings({ allowPaidDocuments: false }, null, true);
    expect(r.settings.allowPaidDocuments).toBe(false);
  });

  it('reports unreadable when nothing could be read', () => {
    const r = resolveEffectiveSettings(undefined, undefined, undefined);
    expect(r.source).toBe('unreadable');
  });

  it('ignores malformed values in the jsonb column rather than adopting them', () => {
    const r = resolveEffectiveSettings(null, {
      allowPaidDocuments: 'yes', maxCostUsd: 'lots', mode: 'turbo', refreshImagery: 1, junk: true,
    }, true);
    // Nothing survived coercion, so the run record carries no usable instruction.
    expect(r.settings.allowPaidDocuments).toBeUndefined();
    expect(r.settings.mode).toBeUndefined();
    expect(r.settings.maxCostUsd).toBeUndefined();
  });

  it('accepts a $0 ceiling, which is a real instruction', () => {
    const r = resolveEffectiveSettings(null, { maxCostUsd: 0 }, true);
    expect(r.settings.maxCostUsd).toBe(0);
  });
});

describe('decidePurchase', () => {
  it('allows a run with paid documents on', () => {
    const d = decidePurchase(resolveEffectiveSettings(null, null, true));
    expect(d.allowed).toBe(true);
  });

  it('REFUSES when the operator switched paid documents off', () => {
    const d = decidePurchase(resolveEffectiveSettings({ allowPaidDocuments: false }, null, true));
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/switched OFF/i);
  });

  it('REFUSES on a $0 ceiling, which is the same instruction said differently', () => {
    const d = decidePurchase(resolveEffectiveSettings({ maxCostUsd: 0 }, null, true));
    expect(d.allowed).toBe(false);
  });

  it('REFUSES in free mode', () => {
    const d = decidePurchase(resolveEffectiveSettings({ mode: 'free' }, null, true));
    expect(d.allowed).toBe(false);
  });

  it('REFUSES when permission could not be read at all', () => {
    // The money direction of the asymmetry: an unspent dollar is recoverable, a spent one is not.
    const d = decidePurchase(resolveEffectiveSettings(undefined, undefined, undefined));
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/could not be confirmed/i);
    // And it must not read as a finding about the county.
    expect(d.reason).toMatch(/deliberate refusal/i);
  });

  it('always explains itself in words, never just a boolean', () => {
    for (const s of [{ allowPaidDocuments: false }, { maxCostUsd: 0 }, { mode: 'free' as const }]) {
      expect(decidePurchase(resolveEffectiveSettings(s, null, true)).reason.length).toBeGreaterThan(40);
    }
  });
});

describe('describeSkippedPurchase — a decision must never read as a fact about the county', () => {
  it('says the documents were not looked for, not that they do not exist', () => {
    const d = decidePurchase(resolveEffectiveSettings({ allowPaidDocuments: false }, null, true));
    const text = describeSkippedPurchase(d, 4);
    expect(text).toMatch(/4 documents/);
    expect(text).toMatch(/says nothing about whether those records exist/i);
  });

  it('is empty when nothing was skipped', () => {
    const d = decidePurchase(resolveEffectiveSettings(null, null, true));
    expect(describeSkippedPurchase(d, 4)).toBe('');
  });

  it('gets the singular right', () => {
    const d = decidePurchase(resolveEffectiveSettings({ allowPaidDocuments: false }, null, true));
    expect(describeSkippedPurchase(d, 1)).toMatch(/1 document that .* was/);
  });
});

// ── The part that would have caught the original defect ─────────────────────────────────────────

describe('every place the worker spends money consults the gate', () => {
  const index = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');

  it('defines the resolver', () => {
    expect(index).toMatch(/async function resolvePurchasePermission\(projectId: string\)/);
  });

  it('Phase 9 (POST /research/purchase) asks before executing purchases', () => {
    // The gate must come BEFORE the orchestrator call, not after — filtering afterwards does not
    // refund anything.
    const gateAt = index.indexOf('const permission = await resolvePurchasePermission(projectId);');
    const spendAt = index.indexOf('orchestrator.executePurchases(');
    expect(gateAt).toBeGreaterThan(-1);
    expect(spendAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(spendAt);
  });

  it('the document access route forces freeOnly from the run setting', () => {
    expect(index).toMatch(/const forcedFreeOnly = \(freeOnly \?\? false\) \|\| !permission\.allowed;/);
    expect(index).toMatch(/freeOnly: forcedFreeOnly,/);
    // The old unconditional line must be gone, or the setting is decorative again.
    expect(index).not.toMatch(/freeOnly: freeOnly \?\? false,/);
  });

  it('the automated purchase route refuses outright, since it has no free tier', () => {
    expect(index).toMatch(/status: 'not_purchased'/);
  });

  it('consults the gate at every site that spends, and at the one that only asks', () => {
    // Was three: the two purchase routes and the document-access orchestrator's paid tier. D1
    // added the fourth and most important — the normal RUN, which until then could not buy at
    // all. The NUMBER is the point: a new spend site that forgets the gate makes this fail, which
    // is the only way that mistake gets noticed.
    // FIVE since the readiness route, and the fifth is NOT a spend site:
    // `GET /research/purchase/readiness/:projectId` consults the gate to REPORT whether a run would
    // be allowed to buy, without buying. It is counted anyway, because the number is the mechanism —
    // a new call makes this fail, and whoever fixes it has to say which kind it is.
    //
    // The four that spend: the two purchase routes, the document-access orchestrator's paid tier,
    // and the normal run (D1).
    const calls = index.match(/await resolvePurchasePermission\(projectId\)/g) ?? [];
    expect(calls.length).toBe(5);
  });
});
