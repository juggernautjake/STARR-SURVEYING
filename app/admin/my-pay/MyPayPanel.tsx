'use client';
// app/admin/my-pay/MyPayPanel.tsx
//
// Extracted body of /admin/my-pay for reuse in the Hub at
// /admin/me?tab=pay (admin-nav redesign Phase 2 slice 2b/5).

import '../styles/AdminPayroll.css';

import { useSession } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';
import { Wallet } from 'lucide-react';
import { usePageError } from '../hooks/usePageError';
import BalanceCard from '../components/payroll/BalanceCard';
import MyOwedAndPayouts from '../components/payroll/MyOwedAndPayouts';
import MyPayoutMethod from '../components/payouts/MyPayoutMethod';
import PayStubView from '../components/payroll/PayStubView';
import CertificationsPanel from '../components/payroll/CertificationsPanel';
import RaiseHistory from '../components/payroll/RaiseHistory';
import PayRateTable from '../components/payroll/PayRateTable';
import { formatCurrency, formatDate } from '../components/payroll/PayrollConstants';
import { useJobTitles } from '../components/payroll/useJobTitles';

interface EmployeeProfile {
  id: string;
  user_email: string;
  user_name: string;
  job_title: string;
  hourly_rate: number;
  salary_type: string;
  pay_frequency: string;
  hire_date: string | null;
  available_balance: number;
  total_earned: number;
  total_withdrawn: number;
  bank_name: string | null;
  bank_account_last4: string | null;
  bank_verified: boolean;
}

export default function MyPayPanel() {
  const { data: session } = useSession();
  const { safeFetch, safeAction, reportPageError } = usePageError('MyPayPage');
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [profileExists, setProfileExists] = useState(true);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'balance' | 'stubs' | 'certifications' | 'raises' | 'rates' | 'bank'>('balance');

  const email = session?.user?.email || '';
  const isAdmin = session?.user?.roles?.includes('admin') ?? false;
  const jobTitles = useJobTitles();

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/payroll/employees?email=${email}`);
      const data = await res.json();
      setProfile(data.profile);
      setProfileExists(data.exists);
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load pay profile' });
    }
    setLoading(false);
  }, [email, reportPageError]);

  useEffect(() => {
    if (email) loadProfile();
  }, [email, loadProfile]);


  if (loading) return <div className="payroll-page"><div className="payroll-loading">Loading your pay information...</div></div>;

  if (!profileExists || !profile) {
    return (
      <div className="payroll-page">
        <div className="payroll-empty-state">
          <div className="payroll-empty-state__icon"><Wallet size={36} strokeWidth={1.5} /></div>
          <h2>Your pay profile hasn&apos;t been set up yet</h2>
          <p>Your admin will set up your pay profile with your job title, hourly rate, and other details. Once configured, you&apos;ll be able to see your earnings, pay stubs, and manage your bank account here.</p>
          <p>In the meantime, you can choose how you want to be paid.</p>
          {/* 2026-10-11: the real chooser — full bank details stored encrypted, Venmo/Cash App/Zelle, checks,
              cash — replaced a form that kept only the last four digits and could never pay anyone. */}
          <MyPayoutMethod />
        </div>
      </div>
    );
  }

  const titleInfo = jobTitles[profile.job_title] || { label: profile.job_title, icon: '👤' };

  return (
    <div className="payroll-page">

      {/* What you are owed, and what you have been paid — read from the same endpoints the
          approval queue uses, so the two cannot disagree. Mounted FIRST because it is the
          question somebody opens this page to answer. */}
      <MyOwedAndPayouts email={email} />

      {/* Pay Summary Header */}
      <div className="payroll-my-header">
        <div className="payroll-my-header__info">
          <span className="payroll-my-header__icon">{titleInfo.icon}</span>
          <div>
            <h2 className="payroll-my-header__name">{profile.user_name || email.split('@')[0]}</h2>
            <p className="payroll-my-header__title">{titleInfo.label}</p>
          </div>
        </div>
        <div className="payroll-my-header__stats">
          <div className="payroll-my-header__stat">
            <span className="payroll-my-header__stat-label">Current Rate</span>
            <span className="payroll-my-header__stat-value">{formatCurrency(profile.hourly_rate)}/hr</span>
          </div>
          <div className="payroll-my-header__stat">
            <span className="payroll-my-header__stat-label">Withdrawal balance</span>
            <span className="payroll-my-header__stat-value payroll-my-header__stat-value--balance">
              {formatCurrency(profile.available_balance)}
            </span>
          </div>
          <div className="payroll-my-header__stat">
            <span className="payroll-my-header__stat-label">Total Earned</span>
            <span className="payroll-my-header__stat-value">{formatCurrency(profile.total_earned)}</span>
          </div>
          {profile.hire_date && (
            <div className="payroll-my-header__stat">
              <span className="payroll-my-header__stat-label">Since</span>
              <span className="payroll-my-header__stat-value">{formatDate(profile.hire_date)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="payroll-tabs">
        <button className={`payroll-tabs__btn ${activeTab === 'balance' ? 'payroll-tabs__btn--active' : ''}`} onClick={() => setActiveTab('balance')}>
          Balance & Transfers
        </button>
        <button className={`payroll-tabs__btn ${activeTab === 'stubs' ? 'payroll-tabs__btn--active' : ''}`} onClick={() => setActiveTab('stubs')}>
          Pay Stubs
        </button>
        <button className={`payroll-tabs__btn ${activeTab === 'certifications' ? 'payroll-tabs__btn--active' : ''}`} onClick={() => setActiveTab('certifications')}>
          Certifications
        </button>
        <button className={`payroll-tabs__btn ${activeTab === 'raises' ? 'payroll-tabs__btn--active' : ''}`} onClick={() => setActiveTab('raises')}>
          Raise History
        </button>
        <button className={`payroll-tabs__btn ${activeTab === 'rates' ? 'payroll-tabs__btn--active' : ''}`} onClick={() => setActiveTab('rates')}>
          Pay Rates
        </button>
        <button className={`payroll-tabs__btn ${activeTab === 'bank' ? 'payroll-tabs__btn--active' : ''}`} onClick={() => setActiveTab('bank')}>
          How I get paid
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'balance' && (
        <BalanceCard email={email} isAdmin={isAdmin} isSelf={true} />
      )}

      {activeTab === 'stubs' && (
        <PayStubView email={email} />
      )}

      {activeTab === 'certifications' && (
        <CertificationsPanel email={email} isAdmin={isAdmin} onCertChanged={loadProfile} />
      )}

      {activeTab === 'raises' && (
        <RaiseHistory email={email} isAdmin={isAdmin} />
      )}

      {activeTab === 'rates' && (
        <PayRateTable isAdmin={false} />
      )}

      {activeTab === 'bank' && (
        // How I get paid (2026-10-11) — replaces the last-four-digits form, which stored nothing payable.
        <MyPayoutMethod />
      )}
    </div>
  );
}
