// app/admin/my-pay/page.tsx — Employee "My Pay" page
'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { usePageError } from '../hooks/usePageError';
import UnderConstruction from '../components/messaging/UnderConstruction';
import BalanceCard from '../components/payroll/BalanceCard';
import PayStubView from '../components/payroll/PayStubView';
import CertificationsPanel from '../components/payroll/CertificationsPanel';
import RaiseHistory from '../components/payroll/RaiseHistory';
import PayRateTable from '../components/payroll/PayRateTable';
import { JOB_TITLES, formatCurrency, formatDate } from '../components/payroll/PayrollConstants';

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

export default function MyPayPage() {
  const { data: session } = useSession();
  const { safeFetch, safeAction, reportPageError } = usePageError('MyPayPage');
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [profileExists, setProfileExists] = useState(true);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'balance' | 'stubs' | 'certifications' | 'raises' | 'rates' | 'bank'>('balance');
  const [bankForm, setBankForm] = useState({
    bank_name: '',
    bank_routing_last4: '',
    bank_account_last4: '',
    bank_account_type: 'checking',
  });

  const email = session?.user?.email || '';
  const isAdmin = session?.user?.role === 'admin';

  useEffect(() => {
    if (email) loadProfile();
  }, [email]);

  async function loadProfile() {
    try {
      const res = await fetch(`/api/admin/payroll/employees?email=${email}`);
      const data = await res.json();
      setProfile(data.profile);
      setProfileExists(data.exists);
      if (data.profile) {
        setBankForm({
          bank_name: data.profile.bank_name || '',
          bank_routing_last4: data.profile.bank_routing_last4 || '',
          bank_account_last4: data.profile.bank_account_last4 || '',
          bank_account_type: data.profile.bank_account_type || 'checking',
        });
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load pay profile' });
    }
    setLoading(false);
  }

  async function saveBankInfo(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/payroll/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: email,
          user_name: session?.user?.name,
          ...bankForm,
        }),
      });
      if (res.ok) {
        loadProfile();
        alert('Bank information saved!');
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'save bank info' });
    }
  }

  if (loading) return <div className="payroll-page"><div className="payroll-loading">Loading your pay information...</div></div>;

  if (!profileExists || !profile) {
    return (
      <div className="payroll-page">
        <UnderConstruction feature="My Pay" description="View your earnings, pay stubs, certifications, and manage bank transfers." />
        <div className="payroll-empty-state">
          <div className="payroll-empty-state__icon">💰</div>
          <h2>Your pay profile hasn&apos;t been set up yet</h2>
          <p>Your admin will set up your pay profile with your job title, hourly rate, and other details. Once configured, you&apos;ll be able to see your earnings, pay stubs, and manage your bank account here.</p>
          <p>In the meantime, you can still link your bank account for future use.</p>

          <div className="payroll-bank-section">
            <h3>Link Bank Account</h3>
            <form className="payroll-bank-form" onSubmit={saveBankInfo}>
              <div className="payroll-form-row">
                <div className="payroll-form-group">
                  <label>Bank Name</label>
                  <input
                    value={bankForm.bank_name}
                    onChange={e => setBankForm(f => ({ ...f, bank_name: e.target.value }))}
                    placeholder="e.g. Chase Bank"
                  />
                </div>
                <div className="payroll-form-group">
                  <label>Account Type</label>
                  <select value={bankForm.bank_account_type} onChange={e => setBankForm(f => ({ ...f, bank_account_type: e.target.value }))}>
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                  </select>
                </div>
              </div>
              <div className="payroll-form-row">
                <div className="payroll-form-group">
                  <label>Routing Number (last 4)</label>
                  <input
                    maxLength={4}
                    value={bankForm.bank_routing_last4}
                    onChange={e => setBankForm(f => ({ ...f, bank_routing_last4: e.target.value }))}
                    placeholder="Last 4 digits"
                  />
                </div>
                <div className="payroll-form-group">
                  <label>Account Number (last 4)</label>
                  <input
                    maxLength={4}
                    value={bankForm.bank_account_last4}
                    onChange={e => setBankForm(f => ({ ...f, bank_account_last4: e.target.value }))}
                    placeholder="Last 4 digits"
                  />
                </div>
              </div>
              <p className="payroll-bank-form__note">
                For security, only the last 4 digits are stored. Full bank details will be configured through a secure payment provider in production.
              </p>
              <button type="submit" className="payroll-btn payroll-btn--primary">Save Bank Info</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const titleInfo = JOB_TITLES[profile.job_title] || { label: profile.job_title, icon: '👤' };

  return (
    <div className="payroll-page">
      <UnderConstruction feature="My Pay" description="View your earnings, pay stubs, certifications, and manage bank transfers." />

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
            <span className="payroll-my-header__stat-label">Available Balance</span>
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
          Bank Account
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
        <div className="payroll-bank-section">
          <h3>Bank Account</h3>
          {profile.bank_account_last4 ? (
            <div className="payroll-bank-current">
              <div className="payroll-bank-current__info">
                <span className="payroll-bank-current__icon">🏦</span>
                <div>
                  <div className="payroll-bank-current__name">{profile.bank_name || 'Bank Account'}</div>
                  <div className="payroll-bank-current__details">
                    ****{profile.bank_account_last4}
                    {profile.bank_verified ? ' (Verified)' : ' (Pending Verification)'}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <form className="payroll-bank-form" onSubmit={saveBankInfo}>
            <h4>{profile.bank_account_last4 ? 'Update' : 'Link'} Bank Account</h4>
            <div className="payroll-form-row">
              <div className="payroll-form-group">
                <label>Bank Name</label>
                <input
                  value={bankForm.bank_name}
                  onChange={e => setBankForm(f => ({ ...f, bank_name: e.target.value }))}
                  placeholder="e.g. Chase Bank"
                />
              </div>
              <div className="payroll-form-group">
                <label>Account Type</label>
                <select value={bankForm.bank_account_type} onChange={e => setBankForm(f => ({ ...f, bank_account_type: e.target.value }))}>
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                </select>
              </div>
            </div>
            <div className="payroll-form-row">
              <div className="payroll-form-group">
                <label>Routing Number (last 4)</label>
                <input
                  maxLength={4}
                  value={bankForm.bank_routing_last4}
                  onChange={e => setBankForm(f => ({ ...f, bank_routing_last4: e.target.value }))}
                  placeholder="Last 4 digits"
                />
              </div>
              <div className="payroll-form-group">
                <label>Account Number (last 4)</label>
                <input
                  maxLength={4}
                  value={bankForm.bank_account_last4}
                  onChange={e => setBankForm(f => ({ ...f, bank_account_last4: e.target.value }))}
                  placeholder="Last 4 digits"
                />
              </div>
            </div>
            <p className="payroll-bank-form__note">
              For security, only the last 4 digits are stored here. In production, a secure payment provider (like Stripe Connect or Gusto) would handle full bank details with proper encryption and compliance.
            </p>
            <button type="submit" className="payroll-btn payroll-btn--primary">Save Bank Info</button>
          </form>
        </div>
      )}
    </div>
  );
}
