// app/admin/pay-rates/page.tsx — manage what each activity pays
'use client';
import '../styles/AdminTimeLogs.css';

// MANAGE THE PAY RATES (owner request, 2026-08-04)
// ════════════════════════════════════════════════
//
// *"Right now I want to log 7 hours of field work at $25 an hour, and 1 hour of driving time at $15
// an hour. But I can't do the $15 an hour. I need to be able to have a way to select $15 an hour
// and submit that. Please make a system so that we can fully manage this all."*
//
// The whole pay system is two screens now. This is one of them; /admin/payroll is the other:
//
//   • **Here** — what each activity pays. Either "the person's base pay" (ordinary work) or a set
//     rate everybody gets (driving).
//   • **/admin/payroll** — what each person's base pay is.
//
// That is deliberately the entire model. Role tiers, seniority brackets, credential bonuses and XP
// milestones are parked: *"put the whole pay progression and seniority thing on hold and hide it
// from surfacing for now."* Nothing on this page mentions them, and nothing in the live pay path
// reads them.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { usePageError } from '../hooks/usePageError';

interface Activity {
  id: string;
  work_type: string;
  label: string;
  base_rate: number;
  rate_mode: 'base' | 'flat';
  icon: string | null;
  description: string | null;
  is_active: boolean;
  sort_order: number | null;
}

const money = (n: number) => `$${Number(n).toFixed(2)}`;

const ADMIN_ROLES = ['admin', 'owner', 'developer'];

export default function PayRatesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { reportPageError } = usePageError('PayRatesPage');

  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ label: '', rate_mode: 'base' as 'base' | 'flat', base_rate: '' });

  const roles: string[] = session?.user?.roles ?? [];
  const mayManage = roles.some((r) => ADMIN_ROLES.includes(r));

  useEffect(() => {
    // Only redirect once the session has actually resolved. Redirecting while it is still
    // 'loading' bounces every admin out of the page on a cold load.
    if (status === 'authenticated' && !mayManage) router.replace('/admin/my-pay');
  }, [status, mayManage, router]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/pay-config/work-types');
      const body = await res.json();
      if (!res.ok) { setError(body.error || 'Could not load the activities.'); return; }
      setActivities(body.work_types ?? []);
      setError(null);
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error('Failed to load pay rates'));
    } finally {
      setLoading(false);
    }
  }, [reportPageError]);

  useEffect(() => { if (mayManage) load(); }, [mayManage, load]);

  /** Save one field on one activity. Optimistic locally, reloaded from the server on success. */
  const patch = useCallback(async (workType: string, changes: Partial<Activity>) => {
    setSavingKey(workType);
    setError(null);
    try {
      const res = await fetch('/api/admin/pay-config/work-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ work_type: workType, ...changes }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error || 'Could not save that change.'); return; }
      setActivities((prev) => prev.map((a) => (a.work_type === workType ? { ...a, ...body.work_type } : a)));
    } catch {
      setError('Could not save that change.');
    } finally {
      setSavingKey(null);
    }
  }, []);

  const addActivity = useCallback(async () => {
    const label = draft.label.trim();
    if (!label) { setError('Give the activity a name.'); return; }
    setSavingKey('__new');
    setError(null);
    try {
      const res = await fetch('/api/admin/pay-config/work-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_type: label,
          label,
          rate_mode: draft.rate_mode,
          base_rate: draft.rate_mode === 'flat' ? parseFloat(draft.base_rate) || 0 : 0,
        }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error || 'Could not add that activity.'); return; }
      setDraft({ label: '', rate_mode: 'base', base_rate: '' });
      setShowAdd(false);
      await load();
    } finally {
      setSavingKey(null);
    }
  }, [draft, load]);

  if (status === 'loading' || (loading && mayManage)) {
    return <div className="tl-page"><div className="tl-loading">Loading…</div></div>;
  }
  if (!mayManage) {
    return <div className="tl-page"><div className="tl-loading">Redirecting…</div></div>;
  }

  const active = activities.filter((a) => a.is_active);
  const inactive = activities.filter((a) => !a.is_active);

  return (
    <div className="tl-page">
      <div className="tl-log-header">
        <h3>Pay rates</h3>
        <span className="tl-log-header__note">
          Base pay per person is set on <Link href="/admin/payroll">Payroll</Link>.
        </span>
      </div>

      <p className="tl-log-help">
        Every activity pays one of two ways. <strong>Base pay</strong> means the person&rsquo;s own hourly
        rate — field work is $25/hr for someone on $25 and $18/hr for someone on $18. <strong>Set
        rate</strong> means the same figure for everybody, whoever does it — riding to a job pays what it
        pays. Whoever approves the hours can still override either one on a payout.
      </p>

      {error && <div className="tl-pay-error">{error}</div>}

      <div className="tl-rate-list">
        {active.map((a) => (
          <div key={a.work_type} className="tl-rate-row">
            <span className="tl-rate-row__icon">{a.icon || '📋'}</span>
            <div className="tl-rate-row__name">
              <strong>{a.label}</strong>
              {a.description && <span className="tl-rate-row__desc">{a.description}</span>}
            </div>

            <label className="tl-rate-row__mode">
              <span>Pays</span>
              <select
                value={a.rate_mode}
                disabled={savingKey === a.work_type}
                onChange={(e) => patch(a.work_type, { rate_mode: e.target.value as 'base' | 'flat' })}
              >
                <option value="base">The person&rsquo;s base pay</option>
                <option value="flat">A set rate for everyone</option>
              </select>
            </label>

            {/* The rate box appears ONLY for a set rate. Showing it for a base-pay activity would
                put an editable number on screen that nobody is ever paid — which is exactly the
                confusion this whole page exists to end. */}
            {a.rate_mode === 'flat' ? (
              <label className="tl-rate-row__rate">
                <span>$/hr</span>
                <input
                  type="number" min="0" step="0.25"
                  defaultValue={a.base_rate}
                  disabled={savingKey === a.work_type}
                  onBlur={(e) => {
                    const value = parseFloat(e.target.value);
                    if (Number.isFinite(value) && value !== Number(a.base_rate)) {
                      patch(a.work_type, { base_rate: value });
                    }
                  }}
                />
              </label>
            ) : (
              <span className="tl-rate-row__varies">varies by person</span>
            )}

            <button
              className="tl-btn tl-btn--sm"
              disabled={savingKey === a.work_type}
              onClick={() => patch(a.work_type, { is_active: false })}
            >
              Retire
            </button>
          </div>
        ))}
      </div>

      {showAdd ? (
        <div className="tl-rate-row tl-rate-row--new">
          <input
            className="tl-rate-row__new-name"
            placeholder="Activity name, e.g. Monument setting"
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          />
          <select
            value={draft.rate_mode}
            onChange={(e) => setDraft((d) => ({ ...d, rate_mode: e.target.value as 'base' | 'flat' }))}
          >
            <option value="base">The person&rsquo;s base pay</option>
            <option value="flat">A set rate for everyone</option>
          </select>
          {draft.rate_mode === 'flat' && (
            <input
              type="number" min="0" step="0.25" placeholder="$/hr"
              value={draft.base_rate}
              onChange={(e) => setDraft((d) => ({ ...d, base_rate: e.target.value }))}
            />
          )}
          <button className="tl-btn tl-btn--primary" disabled={savingKey === '__new'} onClick={addActivity}>
            {savingKey === '__new' ? 'Adding…' : 'Add'}
          </button>
          <button className="tl-btn" onClick={() => setShowAdd(false)}>Cancel</button>
        </div>
      ) : (
        <button className="tl-btn" onClick={() => setShowAdd(true)}>+ Add an activity</button>
      )}

      {inactive.length > 0 && (
        <div className="tl-rate-retired">
          <h4>Retired</h4>
          <p className="tl-rate-retired__note">
            Not offered when logging hours. Kept so that hours already logged against them still read
            correctly.
          </p>
          {inactive.map((a) => (
            <div key={a.work_type} className="tl-rate-row tl-rate-row--retired">
              <span className="tl-rate-row__icon">{a.icon || '📋'}</span>
              <div className="tl-rate-row__name"><strong>{a.label}</strong></div>
              <span className="tl-rate-row__varies">
                {a.rate_mode === 'flat' ? `${money(a.base_rate)}/hr set rate` : 'base pay'}
              </span>
              <button
                className="tl-btn tl-btn--sm"
                disabled={savingKey === a.work_type}
                onClick={() => patch(a.work_type, { is_active: true })}
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
