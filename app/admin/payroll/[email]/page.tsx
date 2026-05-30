// app/admin/payroll/[email]/page.tsx — Employee Detail (Admin view)
'use client';

import Link from 'next/link';

import { useSession } from 'next-auth/react';
import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { usePageError } from '../../hooks/usePageError';
import RaiseHistory from '../../components/payroll/RaiseHistory';
import CertificationsPanel from '../../components/payroll/CertificationsPanel';
import BalanceCard from '../../components/payroll/BalanceCard';
import PayStubView from '../../components/payroll/PayStubView';
import { formatCurrency, formatDate } from '../../components/payroll/PayrollConstants';
import { useJobTitles } from '../../components/payroll/useJobTitles';

interface EmployeeProfile {
  id: string;
  user_email: string;
  user_name: string;
  job_title: string;
  hourly_rate: number;
  salary_type: string;
  annual_salary: number | null;
  pay_frequency: string;
  hire_date: string | null;
  available_balance: number;
  total_earned: number;
  total_withdrawn: number;
  is_active: boolean;
}

export default function EmployeeDetailPage({ params }: { params: Promise<{ email: string }> }) {
  const resolvedParams = use(params);
  const email = decodeURIComponent(resolvedParams.email);
  const { data: session } = useSession();
  const jobTitles = useJobTitles();
  const router = useRouter();
  const { safeFetch, safeAction, reportPageError } = usePageError('EmployeeDetailPage');
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'certifications' | 'raises' | 'balance' | 'stubs'>('overview');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    job_title: '',
    hourly_rate: '',
    salary_type: 'hourly',
    hire_date: '',
    is_active: true,
  });

  const isAdmin = session?.user?.roles?.includes('admin') ?? false;
  const isSelf = session?.user?.email === email;

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/payroll/employees?email=${email}`);
      const data = await res.json();
      if (data.profile) {
        setProfile(data.profile);
        setEditForm({
          job_title: data.profile.job_title,
          hourly_rate: String(data.profile.hourly_rate),
          salary_type: data.profile.salary_type,
          hire_date: data.profile.hire_date || '',
          is_active: data.profile.is_active,
        });
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load profile' });
    }
    setLoading(false);
  }, [email, reportPageError]);

  useEffect(() => {
    if (!isAdmin && !isSelf) {
      router.push('/admin/me?tab=pay');
      return;
    }
    loadProfile();
  }, [isAdmin, isSelf, router, loadProfile]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/payroll/employees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: email,
          job_title: editForm.job_title,
          hourly_rate: parseFloat(editForm.hourly_rate),
          salary_type: editForm.salary_type,
          hire_date: editForm.hire_date || null,
          is_active: editForm.is_active,
        }),
      });
      if (res.ok) {
        setEditing(false);
        loadProfile();
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'save profile' });
    }
  }

  if (loading) return <div className="payroll-page"><div className="payroll-loading">Loading employee details...</div></div>;
  if (!profile) return (
    <div className="payroll-page">
      <div className="payroll-empty">
        Employee profile not found for {email}.
        {isAdmin && (
          <button className="payroll-btn payroll-btn--primary" style={{ marginLeft: '1rem' }} onClick={() => router.push('/admin/payroll')}>
            Back to Payroll
          </button>
        )}
      </div>
    </div>
  );

  const titleInfo = jobTitles[profile.job_title] || { label: profile.job_title, icon: '👤', description: '' };

  return (
    <div className="payroll-page">

      {/* Header */}
      <div className="payroll-emp-detail__header">
        <button className="payroll-btn" onClick={() => router.push('/admin/payroll')}>← Back</button>
        <div className="payroll-emp-detail__title">
          <span className="payroll-emp-detail__icon">{titleInfo.icon}</span>
          <div>
            <h2>{profile.user_name || email.split('@')[0]}</h2>
            <p>{titleInfo.label} • {profile.user_email}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {isAdmin && (
            <Link
              className="payroll-btn"
              href={`/admin/pay-progression/${encodeURIComponent(email)}`}
              title="Open the pay-progression view + override panel for this employee"
            >
              💰 Pay progression
            </Link>
          )}
          {isAdmin && (
            <button className="payroll-btn payroll-btn--primary" onClick={() => setEditing(!editing)}>
              {editing ? 'Cancel' : 'Edit Profile'}
            </button>
          )}
        </div>
      </div>

      {/* Edit Form */}
      {editing && isAdmin && (
        <form className="payroll-emp-detail__edit-form" onSubmit={saveProfile}>
          <div className="payroll-form-row">
            <div className="payroll-form-group">
              <label>Position</label>
              <select value={editForm.job_title} onChange={e => setEditForm(f => ({ ...f, job_title: e.target.value }))}>
                {Object.entries(jobTitles).map(([key, val]) => (
                  <option key={key} value={key}>{val.icon} {val.label}</option>
                ))}
              </select>
              {/* P-8: show admins the pay impact of the tier they're selecting,
               * sourced from the same role_tiers row that the calculation uses.
               * Hidden until the dropdown actually changes from the saved
               * value, so the form isn't cluttered when no edit is happening. */}
              <TierPreview
                tierKey={editForm.job_title}
                currentTierKey={profile.job_title}
              />
            </div>
            <div className="payroll-form-group">
              <label>Hourly Rate ($)</label>
              <input
                type="number"
                step="0.25"
                required
                value={editForm.hourly_rate}
                onChange={e => setEditForm(f => ({ ...f, hourly_rate: e.target.value }))}
              />
            </div>
            <div className="payroll-form-group">
              <label>Hire Date</label>
              <input
                type="date"
                value={editForm.hire_date}
                onChange={e => setEditForm(f => ({ ...f, hire_date: e.target.value }))}
              />
            </div>
            <div className="payroll-form-group">
              <label>
                <input
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))}
                />
                {' '}Active Employee
              </label>
            </div>
          </div>
          <button type="submit" className="payroll-btn payroll-btn--primary">Save Changes</button>
        </form>
      )}

      {/* Quick Stats */}
      <div className="payroll-emp-detail__stats">
        <div className="payroll-emp-detail__stat">
          <span className="payroll-emp-detail__stat-label">Current Rate</span>
          <span className="payroll-emp-detail__stat-value">{formatCurrency(profile.hourly_rate)}/hr</span>
        </div>
        <div className="payroll-emp-detail__stat">
          <span className="payroll-emp-detail__stat-label">Balance</span>
          <span className="payroll-emp-detail__stat-value">{formatCurrency(profile.available_balance)}</span>
        </div>
        <div className="payroll-emp-detail__stat">
          <span className="payroll-emp-detail__stat-label">Total Earned</span>
          <span className="payroll-emp-detail__stat-value">{formatCurrency(profile.total_earned)}</span>
        </div>
        <div className="payroll-emp-detail__stat">
          <span className="payroll-emp-detail__stat-label">Hire Date</span>
          <span className="payroll-emp-detail__stat-value">{profile.hire_date ? formatDate(profile.hire_date) : '—'}</span>
        </div>
        <div className="payroll-emp-detail__stat">
          <span className="payroll-emp-detail__stat-label">Pay Frequency</span>
          <span className="payroll-emp-detail__stat-value">{profile.pay_frequency}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="payroll-tabs">
        <button className={`payroll-tabs__btn ${activeTab === 'overview' ? 'payroll-tabs__btn--active' : ''}`} onClick={() => setActiveTab('overview')}>
          Overview
        </button>
        <button className={`payroll-tabs__btn ${activeTab === 'certifications' ? 'payroll-tabs__btn--active' : ''}`} onClick={() => setActiveTab('certifications')}>
          Certifications
        </button>
        <button className={`payroll-tabs__btn ${activeTab === 'raises' ? 'payroll-tabs__btn--active' : ''}`} onClick={() => setActiveTab('raises')}>
          Raises
        </button>
        <button className={`payroll-tabs__btn ${activeTab === 'balance' ? 'payroll-tabs__btn--active' : ''}`} onClick={() => setActiveTab('balance')}>
          Balance & Withdrawals
        </button>
        <button className={`payroll-tabs__btn ${activeTab === 'stubs' ? 'payroll-tabs__btn--active' : ''}`} onClick={() => setActiveTab('stubs')}>
          Pay Stubs
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="payroll-emp-detail__overview">
          <div className="payroll-emp-detail__overview-grid">
            <div className="payroll-emp-detail__overview-card">
              <h4>Position Details</h4>
              <p><strong>Title:</strong> {titleInfo.label}</p>
              <p><strong>Description:</strong> {titleInfo.description}</p>
              <p><strong>Pay Type:</strong> {profile.salary_type === 'salary' ? 'Salaried' : 'Hourly'}</p>
              <p><strong>Rate:</strong> {formatCurrency(profile.hourly_rate)}/hr</p>
            </div>
            <div className="payroll-emp-detail__overview-card">
              <h4>Financials</h4>
              <p><strong>Available Balance:</strong> {formatCurrency(profile.available_balance)}</p>
              <p><strong>Total Earned:</strong> {formatCurrency(profile.total_earned)}</p>
              <p><strong>Total Withdrawn:</strong> {formatCurrency(profile.total_withdrawn)}</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'certifications' && (
        <CertificationsPanel email={email} isAdmin={isAdmin} onCertChanged={loadProfile} />
      )}

      {activeTab === 'raises' && (
        <RaiseHistory email={email} isAdmin={isAdmin} onRaiseRecorded={loadProfile} />
      )}

      {activeTab === 'balance' && (
        <BalanceCard email={email} isAdmin={isAdmin} isSelf={isSelf} />
      )}

      {activeTab === 'stubs' && (
        <PayStubView email={email} />
      )}
    </div>
  );
}

// ─── Tier preview (P-8) ──────────────────────────────────────────────────────
// Fetches the role_tiers row for a given tier_key and shows the admin the
// base bonus + max effective rate + description that selecting this tier
// will grant. Only renders the "change" banner when the dropdown differs
// from the saved value so the form isn't noisy during routine edits.

interface TierPreviewProps {
  tierKey: string;
  currentTierKey: string;
}

interface TierPreviewData {
  label: string;
  description: string | null;
  icon: string | null;
  base_bonus: number;
  max_effective_rate: number | null;
}

function TierPreview({ tierKey, currentTierKey }: TierPreviewProps) {
  const [tier, setTier] = useState<TierPreviewData | null>(null);
  const [currentBonus, setCurrentBonus] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/role-tiers');
        if (!res.ok) return;
        const data = await res.json() as { tiers: (TierPreviewData & { role_key: string })[] };
        if (cancelled) return;
        const match = data.tiers.find(t => t.role_key === tierKey);
        const current = data.tiers.find(t => t.role_key === currentTierKey);
        setTier(match || null);
        setCurrentBonus(current ? Number(current.base_bonus) : null);
      } catch { /* silent fail */ }
    }
    load();
    return () => { cancelled = true; };
  }, [tierKey, currentTierKey]);

  if (!tier) return null;
  const baseBonus = Number(tier.base_bonus || 0);
  const changed = tierKey !== currentTierKey;
  const delta = currentBonus !== null ? baseBonus - currentBonus : null;

  return (
    <div className="payroll-tier-preview">
      <div className="payroll-tier-preview__row">
        <span className="payroll-tier-preview__label">Base bonus</span>
        <span className="payroll-tier-preview__value">+${baseBonus.toFixed(2)}/hr</span>
      </div>
      {tier.max_effective_rate !== null && (
        <div className="payroll-tier-preview__row">
          <span className="payroll-tier-preview__label">Max effective</span>
          <span className="payroll-tier-preview__value">${Number(tier.max_effective_rate).toFixed(0)}/hr</span>
        </div>
      )}
      {tier.description && (
        <p className="payroll-tier-preview__desc">{tier.description}</p>
      )}
      {changed && delta !== null && (
        <div className={`payroll-tier-preview__delta payroll-tier-preview__delta--${delta >= 0 ? 'up' : 'down'}`}>
          {delta >= 0 ? '↑' : '↓'} {delta >= 0 ? '+' : ''}${Math.abs(delta).toFixed(2)}/hr vs. current tier
        </div>
      )}
    </div>
  );
}
