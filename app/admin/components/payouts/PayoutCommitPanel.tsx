'use client';
// app/admin/components/payouts/PayoutCommitPanel.tsx — "Commit payout", on the batch page.
//
// Owner, 2026-10-11: "whenever the boss confirms the hours and is ready to payout … he can commit the
// payout and it will automatically pay out everyone according to their preferred payment methods."
//
// Before: what Commit will do, grouped by how each person is paid (automatic first), with anything that
// would be HELD and why. One button. After: what happened, and the one or two things left for a person
// to do — upload the bank file, print the checks, hand out cash — each a single click. Pressing Commit
// again is always safe (lib/payouts/commit.ts): it only acts on lines not yet sent.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import './Payouts.css';

interface Line {
  id: string; user_email: string; user_name: string | null; method: string | null; handle: string | null;
  send_cents: number; fee_cents: number; status: string; rail: string; outcome: string; committed: boolean; link?: string | null;
}
interface Group {
  method: string; label: string; rail: string; automatic: boolean; summary: string; setup: string | null;
  total_cents: number; lines: Line[]; artefacts: Array<{ label: string; href: string }>;
}
interface Result { ok: boolean; batch_status: string; groups: Group[]; held: Array<{ id: string; user_email: string; reason: string }>; errors: string[] }

const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const railTag = (g: Group) => (g.method === 'unassigned' ? ['Held', 'warn'] : g.automatic ? ['Automatic', 'auto'] : g.rail === 'file' || g.rail === 'print' ? ['One click', 'one'] : ['By hand', 'hand']);

export default function PayoutCommitPanel({ batchId, batchStatus, onChanged }: { batchId: string; batchStatus: string; onChanged?: () => void }) {
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: 'good' | 'bad' | 'warn'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Pull Venmo statuses back first, so the screen shows what PayPal knows.
    if (batchStatus === 'dispatched' || batchStatus === 'approved') await fetch(`/api/admin/payouts/runs/${batchId}/sync`, { method: 'POST' }).catch(() => null);
    const res = await fetch(`/api/admin/payouts/runs/${batchId}/commit`);
    const json = await res.json().catch(() => ({}));
    if (res.ok) setData(json as Result); else setMessage({ tone: 'bad', text: json.error ?? 'Could not load the payout.' });
    setLoading(false);
  }, [batchId, batchStatus]);
  useEffect(() => { void load(); }, [load]);

  const act = async (key: string, fn: () => Promise<Response>, ok: (j: Record<string, unknown>) => string) => {
    setBusy(key); setMessage(null);
    try {
      const res = await fn();
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) setMessage({ tone: 'bad', text: String(json.error ?? (json.errors as string[] | undefined)?.join(' ') ?? `Failed (${res.status}).`) });
      else setMessage({ tone: 'good', text: ok(json) });
      if (key === 'commit' && res.ok) setData(json as unknown as Result);
      else await load();
      onChanged?.();
    } finally { setBusy(null); }
  };

  const commit = () => act('commit', () => fetch(`/api/admin/payouts/runs/${batchId}/commit`, { method: 'POST' }), (j) => {
    const r = j as unknown as Result;
    const parts = ['Payout committed.'];
    if (r.held?.length) parts.push(`${r.held.length} held until fixed — everyone else is on their way.`);
    if (r.errors?.length) parts.push(r.errors.join(' '));
    return parts.join(' ');
  });
  const mark = (line: Line, status: 'paid' | 'pending' | 'failed') => act(`mark-${line.id}`, () => fetch(`/api/admin/payouts/runs/${batchId}/items/${line.id}/mark`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
  }), () => (status === 'paid' ? `${line.user_name ?? line.user_email} marked paid.` : 'Updated.'));
  const bankUploaded = () => act('bank', () => fetch(`/api/admin/payouts/runs/${batchId}/bank-uploaded`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), (j) => `${j.marked} bank payment${j.marked === 1 ? '' : 's'} marked sent. Mark them paid when the money lands.`);
  const checksPrinted = () => act('checks', () => fetch(`/api/admin/payouts/runs/${batchId}/checks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'printed' }) }), (j) => `${j.marked} check${j.marked === 1 ? '' : 's'} printed. Mark each paid when it is handed over.`);

  if (batchStatus === 'voided') return null;
  if (loading && !data) return <section className="po po-card" aria-busy="true"><p className="po-muted">Working out how everyone gets paid…</p></section>;
  if (!data) return message ? <section className="po po-card"><div className="po-note po-note--bad">{message.text}</div></section> : null;

  const pendingLines = data.groups.filter((g) => g.method !== 'unassigned').flatMap((g) => g.lines).filter((l) => l.status === 'pending' || l.status === 'failed');
  // What pressing Commit (again) would actually act on: lines it has not taken yet, failed sends to
  // retry, and held lines that may have been fixed. Lines waiting on a person (cash, links, printed
  // checks) are NOT more work for Commit, so they don't bring the button back.
  const commitWork = pendingLines.filter((l) => !l.committed || l.status === 'failed');
  const toSend = (batchStatus === 'draft' ? pendingLines : commitWork).reduce((s, l) => s + l.send_cents, 0);
  const all = data.groups.flatMap((g) => g.lines);
  const paid = all.filter((l) => l.status === 'paid').length;
  const committed = batchStatus !== 'draft';
  const fees = all.reduce((s, l) => s + l.fee_cents, 0);

  return (
    <section className="po po-card po-card--accent" data-testid="payout-commit-panel">
      <div className="po-row po-row--between">
        <div>
          <h2>{committed ? 'Payout in progress' : 'Commit payout'}</h2>
          <p className="po-muted">
            {committed
              ? `${paid} of ${all.length} paid. Anything left is listed with the one step it needs.`
              : 'Check how each person will be paid, then commit. Automatic payments go out immediately; the rest are ready in one click each.'}
          </p>
        </div>
        <Link href="/admin/payouts/settings" className="po-btn po-btn--small po-noprint">Payout settings</Link>
      </div>

      <div className="po-totals">
        <div><b>{all.length}</b><span>people</span></div>
        <div><b>{money(all.reduce((s, l) => s + l.send_cents, 0))}</b><span>to send in total</span></div>
        {fees > 0 && <div><b>{money(fees)}</b><span>in method fees kept</span></div>}
        {data.held.length > 0 && <div><b>{data.held.length}</b><span>held — need fixing</span></div>}
      </div>

      {message && <div className={`po-note po-note--${message.tone}`} role="status" style={{ margin: '0.5rem 0' }}>{message.text}</div>}

      {data.groups.map((g) => {
        const [tag, tone] = railTag(g);
        const waiting = g.lines.filter((l) => l.status === 'pending' || l.status === 'failed');
        return (
          <div key={g.method} className={`po-group${g.method === 'unassigned' ? ' po-group--held' : ''}`} data-testid={`commit-group-${g.method}`}>
            <div className="po-group__head">
              <div>
                <span className="po-group__title">{g.label}</span>{' '}<span className={`po-tag po-tag--${tone}`}>{tag}</span>
                <div className="po-small">{g.summary}</div>
                {g.setup && <div className="po-small">Set-up: {g.setup}</div>}
              </div>
              <span className="po-group__sum">{money(g.total_cents)}</span>
            </div>

            {committed && g.artefacts.length > 0 && (
              <div className="po-row" style={{ marginTop: '0.5rem' }}>
                {g.artefacts.map((a) => <a key={a.href} className="po-btn po-btn--primary po-btn--small" href={a.href} target="_blank" rel="noreferrer">{a.label}</a>)}
                {g.method === 'ach' && waiting.length > 0 && <button type="button" className="po-btn po-btn--small" disabled={!!busy} onClick={bankUploaded}>I uploaded it to PNC</button>}
                {g.method === 'check' && waiting.length > 0 && (
                  <>
                    <a className="po-btn po-btn--small" href={`/api/admin/payouts/runs/${batchId}/checks?test=1`} target="_blank" rel="noreferrer">Alignment test page</a>
                    <button type="button" className="po-btn po-btn--small" disabled={!!busy} onClick={checksPrinted}>Checks printed OK</button>
                    <Link className="po-btn po-btn--small" href="/admin/payouts/checks">Void / reissue a check</Link>
                  </>
                )}
              </div>
            )}

            <ul className="po-group__lines">
              {g.lines.map((l) => (
                <li key={l.id} className="po-line">
                  <div className="po-line__who"><b>{l.user_name ?? l.user_email}</b><span>{l.user_email}{l.handle ? ` · ${l.handle}` : ''}</span></div>
                  <div className="po-line__amt">{money(l.send_cents)}{l.fee_cents > 0 && <small>after {money(l.fee_cents)} fee</small>}</div>
                  <div className="po-line__what">
                    {l.status === 'paid' ? <span className="po-tag po-tag--paid">Paid</span> : l.status === 'failed' ? <span className="po-tag po-tag--failed">Failed</span> : l.status === 'sent' ? <span className="po-tag po-tag--one">Sent</span> : null}{' '}
                    {l.outcome}
                    {g.method === 'unassigned' && <> {' '}<Link href={`/admin/payroll/${encodeURIComponent(l.user_email)}`}>Fix their pay details →</Link></>}
                  </div>
                  <div className="po-line__act po-noprint">
                    {committed && l.link && l.status !== 'paid' && <a className="po-btn po-btn--small" href={l.link} target="_blank" rel="noreferrer">Open {g.label}</a>}
                    {committed && g.method !== 'unassigned' && g.method !== 'account' && l.status !== 'paid' && (
                      <button type="button" className="po-btn po-btn--small" disabled={!!busy} onClick={() => mark(l, 'paid')}>Mark paid</button>
                    )}
                    {committed && l.status === 'paid' && g.method !== 'account' && (
                      <button type="button" className="po-btn po-btn--small" disabled={!!busy} onClick={() => mark(l, 'pending')}>Undo</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {batchStatus !== 'completed' && (!committed ? pendingLines.length > 0 : commitWork.length > 0 || data.held.length > 0) && (
        <div className="po-row po-noprint" style={{ marginTop: '0.9rem' }}>
          {!confirming ? (
            <button type="button" className="po-btn po-btn--go" disabled={!!busy || (!committed && pendingLines.length === 0)} onClick={() => setConfirming(true)} data-testid="commit-payout">
              {committed
                ? (commitWork.length > 0 ? `Commit the remaining ${commitWork.length} — ${money(toSend)}` : 'Retry held payments')
                : `Commit payout — ${money(toSend)} to ${pendingLines.length} ${pendingLines.length === 1 ? 'person' : 'people'}`}
            </button>
          ) : (
            <>
              <span className="po-muted">
                {data.groups.some((g) => g.automatic && g.method !== 'account' && g.lines.some((l) => l.status === 'pending'))
                  ? 'Automatic payments (Venmo) go out now and cannot be recalled from here. '
                  : ''}
                Commit {money(toSend)}?
              </span>
              <button type="button" className="po-btn po-btn--go" disabled={!!busy} onClick={() => { setConfirming(false); void commit(); }} data-testid="commit-confirm">
                {busy === 'commit' ? 'Committing…' : 'Yes, commit'}
              </button>
              <button type="button" className="po-btn" disabled={!!busy} onClick={() => setConfirming(false)}>Cancel</button>
            </>
          )}
          {data.held.length > 0 && <span className="po-small">Held lines are skipped; fix them and press again to pay just those.</span>}
        </div>
      )}
    </section>
  );
}
