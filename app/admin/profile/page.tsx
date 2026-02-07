// app/admin/profile/page.tsx — Employee profile with DB data, credentials, changes
'use client';
import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { usePageError } from '../hooks/usePageError';

interface Profile {
  user_name: string; job_title: string; hire_date: string | null;
  hourly_rate: number; is_active: boolean; available_balance: number;
}
interface Cert { id: string; certification_name: string; certification_type: string; issued_date: string; expiry_date: string | null; pay_bump_amount: number; }
interface ProfileChange { change_type: string; title: string; description: string; old_value: string; new_value: string; created_at: string; }
interface LearningCredit { entity_label: string; points_earned: number; earned_at: string; }

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString() : '—';
const fmtCurrency = (n: number) => '$' + (n || 0).toFixed(2);

type Tab = 'info' | 'credentials' | 'credits' | 'changes';

export default function ProfilePage() {
  const { data: session } = useSession();
  const { safeFetch, reportPageError } = usePageError('ProfilePage');
  const email = session?.user?.email || '';

  const [profile, setProfile] = useState<Profile | null>(null);
  const [certs, setCerts] = useState<Cert[]>([]);
  const [changes, setChanges] = useState<ProfileChange[]>([]);
  const [credits, setCredits] = useState<LearningCredit[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('info');

  useEffect(() => {
    if (!email) return;
    loadProfile();
  }, [email]);

  async function loadProfile() {
    try {
      setLoading(true);
      const profileData = await safeFetch<{ profile: Profile; certifications: Cert[]; exists: boolean }>(
        `/api/admin/payroll/employees?email=${encodeURIComponent(email)}`
      );
      if (profileData?.profile) {
        setProfile(profileData.profile);
        setCerts(profileData.certifications || []);
      }

      // Load profile changes and learning credits from employee-accessible endpoint
      try {
        const myData = await safeFetch<{ profile_changes: ProfileChange[]; employee_credits: LearningCredit[]; total_points: number }>(
          '/api/admin/profile/changes'
        );
        if (myData) {
          setChanges(myData.profile_changes || []);
          setCredits(myData.employee_credits || []);
          setTotalPoints(myData.total_points || 0);
        }
      } catch { /* ignore */ }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error('Load failed'));
    } finally {
      setLoading(false);
    }
  }

  if (!session?.user) return null;
  const { name, image, role } = session.user;

  if (loading) return <div className="tl-loading">Loading profile...</div>;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: 'Profile' },
    { key: 'credentials', label: 'Credentials' },
    { key: 'credits', label: 'Learning Credits' },
    { key: 'changes', label: 'Recent Changes' },
  ];

  return (
    <div style={{ maxWidth: '700px' }}>
      {/* Header card */}
      <div className="admin-card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          {image ? (
            <img src={image} alt={name || 'User'} style={{ width: 64, height: 64, borderRadius: '50%', border: '3px solid #E5E7EB' }} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#BD1218', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Sora,sans-serif', fontSize: '1.25rem', fontWeight: 700 }}>
              {(name || 'U').charAt(0)}
            </div>
          )}
          <div>
            <div style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.2rem', fontWeight: 700, color: '#0F1419' }}>{name}</div>
            <div style={{ fontFamily: 'Inter,sans-serif', fontSize: '.85rem', color: '#6B7280' }}>{email}</div>
            <span className={`admin-topbar__role-badge admin-topbar__role-badge--${role}`} style={{ display: 'inline-flex', marginTop: '0.25rem' }}>{role}</span>
          </div>
        </div>
        {profile && (
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div><span style={{ fontSize: '0.75rem', color: '#9CA3AF', display: 'block' }}>HOURLY RATE</span><span style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700, color: '#1D3095' }}>{fmtCurrency(profile.hourly_rate)}/hr</span></div>
            <div><span style={{ fontSize: '0.75rem', color: '#9CA3AF', display: 'block' }}>LEARNING CREDITS</span><span style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700, color: '#1D3095' }}>{totalPoints}</span></div>
            <div><span style={{ fontSize: '0.75rem', color: '#9CA3AF', display: 'block' }}>CREDENTIALS</span><span style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700, color: '#1D3095' }}>{certs.length}</span></div>
            {profile.hire_date && <div><span style={{ fontSize: '0.75rem', color: '#9CA3AF', display: 'block' }}>HIRE DATE</span><span style={{ fontSize: '0.9rem', color: '#374151' }}>{fmtDate(profile.hire_date)}</span></div>}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="emp-manage__tabs">
        {tabs.map(t => (
          <button key={t.key} className={`emp-manage__tab ${tab === t.key ? 'emp-manage__tab--active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Profile Info */}
      {tab === 'info' && (
        <div className="admin-card">
          <div className="emp-manage__field"><label>Name</label><span>{profile?.user_name || name || '—'}</span></div>
          <div className="emp-manage__field"><label>Email</label><span>{email}</span></div>
          <div className="emp-manage__field"><label>Role</label><span>{profile?.job_title || role}</span></div>
          <div className="emp-manage__field"><label>Authentication</label><span>Google Workspace (@starr-surveying.com)</span></div>
          <div className="emp-manage__field"><label>Status</label><span style={{ color: profile?.is_active !== false ? '#059669' : '#EF4444' }}>{profile?.is_active !== false ? 'Active' : 'Inactive'}</span></div>
          {profile?.available_balance !== undefined && (
            <div className="emp-manage__field"><label>Available Balance</label><span>{fmtCurrency(profile.available_balance)}</span></div>
          )}
        </div>
      )}

      {/* Credentials */}
      {tab === 'credentials' && (
        <div className="admin-card">
          {certs.length === 0 ? (
            <div className="emp-manage__empty">No credentials on file yet. Your admin can assign credentials to your profile.</div>
          ) : (
            <div className="emp-manage__cred-list">
              {certs.map(c => (
                <div key={c.id} className="emp-manage__cred-item">
                  <div className="emp-manage__cred-info">
                    <span className="emp-manage__cred-name">{c.certification_name}</span>
                    <span className="emp-manage__cred-type">{c.certification_type}</span>
                  </div>
                  <div className="emp-manage__cred-details">
                    <span>Issued: {fmtDate(c.issued_date)}</span>
                    {c.expiry_date && <span>Expires: {fmtDate(c.expiry_date)}</span>}
                    {c.pay_bump_amount > 0 && <span className="emp-manage__cred-bonus">+{fmtCurrency(c.pay_bump_amount)}/hr</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Learning Credits */}
      {tab === 'credits' && (
        <div className="admin-card">
          <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: '#374151' }}>
            Total Learning Credits: <strong style={{ color: '#1D3095' }}>{totalPoints}</strong>
          </div>
          {credits.length === 0 ? (
            <div className="emp-manage__empty">No learning credits earned yet. Complete modules, quizzes, and lessons to earn credits.</div>
          ) : (
            <div className="emp-manage__credit-list">
              {credits.slice(0, 30).map((lc, i) => (
                <div key={i} className="emp-manage__credit-item">
                  <span className="emp-manage__credit-points">+{lc.points_earned}</span>
                  <div className="emp-manage__credit-info">
                    <span className="emp-manage__credit-label">{lc.entity_label || 'Learning Activity'}</span>
                    <span className="emp-manage__credit-meta">{fmtDate(lc.earned_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent Changes */}
      {tab === 'changes' && (
        <div className="admin-card">
          {changes.length === 0 ? (
            <div className="emp-manage__empty">No recent profile changes.</div>
          ) : (
            <div className="emp-manage__changelog">
              {changes.map((pc, i) => (
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
                      {pc.old_value && pc.new_value && <span>&rarr;</span>}
                      {pc.new_value && <span className="emp-manage__change-new">{pc.new_value}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
