'use client';
// app/admin/payouts/settings/page.tsx — how this firm pays people.
//
// Owner, 2026-10-11: "The org needs to be able to have full control over how payouts work. They can just
// provide a single way to payout, or multiple. They can put extra charges for using different types of
// payouts … make it easy to manage."
//
// One page, top to bottom in the order a firm decides things: which ways it pays, what happens when
// someone hasn't chosen or their choice can't be used, any fees (with the legal guardrails stated where
// the fee is set), approval, then the set-up each rail needs — each with a plain "ready / still needs"
// line so nothing is discovered at payday.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import '../../components/payouts/Payouts.css';

type Method = 'ach' | 'venmo' | 'cashapp' | 'zelle' | 'check' | 'cash' | 'account';
const LABELS: Record<Method, string> = { ach: 'Direct deposit (bank)', venmo: 'Venmo', cashapp: 'Cash App', zelle: 'Zelle', check: 'Paper check', cash: 'Cash', account: 'Hold in their pay account' };
const HOW: Record<Method, string> = {
  ach: 'One bank file per payout, uploaded to PNC.',
  venmo: 'Sent automatically through PayPal once connected.',
  cashapp: 'Tap-to-pay links — Cash App cannot send automatically.',
  zelle: 'From the bank\'s Zelle — no automatic sending exists.',
  check: 'Numbered and printed in one PDF.',
  cash: 'Handed over in person, signed for on a printed sheet.',
  account: 'Credited to their balance; they withdraw it later.',
};
const ORDER: Method[] = ['ach', 'venmo', 'cashapp', 'zelle', 'check', 'cash', 'account'];
const FEEABLE: Method[] = ['check', 'cash', 'venmo', 'cashapp', 'zelle', 'ach'];

interface Report {
  settings: {
    enabled_methods: Method[]; default_method: Method | null; fallback_method: Method | null;
    fees: Partial<Record<Method, { flat_cents?: number; percent_bps?: number; cap_cents?: number }>>;
    fee_scope: 'contractors' | 'everyone'; fee_requires_consent: boolean; fee_max_percent: number; two_person_approval: boolean;
    ach: Record<string, string>; checks: Record<string, string | number>; has_check_account: boolean;
    updated_by: string | null; updated_at: string | null;
  };
  policy: string;
  readiness: {
    paypal: { ready: boolean; mode?: string; missing?: string };
    encryption: { ready: boolean; missing?: string };
    ach: { ready: boolean; problems: string[] };
    checks: { ready: boolean; problems: string[]; micr_font: boolean };
  };
}

const dollars = (c?: number) => (c ? (c / 100).toFixed(2) : '');
const pct = (bps?: number) => (bps ? (bps / 100).toString() : '');

function Ready({ ok, text }: { ok: boolean; text: string }) {
  return <span className={`po-tag po-tag--${ok ? 'auto' : 'warn'}`}>{ok ? 'Ready' : text}</span>;
}

export default function PayoutSettingsPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { roles?: string[] } | undefined)?.roles?.includes('admin');
  const [r, setR] = useState<Report | null>(null);
  const [form, setForm] = useState<Report['settings'] | null>(null);
  const [checkAccount, setCheckAccount] = useState('');
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/payouts/settings');
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg({ tone: 'bad', text: json.error ?? 'Could not load payout settings.' }); return; }
    setR(json); setForm(json.settings);
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (session && !isAdmin) return <main className="po" style={{ padding: '1.5rem' }}><p>Payout settings are for admins.</p></main>;
  if (!r || !form) return <main className="po" style={{ padding: '1.5rem' }}><p className="po-muted">{msg?.text ?? 'Loading…'}</p></main>;

  const set = <K extends keyof Report['settings']>(k: K, v: Report['settings'][K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const toggleMethod = (m: Method) => {
    const on = form.enabled_methods.includes(m);
    const next = on ? form.enabled_methods.filter((x) => x !== m) : [...form.enabled_methods, m];
    setForm({
      ...form, enabled_methods: next,
      default_method: form.default_method && next.includes(form.default_method) ? form.default_method : null,
      fallback_method: form.fallback_method && next.includes(form.fallback_method) ? form.fallback_method : null,
    });
  };
  const setFee = (m: Method, key: 'flat_cents' | 'percent_bps' | 'cap_cents', raw: string) => {
    const v = raw === '' ? 0 : key === 'percent_bps' ? Math.round(Number(raw) * 100) : Math.round(Number(raw) * 100);
    set('fees', { ...form.fees, [m]: { ...form.fees[m], [key]: Number.isFinite(v) ? v : 0 } });
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    const res = await fetch('/api/admin/payouts/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, check_account: checkAccount || undefined }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setMsg({ tone: 'bad', text: json.error ?? 'Not saved.' }); return; }
    setR(json); setForm(json.settings); setCheckAccount('');
    setMsg({ tone: 'good', text: 'Saved. New payouts use these settings straight away.' });
  };

  const rd = r.readiness;
  const offered = ORDER.filter((m) => form.enabled_methods.includes(m));

  return (
    <main className="po" style={{ maxWidth: 980, margin: '0 auto', padding: '1.25rem 1rem 4rem' }} data-testid="payout-settings">
      <div className="po-row po-row--between" style={{ marginBottom: '0.75rem' }}>
        <div>
          <Link href="/admin/pay?tab=payroll" className="po-small">← Pay</Link>
          <h1 style={{ margin: '0.2rem 0', fontSize: '1.5rem' }}>Payout settings</h1>
          <p className="po-muted">{r.policy}</p>
        </div>
        <div className="po-row"><Link href="/admin/payouts/checks" className="po-btn po-btn--small">Check register</Link></div>
      </div>

      {msg && <div className={`po-note po-note--${msg.tone}`} role="status" style={{ marginBottom: '0.75rem' }}>{msg.text}</div>}

      <section className="po-card">
        <h2>1. Ways you pay people</h2>
        <p className="po-muted">Tick one to pay everyone the same way, or several to let people choose.</p>
        <div className="po-options" style={{ marginTop: '0.6rem' }}>
          {ORDER.map((m) => (
            <label key={m} className={`po-option${form.enabled_methods.includes(m) ? ' po-option--on' : ''}`}>
              <span className="po-check"><input type="checkbox" checked={form.enabled_methods.includes(m)} onChange={() => toggleMethod(m)} /><b>{LABELS[m]}</b></span>
              <span className="po-small">{HOW[m]}</span>
            </label>
          ))}
        </div>
        <div className="po-grid" style={{ marginTop: '0.8rem' }}>
          <label className="po-field"><span>For people who haven&apos;t chosen</span>
            <select value={form.default_method ?? ''} onChange={(e) => set('default_method', (e.target.value || null) as Method | null)}>
              <option value="">They must choose before being paid</option>
              {offered.map((m) => <option key={m} value={m}>{LABELS[m]}</option>)}
            </select>
          </label>
          <label className="po-field"><span>If someone&apos;s choice can&apos;t be used</span>
            <select value={form.fallback_method ?? ''} onChange={(e) => set('fallback_method', (e.target.value || null) as Method | null)}>
              <option value="">Hold that payment for attention</option>
              {offered.map((m) => <option key={m} value={m}>{LABELS[m]}</option>)}
            </select>
          </label>
        </div>
        <p className="po-small" style={{ marginTop: '0.4rem' }}>A choice can&apos;t be used when its method is switched off here, or their details are missing (no bank account, no Venmo handle…). The payment then goes the fallback way and says so on the payout.</p>
      </section>

      <section className="po-card">
        <h2>2. Fees for a payment method</h2>
        <p className="po-muted">Charge for slower or costlier methods to encourage digital ones. A fee is taken out of what is sent and shown on the payout and the pay stub; every fee names a free alternative.</p>
        <div className="po-wrap" style={{ marginTop: '0.5rem' }}>
          <table className="po-table">
            <thead><tr><th>Method</th><th>Flat fee ($)</th><th>Percent (%)</th><th>At most ($)</th></tr></thead>
            <tbody>
              {FEEABLE.filter((m) => form.enabled_methods.includes(m)).map((m) => (
                <tr key={m}>
                  <td>{LABELS[m]}</td>
                  <td><input type="number" min="0" max="50" step="0.25" value={dollars(form.fees[m]?.flat_cents)} onChange={(e) => setFee(m, 'flat_cents', e.target.value)} aria-label={`${LABELS[m]} flat fee`} /></td>
                  <td><input type="number" min="0" max="10" step="0.1" value={pct(form.fees[m]?.percent_bps)} onChange={(e) => setFee(m, 'percent_bps', e.target.value)} aria-label={`${LABELS[m]} percent fee`} /></td>
                  <td><input type="number" min="0" max="100" step="0.5" value={dollars(form.fees[m]?.cap_cents)} onChange={(e) => setFee(m, 'cap_cents', e.target.value)} aria-label={`${LABELS[m]} fee cap`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="po-grid" style={{ marginTop: '0.7rem' }}>
          <label className="po-field"><span>Who a fee applies to</span>
            <select value={form.fee_scope} onChange={(e) => {
              const v = e.target.value as 'contractors' | 'everyone';
              // A fee from employees' wages always needs their written consent.
              setForm({ ...form, fee_scope: v, fee_requires_consent: v === 'everyone' ? true : form.fee_requires_consent });
            }}>
              <option value="contractors">1099 contractors only (recommended)</option>
              <option value="everyone">Everyone, with their written consent</option>
            </select>
          </label>
          <label className="po-field"><span>Never more than (% of a payment)</span>
            <input type="number" min="0" max="25" step="0.5" value={form.fee_max_percent} onChange={(e) => set('fee_max_percent', Number(e.target.value))} />
          </label>
        </div>
        <label className="po-check" style={{ marginTop: '0.6rem' }}>
          <input type="checkbox" checked={form.fee_requires_consent} disabled={form.fee_scope === 'everyone'}
            onChange={(e) => set('fee_requires_consent', e.target.checked)} />
          <span>Each person must agree in writing before a fee is taken (always on when fees apply to employees).</span>
        </label>
        <div className="po-note po-note--warn" style={{ marginTop: '0.6rem' }}>
          Taking a fee from a W-2 employee&apos;s wages is a wage deduction. Texas Payday Law allows it only with the employee&apos;s written
          authorisation for a lawful purpose, and federal law requires minimum wage be paid free and clear. That is why fees default
          to contractors only and need consent. Check with your CPA before applying fees to employees.
        </div>
      </section>

      <section className="po-card">
        <h2>3. Approval</h2>
        <label className="po-check">
          <input type="checkbox" checked={form.two_person_approval} onChange={(e) => set('two_person_approval', e.target.checked)} />
          <span>Two-person approval — the admin who built a payout can&apos;t also commit it. Leave off if one person runs payroll.</span>
        </label>
      </section>

      <section className="po-card">
        <div className="po-row po-row--between"><h2>4. Venmo (PayPal Payouts)</h2><Ready ok={rd.paypal.ready} text="Not connected" /></div>
        {rd.paypal.ready
          ? <p className="po-muted">Connected ({rd.paypal.mode}). Venmo payments go out automatically when a payout is committed.</p>
          : <p className="po-muted">Until connected, Venmo payments are tap-to-pay links. To connect: a PayPal Business account with Payouts enabled → set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_ENV=live in the environment.</p>}
      </section>

      <section className="po-card">
        <div className="po-row po-row--between"><h2>5. Direct deposit — bank file (ACH)</h2><Ready ok={rd.ach.ready} text="Needs details" /></div>
        <p className="po-muted">From PNC once ACH origination is set up on the business account. Until then a simple CSV list is produced.</p>
        <div className="po-grid" style={{ marginTop: '0.5rem' }}>
          {([
            ['company_name', 'Company name on statements (16)'], ['company_id', 'Company ID (from PNC)'], ['odfi_routing', 'Your bank routing number'],
            ['immediate_destination', 'Immediate destination (from PNC)'], ['immediate_destination_name', 'Destination name'],
            ['immediate_origin', 'Immediate origin (from PNC)'], ['immediate_origin_name', 'Origin name'], ['entry_description', 'Statement description'],
          ] as const).map(([k, label]) => (
            <label key={k} className="po-field"><span>{label}</span>
              <input type="text" value={String(form.ach?.[k] ?? '')} onChange={(e) => set('ach', { ...form.ach, [k]: e.target.value })} />
            </label>
          ))}
        </div>
        {!rd.ach.ready && rd.ach.problems.length > 0 && <ul className="po-small">{rd.ach.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        {!rd.encryption.ready && <div className="po-note po-note--bad" style={{ marginTop: '0.5rem' }}>{rd.encryption.missing}</div>}
      </section>

      <section className="po-card">
        <div className="po-row po-row--between"><h2>6. Paper checks</h2><Ready ok={rd.checks.ready} text="Needs details" /></div>
        <div className="po-grid" style={{ marginTop: '0.5rem' }}>
          <label className="po-field"><span>Check stock</span>
            <select value={String(form.checks?.stock ?? 'preprinted')} onChange={(e) => set('checks', { ...form.checks, stock: e.target.value })}>
              <option value="preprinted">Pre-printed checks (bank details already on them)</option>
              <option value="blank_micr">Blank check stock + MICR toner</option>
            </select>
          </label>
          {([['payer_name', 'Company name on checks'], ['payer_address', 'Company address'], ['bank_name', 'Bank name'], ['bank_address', 'Bank city/state'], ['routing', 'Bank routing number'], ['next_number', 'Next check number'], ['void_after_days', 'Void after (days)'], ['offset_x_mm', 'Printer nudge → (mm)'], ['offset_y_mm', 'Printer nudge ↓ (mm)']] as const).map(([k, label]) => (
            <label key={k} className="po-field"><span>{label}</span>
              <input type="text" value={String(form.checks?.[k] ?? '')} onChange={(e) => set('checks', { ...form.checks, [k]: e.target.value })} />
            </label>
          ))}
          <label className="po-field"><span>Bank account number {form.has_check_account ? `(on file ••${String(form.checks?.account_last4 ?? '')})` : ''}</span>
            <input type="password" autoComplete="off" placeholder={form.has_check_account ? 'Enter to replace' : 'Needed for blank stock'} value={checkAccount} onChange={(e) => setCheckAccount(e.target.value)} />
          </label>
        </div>
        {!rd.checks.ready && rd.checks.problems.length > 0 && <ul className="po-small">{rd.checks.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        {form.checks?.stock === 'blank_micr' && !rd.checks.micr_font && <div className="po-note po-note--warn" style={{ marginTop: '0.5rem' }}>Blank stock needs an E-13B MICR font file at public/fonts/micr-e13b.ttf. Use pre-printed checks until it is added.</div>}
      </section>

      <div className="po-row" style={{ position: 'sticky', bottom: 12 }}>
        <button type="button" className="po-btn po-btn--primary" onClick={save} disabled={saving} data-testid="payout-settings-save">{saving ? 'Saving…' : 'Save payout settings'}</button>
        {form.updated_at && <span className="po-small">Last changed {new Date(form.updated_at).toLocaleString()}{form.updated_by ? ` by ${form.updated_by}` : ''}</span>}
      </div>
    </main>
  );
}
