// app/admin/pay-progression/[email]/page.tsx
//
// Per-employee pay-progression view with the override panel.
// P-17 of PAY_PROGRESSION_OVERHAUL.md.
//
// Admin sees:
//   • The same hero card + effective rate breakdown as the public page,
//     but computed for THIS employee (not the signed-in admin)
//   • An "Override panel" with all the user_pay_overrides fields
//   • Before / after preview that recomputes via the canonical
//     effective-rate calculator as the admin tweaks override fields
//   • A history list of past overrides (P-18 polishes this)
//
// Admin-only. Non-admins get redirected to /admin/pay-progression.

'use client';
import '../../styles/AdminPayroll.css';
import '../../styles/AdminRewards.css';

import { useState, useEffect, useCallback, use } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  computeEffectiveRate,
  findSeniorityBracket,
  type WorkTypeRow,
  type RoleTierRow,
  type SeniorityBracketRow,
  type CredentialRow,
  type XpMilestoneRow,
} from '@/lib/payroll/effective-rate';

interface OverrideRow {
  id: string;
  user_email: string;
  fixed_rate: number | null;
  role_bonus_multiplier: number;
  seniority_multiplier: number;
  flat_addition: number;
  reason: string | null;
  effective_date: string;
  expires_at: string | null;
  approved_by: string;
  created_at: string;
}

interface EmployeeProfile {
  user_email: string;
  user_name: string;
  job_title: string;
  hourly_rate: number;
  hire_date: string | null;
}

interface BalanceRow {
  total_earned: number;
  current_balance: number;
}

interface PayConfigData {
  work_type_rates: WorkTypeRow[];
  role_tiers: (RoleTierRow & { label?: string; description?: string | null })[];
  seniority_brackets: SeniorityBracketRow[];
  credential_bonuses: CredentialRow[];
  xp_milestones: XpMilestoneRow[];
  earned_credentials: { credential_key: string; earned_date?: string }[];
  balance: BalanceRow | null;
  profile: EmployeeProfile | null;
}

export default function EmployeeOverridePage({ params }: { params: Promise<{ email: string }> }) {
  const resolvedParams = use(params);
  const email = decodeURIComponent(resolvedParams.email);
  const { data: session, status } = useSession();
  const router = useRouter();

  const isAdmin = session?.user?.roles?.includes('admin') ?? false;

  const [config, setConfig] = useState<PayConfigData | null>(null);
  const [history, setHistory] = useState<OverrideRow[]>([]);
  const [current, setCurrent] = useState<OverrideRow | null>(null);
  const [loading, setLoading] = useState(true);

  // Override draft (what admin is editing)
  const [draft, setDraft] = useState({
    fixed_rate: null as number | null,
    role_bonus_multiplier: 1,
    seniority_multiplier: 1,
    flat_addition: 0,
    reason: '',
    effective_date: new Date().toISOString().slice(0, 10),
    expires_at: '' as string,
  });
  const [previewWorkType, setPreviewWorkType] = useState<string>('field_work');
  const [saving, setSaving] = useState(false);

  const loadEmployee = useCallback(async () => {
    setLoading(true);
    try {
      // Pay-progression config (reuses the rewards endpoint).
      const cfgRes = await fetch(`/api/admin/rewards?section=pay&email=${encodeURIComponent(email)}`);
      const cfg = cfgRes.ok ? await cfgRes.json() as PayConfigData : null;
      setConfig(cfg);

      // Override history + active row.
      const ovRes = await fetch(`/api/admin/pay-config/overrides?email=${encodeURIComponent(email)}`);
      if (ovRes.ok) {
        const data = await ovRes.json() as { history: OverrideRow[]; current: OverrideRow | null };
        setHistory(data.history);
        setCurrent(data.current);
        if (data.current) {
          setDraft({
            fixed_rate: data.current.fixed_rate,
            role_bonus_multiplier: data.current.role_bonus_multiplier,
            seniority_multiplier: data.current.seniority_multiplier,
            flat_addition: data.current.flat_addition,
            reason: data.current.reason || '',
            effective_date: new Date().toISOString().slice(0, 10),
            expires_at: '',
          });
        }
      }

      if (cfg?.work_type_rates?.length) {
        setPreviewWorkType(cfg.work_type_rates[0].work_type);
      }
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    if (status === 'authenticated' && !isAdmin) {
      router.replace('/admin/pay-progression');
      return;
    }
    if (status === 'authenticated') loadEmployee();
  }, [status, isAdmin, router, loadEmployee]);

  if (!isAdmin || loading || !config) {
    return (
      <div className="admin-empty">
        <div className="admin-empty__icon">⏳</div>
        <div className="admin-empty__title">Loading…</div>
      </div>
    );
  }

  const profile = config.profile;
  if (!profile) {
    return (
      <div className="admin-empty">
        <div className="admin-empty__title">No employee profile for {email}</div>
        <Link className="admin-btn" href="/admin/pay-progression">← Back to pay progression</Link>
      </div>
    );
  }

  // Resolve the user's tier the same way the public page does (job_title slug match).
  const tierKey = profile.job_title?.toLowerCase().replace(/\s+/g, '_');
  const tier = config.role_tiers.find(r => r.role_key === tierKey) || null;
  const workType = config.work_type_rates.find(w => w.work_type === previewWorkType);
  const yearsEmployed = profile.hire_date
    ? Math.floor((Date.now() - new Date(profile.hire_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : 0;
  const earnedKeys = config.earned_credentials.map(c => c.credential_key);
  const totalXp = Number(config.balance?.total_earned || 0);

  const baseInputs = workType ? {
    workType,
    tier,
    yearsEmployed,
    seniority: config.seniority_brackets,
    earnedCredentialKeys: earnedKeys,
    credentials: config.credential_bonuses,
    totalXp,
    xpMilestones: config.xp_milestones,
  } : null;

  // "Before" = current active override (if any) applied.
  const beforeOverride = current ? {
    fixed_rate: current.fixed_rate,
    role_bonus_multiplier: current.role_bonus_multiplier,
    seniority_multiplier: current.seniority_multiplier,
    flat_addition: current.flat_addition,
  } : null;
  const beforeResult = baseInputs ? computeEffectiveRate({ ...baseInputs, override: beforeOverride }) : null;

  // "After" = draft applied.
  const afterOverride = {
    fixed_rate: draft.fixed_rate,
    role_bonus_multiplier: draft.role_bonus_multiplier,
    seniority_multiplier: draft.seniority_multiplier,
    flat_addition: draft.flat_addition,
  };
  const afterResult = baseInputs ? computeEffectiveRate({ ...baseInputs, override: afterOverride }) : null;

  const delta = (afterResult?.effectiveRate ?? 0) - (beforeResult?.effectiveRate ?? 0);
  const isNonDefault =
    draft.fixed_rate !== null ||
    draft.role_bonus_multiplier !== 1 ||
    draft.seniority_multiplier !== 1 ||
    draft.flat_addition !== 0;

  async function saveOverride() {
    if (isNonDefault && !draft.reason.trim()) {
      window.alert('A reason is required when any override field is non-default.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pay-config/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: email,
          fixed_rate: draft.fixed_rate,
          role_bonus_multiplier: draft.role_bonus_multiplier,
          seniority_multiplier: draft.seniority_multiplier,
          flat_addition: draft.flat_addition,
          reason: draft.reason || null,
          effective_date: draft.effective_date,
          expires_at: draft.expires_at || null,
        }),
      });
      if (res.ok) {
        await loadEmployee();
      } else {
        const body = await res.json().catch(() => ({}));
        window.alert(body.error || 'Failed to save override');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pay-prog-page pay-prog-page--override">
      <div className="admin-learn__header">
        <h2 className="admin-learn__title">💰 Pay Override · {profile.user_name || email}</h2>
        <p className="admin-learn__subtitle">
          <Link href="/admin/pay-progression" style={{ color: 'var(--color-brand-navy)' }}>← Back to pay progression</Link>
          {' · '}
          <Link href={`/admin/payroll/${encodeURIComponent(email)}`} style={{ color: 'var(--color-brand-navy)' }}>View payroll detail</Link>
        </p>
      </div>

      {/* Before / after preview */}
      {beforeResult && afterResult && (
        <div className="pay-prog__override-preview">
          <div className="pay-prog__override-preview-side">
            <span className="pay-prog__hero-eyebrow">Before</span>
            <span className="pay-prog__hero-rate-row">
              <span className="pay-prog__hero-rate" style={{ color: 'var(--color-text-primary)' }}>${beforeResult.effectiveRate.toFixed(2)}</span>
              <span className="pay-prog__hero-rate-unit">/hr</span>
            </span>
            <span className="pay-prog__override-preview-note">
              {current ? `Active override: ${current.reason || 'no reason recorded'}` : 'No active override — default formula'}
            </span>
          </div>
          <div className="pay-prog__override-preview-arrow" aria-hidden="true">→</div>
          <div className="pay-prog__override-preview-side pay-prog__override-preview-side--after">
            <span className="pay-prog__hero-eyebrow">After</span>
            <span className="pay-prog__hero-rate-row">
              <span className="pay-prog__hero-rate" style={{ color: 'var(--color-brand-navy)' }}>${afterResult.effectiveRate.toFixed(2)}</span>
              <span className="pay-prog__hero-rate-unit">/hr</span>
            </span>
            <span className={`pay-prog__override-preview-delta ${delta >= 0 ? 'pay-prog__override-preview-delta--up' : 'pay-prog__override-preview-delta--down'}`}>
              {delta === 0 ? 'No change' : `${delta > 0 ? '+' : ''}$${delta.toFixed(2)}/hr`}
            </span>
          </div>
        </div>
      )}

      {/* Override form */}
      <div className="pay-prog__section">
        <div className="pay-prog__section-header">
          <h3 className="pay-prog__section-title">Override fields</h3>
          <select
            className="pay-prog__calc-select"
            style={{ width: 'auto' }}
            value={previewWorkType}
            onChange={e => setPreviewWorkType(e.target.value)}
            aria-label="Preview work type"
          >
            {config.work_type_rates.map(w => (
              <option key={w.work_type} value={w.work_type}>Preview: {w.work_type}</option>
            ))}
          </select>
        </div>

        <div className="pay-prog__override-grid">
          <label className="pay-prog__rate-edit-field">
            <span>Fixed rate $/hr (if set, ignores formula)</span>
            <input
              type="number"
              step="0.25"
              min="0"
              value={draft.fixed_rate ?? ''}
              onChange={e => setDraft(d => ({ ...d, fixed_rate: e.target.value === '' ? null : Number(e.target.value) }))}
              placeholder="Leave blank to use the formula"
            />
          </label>
          <label className="pay-prog__rate-edit-field">
            <span>Role bonus multiplier (default 1.0)</span>
            <input
              type="number"
              step="0.05"
              min="0"
              max="2"
              value={draft.role_bonus_multiplier}
              onChange={e => setDraft(d => ({ ...d, role_bonus_multiplier: Number(e.target.value) }))}
            />
          </label>
          <label className="pay-prog__rate-edit-field">
            <span>Seniority multiplier (default 1.0)</span>
            <input
              type="number"
              step="0.05"
              min="0"
              max="2"
              value={draft.seniority_multiplier}
              onChange={e => setDraft(d => ({ ...d, seniority_multiplier: Number(e.target.value) }))}
            />
          </label>
          <label className="pay-prog__rate-edit-field">
            <span>Flat addition $/hr (default 0)</span>
            <input
              type="number"
              step="0.25"
              value={draft.flat_addition}
              onChange={e => setDraft(d => ({ ...d, flat_addition: Number(e.target.value) }))}
            />
          </label>
          <label className="pay-prog__rate-edit-field">
            <span>Effective date</span>
            <input
              type="date"
              value={draft.effective_date}
              onChange={e => setDraft(d => ({ ...d, effective_date: e.target.value }))}
            />
          </label>
          <label className="pay-prog__rate-edit-field">
            <span>Expires (optional)</span>
            <input
              type="date"
              value={draft.expires_at}
              onChange={e => setDraft(d => ({ ...d, expires_at: e.target.value }))}
              placeholder="No expiry"
            />
          </label>
          <label className="pay-prog__rate-edit-field pay-prog__override-reason">
            <span>Reason {isNonDefault && <em style={{ color: 'var(--color-error)' }}>(required)</em>}</span>
            <textarea
              value={draft.reason}
              onChange={e => setDraft(d => ({ ...d, reason: e.target.value }))}
              placeholder="e.g. Long-tenure adjustment per owner approval 2026-04-01"
              rows={2}
              style={{ width: '100%', padding: 'var(--input-padding-y) var(--input-padding-x)', borderRadius: 'var(--radius-md)', border: 'var(--border-normal)' }}
            />
          </label>
        </div>

        <div className="pay-prog__rate-edit-actions" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn btn--primary" disabled={saving} onClick={saveOverride}>
            {saving ? 'Saving…' : 'Save override'}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={saving}
            onClick={() => setDraft({
              fixed_rate: null,
              role_bonus_multiplier: 1,
              seniority_multiplier: 1,
              flat_addition: 0,
              reason: '',
              effective_date: new Date().toISOString().slice(0, 10),
              expires_at: '',
            })}
          >
            Reset to defaults
          </button>
        </div>
      </div>

      {/* Read-only summary of the employee's current stats */}
      <div className="pay-prog__section">
        <h3 className="pay-prog__section-title">Employee snapshot</h3>
        <ul className="pay-prog__calc-stack">
          <li><span>Tier</span><span>{tier?.label || profile.job_title || '—'}</span></li>
          <li><span>Years employed</span><span>{yearsEmployed}</span></li>
          <li><span>Seniority bracket</span><span>{findSeniorityBracket(config.seniority_brackets, yearsEmployed)?.label || '—'}</span></li>
          <li><span>Credentials earned</span><span>{earnedKeys.length}</span></li>
          <li><span>Total XP</span><span>{totalXp.toLocaleString()}</span></li>
          <li><span>Stored hourly_rate</span><span>${Number(profile.hourly_rate || 0).toFixed(2)}</span></li>
        </ul>
      </div>

      {/* Audit-trail viewer — P-18.
       * Shows each override with a state badge (Active / Future / Expired /
       * Superseded), a field-by-field diff against the previous chronological
       * row, the reason + approver, and a delete affordance. */}
      <div className="pay-prog__section">
        <h3 className="pay-prog__section-title">Override history ({history.length})</h3>
        {history.length === 0 ? (
          <p className="pay-prog__section-desc">No overrides applied yet.</p>
        ) : (
          <div className="pay-prog__audit-list">
            {history.map((h, idx) => {
              // `history` is sorted newest-first. The previous chronological
              // row (older) is at idx + 1; the diff compares h vs that older row.
              const previous = history[idx + 1];
              return (
                <AuditRow
                  key={h.id}
                  row={h}
                  previous={previous}
                  isActive={current?.id === h.id}
                  onDelete={loadEmployee}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Audit-trail row (P-18) ─────────────────────────────────────────────────

interface AuditRowProps {
  row: OverrideRow;
  previous: OverrideRow | undefined;
  isActive: boolean;
  onDelete: () => void;
}

function AuditRow({ row, previous, isActive, onDelete }: AuditRowProps) {
  const [busy, setBusy] = useState(false);

  // State classification.
  const today = new Date().toISOString().slice(0, 10);
  const isFuture = row.effective_date > today;
  const isExpired = row.expires_at !== null && row.expires_at <= today;
  const isSuperseded = !isActive && !isFuture && !isExpired;
  const stateLabel = isActive ? 'Active' : isFuture ? 'Future' : isExpired ? 'Expired' : 'Superseded';
  const stateClass = isActive ? 'active' : isFuture ? 'future' : isExpired ? 'expired' : 'superseded';

  // Field-by-field diff vs the previous row (or vs the default values if no
  // previous exists — this is the oldest override).
  const baseline = previous ?? {
    fixed_rate: null as number | null,
    role_bonus_multiplier: 1,
    seniority_multiplier: 1,
    flat_addition: 0,
  };
  const diffs: { label: string; from: string; to: string }[] = [];
  if (Number(row.fixed_rate ?? -1) !== Number(baseline.fixed_rate ?? -1)) {
    diffs.push({
      label: 'Fixed rate',
      from: baseline.fixed_rate === null ? 'unset' : `$${Number(baseline.fixed_rate).toFixed(2)}`,
      to: row.fixed_rate === null ? 'unset' : `$${Number(row.fixed_rate).toFixed(2)}`,
    });
  }
  if (Number(row.role_bonus_multiplier) !== Number(baseline.role_bonus_multiplier)) {
    diffs.push({
      label: 'Role ×',
      from: `${Number(baseline.role_bonus_multiplier).toFixed(2)}`,
      to: `${Number(row.role_bonus_multiplier).toFixed(2)}`,
    });
  }
  if (Number(row.seniority_multiplier) !== Number(baseline.seniority_multiplier)) {
    diffs.push({
      label: 'Seniority ×',
      from: `${Number(baseline.seniority_multiplier).toFixed(2)}`,
      to: `${Number(row.seniority_multiplier).toFixed(2)}`,
    });
  }
  if (Number(row.flat_addition) !== Number(baseline.flat_addition)) {
    diffs.push({
      label: 'Flat add',
      from: `+$${Number(baseline.flat_addition).toFixed(2)}`,
      to: `+$${Number(row.flat_addition).toFixed(2)}`,
    });
  }

  async function remove() {
    if (!window.confirm(`Delete this override (effective ${row.effective_date})? The next-oldest row will become active.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/pay-config/overrides?id=${encodeURIComponent(row.id)}`, { method: 'DELETE' });
      if (res.ok) onDelete();
      else {
        const body = await res.json().catch(() => ({}));
        window.alert(body.error || 'Failed to delete');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`pay-prog__audit-row pay-prog__audit-row--${stateClass}`}>
      <div className="pay-prog__audit-head">
        <span className={`pay-prog__audit-badge pay-prog__audit-badge--${stateClass}`}>{stateLabel}</span>
        <code className="pay-prog__audit-dates">
          {row.effective_date}
          {row.expires_at ? ` → ${row.expires_at}` : ' → ∞'}
        </code>
        <button
          type="button"
          className="btn btn--sm btn--danger"
          disabled={busy}
          onClick={remove}
          title="Delete this override row"
        >
          {busy ? '…' : 'Delete'}
        </button>
      </div>
      <div className="pay-prog__audit-body">
        {row.reason && <p className="pay-prog__audit-reason">{row.reason}</p>}
        <p className="pay-prog__audit-meta">
          Approved by <strong>{row.approved_by}</strong> on {new Date(row.created_at).toLocaleString()}
        </p>
        {diffs.length > 0 ? (
          <ul className="pay-prog__audit-diffs">
            {diffs.map(d => (
              <li key={d.label}>
                <span className="pay-prog__audit-diff-label">{d.label}:</span>
                <span className="pay-prog__audit-diff-from">{d.from}</span>
                <span className="pay-prog__audit-diff-arrow" aria-hidden="true">→</span>
                <span className="pay-prog__audit-diff-to">{d.to}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pay-prog__audit-meta">No field changes vs. previous row (re-affirmation).</p>
        )}
      </div>
    </div>
  );
}
