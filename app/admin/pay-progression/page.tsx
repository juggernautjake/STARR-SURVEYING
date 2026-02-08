// app/admin/pay-progression/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface WorkTypeRate {
  work_type: string;
  base_rate: number;
  icon: string;
  label: string;
}

interface RoleTier {
  role_key: string;
  label: string;
  base_bonus: number;
}

interface SeniorityBracket {
  min_years: number;
  max_years: number | null;
  bonus_per_hour: number;
  label: string;
}

interface CredentialBonus {
  credential_key: string;
  label: string;
  bonus_per_hour: number;
  credential_type: string;
}

interface XpMilestone {
  xp_threshold: number;
  bonus_per_hour: number;
  label: string;
  achieved: boolean;
}

interface Profile {
  hire_date: string;
  job_title: string;
  hourly_rate: number;
}

export default function PayProgressionPage() {
  const [workRates, setWorkRates] = useState<WorkTypeRate[]>([]);
  const [roles, setRoles] = useState<RoleTier[]>([]);
  const [seniority, setSeniority] = useState<SeniorityBracket[]>([]);
  const [credentials, setCredentials] = useState<CredentialBonus[]>([]);
  const [xpMilestones, setXpMilestones] = useState<XpMilestone[]>([]);
  const [earnedCreds, setEarnedCreds] = useState<{ credential_key: string }[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    try {
      const res = await fetch('/api/admin/rewards?section=pay');
      if (res.ok) {
        const data = await res.json();
        setWorkRates(data.work_type_rates || []);
        setRoles(data.role_tiers || []);
        setSeniority(data.seniority_brackets || []);
        setCredentials(data.credential_bonuses || []);
        setXpMilestones(data.xp_milestones || []);
        setEarnedCreds(data.earned_credentials || []);
        setProfile(data.profile || null);
      }
    } catch (err) { console.error('PayProgressionPage: fetch failed', err); }
    setLoading(false);
  }

  const yearsEmployed = profile?.hire_date
    ? Math.floor((Date.now() - new Date(profile.hire_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : 0;

  const earnedCredKeys = new Set(earnedCreds.map(c => c.credential_key));

  const currentSeniority = seniority.find(s =>
    yearsEmployed >= s.min_years && (!s.max_years || yearsEmployed < s.max_years)
  );

  if (loading) return (
    <div className="admin-empty">
      <div className="admin-empty__icon">&#x23F3;</div>
      <div className="admin-empty__title">Loading Pay Progression...</div>
    </div>
  );

  return (
    <>
      <div className="admin-learn__header">
        <h2 className="admin-learn__title">&#x1F4B0; Pay Progression Roadmap</h2>
        <p className="admin-learn__subtitle">
          See how your hourly pay grows through seniority, credentials, education, and XP milestones.
          Multiple paths to earning more!
        </p>
      </div>

      {/* Your Current Pay Breakdown */}
      {profile && (
        <div className="pay-prog__current">
          <h3>Your Current Pay Breakdown</h3>
          <div className="pay-prog__current-grid">
            <div className="pay-prog__current-item">
              <span className="pay-prog__current-label">Current Role</span>
              <span className="pay-prog__current-value">{profile.job_title || 'Not set'}</span>
            </div>
            <div className="pay-prog__current-item">
              <span className="pay-prog__current-label">Years with Company</span>
              <span className="pay-prog__current-value">{yearsEmployed} year{yearsEmployed !== 1 ? 's' : ''}</span>
            </div>
            <div className="pay-prog__current-item">
              <span className="pay-prog__current-label">Seniority Bonus</span>
              <span className="pay-prog__current-value">+${currentSeniority?.bonus_per_hour?.toFixed(2) || '0.00'}/hr</span>
            </div>
            <div className="pay-prog__current-item">
              <span className="pay-prog__current-label">Credentials Held</span>
              <span className="pay-prog__current-value">{earnedCreds.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Base Pay by Work Type */}
      <div className="pay-prog__section">
        <h3 className="pay-prog__section-title">&#x1F3D7;&#xFE0F; Base Pay by Work Type</h3>
        <p className="pay-prog__section-desc">Your base hourly rate depends on the type of work you&apos;re doing.</p>
        <div className="pay-prog__rates-grid">
          {workRates.map(r => (
            <div key={r.work_type} className="pay-prog__rate-card">
              <span className="pay-prog__rate-icon">{r.icon || '\u2699\uFE0F'}</span>
              <span className="pay-prog__rate-label">{r.label || r.work_type}</span>
              <span className="pay-prog__rate-amount">${r.base_rate.toFixed(2)}/hr</span>
            </div>
          ))}
        </div>
      </div>

      {/* Role Tier Progression (left to right) */}
      <div className="pay-prog__section">
        <h3 className="pay-prog__section-title">&#x1F4CA; Role Progression</h3>
        <p className="pay-prog__section-desc">As you advance in your career, your role bonus increases. This is added on top of the base work type rate.</p>
        <div className="pay-prog__timeline">
          {roles.sort((a, b) => a.base_bonus - b.base_bonus).map((r, i) => {
            const isCurrent = profile?.job_title?.toLowerCase().replace(/\s+/g, '_') === r.role_key;
            return (
              <div key={r.role_key} className={`pay-prog__timeline-item ${isCurrent ? 'pay-prog__timeline-item--current' : ''}`}>
                <div className="pay-prog__timeline-dot" style={{ background: isCurrent ? '#1D3095' : i < roles.length / 2 ? '#10B981' : '#F59E0B' }} />
                <div className="pay-prog__timeline-content">
                  <span className="pay-prog__timeline-label">{r.label || r.role_key}</span>
                  <span className="pay-prog__timeline-bonus">+${r.base_bonus.toFixed(2)}/hr</span>
                </div>
                {i < roles.length - 1 && <div className="pay-prog__timeline-connector" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Seniority Milestones (left to right) */}
      <div className="pay-prog__section">
        <h3 className="pay-prog__section-title">&#x1F4C5; Seniority Milestones</h3>
        <p className="pay-prog__section-desc">The longer you stay with the company, the more your hourly bonus grows.</p>
        <div className="pay-prog__timeline">
          {seniority.map((s, i) => {
            const reached = yearsEmployed >= s.min_years;
            return (
              <div key={s.min_years} className={`pay-prog__timeline-item ${reached ? 'pay-prog__timeline-item--reached' : ''}`}>
                <div className="pay-prog__timeline-dot" style={{ background: reached ? '#10B981' : '#E5E7EB' }} />
                <div className="pay-prog__timeline-content">
                  <span className="pay-prog__timeline-label">
                    {s.min_years === 0 ? 'Start' : `${s.min_years} Year${s.min_years !== 1 ? 's' : ''}`}
                  </span>
                  <span className="pay-prog__timeline-bonus">+${s.bonus_per_hour.toFixed(2)}/hr</span>
                </div>
                {i < seniority.length - 1 && <div className={`pay-prog__timeline-connector ${reached ? 'pay-prog__timeline-connector--active' : ''}`} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Credentials */}
      <div className="pay-prog__section">
        <h3 className="pay-prog__section-title">&#x1F4DC; Credential Bonuses</h3>
        <p className="pay-prog__section-desc">Each certification or credential you earn adds to your hourly rate. Stack multiple for bigger bonuses!</p>
        <div className="pay-prog__creds-grid">
          {credentials.map(c => {
            const earned = earnedCredKeys.has(c.credential_key);
            return (
              <div key={c.credential_key} className={`pay-prog__cred-card ${earned ? 'pay-prog__cred-card--earned' : ''}`}>
                <div className="pay-prog__cred-status">
                  {earned ? '\u2705' : '\u26AA'}
                </div>
                <div className="pay-prog__cred-info">
                  <span className="pay-prog__cred-name">{c.label || c.credential_key}</span>
                  <span className="pay-prog__cred-type">{c.credential_type}</span>
                </div>
                <span className="pay-prog__cred-bonus">+${c.bonus_per_hour.toFixed(2)}/hr</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* XP Milestones */}
      <div className="pay-prog__section">
        <h3 className="pay-prog__section-title">&#x2B50; XP Milestones</h3>
        <p className="pay-prog__section-desc">Earn XP by completing modules, quizzes, and exams. Every 10,000 XP total earns a permanent +$0.50/hr bonus!</p>
        <div className="pay-prog__xp-milestones">
          {xpMilestones.map((m, i) => (
            <div key={m.xp_threshold} className={`pay-prog__xp-milestone ${m.achieved ? 'pay-prog__xp-milestone--achieved' : ''}`}>
              <div className="pay-prog__xp-dot" style={{ background: m.achieved ? '#10B981' : '#E5E7EB' }}>
                {m.achieved ? '\u2713' : (i + 1)}
              </div>
              <div className="pay-prog__xp-info">
                <span className="pay-prog__xp-label">{m.label}</span>
                <span className="pay-prog__xp-threshold">{m.xp_threshold.toLocaleString()} XP</span>
                <span className="pay-prog__xp-bonus">+${m.bonus_per_hour.toFixed(2)}/hr</span>
              </div>
              {i < xpMilestones.length - 1 && <div className={`pay-prog__xp-connector ${m.achieved ? 'pay-prog__xp-connector--active' : ''}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Education Reimbursement */}
      <div className="pay-prog__section">
        <h3 className="pay-prog__section-title">&#x1F393; Education &amp; College Classes</h3>
        <p className="pay-prog__section-desc">The company supports your education! Here&apos;s how class reimbursement works:</p>
        <div className="pay-prog__edu-rules">
          <div className="pay-prog__edu-rule pay-prog__edu-rule--green">
            <strong>First Attempt</strong>
            <p>Company pays <strong>100%</strong> if you pass the class</p>
          </div>
          <div className="pay-prog__edu-rule pay-prog__edu-rule--yellow">
            <strong>Second Attempt</strong>
            <p>Company pays <strong>50%</strong> of the class cost</p>
          </div>
          <div className="pay-prog__edu-rule pay-prog__edu-rule--red">
            <strong>Third Attempt</strong>
            <p>Employee pays <strong>100%</strong> of class cost</p>
          </div>
          <div className="pay-prog__edu-rule pay-prog__edu-rule--green">
            <strong>After Passing</strong>
            <p>Reset! Company pays <strong>100%</strong> for next semester&apos;s class</p>
          </div>
        </div>
        <p className="pay-prog__edu-note">
          Every surveying-related college class passed earns a <strong>+$0.50/hr</strong> permanent pay increase,
          plus XP towards your milestone bonuses!
        </p>
      </div>

      {/* FS Exam Incentives */}
      <div className="pay-prog__section">
        <h3 className="pay-prog__section-title">&#x1F3AF; FS/SIT Exam Incentives</h3>
        <div className="pay-prog__incentive-cards">
          <div className="pay-prog__incentive-card">
            <h4>Complete FS Prep Course</h4>
            <ul>
              <li>Earn the &#x1F3AF; <strong>FS Ready</strong> badge</li>
              <li>Earn <strong>3,500 XP</strong></li>
              <li>Company <strong>pays for your FS exam</strong></li>
              <li>Receive <strong>+$5.00/hr raise</strong> upon passing</li>
            </ul>
          </div>
          <div className="pay-prog__incentive-card">
            <h4>Skip FS Prep Course</h4>
            <ul>
              <li>Pay for FS exam out of pocket</li>
              <li>Still receive <strong>+$5.00/hr raise</strong> upon passing</li>
              <li>No FS Ready badge or XP bonus</li>
            </ul>
          </div>
          <div className="pay-prog__incentive-card pay-prog__incentive-card--highlight">
            <h4>SIT Certification</h4>
            <ul>
              <li>Automatic <strong>+$10.00/hr raise</strong></li>
              <li>Earn <strong>5,000 XP</strong></li>
              <li>Unlocks RPLS prep pathway</li>
            </ul>
          </div>
          <div className="pay-prog__incentive-card pay-prog__incentive-card--highlight">
            <h4>RPLS License</h4>
            <ul>
              <li>Automatic <strong>+$10.00/hr raise</strong></li>
              <li>Earn <strong>10,000 XP</strong></li>
              <li>Highest professional tier</li>
            </ul>
          </div>
        </div>
      </div>

      {/* How Pay is Calculated */}
      <div className="pay-prog__section">
        <h3 className="pay-prog__section-title">&#x1F9EE; How Your Pay is Calculated</h3>
        <div className="pay-prog__formula">
          <div className="pay-prog__formula-item">Base Rate (by work type)</div>
          <div className="pay-prog__formula-op">+</div>
          <div className="pay-prog__formula-item">Role Tier Bonus</div>
          <div className="pay-prog__formula-op">+</div>
          <div className="pay-prog__formula-item">Seniority Bonus</div>
          <div className="pay-prog__formula-op">+</div>
          <div className="pay-prog__formula-item">Credential Bonuses</div>
          <div className="pay-prog__formula-op">+</div>
          <div className="pay-prog__formula-item">XP Milestone Bonuses</div>
          <div className="pay-prog__formula-op">=</div>
          <div className="pay-prog__formula-item pay-prog__formula-item--total">Your Hourly Rate</div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <Link href="/admin/rewards/how-it-works" className="admin-btn admin-btn--secondary">
          Learn More About How Rewards Work
        </Link>
      </div>
    </>
  );
}
