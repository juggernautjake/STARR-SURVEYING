'use client';

// /admin/calls/blocked — the numbers the business line refuses, and what they tried.
//
// Owner, 2026-09-23: "I want you to make it so that we have a list of blocked calls that we can
// unblock as well. It should register the area code and show whatever info can be garnered from the
// call even if a call is blocked."
//
// ── WHAT THIS PAGE IS FOR ───────────────────────────────────────────────────────────────────────
//
// Not a settings screen. It is the evidence that a block is working and the way back if one is
// wrong, so every row leads with the two facts that answer both questions: how many times this
// number has been turned away since, and the last thing it actually said. A block list that shows
// only numbers makes a mistaken block invisible — the customer simply stops getting through and
// nobody ever learns why.
//
// Unblocking deactivates rather than deletes, so a rule keeps its reason and its tally. The
// "Unblocked" section is therefore a real part of the page, not an archive nobody opens: it is
// where you look when a number rings again and somebody asks whether it used to be blocked.

import '../../styles/AdminCalls.css';
import '../../styles/AdminBlockedCalls.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ShieldBan, ShieldCheck, Plus, RotateCcw, Phone, AlertTriangle } from 'lucide-react';
import { usePageError } from '../../hooks/usePageError';

interface Rule {
  id: string;
  number: string | null;
  pattern: string | null;
  target: string;
  areaCode: string | null;
  reason: string | null;
  notes: string | null;
  blocked_by: string | null;
  auto_blocked: boolean | null;
  hit_count: number | null;
  last_hit_at: string | null;
  active: boolean | null;
  created_at: string;
  callsSeen: number;
  lastSummary: string | null;
  lastCallAt: string | null;
  blockedSince: number;
}

/** +13182091951 → (318) 209-1951. The form a person reads a number in. */
function pretty(e164: string | null): string {
  if (!e164) return '';
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

export default function BlockedCallsPage() {
  const { reportPageError } = usePageError('BlockedCallsPage');
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ number: '', reason: 'spam', notes: '' });

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/calls/blocked?all=1');
      const j = (await r.json()) as { rules?: Rule[]; error?: string };
      if (!r.ok) { setError(j.error ?? `Could not load the block list (HTTP ${r.status}).`); return; }
      setRules(j.rules ?? []);
      setError(null);
    } catch (e) {
      reportPageError(e instanceof Error ? e : new Error(String(e)), { element: 'load block list' });
      setError('Could not load the block list.');
    } finally {
      setLoading(false);
    }
  }, [reportPageError]);

  useEffect(() => { void load(); }, [load]);

  const active = useMemo(() => rules.filter((r) => r.active), [rules]);
  const inactive = useMemo(() => rules.filter((r) => !r.active), [rules]);
  const stopped = useMemo(() => active.reduce((n, r) => n + (r.hit_count ?? 0), 0), [active]);

  async function block(e: React.FormEvent) {
    e.preventDefault();
    const number = form.number.trim();
    if (!number) return;
    setBusy('new');
    setError(null);
    try {
      // A prefix is entered as a number ending in a dot — "+1318209." — so one field serves both
      // without asking a person to understand the distinction before they have hit the problem.
      const isPattern = number.endsWith('.');
      const body = isPattern
        ? { pattern: number.replace(/[.\s()-]/g, ''), reason: form.reason, notes: form.notes }
        : { number, reason: form.reason, notes: form.notes };
      const r = await fetch('/api/admin/calls/blocked', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) { setError(j.error ?? 'Could not block that number.'); return; }
      setForm({ number: '', reason: 'spam', notes: '' });
      setAdding(false);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function setActive(rule: Rule, next: boolean) {
    setBusy(rule.id);
    setError(null);
    try {
      const r = next
        ? await fetch('/api/admin/calls/blocked', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rule.number ? { number: rule.number, reason: rule.reason ?? 'spam', notes: rule.notes }
            : { pattern: rule.pattern, reason: rule.reason ?? 'spam', notes: rule.notes }),
        })
        : await fetch(`/api/admin/calls/blocked?id=${encodeURIComponent(rule.id)}`, { method: 'DELETE' });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) { setError(j.error ?? 'That did not work.'); return; }
      await load();
    } finally {
      setBusy(null);
    }
  }

  function Row({ rule }: { rule: Rule }) {
    return (
      <li className={`blocked-row${rule.active ? '' : ' blocked-row--off'}`} data-testid="blocked-row">
        <div className="blocked-row__id">
          <span className="blocked-row__number">{rule.pattern ? `${rule.pattern}…` : pretty(rule.number)}</span>
          <span className="blocked-row__meta">
            {rule.areaCode && <span className="blocked-row__area">Area {rule.areaCode}</span>}
            {rule.pattern && <span className="blocked-row__tag">prefix</span>}
            {rule.auto_blocked && <span className="blocked-row__tag">auto</span>}
            <span className="blocked-row__reason">{rule.reason ?? 'spam'}</span>
          </span>
        </div>

        <div className="blocked-row__evidence">
          {rule.lastSummary
            ? <p className="blocked-row__said">{rule.lastSummary}</p>
            : <p className="blocked-row__said blocked-row__said--none">No call from this number has been recorded yet.</p>}
          {rule.notes && <p className="blocked-row__notes">{rule.notes}</p>}
        </div>

        <div className="blocked-row__stats">
          <span className="blocked-row__stat"><b>{rule.hit_count ?? 0}</b> turned away</span>
          <span className="blocked-row__stat blocked-row__stat--quiet">{rule.callsSeen} call{rule.callsSeen === 1 ? '' : 's'} on record</span>
          <span className="blocked-row__stat blocked-row__stat--quiet">last {ago(rule.last_hit_at ?? rule.lastCallAt)}</span>
        </div>

        <div className="blocked-row__action">
          <button
            type="button"
            className={`blocked-btn${rule.active ? ' blocked-btn--undo' : ''}`}
            disabled={busy === rule.id}
            onClick={() => void setActive(rule, !rule.active)}
            data-testid={rule.active ? 'unblock' : 'reblock'}
          >
            {busy === rule.id ? '…' : rule.active
              ? <><RotateCcw size={14} aria-hidden="true" /> Unblock</>
              : <><ShieldBan size={14} aria-hidden="true" /> Block again</>}
          </button>
        </div>
      </li>
    );
  }

  return (
    <div className="calls-page blocked-page">
      <header className="calls-page__head">
        <div>
          <h1 className="calls-page__title">Blocked numbers</h1>
          <p className="calls-page__sub">
            These never reach the phone. The call is still recorded so you can see the block working —
            it simply tells nobody.
          </p>
        </div>
        <div className="blocked-page__actions">
          <Link href="/admin/calls" className="blocked-btn blocked-btn--ghost"><Phone size={14} aria-hidden="true" /> All calls</Link>
          <button type="button" className="blocked-btn" onClick={() => setAdding((v) => !v)} data-testid="add-toggle">
            <Plus size={14} aria-hidden="true" /> Block a number
          </button>
        </div>
      </header>

      <div className="blocked-tally">
        <div><b>{active.length}</b><span>Blocked</span></div>
        <div><b>{stopped}</b><span>Calls turned away</span></div>
        <div><b>{inactive.length}</b><span>Unblocked</span></div>
      </div>

      {adding && (
        <form className="blocked-form" onSubmit={block} data-testid="block-form">
          <label className="blocked-form__field">
            <span>Number</span>
            <input
              type="tel" value={form.number} autoFocus
              onChange={(e) => setForm({ ...form, number: e.target.value })}
              placeholder="(318) 209-1951" aria-label="Number to block"
              aria-describedby="blocked-form-hint"
            />
          </label>
          <label className="blocked-form__field">
            <span>Reason</span>
            <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} aria-label="Reason">
              <option value="spam">Spam</option>
              <option value="robocall">Robocall</option>
              <option value="telemarketing">Telemarketing</option>
              <option value="harassment">Harassment</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="blocked-form__field">
            <span>Notes</span>
            <input
              type="text" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="What the recording said, or who it claimed to be" aria-label="Notes"
            />
          </label>
          <button type="submit" className="blocked-btn" disabled={busy === 'new' || !form.number.trim()}>
            {busy === 'new' ? 'Blocking…' : 'Block'}
          </button>
          {/* The one thing a person cannot guess, said where they are about to need it. */}
          <p className="blocked-form__hint" id="blocked-form-hint">
            End with a dot to block a whole exchange — <code>+1318209.</code> stops every number that starts that way.
          </p>
        </form>
      )}

      {error && (
        <div className="blocked-error" role="alert">
          <AlertTriangle size={15} aria-hidden="true" /> {error}
        </div>
      )}

      {loading ? (
        <p className="blocked-empty">Loading…</p>
      ) : (
        <>
          <section className="blocked-section">
            <h2 className="blocked-section__title"><ShieldBan size={15} aria-hidden="true" /> Blocked</h2>
            {active.length === 0
              ? <p className="blocked-empty">Nothing is blocked. Numbers you block here stop reaching the phone immediately.</p>
              : <ul className="blocked-list">{active.map((r) => <Row key={r.id} rule={r} />)}</ul>}
          </section>

          {inactive.length > 0 && (
            <section className="blocked-section">
              <h2 className="blocked-section__title"><ShieldCheck size={15} aria-hidden="true" /> Unblocked</h2>
              <p className="blocked-section__note">
                Kept with their history, so when one of these rings again you can see why it was blocked before.
              </p>
              <ul className="blocked-list">{inactive.map((r) => <Row key={r.id} rule={r} />)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
