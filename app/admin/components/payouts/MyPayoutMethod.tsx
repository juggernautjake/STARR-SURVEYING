'use client';
// app/admin/components/payouts/MyPayoutMethod.tsx — "How I get paid", on My Pay.
//
// The person picks from the methods the firm offers, adds what that method needs (Venmo handle, bank
// details …), and — if the method carries a fee — reads and agrees to the exact fee wording before it
// can be chosen. Free methods say so. Bank numbers are sent once and never shown again (masked only).

import { useCallback, useEffect, useState } from 'react';
import './Payouts.css';

interface Option {
  method: string; label: string; needsHandle: boolean; fee: string | null; exampleFeeOn500: number;
  consentRequired: boolean; consentTerms: string | null; consented: boolean; consentedAt: string | null;
}
interface View { current: { method: string | null; handle: string | null; bank: string | null }; canSaveBank: boolean; defaultMethod: string | null; options: Option[] }

const HANDLE_HINT: Record<string, string> = { venmo: 'Venmo username, phone or email', cashapp: '$cashtag', zelle: 'Email or phone you use for Zelle' };
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function MyPayoutMethod() {
  const [v, setV] = useState<View | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  const [handle, setHandle] = useState('');
  const [routing, setRouting] = useState('');
  const [account, setAccount] = useState('');
  const [acctType, setAcctType] = useState<'checking' | 'savings'>('checking');
  const [consent, setConsent] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/payroll/my-payout-method');
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg({ tone: 'bad', text: json.error ?? 'Could not load your pay settings.' }); return; }
    setV(json); setMethod(json.current.method); setHandle(json.current.handle ?? '');
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!v) return msg ? <section className="po po-card"><div className="po-note po-note--bad">{msg.text}</div></section> : null;
  const opt = v.options.find((o) => o.method === method) ?? null;
  const changed = method !== v.current.method || (opt?.needsHandle && handle.trim() !== (v.current.handle ?? '')) || (method === 'ach' && (routing || account));

  const save = async () => {
    setSaving(true); setMsg(null);
    const res = await fetch('/api/admin/payroll/my-payout-method', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, handle, consent, bank: method === 'ach' && (routing || account) ? { routing, account, account_type: acctType } : undefined }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setMsg({ tone: 'bad', text: json.error ?? 'Not saved.' }); return; }
    setV(json); setRouting(''); setAccount(''); setConsent(false);
    setMsg({ tone: 'good', text: 'Saved. Your next payout will use this.' });
  };

  return (
    <section className="po po-card" data-testid="my-payout-method">
      <h2>How I get paid</h2>
      <p className="po-muted">
        {v.current.method
          ? `Now: ${v.options.find((o) => o.method === v.current.method)?.label ?? v.current.method}${v.current.handle ? ` (${v.current.handle})` : ''}${v.current.method === 'ach' && v.current.bank ? ` — ${v.current.bank}` : ''}.`
          : v.defaultMethod
            ? `You haven't chosen — you'll be paid by ${v.options.find((o) => o.method === v.defaultMethod)?.label ?? v.defaultMethod} until you do.`
            : 'Choose how you want to be paid — you can’t be paid until you do.'}
      </p>

      <div className="po-options" style={{ marginTop: '0.6rem' }} role="radiogroup" aria-label="How I get paid">
        {v.options.map((o) => (
          <label key={o.method} className={`po-option${method === o.method ? ' po-option--on' : ''}`}>
            <span className="po-check">
              <input type="radio" name="payout-method" checked={method === o.method} onChange={() => { setMethod(o.method); setConsent(false); setMsg(null); }} />
              <b>{o.label}</b>
            </span>
            {o.fee ? <span className="po-tag po-tag--warn" style={{ justifySelf: 'start' }}>Fee — {money(o.exampleFeeOn500)} on a $500 payout</span> : <span className="po-tag po-tag--auto" style={{ justifySelf: 'start' }}>No fee</span>}
          </label>
        ))}
      </div>

      {opt?.needsHandle && (
        <label className="po-field" style={{ marginTop: '0.7rem', maxWidth: 360 }}>
          <span>{HANDLE_HINT[opt.method] ?? 'Handle'}</span>
          <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={opt.method === 'cashapp' ? '$YourName' : ''} />
        </label>
      )}

      {method === 'ach' && (
        <div style={{ marginTop: '0.7rem' }}>
          {v.current.bank && <p className="po-small">On file: {v.current.bank}. Enter new numbers only to change it.</p>}
          {!v.canSaveBank && <div className="po-note po-note--warn">Bank details can&apos;t be saved yet — ask the office.</div>}
          <div className="po-grid" style={{ marginTop: '0.4rem' }}>
            <label className="po-field"><span>Routing number (9 digits)</span><input type="text" inputMode="numeric" autoComplete="off" value={routing} onChange={(e) => setRouting(e.target.value)} /></label>
            <label className="po-field"><span>Account number</span><input type="password" inputMode="numeric" autoComplete="off" value={account} onChange={(e) => setAccount(e.target.value)} /></label>
            <label className="po-field"><span>Account type</span>
              <select value={acctType} onChange={(e) => setAcctType(e.target.value as 'checking' | 'savings')}><option value="checking">Checking</option><option value="savings">Savings</option></select>
            </label>
          </div>
          <p className="po-small">Stored encrypted. Only the last four digits are ever shown.</p>
        </div>
      )}

      {opt?.fee && (
        <div className="po-note po-note--warn" style={{ marginTop: '0.7rem' }}>
          <p style={{ margin: 0 }}>{opt.fee}</p>
          {opt.consentRequired && !opt.consented && opt.consentTerms && (
            <label className="po-check" style={{ marginTop: '0.5rem' }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>{opt.consentTerms}</span>
            </label>
          )}
          {opt.consented && <p className="po-small" style={{ margin: '0.3rem 0 0' }}>You agreed to this fee{opt.consentedAt ? ` on ${new Date(opt.consentedAt).toLocaleDateString()}` : ''}.</p>}
        </div>
      )}

      {msg && <div className={`po-note po-note--${msg.tone}`} role="status" style={{ marginTop: '0.6rem' }}>{msg.text}</div>}
      <div className="po-row" style={{ marginTop: '0.7rem' }}>
        <button type="button" className="po-btn po-btn--primary" disabled={!method || saving || !changed || (!!opt?.consentRequired && !opt.consented && !consent)} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  );
}
