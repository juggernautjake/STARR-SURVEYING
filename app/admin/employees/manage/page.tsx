// app/admin/employees/manage/page.tsx — Admin employee management detail page
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { usePageError } from '../../hooks/usePageError';

interface Profile {
  user_email: string; user_name: string; job_title: string; hire_date: string;
  hourly_rate: number; salary_type: string; is_active: boolean;
  available_balance: number; total_earned: number;
}
interface RoleTier { role_key: string; label: string; base_bonus: number; description: string; sort_order: number; }
interface EarnedCred { credential_key: string; earned_date: string; verified: boolean; notes: string; }
interface CredBonus { credential_key: string; label: string; bonus_per_hour: number; credential_type: string; description: string; }
interface RoleHistoryEntry { old_role: string; new_role: string; reason: string; effective_date: string; changed_by: string; pay_impact: number; created_at: string; }
interface LearningCredit { entity_label: string; points_earned: number; earned_at: string; source_type: string; awarded_by: string; }
interface ProfileChange { change_type: string; title: string; description: string; old_value: string; new_value: string; changed_by: string; created_at: string; }
interface SeniorityBracket { min_years: number; max_years: number | null; bonus_per_hour: number; label: string; }

type Tab = 'overview' | 'credentials' | 'pay' | 'learning' | 'history';

function fmtCurrency(n: number) { return '$' + n.toFixed(2); }
function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString() : '—'; }

export default function EmployeeManagePage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const { safeFetch, reportPageError } = usePageError('EmployeeManagePage');

  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roleTiers, setRoleTiers] = useState<RoleTier[]>([]);
  const [earnedCreds, setEarnedCreds] = useState<EarnedCred[]>([]);
  const [credBonuses, setCredBonuses] = useState<CredBonus[]>([]);
  const [roleHistory, setRoleHistory] = useState<RoleHistoryEntry[]>([]);
  const [learningCredits, setLearningCredits] = useState<LearningCredit[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [profileChanges, setProfileChanges] = useState<ProfileChange[]>([]);
  const [seniorityBrackets, setSeniorityBrackets] = useState<SeniorityBracket[]>([]);
  const [yearsEmployed, setYearsEmployed] = useState(0);

  // Form states
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [roleForm, setRoleForm] = useState({ new_role: '', new_tier: '', reason: '' });
  const [showCredForm, setShowCredForm] = useState(false);
  const [credForm, setCredForm] = useState({ credential_key: '', notes: '' });
  const [showRaiseForm, setShowRaiseForm] = useState(false);
  const [raiseForm, setRaiseForm] = useState({ raise_amount: '', reason: '' });
  const [showBonusForm, setShowBonusForm] = useState(false);
  const [bonusForm, setBonusForm] = useState({ amount: '', bonus_type: 'performance_bonus', reason: '' });
  const [showCreditForm, setShowCreditForm] = useState(false);
  const [creditForm, setCreditForm] = useState({ points: '', reason: '' });
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!email) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/employees/manage?email=${encodeURIComponent(email)}`);
      if (!res.ok) throw new Error('Failed to load employee data');
      const data = await res.json();
      setProfile(data.profile);
      setRoleTiers(data.role_tiers || []);
      setEarnedCreds(data.earned_credentials || []);
      setCredBonuses(data.credential_bonuses || []);
      setRoleHistory(data.role_history || []);
      setLearningCredits(data.learning_credits || []);
      setTotalPoints(data.total_points || 0);
      setProfileChanges(data.profile_changes || []);
      setSeniorityBrackets(data.seniority_brackets || []);
      setYearsEmployed(data.years_employed || 0);
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error('Load failed'));
    } finally {
      setLoading(false);
    }
  }, [email, reportPageError]);

  useEffect(() => { loadData(); }, [loadData]);

  const doAction = async (action: string, payload: Record<string, unknown>) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/employees/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, email, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Action failed'); return; }
      await loadData();
      return data;
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error('Action failed'));
    } finally {
      setActionLoading(false);
    }
  };

  if (!email) return <div className="tl-loading">No employee email specified. Use ?email=...</div>;
  if (!session?.user?.email || session.user.role !== 'admin') return <div className="tl-loading">Admin access required</div>;
  if (loading) return <div className="tl-loading">Loading employee data...</div>;
  if (!profile) return <div className="tl-loading">Employee profile not found for {email}</div>;

  const currentTier = roleTiers.find((t) => t.role_key === profile.job_title);
  const senBracket = seniorityBrackets.find((b) => yearsEmployed >= b.min_years && (b.max_years === null || yearsEmployed <= b.max_years));
  const credBonus = earnedCreds.reduce((s, ec) => {
    const cb = credBonuses.find((c) => c.credential_key === ec.credential_key);
    return s + (cb?.bonus_per_hour || 0);
  }, 0);
  const unearnedCreds = credBonuses.filter((cb) => !earnedCreds.some((ec) => ec.credential_key === cb.credential_key));

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: '📋' },
    { key: 'credentials', label: 'Credentials', icon: '🏅' },
    { key: 'pay', label: 'Pay & Bonuses', icon: '💰' },
    { key: 'learning', label: 'Learning Credits', icon: '🎓' },
    { key: 'history', label: 'Change Log', icon: '📜' },
  ];

  return (
    <div className="emp-manage">
      {/* Header */}
      <div className="emp-manage__header">
        <div className="emp-manage__header-info">
          <h2 className="emp-manage__name">{profile.user_name || email}</h2>
          <div className="emp-manage__meta">
            <span className="emp-manage__email">{email}</span>
            <span className="emp-manage__badge">{currentTier?.label || profile.job_title}</span>
            <span className={`emp-manage__status ${profile.is_active ? 'emp-manage__status--active' : 'emp-manage__status--inactive'}`}>
              {profile.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
        <div className="emp-manage__header-stats">
          <div className="emp-manage__stat">
            <span className="emp-manage__stat-val">{fmtCurrency(profile.hourly_rate || 0)}/hr</span>
            <span className="emp-manage__stat-lbl">Base Rate</span>
          </div>
          <div className="emp-manage__stat">
            <span className="emp-manage__stat-val">{yearsEmployed}yr</span>
            <span className="emp-manage__stat-lbl">Seniority</span>
          </div>
          <div className="emp-manage__stat">
            <span className="emp-manage__stat-val">{totalPoints}</span>
            <span className="emp-manage__stat-lbl">Credits</span>
          </div>
          <div className="emp-manage__stat">
            <span className="emp-manage__stat-val">{earnedCreds.length}</span>
            <span className="emp-manage__stat-lbl">Credentials</span>
          </div>
        </div>
      </div>

      {/* Effective Rate Breakdown */}
      <div className="emp-manage__rate-card">
        <h3>Effective Hourly Rate Breakdown</h3>
        <div className="emp-manage__rate-rows">
          <div className="emp-manage__rate-row"><span>Base Rate</span><span>{fmtCurrency(profile.hourly_rate || 0)}</span></div>
          <div className="emp-manage__rate-row"><span>Role Tier ({currentTier?.label || '—'})</span><span>+{fmtCurrency(currentTier?.base_bonus || 0)}</span></div>
          <div className="emp-manage__rate-row"><span>Seniority ({senBracket?.label || '—'})</span><span>+{fmtCurrency(senBracket?.bonus_per_hour || 0)}</span></div>
          <div className="emp-manage__rate-row"><span>Credentials ({earnedCreds.length})</span><span>+{fmtCurrency(credBonus)}</span></div>
          <div className="emp-manage__rate-row emp-manage__rate-row--total">
            <span>Effective Rate</span>
            <span>{fmtCurrency((profile.hourly_rate || 0) + (currentTier?.base_bonus || 0) + (senBracket?.bonus_per_hour || 0) + credBonus)}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="emp-manage__tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`emp-manage__tab ${tab === t.key ? 'emp-manage__tab--active' : ''}`} onClick={() => setTab(t.key)}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="emp-manage__section">
          <div className="emp-manage__grid">
            <div className="emp-manage__card">
              <h4>Profile Info</h4>
              <div className="emp-manage__field"><label>Name</label><span>{profile.user_name || '—'}</span></div>
              <div className="emp-manage__field"><label>Email</label><span>{email}</span></div>
              <div className="emp-manage__field"><label>Role</label><span>{currentTier?.label || profile.job_title}</span></div>
              <div className="emp-manage__field"><label>Hire Date</label><span>{fmtDate(profile.hire_date)}</span></div>
              <div className="emp-manage__field"><label>Seniority</label><span>{yearsEmployed} years ({senBracket?.label || '—'})</span></div>
            </div>
            <div className="emp-manage__card">
              <h4>Quick Actions</h4>
              <div className="emp-manage__actions">
                <button className="emp-manage__action-btn" onClick={() => setShowRoleForm(true)}>Change Role</button>
                <button className="emp-manage__action-btn" onClick={() => setShowCredForm(true)}>Grant Credential</button>
                <button className="emp-manage__action-btn" onClick={() => setShowRaiseForm(true)}>Give Pay Raise</button>
                <button className="emp-manage__action-btn" onClick={() => setShowBonusForm(true)}>Award Bonus</button>
                <button className="emp-manage__action-btn" onClick={() => setShowCreditForm(true)}>Award Credits</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Credentials Tab */}
      {tab === 'credentials' && (
        <div className="emp-manage__section">
          <div className="emp-manage__section-header">
            <h3>Earned Credentials</h3>
            <button className="emp-manage__btn" onClick={() => setShowCredForm(true)}>+ Grant Credential</button>
          </div>
          {earnedCreds.length === 0 ? (
            <div className="emp-manage__empty">No credentials earned yet</div>
          ) : (
            <div className="emp-manage__cred-list">
              {earnedCreds.map((ec) => {
                const info = credBonuses.find((c) => c.credential_key === ec.credential_key);
                return (
                  <div key={ec.credential_key} className="emp-manage__cred-item">
                    <div className="emp-manage__cred-info">
                      <span className="emp-manage__cred-name">{info?.label || ec.credential_key}</span>
                      <span className="emp-manage__cred-type">{info?.credential_type || ''}</span>
                    </div>
                    <div className="emp-manage__cred-details">
                      <span>Earned: {fmtDate(ec.earned_date)}</span>
                      {info && info.bonus_per_hour > 0 && <span className="emp-manage__cred-bonus">+{fmtCurrency(info.bonus_per_hour)}/hr</span>}
                      {ec.verified && <span className="emp-manage__cred-verified">Verified</span>}
                    </div>
                    <button className="emp-manage__cred-remove" onClick={() => doAction('remove_credential', { credential_key: ec.credential_key })} disabled={actionLoading}>Remove</button>
                  </div>
                );
              })}
            </div>
          )}
          {unearnedCreds.length > 0 && (
            <>
              <h4 style={{ marginTop: '1.5rem', color: '#6B7280', fontSize: '0.9rem' }}>Available Credentials</h4>
              <div className="emp-manage__cred-list emp-manage__cred-list--available">
                {unearnedCreds.map((cb) => (
                  <div key={cb.credential_key} className="emp-manage__cred-item emp-manage__cred-item--available">
                    <div className="emp-manage__cred-info">
                      <span className="emp-manage__cred-name">{cb.label}</span>
                      <span className="emp-manage__cred-type">{cb.credential_type}</span>
                    </div>
                    <div className="emp-manage__cred-details">
                      <span>{cb.description}</span>
                      {cb.bonus_per_hour > 0 && <span className="emp-manage__cred-bonus">+{fmtCurrency(cb.bonus_per_hour)}/hr</span>}
                    </div>
                    <button className="emp-manage__btn emp-manage__btn--sm" onClick={() => doAction('grant_credential', { credential_key: cb.credential_key })} disabled={actionLoading}>Grant</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Pay & Bonuses Tab */}
      {tab === 'pay' && (
        <div className="emp-manage__section">
          <div className="emp-manage__section-header">
            <h3>Pay Management</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="emp-manage__btn" onClick={() => setShowRaiseForm(true)}>+ Pay Raise</button>
              <button className="emp-manage__btn" onClick={() => setShowBonusForm(true)}>+ Bonus</button>
            </div>
          </div>
          <div className="emp-manage__card">
            <h4>Role History</h4>
            {roleHistory.length === 0 ? (
              <div className="emp-manage__empty">No role changes recorded</div>
            ) : (
              roleHistory.map((rh, i) => (
                <div key={i} className="emp-manage__history-item">
                  <div className="emp-manage__history-main">
                    <span className="emp-manage__history-title">{rh.old_role} → {rh.new_role}</span>
                    {rh.pay_impact !== 0 && (
                      <span className={`emp-manage__history-impact ${rh.pay_impact > 0 ? 'emp-manage__history-impact--pos' : 'emp-manage__history-impact--neg'}`}>
                        {rh.pay_impact > 0 ? '+' : ''}{fmtCurrency(rh.pay_impact)}/hr
                      </span>
                    )}
                  </div>
                  <div className="emp-manage__history-meta">
                    <span>{rh.reason}</span>
                    <span>{fmtDate(rh.effective_date)} by {rh.changed_by}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Learning Credits Tab */}
      {tab === 'learning' && (
        <div className="emp-manage__section">
          <div className="emp-manage__section-header">
            <h3>Learning Credits: {totalPoints} total</h3>
            <button className="emp-manage__btn" onClick={() => setShowCreditForm(true)}>+ Award Credits</button>
          </div>
          {learningCredits.length === 0 ? (
            <div className="emp-manage__empty">No credits earned yet</div>
          ) : (
            <div className="emp-manage__credit-list">
              {learningCredits.map((lc, i) => (
                <div key={i} className="emp-manage__credit-item">
                  <span className="emp-manage__credit-points">+{lc.points_earned}</span>
                  <div className="emp-manage__credit-info">
                    <span className="emp-manage__credit-label">{lc.entity_label || lc.source_type}</span>
                    <span className="emp-manage__credit-meta">{fmtDate(lc.earned_at)} {lc.awarded_by ? `by ${lc.awarded_by}` : '(auto)'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Change Log Tab */}
      {tab === 'history' && (
        <div className="emp-manage__section">
          <h3>Profile Change History</h3>
          {profileChanges.length === 0 ? (
            <div className="emp-manage__empty">No changes recorded</div>
          ) : (
            <div className="emp-manage__changelog">
              {profileChanges.map((pc, i) => (
                <div key={i} className="emp-manage__change-item">
                  <div className="emp-manage__change-header">
                    <span className={`emp-manage__change-type emp-manage__change-type--${pc.change_type}`}>
                      {pc.change_type.replace(/_/g, ' ')}
                    </span>
                    <span className="emp-manage__change-date">{new Date(pc.created_at).toLocaleString()}</span>
                  </div>
                  <div className="emp-manage__change-title">{pc.title}</div>
                  {pc.description && <div className="emp-manage__change-desc">{pc.description}</div>}
                  {(pc.old_value || pc.new_value) && (
                    <div className="emp-manage__change-values">
                      {pc.old_value && <span className="emp-manage__change-old">{pc.old_value}</span>}
                      {pc.old_value && pc.new_value && <span>→</span>}
                      {pc.new_value && <span className="emp-manage__change-new">{pc.new_value}</span>}
                    </div>
                  )}
                  <div className="emp-manage__change-by">by {pc.changed_by}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {/* Role Change Modal */}
      {showRoleForm && (
        <div className="emp-manage__modal-overlay" onClick={() => setShowRoleForm(false)}>
          <div className="emp-manage__modal" onClick={(e) => e.stopPropagation()}>
            <h3>Change Role</h3>
            <div className="emp-manage__form-field">
              <label>New Role</label>
              <select value={roleForm.new_tier} onChange={(e) => {
                const tier = roleTiers.find((t) => t.role_key === e.target.value);
                setRoleForm({ ...roleForm, new_role: tier?.label || e.target.value, new_tier: e.target.value });
              }}>
                <option value="">Select role...</option>
                {roleTiers.map((t) => <option key={t.role_key} value={t.role_key}>{t.label} (+{fmtCurrency(t.base_bonus)}/hr)</option>)}
              </select>
            </div>
            <div className="emp-manage__form-field">
              <label>Reason</label>
              <textarea value={roleForm.reason} onChange={(e) => setRoleForm({ ...roleForm, reason: e.target.value })} placeholder="e.g. Passed SIT exam, promoted based on performance..." />
            </div>
            <div className="emp-manage__modal-actions">
              <button className="emp-manage__btn emp-manage__btn--cancel" onClick={() => setShowRoleForm(false)}>Cancel</button>
              <button className="emp-manage__btn emp-manage__btn--primary" disabled={!roleForm.new_tier || !roleForm.reason || actionLoading}
                onClick={async () => { await doAction('change_role', roleForm); setShowRoleForm(false); setRoleForm({ new_role: '', new_tier: '', reason: '' }); }}>
                Apply Role Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grant Credential Modal */}
      {showCredForm && (
        <div className="emp-manage__modal-overlay" onClick={() => setShowCredForm(false)}>
          <div className="emp-manage__modal" onClick={(e) => e.stopPropagation()}>
            <h3>Grant Credential</h3>
            <div className="emp-manage__form-field">
              <label>Credential</label>
              <select value={credForm.credential_key} onChange={(e) => setCredForm({ ...credForm, credential_key: e.target.value })}>
                <option value="">Select credential...</option>
                {unearnedCreds.map((c) => <option key={c.credential_key} value={c.credential_key}>{c.label} (+{fmtCurrency(c.bonus_per_hour)}/hr)</option>)}
              </select>
            </div>
            <div className="emp-manage__form-field">
              <label>Notes (optional)</label>
              <input value={credForm.notes} onChange={(e) => setCredForm({ ...credForm, notes: e.target.value })} placeholder="e.g. Exam passed on 2026-01-15" />
            </div>
            <div className="emp-manage__modal-actions">
              <button className="emp-manage__btn emp-manage__btn--cancel" onClick={() => setShowCredForm(false)}>Cancel</button>
              <button className="emp-manage__btn emp-manage__btn--primary" disabled={!credForm.credential_key || actionLoading}
                onClick={async () => { await doAction('grant_credential', credForm); setShowCredForm(false); setCredForm({ credential_key: '', notes: '' }); }}>
                Grant Credential
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Raise Modal */}
      {showRaiseForm && (
        <div className="emp-manage__modal-overlay" onClick={() => setShowRaiseForm(false)}>
          <div className="emp-manage__modal" onClick={(e) => e.stopPropagation()}>
            <h3>Apply Pay Raise</h3>
            <p style={{ fontSize: '0.85rem', color: '#6B7280' }}>Current rate: {fmtCurrency(profile.hourly_rate || 0)}/hr</p>
            <div className="emp-manage__form-field">
              <label>Raise Amount ($/hr)</label>
              <input type="number" step="0.25" min="0.25" value={raiseForm.raise_amount} onChange={(e) => setRaiseForm({ ...raiseForm, raise_amount: e.target.value })} placeholder="e.g. 1.50" />
            </div>
            <div className="emp-manage__form-field">
              <label>Reason</label>
              <textarea value={raiseForm.reason} onChange={(e) => setRaiseForm({ ...raiseForm, reason: e.target.value })} placeholder="e.g. Annual performance review, milestone reached..." />
            </div>
            {raiseForm.raise_amount && <p style={{ fontSize: '0.85rem', color: '#059669' }}>New rate: {fmtCurrency((profile.hourly_rate || 0) + parseFloat(raiseForm.raise_amount || '0'))}/hr</p>}
            <div className="emp-manage__modal-actions">
              <button className="emp-manage__btn emp-manage__btn--cancel" onClick={() => setShowRaiseForm(false)}>Cancel</button>
              <button className="emp-manage__btn emp-manage__btn--primary" disabled={!raiseForm.raise_amount || !raiseForm.reason || actionLoading}
                onClick={async () => { await doAction('pay_raise', { raise_amount: parseFloat(raiseForm.raise_amount), reason: raiseForm.reason }); setShowRaiseForm(false); setRaiseForm({ raise_amount: '', reason: '' }); }}>
                Apply Raise
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Award Bonus Modal */}
      {showBonusForm && (
        <div className="emp-manage__modal-overlay" onClick={() => setShowBonusForm(false)}>
          <div className="emp-manage__modal" onClick={(e) => e.stopPropagation()}>
            <h3>Award Bonus</h3>
            <div className="emp-manage__form-field">
              <label>Amount ($)</label>
              <input type="number" step="1" min="1" value={bonusForm.amount} onChange={(e) => setBonusForm({ ...bonusForm, amount: e.target.value })} placeholder="e.g. 100" />
            </div>
            <div className="emp-manage__form-field">
              <label>Type</label>
              <select value={bonusForm.bonus_type} onChange={(e) => setBonusForm({ ...bonusForm, bonus_type: e.target.value })}>
                <option value="performance_bonus">Performance</option>
                <option value="holiday_bonus">Holiday</option>
                <option value="spot_bonus">Spot Bonus</option>
                <option value="education_bonus">Education</option>
                <option value="referral_bonus">Referral</option>
                <option value="retention_bonus">Retention</option>
                <option value="completion_bonus">Completion</option>
              </select>
            </div>
            <div className="emp-manage__form-field">
              <label>Reason</label>
              <textarea value={bonusForm.reason} onChange={(e) => setBonusForm({ ...bonusForm, reason: e.target.value })} placeholder="e.g. Christmas bonus, completed major project..." />
            </div>
            <div className="emp-manage__modal-actions">
              <button className="emp-manage__btn emp-manage__btn--cancel" onClick={() => setShowBonusForm(false)}>Cancel</button>
              <button className="emp-manage__btn emp-manage__btn--primary" disabled={!bonusForm.amount || !bonusForm.reason || actionLoading}
                onClick={async () => { await doAction('award_bonus', { amount: parseFloat(bonusForm.amount), bonus_type: bonusForm.bonus_type, reason: bonusForm.reason }); setShowBonusForm(false); setBonusForm({ amount: '', bonus_type: 'performance_bonus', reason: '' }); }}>
                Award Bonus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Award Credits Modal */}
      {showCreditForm && (
        <div className="emp-manage__modal-overlay" onClick={() => setShowCreditForm(false)}>
          <div className="emp-manage__modal" onClick={(e) => e.stopPropagation()}>
            <h3>Award Learning Credits</h3>
            <div className="emp-manage__form-field">
              <label>Points</label>
              <input type="number" min="1" value={creditForm.points} onChange={(e) => setCreditForm({ ...creditForm, points: e.target.value })} placeholder="e.g. 25" />
            </div>
            <div className="emp-manage__form-field">
              <label>Reason</label>
              <textarea value={creditForm.reason} onChange={(e) => setCreditForm({ ...creditForm, reason: e.target.value })} placeholder="e.g. Completed field safety training, passed boundary law module..." />
            </div>
            <div className="emp-manage__modal-actions">
              <button className="emp-manage__btn emp-manage__btn--cancel" onClick={() => setShowCreditForm(false)}>Cancel</button>
              <button className="emp-manage__btn emp-manage__btn--primary" disabled={!creditForm.points || !creditForm.reason || actionLoading}
                onClick={async () => { await doAction('award_credits', { points: parseInt(creditForm.points), credit_reason: creditForm.reason }); setShowCreditForm(false); setCreditForm({ points: '', reason: '' }); }}>
                Award Credits
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
