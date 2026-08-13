// __tests__/receipts/card-check-covers-every-receipt.test.ts
//
// Owner, 2026-08-13: *"We need to know what card is paying for each receipt unless it is cash or
// check… all of the receipts should be flagged as having been paid for with an unknown card."*
//
// ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────────────────────────
//
// The card matcher shipped 2026-08-12 and ran during extraction. Production on 2026-08-13 held
// twelve receipts and **ten of them had `card_match_status = NULL`** — eight being card purchases
// with a perfectly legible last four. They predated the matcher, so nothing had ever asked the
// question about them.
//
// The re-match sweep was supposed to be the safety net, and it was the thing that missed them: it
// selected `.in('card_match_status', ['not_on_file', 'unknown'])`, and NULL is in neither list. So
// the receipts were not matched, not flagged, and not swept — absent from the feature rather than
// failing it, which is the state nobody thinks to check for. The queue looked clean because the
// rows were not in it.
//
// Two rules keep that shut, and neither is provable by a unit test of the matcher alone:
//
//   1. the sweep is defined by what it EXCLUDES (settled matches), not by listing open statuses, and
//      it names NULL explicitly — because `NOT IN (…)` is UNKNOWN, not TRUE, for a NULL column;
//   2. `not_a_card` is only ever the answer when the receipt actually SAYS cash or cheque.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { matchCardOnFile, type CardOnFile } from '@/lib/receipts/card-on-file';

const CARDS: CardOnFile[] = [
  { id: 'c1', last4: '4054', brand: 'visa', label: 'Fuel card', holder_name: 'Jacob Maddux' },
];

describe('the sweep cannot skip a receipt by predating the check', () => {
  const src = fs.readFileSync('lib/receipts/rematch-cards.ts', 'utf8');

  it('selects NULL card_match_status explicitly', () => {
    // The whole bug in one assertion. `.in(...)` and a bare `.not.in(...)` both drop NULL rows; only
    // an explicit `is.null` arm picks up a receipt the matcher has never examined.
    expect(src).toMatch(/card_match_status\.is\.null/);
  });

  it('is written as an exclusion of settled matches, not a list of open ones', () => {
    // A list of open statuses is a list somebody must remember to extend. Excluding the two SETTLED
    // answers means a status this code has never written is re-asked by default rather than ignored.
    expect(src).toMatch(/SETTLED_STATUSES\s*=\s*\[\s*'on_file',\s*'retired'\s*\]/);
    expect(src, 'the old open-status list must be gone, not merely unused')
      .not.toMatch(/OPEN_STATUSES/);
  });

  it('still leaves a settled match alone', () => {
    // The reason this is an exclusion and not "re-check everything": two cards can share a last
    // four, and silently re-pointing an already-matched receipt would rewrite a settled fact.
    expect(src).toMatch(/on_file/);
    expect(src).toMatch(/retired/);
  });
});

describe('the cron re-asks the question on its own', () => {
  const src = fs.readFileSync('app/api/cron/receipt-extraction/route.ts', 'utf8');

  it('runs the card re-match', () => {
    // Registering a card triggers a re-match, but that only helps a receipt somebody is chasing.
    // Without this the ten NULL rows would have waited for a card save that might never come.
    expect(src).toMatch(/rematchOpenReceipts\(\)/);
  });

  it('runs it before the API-key check, so it works on a deployment with no key', () => {
    // These receipts will never be extracted again — extraction is what would otherwise carry the
    // check — so gating the sweep behind the Vision key would leave them unexamined forever.
    const rematchAt = src.indexOf('rematchOpenReceipts()');
    const keyCheckAt = src.indexOf('ANTHROPIC_API_KEY');
    expect(rematchAt).toBeGreaterThan(-1);
    expect(rematchAt).toBeLessThan(keyCheckAt);
  });
});

describe('"not a card" is a claim, and is only made when the receipt makes it', () => {
  it('says not_a_card for cash and cheques', () => {
    for (const m of ['cash', 'check', 'cheque']) {
      expect(matchCardOnFile({ payment_method: m }, CARDS).status, m).toBe('not_a_card');
    }
  });

  it('never says not_a_card about a receipt that did not say how it was paid', () => {
    // The owner's rule — every receipt names a card unless it was cash or a cheque — has exactly one
    // loophole, and this is it: a blank payment line filed as "no card involved" leaves the check
    // without anybody deciding it should.
    for (const receipt of [{}, { payment_method: null }, { payment_method: 'debit' }]) {
      const r = matchCardOnFile(receipt, CARDS);
      expect(r.status, JSON.stringify(receipt)).not.toBe('not_a_card');
      expect(r.flag, 'an open question must say so out loud').toBeTruthy();
    }
  });

  it('a card purchase with no cards on file is flagged, not silently accepted', () => {
    // The firm's state today: an empty registry must produce a flag on every card receipt, which is
    // the prompt to go and register the cards.
    const r = matchCardOnFile({ payment_method: 'card', payment_last4: '9858' }, []);
    expect(r.status).toBe('not_on_file');
    expect(r.flag).toContain('9858');
  });
});
