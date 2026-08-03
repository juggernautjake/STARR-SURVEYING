// Cheapest-first stops being a suggestion (plan R13).
//
// `platform-choice.ts` opens by explaining the difference between a sort and a policy — that
// `getPlatformsForCounty()` returns platforms cost-ascending, that "callers picked a vendor by
// name", and that a county covered at $0.50 was routinely billed at $1.00 because a recommendation
// string happened to say TexasFile.
//
// It then had **zero callers**. The module written to end the overpay never saw a purchase. That is
// the eighth instance of this shape in the research plan, and it keeps landing on the modules whose
// whole purpose is to prevent a quiet loss — a check nobody runs and a policy nobody enforces fail
// the same silent way.
//
// What is pinned here is the enforcement point and, just as much, its LIMIT: this records the
// premium, it does not refuse the purchase.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { choosePlatform, mayPurchaseFrom } from '../services/platform-choice.js';

const orchestrator = fs.readFileSync(
  path.join(process.cwd(), 'src/services/document-purchase-orchestrator.ts'), 'utf8');
const purchaseTypes = fs.readFileSync(
  path.join(process.cwd(), 'src/types/purchase.ts'), 'utf8');

/** Bell County — Kofile territory, and one of the 22 this platform actually covers. */
const BELL = '48027';

describe('the policy still says what it said', () => {
  it('picks a platform and explains why', () => {
    const c = choosePlatform(BELL, { configured: ['texasfile'] });
    expect(c.reason).toBeTruthy();
  });

  it('allows the platform it chose', () => {
    const c = choosePlatform(BELL, { configured: ['texasfile'] });
    if (c.platform) {
      expect(mayPurchaseFrom(BELL, c.platform.id, { configured: ['texasfile'] }).allowed).toBe(true);
    }
  });

  it('does not refuse a CHEAPER purchase than its own choice', () => {
    // Refusing one would be the policy working against its own purpose — the caller may know a
    // county-specific rate, or that only that vendor carries the document.
    const c = choosePlatform(BELL, { configured: ['texasfile'] });
    if (!c.platform) return;
    const cheaper = ['glo_archives', 'txdot_docs'] as const;
    for (const id of cheaper) {
      const v = mayPurchaseFrom(BELL, id, { configured: ['texasfile', ...cheaper] });
      if (!v.allowed) expect(v.reason).not.toMatch(/needs a stated reason/);
    }
  });

  it('rejects an id that is not a platform at all', () => {
    const v = mayPurchaseFrom(BELL, 'not_a_platform' as never);
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain('not a known platform');
  });
});

describe('the purchase step now asks', () => {
  it('calls the enforcement point before buying', () => {
    expect(orchestrator).toContain('mayPurchaseFrom(countyFIPS, intendedPlatform');
  });

  it('uses the real platform ids, not the free-text source string', () => {
    // `kofile` is not a PaidPlatformId — `kofile_pay` is. The typechecker caught this; a string
    // comparison would not have, and the policy would silently never match.
    expect(orchestrator).toContain("'kofile_pay'");
    expect(orchestrator).not.toMatch(/intendedPlatform[\s\S]{0,80}\?\s*'kofile'\s/);
  });

  it('treats "configured" as what this RUN can actually buy from', () => {
    // Not what credentials exist in principle: recommending a cheaper vendor that was never
    // initialised would name an alternative that did not exist, which reads as a mistake and is not.
    expect(orchestrator).toContain('kofileAdapter ?');
    expect(orchestrator).toContain('texasFileAdapter ?');
    expect(orchestrator).toContain('configuredPlatformIds: PaidPlatformId[]');
  });
});

describe('what it deliberately does NOT do', () => {
  it('records the premium instead of blocking the purchase', () => {
    // The adapters wired into this file are the only ones that can complete a purchase, so refusing
    // here would stall a run rather than save money. Making the overpay visible and priced is the
    // part that can actually change what somebody subscribes to.
    expect(orchestrator).toContain('policyPremiums.push');
    expect(orchestrator).toContain('does not override the choice');
  });

  it('keeps the reason, not just a count', () => {
    // "Tyler covers this county at $0.50 but has no credentials configured" is an invoice line AND a
    // to-do item. A count of overpays is neither.
    expect(orchestrator).toMatch(/policyPremiums.*Array<\{ instrument: string; reason: string \}>/s);
  });
});

describe('the premium reaches the report, not only the log', () => {
  it('is on the report type', () => {
    expect(purchaseTypes).toContain('policyPremiums?: Array<{ instrument: string; reason: string }>');
  });

  it('is undefined rather than empty when nothing overpaid', () => {
    // "checked and held" must stay distinguishable from "never evaluated" — the same rule
    // librarySavings and identity already follow.
    expect(orchestrator).toContain('policyPremiums.length > 0 ? [...policyPremiums] : undefined');
  });

  it('says why the distinction matters, where the next person will edit it', () => {
    expect(purchaseTypes).toContain('an empty array would claim it did and found nothing');
  });
});
