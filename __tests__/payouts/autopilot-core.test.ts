// __tests__/payouts/autopilot-core.test.ts — the pure core of "commit once, everyone paid their way".
// Plan: docs/planning/in-progress/PAYOUT_AUTOPILOT_2026-10-11.md.

import { describe, it, expect, vi } from 'vitest';
import { computePayoutFee, normalizeFeeSettings, ruleAmount, consentTerms, type FeeSettings } from '@/lib/payouts/fees';
import { resolvePayout, normalizePolicy, methodBlocker, describePolicy, type PayoutPolicy, type PersonPayInfo } from '@/lib/payouts/routing';
import { railFor, venmoRecipient } from '@/lib/payouts/rails';
import { buildNachaFile, isValidRouting, originatorProblems, type NachaOriginator } from '@/lib/payouts/nacha';
import { buildVenmoPayoutRequest, mapPayPalItemStatus, createVenmoPayout, paypalConfig } from '@/lib/payouts/paypal';
import { amountInWords, dollarsInWords, amountFigures } from '@/lib/checks/words';
import { layoutCheck, micrLine, stubLinesFor } from '@/lib/checks/layout';
import { disbursedCents, totalFeeCents } from '@/lib/payroll/disbursement';

const fees: FeeSettings = normalizeFeeSettings({ fees: { check: { flat_cents: 200 }, cash: { flat_cents: 100, percent_bps: 100, cap_cents: 500 } }, fee_scope: 'contractors', fee_requires_consent: true, fee_max_percent: 5 });
const policy = (over: Partial<PayoutPolicy> = {}): PayoutPolicy => ({ ...normalizePolicy(null, { paypal: true, ach: true, checks: true }), fees, ...over });
const person = (over: Partial<PersonPayInfo> = {}): PersonPayInfo => ({ user_email: 'a@x.com', preferred: null, handle: null, hasBank: false, classification: 'contractor_1099', consented: new Set(), ...over });

describe('fees', () => {
  it('flat + percent, capped, never above the max percent or the payment', () => {
    expect(ruleAmount({ flat_cents: 100, percent_bps: 100, cap_cents: 500 }, 100_000, 5)).toBe(500); // $1 + 1% of $1000 = $11 → cap $5
    expect(ruleAmount({ flat_cents: 200 }, 1_000, 5)).toBe(50); // $2 fee on $10 → 5% max = $0.50
    expect(ruleAmount({ flat_cents: 200 }, 0, 5)).toBe(0);
  });
  it('contractors only by default; W-2 and unclassified are waived with a reason', () => {
    const r = computePayoutFee({ method: 'check', payableCents: 80_000, classification: 'w2', consented: true, settings: fees });
    expect(r.feeCents).toBe(0);
    expect(r.waived).toMatch(/contractors only/);
  });
  it('needs written consent', () => {
    expect(computePayoutFee({ method: 'check', payableCents: 80_000, classification: 'contractor_1099', consented: false, settings: fees }).waived).toMatch(/consent/);
    const ok = computePayoutFee({ method: 'check', payableCents: 80_000, classification: 'contractor_1099', consented: true, settings: fees, freeAlternative: 'Direct deposit' });
    expect(ok.feeCents).toBe(200);
    expect(ok.note).toBe('Check fee $2.00 — Direct deposit is free.');
  });
  it('any method may carry a fee when the firm sets one; account never does', () => {
    const s = normalizeFeeSettings({ fees: { venmo: { flat_cents: 50 }, account: { flat_cents: 99 } }, fee_scope: 'everyone', fee_requires_consent: false });
    expect(computePayoutFee({ method: 'venmo', payableCents: 10_000, classification: 'w2', consented: false, settings: s }).feeCents).toBe(50);
    expect(s.fees.account).toBeUndefined();
  });
  it('consent wording names the fee and the way out', () => {
    expect(consentTerms('check', { flat_cents: 200 }, 5)).toMatch(/\$2\.00 per payment.*never more than 5%.*switch to another offered method/);
  });
});

describe('routing — one decided way to pay each person', () => {
  it('uses the person\'s choice when it is offered and complete', () => {
    const r = resolvePayout(person({ preferred: 'venmo', handle: '@jake' }), policy(), 50_000);
    expect(r).toMatchObject({ method: 'venmo', source: 'preferred', handle: '@jake', problems: [] });
    expect(r.rail).toMatchObject({ kind: 'api', automatic: true });
  });
  it('falls back, and says why, when the choice cannot be used', () => {
    const r = resolvePayout(person({ preferred: 'ach', hasBank: false }), policy({ fallbackMethod: 'check' }), 50_000);
    expect(r.method).toBe('check');
    expect(r.source).toBe('fallback');
    expect(r.notes.join(' ')).toMatch(/Direct deposit|ACH.*no bank account on file/);
  });
  it('a method the firm switched off is never used', () => {
    const p = policy({ enabled: ['ach', 'check'], fallbackMethod: 'check' });
    const r = resolvePayout(person({ preferred: 'venmo', handle: 'jake' }), p, 50_000);
    expect(r.method).toBe('check');
    expect(methodBlocker('venmo', { handle: 'jake', hasBank: false }, p)).toMatch(/not offered/);
  });
  it('the default covers people who never chose', () => {
    expect(resolvePayout(person(), policy({ defaultMethod: 'cash' }), 50_000)).toMatchObject({ method: 'cash', source: 'default' });
  });
  it('holds the line, with a reason, when nothing works — never a guess', () => {
    const r = resolvePayout(person({ preferred: 'cashapp' }), policy(), 50_000);
    expect(r.method).toBeNull();
    expect(r.problems[0]).toMatch(/Cash App: no Cash App \$cashtag on file.*No fallback/);
  });
  it('a single-method firm reads as such', () => {
    expect(describePolicy(policy({ enabled: ['ach'] }))).toBe('Everyone is paid by ACH / direct deposit.');
  });
  it('the fee comes with the method, and names a free alternative', () => {
    const r = resolvePayout(person({ preferred: 'check', consented: new Set(['check'] as const) }), policy(), 80_000);
    expect(r.feeCents).toBe(200);
    expect(r.feeNote).toMatch(/Check fee \$2\.00 — .* is free\./);
  });
});

describe('rails', () => {
  it('Venmo is automatic only when PayPal is connected', () => {
    expect(railFor('venmo', { paypal: false, ach: false, checks: false })).toMatchObject({ kind: 'manual', automatic: false });
    expect(railFor('venmo', { paypal: true, ach: false, checks: false }).automatic).toBe(true);
  });
  it('Cash App and Zelle say plainly they cannot send themselves', () => {
    expect(railFor('cashapp', { paypal: true, ach: true, checks: true }).summary).toMatch(/no API/);
    expect(railFor('zelle', { paypal: true, ach: true, checks: true }).summary).toMatch(/no API/);
  });
  it('reads Venmo handles as people type them', () => {
    expect(venmoRecipient('@Jake-M')).toEqual({ recipient_type: 'USER_HANDLE', receiver: 'Jake-M' });
    expect(venmoRecipient('(254) 555-0142')).toEqual({ recipient_type: 'PHONE', receiver: '2545550142' });
    expect(venmoRecipient('Jake@Example.com')).toEqual({ recipient_type: 'EMAIL', receiver: 'jake@example.com' });
    expect(venmoRecipient('not a handle!')).toBeNull();
  });
});

describe('NACHA file', () => {
  const o: NachaOriginator = { immediate_destination: '043000096', immediate_destination_name: 'PNC Bank', immediate_origin: '1234567890', immediate_origin_name: 'Starr Surveying', company_name: 'Starr Surveying', company_id: '1234567890', odfi_routing: '043000096' };
  const entries = [
    { routing: '111000025', account: '123456789', account_type: 'checking' as const, amount_cents: 84_250, name: 'Jacob Maddux', individual_id: 'ITEM1' },
    { routing: '021000021', account: '9876543210', account_type: 'savings' as const, amount_cents: 51_000, name: 'Michael Gibbs', individual_id: 'ITEM2' },
  ];
  const f = buildNachaFile(o, entries, { effective_date: '2026-10-14', created_at: new Date('2026-10-12T15:30:00Z') });
  const lines = f.text.trimEnd().split('\r\n');
  it('every record is 94 characters and the file is blocked to 10', () => {
    expect(lines.every((l) => l.length === 94)).toBe(true);
    expect(lines.length % 10).toBe(0);
  });
  it('records in order with the right codes', () => {
    expect(lines.slice(0, 6).map((l) => l[0]).join('')).toBe('156689');
    expect(lines[2].slice(1, 3)).toBe('22');
    expect(lines[3].slice(1, 3)).toBe('32');
    expect(lines[2].slice(29, 39)).toBe('0000084250');
    expect(lines[1].slice(50, 53)).toBe('PPD');
    expect(lines[1].slice(69, 75)).toBe('261014');
  });
  it('hash and totals agree between batch and file control', () => {
    expect(f.entryHash).toBe(11100002 + 2100002);
    expect(lines[4].slice(10, 20)).toBe(String(f.entryHash).padStart(10, '0'));
    expect(lines[4].slice(32, 44)).toBe('000000135250');
    expect(lines[5].slice(31, 43)).toBe('000000000000');
    expect(lines[5].slice(43, 55)).toBe('000000135250');
  });
  it('validates routing numbers and refuses an incomplete setup', () => {
    expect(isValidRouting('043000096')).toBe(true);
    expect(isValidRouting('043000097')).toBe(false);
    expect(originatorProblems({})).not.toHaveLength(0);
    expect(() => buildNachaFile(o, [{ ...entries[0], routing: '123456789' }], { effective_date: '2026-10-14' })).toThrow(/routing/);
  });
});

describe('PayPal (Venmo) payouts', () => {
  it('builds an idempotent request with one item per line', () => {
    const b = buildVenmoPayoutRequest('batch-1-venmo', [{ itemId: 'i1', handle: '@jake', amountCents: 84_250, note: 'Pay' }], 'Starr payout');
    expect(b.sender_batch_header.sender_batch_id).toBe('batch-1-venmo');
    expect(b.items[0]).toMatchObject({ recipient_wallet: 'VENMO', recipient_type: 'USER_HANDLE', receiver: 'jake', sender_item_id: 'i1', amount: { value: '842.50', currency: 'USD' } });
  });
  it('maps statuses to ours', () => {
    expect(mapPayPalItemStatus('SUCCESS')).toEqual({ status: 'paid', final: true });
    expect(mapPayPalItemStatus('RETURNED').status).toBe('failed');
    expect(mapPayPalItemStatus('UNCLAIMED')).toEqual({ status: 'sent', final: false });
  });
  it('sends the idempotency key and reads the batch id back', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url.endsWith('/oauth2/token')) return new Response(JSON.stringify({ access_token: 'T' }), { status: 200 });
      return new Response(JSON.stringify({ batch_header: { payout_batch_id: 'PB1', batch_status: 'PENDING' } }), { status: 201 });
    }) as unknown as typeof fetch;
    const cfg = paypalConfig({ PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 'sec' } as unknown as NodeJS.ProcessEnv)!;
    expect(cfg.live).toBe(false);
    const r = await createVenmoPayout(cfg, 'b1-venmo', [{ itemId: 'i1', handle: '2545550142', amountCents: 1000, note: 'x' }], 'Pay', fetchImpl);
    expect(r.payoutBatchId).toBe('PB1');
    expect((calls[1][1]!.headers as Record<string, string>)['PayPal-Request-Id']).toBe('b1-venmo');
  });
});

describe('checks', () => {
  it('writes amounts in words, from cents', () => {
    expect(amountInWords(84_250)).toBe('Eight hundred forty-two and 50/100');
    expect(amountInWords(1)).toBe('Zero and 01/100');
    expect(amountInWords(1_000_000_00)).toBe('One million and 00/100');
    expect(dollarsInWords(1_234_567)).toBe('one million two hundred thirty-four thousand five hundred sixty-seven');
    expect(amountFigures(123_450)).toBe('**1,234.50');
  });
  it('MICR line in on-us / transit / account order', () => {
    expect(micrLine(1047, '043000096', '1234-5678')).toBe('C001047C A043000096A 12345678C');
  });
  const doc = { check_number: 1047, issue_date: '2026-10-14', payee_name: 'Jacob Maddux', amount_cents: 84_250, memo: 'Pay to Oct 11', period_label: 'Approved hours through Oct 11, 2026', stub_lines: [] };
  it('pre-printed stock prints only the fields — no MICR, no bank block', () => {
    const ops = layoutCheck(doc, { stock: 'preprinted', payer_name: 'Starr Surveying' });
    expect(ops.some((o) => o.t === 'text' && o.font === 'micr')).toBe(false);
    expect(ops.some((o) => o.t === 'text' && o.text === 'Jacob Maddux')).toBe(true);
    expect(ops.some((o) => o.t === 'text' && o.text.startsWith('Eight hundred forty-two and 50/100'))).toBe(true);
  });
  it('blank stock needs the bank numbers and prints the MICR line', () => {
    expect(() => layoutCheck(doc, { stock: 'blank_micr', payer_name: 'Starr' })).toThrow(/routing/);
    const ops = layoutCheck(doc, { stock: 'blank_micr', payer_name: 'Starr', routing: '043000096', account: '12345678' });
    expect(ops.find((o) => o.t === 'text' && o.font === 'micr')).toMatchObject({ text: 'C001047C A043000096A 12345678C' });
  });
  it('the stub shows what was withheld and ends on the check amount', () => {
    const lines = stubLinesFor({ hours_cents: 100_000, total_cents: 100_000, recovered_cents: 15_000, fee_cents: 200, fee_note: 'Check fee $2.00 — Direct deposit is free.' }, 84_800);
    expect(lines.map((l) => l.label)).toEqual(['Approved hours', 'Pay advance repayment', 'Check fee $2.00', 'Amount of this check']);
    expect(lines.at(-1)).toMatchObject({ amount_cents: 84_800, kind: 'total' });
  });
});

describe('disbursement with fees', () => {
  it('a fee is withheld from what is sent, not from what is settled', () => {
    expect(disbursedCents({ total_cents: 100_000, recovered_cents: 15_000, fee_cents: 200 })).toBe(84_800);
    expect(disbursedCents({ total_cents: 100, fee_cents: 500 })).toBe(0);
    expect(totalFeeCents([{ fee_cents: 200 }, { fee_cents: null }, { fee_cents: 100 }])).toBe(300);
  });
});
