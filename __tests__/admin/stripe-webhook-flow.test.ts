/**
 * The Stripe webhook, run for real against an in-memory database: a bank payment clears, a card
 * payment is refunded in part, a chargeback is opened and won, a bank payment bounces, and a
 * database failure makes Stripe send the event again. (Owner, 2026-11-10: online payments.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
let failNextPaymentsInsert = false;
const sent: Array<{ to: string; subject: string }> = [];

function table(name: string) {
  db[name] = db[name] ?? [];
  return db[name];
}

/** Just enough of the Supabase query builder for the webhook. */
function query(name: string) {
  const filters: Array<[string, unknown]> = [];
  let op: 'select' | 'update' | 'delete' = 'select';
  let patch: Row = {};
  const rows = () => table(name).filter((r) => filters.every(([k, v]) => r[k] === v));
  const api = {
    select: () => api,
    eq: (k: string, v: unknown) => { filters.push([k, v]); return api; },
    order: () => api,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    single: async () => ({ data: rows()[0] ?? null, error: null }),
    insert: async (r: Row) => {
      if (name === 'payments' && failNextPaymentsInsert) { failNextPaymentsInsert = false; return { error: { message: 'connection reset' } }; }
      if (name === 'processed_webhook_events' && table(name).some((x) => x.stripe_event_id === r.stripe_event_id)) return { error: { code: '23505' } };
      table(name).push({ id: crypto.randomUUID(), refunded_cents: 0, ...r });
      return { error: null };
    },
    update: (p: Row) => { op = 'update'; patch = p; return api; },
    delete: () => { op = 'delete'; return api; },
    then: (res: (v: { data: Row[] | null; error: null }) => void) => {
      if (op === 'update') for (const r of rows()) Object.assign(r, patch);
      if (op === 'delete') { const keep = table(name).filter((r) => !rows().includes(r)); db[name] = keep; }
      res({ data: op === 'select' ? rows() : null, error: null });
    },
  };
  return api;
}

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: (n: string) => query(n) } }));
vi.mock('@/lib/saas/notifications', () => ({ dispatch: vi.fn() }));
vi.mock('@/lib/saas/notifications/events', () => ({ registerAllEvents: () => {} }));
vi.mock('@/lib/saas/notifications/email', () => ({
  sendEmailViaResend: async (m: { to: string; subject: string }) => { sent.push({ to: m.to, subject: m.subject }); return true; },
}));
vi.mock('@/lib/saas/tenant-profile', () => ({ getTenantProfile: async () => ({ contactEmail: 'office@firm.test' }) }));

const SECRET = 'whsec_test';
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.PAYMENTS_LIVE = 'true';

const { POST } = await import('@/app/api/webhooks/stripe/route');

let n = 0;
async function send(type: string, object: Row) {
  const body = JSON.stringify({ id: `evt_${++n}`, type, created: 0, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex');
  const req = new Request('http://x/api/webhooks/stripe', { method: 'POST', body, headers: { 'stripe-signature': `t=${t},v1=${sig}` } });
  const res = await POST(req as never);
  return { status: res.status, body };
}
async function resend(body: string) {
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex');
  const res = await POST(new Request('http://x', { method: 'POST', body, headers: { 'stripe-signature': `t=${t},v1=${sig}` } }) as never);
  return res.status;
}

const INV = 'inv-1';
const pi = (id: string, extra: Row = {}) => ({
  object: 'payment_intent', id, amount: 100000, amount_received: 100000, currency: 'usd',
  receipt_email: 'pat@example.com', metadata: { invoice_id: INV, invoice_number: 'SS-1', public_slug: 's' }, ...extra,
});
const invoice = () => table('customer_invoices')[0];
const payments = () => table('payments');

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  sent.length = 0;
  table('customer_invoices').push({ id: INV, org_id: 'org', invoice_number: 'SS-1', customer_name: 'Pat', total_cents: 100000, status: 'issued', paid_at: null });
});

describe('the Stripe webhook, end to end', () => {
  it('a bank payment: clearing (not paid, one pending row) → cleared (paid, the same row)', async () => {
    await send('payment_intent.processing', pi('pi_bank', { status: 'processing', amount_received: 0 }));
    expect(payments()).toHaveLength(1);
    expect(payments()[0].status).toBe('pending');
    expect(invoice().status).toBe('issued');

    await send('payment_intent.succeeded', pi('pi_bank', { status: 'succeeded' }));
    expect(payments()).toHaveLength(1);
    expect(payments()[0].status).toBe('succeeded');
    expect(invoice().status).toBe('paid');
    expect(invoice().paid_at).toBeTruthy();

    // A late or repeated "processing" never undoes it.
    await send('payment_intent.processing', pi('pi_bank', { status: 'processing' }));
    expect(payments()[0].status).toBe('succeeded');
  });

  it('a bank payment that bounces: failed, invoice owed again, office emailed', async () => {
    await send('payment_intent.processing', pi('pi_b', { amount_received: 0 }));
    await send('payment_intent.payment_failed', pi('pi_b', { last_payment_error: { message: 'Insufficient funds' } }));
    expect(payments()[0].status).toBe('failed');
    expect(invoice().status).toBe('issued');
    expect(sent).toEqual([{ to: 'office@firm.test', subject: 'Bank payment failed — invoice SS-1' }]);
  });

  it('a card declined at checkout writes nothing and emails nobody', async () => {
    await send('payment_intent.payment_failed', pi('pi_c', { last_payment_error: { message: 'Card declined' } }));
    expect(payments()).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('a part refund reopens the balance; the rest refunded → refunded', async () => {
    await send('payment_intent.succeeded', pi('pi_card'));
    await send('charge.refunded', { object: 'charge', id: 'ch_1', payment_intent: 'pi_card', amount: 100000, amount_refunded: 25000 });
    expect(payments()[0].refunded_cents).toBe(25000);
    expect(invoice().status).toBe('partial');
    expect(invoice().paid_at).toBeNull();
    await send('charge.refunded', { object: 'charge', id: 'ch_1', payment_intent: 'pi_card', amount: 100000, amount_refunded: 100000 });
    expect(payments()[0].status).toBe('refunded');
    expect(invoice().status).toBe('refunded');
  });

  it('a chargeback: money held back and the office told; won → paid again', async () => {
    await send('payment_intent.succeeded', pi('pi_card'));
    await send('charge.dispute.created', { object: 'dispute', id: 'dp_1', payment_intent: 'pi_card', amount: 100000, status: 'needs_response', reason: 'product_not_received', evidence_details: { due_by: 1800000000 } });
    expect(payments()[0].status).toBe('disputed');
    expect(invoice().status).toBe('issued');
    expect(sent[0].subject).toBe('Chargeback opened — invoice SS-1');
    await send('charge.dispute.closed', { object: 'dispute', id: 'dp_1', payment_intent: 'pi_card', amount: 100000, status: 'won' });
    expect(payments()[0].status).toBe('succeeded');
    expect(invoice().status).toBe('paid');
  });

  it('a database failure answers 500 and forgets the event, so Stripe\'s retry records the payment', async () => {
    failNextPaymentsInsert = true;
    const first = await send('payment_intent.succeeded', pi('pi_retry'));
    expect(first.status).toBe(500);
    expect(payments()).toHaveLength(0);
    expect(await resend(first.body)).toBe(200);
    expect(payments()).toHaveLength(1);
    expect(invoice().status).toBe('paid');
  });

  it('a bank payment at the non-card price settles the card-price invoice (2026-11-10)', async () => {
    invoice().total_cents = 103017; // the card price of a $1,000 quote
    const bank = (extra: Record<string, unknown> = {}) => pi('pi_ach', {
      amount: 100000, amount_received: 100000, payment_method_types: ['us_bank_account'],
      metadata: { invoice_id: INV, invoice_number: 'SS-1', public_slug: 's', pay_method: 'bank', credit_cents: '103017', discount_cents: '3017' },
      ...extra,
    });
    await send('payment_intent.processing', bank({ amount_received: 0 }));
    expect(payments()[0]).toMatchObject({ status: 'pending', method: 'ach', amount_cents: 100000, discount_cents: 3017 });
    expect(invoice().status).toBe('issued');
    await send('payment_intent.succeeded', bank());
    expect(payments()).toHaveLength(1);
    expect(payments()[0]).toMatchObject({ status: 'succeeded', method: 'ach', discount_cents: 3017 });
    expect(invoice().status).toBe('paid');
  });

  it('a card payment never gets the discount, whatever the metadata says', async () => {
    invoice().total_cents = 103017;
    await send('payment_intent.succeeded', pi('pi_card2', {
      amount: 100000, amount_received: 100000, payment_method_types: ['card'],
      metadata: { invoice_id: INV, invoice_number: 'SS-1', public_slug: 's', pay_method: 'card', discount_cents: '3017' },
    }));
    expect(payments()[0]).toMatchObject({ method: 'stripe', discount_cents: 0 });
    expect(invoice().status).toBe('partial');
  });

  it('the same event twice records one payment', async () => {
    const a = await send('payment_intent.succeeded', pi('pi_dup'));
    expect(await resend(a.body)).toBe(200);
    expect(payments()).toHaveLength(1);
  });
});
