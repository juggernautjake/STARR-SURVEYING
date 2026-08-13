'use client';
// /admin/role-requests — ask for access, and decide who gets it. E2.
//
// ── ONE PAGE, TWO AUDIENCES, ON PURPOSE ─────────────────────────────────────────────────────────
//
// Everyone sees "ask for a role" and their own history. Admins additionally see the pending queue.
// Two routes would mean two nav entries for one subject, and the admin — who is also a person who
// might need a role — would have to remember which page was which.
//
// ── ASKING IS NOT GETTING, AND THE WORDING HAS TO SAY SO ────────────────────────────────────────
//
// The single most likely misreading is that ticking a box grants the role. Every label here is
// written to prevent that: the button says "Send request", the result says "waiting for an admin",
// and nothing in the UI shows the new role as held until it actually is.

import { useCallback, useEffect, useState } from 'react';
import { Check, Clock, Send, ShieldQuestion, X } from 'lucide-react';
import { useSession } from 'next-auth/react';

interface RoleRequest {
  id: string;
  requester_email: string;
  requested_roles: string[];
  reason: string | null;
  status: 'pending' | 'approved' | 'denied' | 'withdrawn';
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

/** Everything except `employee` (everyone has it) and `guest` (not something to ask for). Labels
 *  say what the role LETS YOU DO, because "drawer" means nothing to somebody who has not been told. */
const REQUESTABLE: Array<{ id: string; label: string; blurb: string }> = [
  { id: 'field_crew', label: 'Field Crew', blurb: 'Work Mode, field data, equipment check-out.' },
  { id: 'drawer', label: 'Drawer', blurb: 'CAD drawings and the plat tools.' },
  { id: 'researcher', label: 'Researcher', blurb: 'Property research projects and the document library.' },
  { id: 'equipment_manager', label: 'Equipment Manager', blurb: 'Inventory, maintenance and the fleet.' },
  { id: 'teacher', label: 'Teacher', blurb: 'Create and manage learning content.' },
  { id: 'student', label: 'Student', blurb: 'Exam prep and the learning modules.' },
  { id: 'tech_support', label: 'Tech Support', blurb: 'Support tickets and the error log.' },
  { id: 'developer', label: 'Developer', blurb: 'Developer tools and diagnostics.' },
  { id: 'admin', label: 'Admin', blurb: 'Everything, including money and people. Rarely granted.' },
];

const STATUS_STYLE: Record<RoleRequest['status'], { bg: string; fg: string; label: string }> = {
  pending: { bg: '#FEF3C7', fg: '#92400E', label: 'Waiting for an admin' },
  approved: { bg: '#D1FAE5', fg: '#065F46', label: 'Approved' },
  denied: { bg: '#FEE2E2', fg: '#991B1B', label: 'Not granted' },
  withdrawn: { bg: '#E5E7EB', fg: '#374151', label: 'Withdrawn' },
};

const roleLabel = (id: string) => REQUESTABLE.find((r) => r.id === id)?.label ?? id.replace(/_/g, ' ');

export default function RoleRequestsPage(): React.ReactElement {
  const { data: session } = useSession();
  const roles = (session?.user?.roles ?? []) as string[];
  const isAdmin = roles.includes('admin');
  const held = new Set(roles);

  const [mine, setMine] = useState<RoleRequest[]>([]);
  const [queue, setQueue] = useState<RoleRequest[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/role-requests');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not load requests.');
      setMine(data.mine ?? []);
      setQueue(data.queue ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load requests.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function send() {
    if (picked.length === 0 || busy) return;
    setBusy(true); setError(null); setMsg(null);
    try {
      const res = await fetch('/api/admin/role-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: picked, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not send the request.');
      setPicked([]); setReason('');
      setMsg('Sent. An admin will see it in their queue — you will get the access when they approve it.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the request.');
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, action: 'approve' | 'deny' | 'withdraw') {
    if (busy) return;
    if (action === 'approve' && typeof window !== 'undefined') {
      // Granting access is not undoable by the requester, and `admin` in particular hands over the
      // money and people pages. Worth one confirm.
      const target = (queue ?? []).find((q) => q.id === id);
      const what = target ? `${target.requested_roles.map(roleLabel).join(', ')} to ${target.requester_email}` : 'this role';
      if (!window.confirm(`Grant ${what}? They will have it immediately.`)) return;
    }
    setBusy(true); setError(null); setMsg(null);
    try {
      const res = await fetch(`/api/admin/role-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not update the request.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the request.');
    } finally {
      setBusy(false);
    }
  }

  const available = REQUESTABLE.filter((r) => !held.has(r.id));

  return (
    <div className="rr">
      <h1 className="rr__title">Access requests</h1>
      <p className="rr__lead">
        Ask for the parts of the app your work needs. An admin decides — asking does not grant
        anything by itself.
      </p>

      {error ? <p className="rr__error" role="alert">{error}</p> : null}
      {msg ? <p className="rr__ok" role="status">{msg}</p> : null}

      {/* ── Ask ─────────────────────────────────────────────────────────────────────────────── */}
      <section className="rr__card">
        <h2 className="rr__h2"><ShieldQuestion size={16} aria-hidden /> Request access</h2>
        {available.length === 0 ? (
          <p className="rr__muted">You already have every role there is to ask for.</p>
        ) : (
          <>
            <div className="rr__roles">
              {available.map((r) => {
                const on = picked.includes(r.id);
                return (
                  <label key={r.id} className={`rr__role${on ? ' rr__role--on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setPicked((cur) => (on ? cur.filter((c) => c !== r.id) : [...cur, r.id]))
                      }
                    />
                    <span>
                      <strong>{r.label}</strong>
                      <em>{r.blurb}</em>
                    </span>
                  </label>
                );
              })}
            </div>
            <label className="rr__field">
              <span>Why do you need it?</span>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. I am drafting the Henry plat and need the CAD tools."
              />
            </label>
            <button
              type="button"
              className="rr__btn rr__btn--primary"
              onClick={() => void send()}
              disabled={busy || picked.length === 0}
            >
              <Send size={15} aria-hidden /> Send request
            </button>
          </>
        )}
      </section>

      {/* ── Decide (admins) ─────────────────────────────────────────────────────────────────── */}
      {isAdmin && queue ? (
        <section className="rr__card">
          <h2 className="rr__h2"><Clock size={16} aria-hidden /> Waiting on you ({queue.length})</h2>
          {queue.length === 0 ? (
            <p className="rr__muted">Nothing is waiting.</p>
          ) : (
            <ul className="rr__list">
              {queue.map((q) => (
                <li key={q.id} className="rr__item">
                  <div className="rr__item-main">
                    <strong>{q.requester_email}</strong>
                    <span className="rr__asked">{q.requested_roles.map(roleLabel).join(', ')}</span>
                    {q.reason ? <span className="rr__reason">“{q.reason}”</span> : (
                      <span className="rr__reason rr__reason--none">No reason given.</span>
                    )}
                  </div>
                  <div className="rr__item-actions">
                    <button type="button" className="rr__btn rr__btn--ok" disabled={busy} onClick={() => void decide(q.id, 'approve')}>
                      <Check size={14} aria-hidden /> Grant
                    </button>
                    <button type="button" className="rr__btn" disabled={busy} onClick={() => void decide(q.id, 'deny')}>
                      <X size={14} aria-hidden /> Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {/* ── Your history ────────────────────────────────────────────────────────────────────── */}
      {mine.length > 0 ? (
        <section className="rr__card">
          <h2 className="rr__h2">Your requests</h2>
          <ul className="rr__list">
            {mine.map((r) => {
              const s = STATUS_STYLE[r.status];
              return (
                <li key={r.id} className="rr__item">
                  <div className="rr__item-main">
                    <span className="rr__asked">{r.requested_roles.map(roleLabel).join(', ')}</span>
                    <span className="rr__chip" style={{ background: s.bg, color: s.fg }}>{s.label}</span>
                    {r.decision_note ? <span className="rr__reason">{r.decision_note}</span> : null}
                  </div>
                  {r.status === 'pending' ? (
                    <div className="rr__item-actions">
                      <button type="button" className="rr__btn" disabled={busy} onClick={() => void decide(r.id, 'withdraw')}>
                        Withdraw
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <style jsx>{`
        .rr { max-width: 780px; min-width: 0; }
        .rr__title { font-family: 'Sora', sans-serif; font-size: 1.4rem; font-weight: 700; margin: 0 0 0.3rem; color: var(--theme-fg-primary, #0F1419); }
        .rr__lead { margin: 0 0 1.2rem; font-size: 0.88rem; color: var(--theme-fg-muted); }
        .rr__card { border: 1px solid var(--theme-border, #E5E7EB); border-radius: 12px; padding: 1rem; margin-bottom: 1rem; background: var(--theme-bg-surface, #FFF); min-width: 0; }
        .rr__h2 { display: flex; align-items: center; gap: 0.4rem; font-size: 1rem; font-weight: 700; margin: 0 0 0.75rem; color: var(--theme-fg-primary, #1F2937); }
        .rr__muted { margin: 0; font-size: 0.85rem; color: var(--theme-fg-muted); }
        .rr__error { font-size: 0.85rem; color: #B91C1C; margin: 0 0 0.75rem; overflow-wrap: anywhere; }
        .rr__ok { font-size: 0.85rem; color: #065F46; margin: 0 0 0.75rem; }

        /* One column on a phone, two when there is room. Each option is a real tap target with its
         * explanation attached — a role name alone means nothing to somebody who has not been told
         * what it unlocks. */
        .rr__roles { display: grid; grid-template-columns: 1fr; gap: 0.4rem; margin-bottom: 0.75rem; }
        @media (min-width: 620px) { .rr__roles { grid-template-columns: 1fr 1fr; } }
        .rr__role { display: flex; gap: 0.5rem; align-items: flex-start; padding: 0.6rem; min-height: 44px; border: 1px solid var(--theme-border, #E5E7EB); border-radius: 8px; cursor: pointer; min-width: 0; }
        .rr__role--on { border-color: var(--color-brand-navy, #1E3A5F); background: var(--theme-bg-elevated); }
        .rr__role span { display: flex; flex-direction: column; min-width: 0; }
        .rr__role strong { font-size: 0.85rem; color: var(--theme-fg-primary, #1F2937); }
        .rr__role em { font-style: normal; font-size: 0.74rem; color: var(--theme-fg-muted); overflow-wrap: anywhere; }

        .rr__field { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.75rem; min-width: 0; }
        .rr__field span { font-size: 0.75rem; font-weight: 600; color: var(--theme-fg-secondary, #4B5563); }
        .rr__field textarea { width: 100%; box-sizing: border-box; min-width: 0; padding: 0.5rem; border: 1px solid var(--theme-border, #E5E7EB); border-radius: 8px; font-size: 16px; font-family: inherit; }

        .rr__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
        .rr__item { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; justify-content: space-between; padding: 0.6rem; border: 1px solid var(--theme-border, #E5E7EB); border-radius: 8px; min-width: 0; }
        .rr__item-main { display: flex; flex-direction: column; gap: 0.15rem; flex: 1 1 200px; min-width: 0; }
        .rr__asked { font-size: 0.86rem; font-weight: 600; color: var(--theme-fg-primary, #1F2937); overflow-wrap: anywhere; }
        .rr__reason { font-size: 0.76rem; color: var(--theme-fg-muted); overflow-wrap: anywhere; }
        .rr__reason--none { font-style: italic; }
        .rr__chip { align-self: flex-start; padding: 0.05rem 0.45rem; border-radius: 999px; font-size: 0.68rem; font-weight: 700; }
        .rr__item-actions { display: flex; gap: 0.35rem; flex-shrink: 0; }

        .rr__btn { display: inline-flex; align-items: center; gap: 0.3rem; min-height: 40px; padding: 0 0.8rem; border: 1px solid var(--theme-border, #E5E7EB); border-radius: 8px; background: transparent; font-size: 0.82rem; font-weight: 600; cursor: pointer; color: var(--theme-fg-primary, #1F2937); }
        .rr__btn--primary { border-color: var(--color-brand-navy, #1E3A5F); background: var(--color-brand-navy, #1E3A5F); color: var(--color-text-on-brand, #FFF); }
        .rr__btn--ok { border-color: #059669; color: #065F46; }
        .rr__btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
