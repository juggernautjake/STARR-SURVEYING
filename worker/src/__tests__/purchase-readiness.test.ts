import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { assessPurchaseReadiness } from '../research/purchase-readiness.js';

// D3's non-spending half — "will a paid run work?", answered before the money is at stake.
//
// Proving the purchase path end to end means spending real money at a live vendor against a real
// property, and that is the owner's call. What can be shipped is the readiness check, because a paid
// run that fails on a missing password teaches nothing except that a password was missing.
//
// `GET /research/purchase/platforms/status` already existed and does not answer this: it reports six
// Phase 15 adapters — Tyler Pay, Henschen, iDocket, Fidlar, GovOS, Landex — and NOT TexasFile or
// Kofile, which are the two the purchase orchestrator actually buys through. It also has no callers.

const env = (over: Record<string, string> = {}) => ({
  TEXASFILE_USERNAME: 'u', TEXASFILE_PASSWORD: 'p', ...over,
}) as unknown as NodeJS.ProcessEnv;

describe('what readiness reports', () => {
  it('CONTROL: a fully-configured run reads ready', () => {
    // Without this, "always report a problem" would satisfy every negative case below.
    const r = assessPurchaseReadiness({
      env: env(),
      permission: { allowed: true, reason: 'Paid documents are permitted for this run.' },
      recommendationCount: 3,
      hasReconciledBoundary: true,
    });
    expect(r.ready).toBe(true);
  });

  it('says presence is NOT proof, on the one check that cannot be proven for free', () => {
    // A username being set says nothing about whether the vendor accepts it or the account is
    // funded. A green light that overstates itself is worse than a red one — and this repo has
    // already been caught reporting a key that was merely present as a working integration.
    const r = assessPurchaseReadiness({ env: env() });
    const cred = r.checks.find((c) => c.name.includes('vendor account'));
    expect(cred?.ok).toBe(true);
    expect(cred?.detail).toMatch(/presence, not proof/i);
    expect(cred?.detail).toMatch(/nothing here has logged in/i);
  });

  it('and the summary refuses to claim the path is proven', () => {
    const r = assessPurchaseReadiness({
      env: env(),
      permission: { allowed: true, reason: 'ok' },
      recommendationCount: 2,
      hasReconciledBoundary: true,
    });
    expect(r.summary).toMatch(/only way to prove/i);
    expect(r.summary).toMatch(/nothing above has logged in or bought/i);
  });
});

describe('each way it can be not-ready reads differently', () => {
  it('no vendor account at all', () => {
    const r = assessPurchaseReadiness({ env: {} as NodeJS.ProcessEnv });
    expect(r.ready).toBe(false);
    expect(r.checks[0].detail).toMatch(/nothing to buy with/i);
  });

  it('the run is not allowed to spend', () => {
    const r = assessPurchaseReadiness({
      env: env(),
      permission: { allowed: false, reason: 'Paid documents are switched OFF for this run.' },
    });
    expect(r.ready).toBe(false);
    expect(r.summary).toMatch(/allowed to spend/i);
  });

  it('no reconciled boundary — and it names why that matters', () => {
    // This is the chain the whole plan uncovered: no boundary file → no Phase 8 → no
    // recommendations → no purchase. The message should tell that story, because it is the answer
    // to "why has nothing ever been bought".
    const r = assessPurchaseReadiness({ env: env(), hasReconciledBoundary: false });
    expect(r.ready).toBe(false);
    const check = r.checks.find((c) => c.name.includes('boundary'));
    expect(check?.detail).toMatch(/no purchase recommendations/i);
    expect(check?.detail).toMatch(/why no run has ever bought/i);
  });

  it('nothing worth buying is NOT the same as a working purchase path', () => {
    // The trap this check exists for. A run that correctly buys nothing looks identical to a run
    // whose purchase path is broken, and it would be the easiest possible false all-clear.
    const r = assessPurchaseReadiness({
      env: env(),
      permission: { allowed: true, reason: 'ok' },
      hasReconciledBoundary: true,
      recommendationCount: 0,
    });
    expect(r.ready).toBe(false);
    const check = r.checks.find((c) => c.name.includes('worth buying'));
    expect(check?.detail).toMatch(/does NOT prove the purchase path works/i);
  });

  it('omits checks it was given no input for, rather than guessing', () => {
    // A readiness report that invents a passing check is the failure mode this whole plan is about.
    const r = assessPurchaseReadiness({ env: env() });
    expect(r.checks.map((c) => c.name)).toEqual(['A vendor account is configured']);
  });
});

describe('the route exists and asks about the right vendors', () => {
  const INDEX = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8');

  it('is wired', () => {
    expect(INDEX).toContain("app.get('/research/purchase/readiness/:projectId'");
    expect(INDEX).toContain('assessPurchaseReadiness({');
  });

  it('reads the real gate rather than re-deciding', () => {
    expect(INDEX).toContain('await resolvePurchasePermission(projectId)');
  });

  it('checks the files the purchase chain actually depends on', () => {
    const at = INDEX.indexOf("app.get('/research/purchase/readiness/:projectId'");
    const block = INDEX.slice(at, at + 2000);
    expect(block).toContain('reconciled_boundary.json');
    expect(block).toContain('confidence_report.json');
  });

  it('never spends or logs in', () => {
    const at = INDEX.indexOf("app.get('/research/purchase/readiness/:projectId'");
    const block = INDEX.slice(at, at + 2000);
    expect(block, 'the readiness check constructs a purchaser').not.toContain('DocumentPurchaseOrchestrator');
    expect(block, 'the readiness check initiates a session').not.toContain('initSession');
  });
});
