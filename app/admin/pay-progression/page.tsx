// app/admin/pay-progression/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface WorkTypeRate {
  work_type: string;
  base_rate: number;
  icon: string;
  label: string;
  max_bonus_cap: number | null;
  bonus_multiplier: number | null;
}

interface RoleTier {
  role_key: string;
  label: string;
  base_bonus: number;
  max_effective_rate: number | null;
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

  function getMultiplierLabel(m: number | null): string {
    if (!m || m === 1) return 'Full';
    if (m === 0.75) return '75%';
    if (m === 0.5) return '50%';
    return `${Math.round((m || 1) * 100)}%`;
  }

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

      {/* Base Pay by Work Type — now shows bonus multiplier and cap */}
      <div className="pay-prog__section">
        <h3 className="pay-prog__section-title">&#x1F3D7;&#xFE0F; Base Pay by Work Type</h3>
        <p className="pay-prog__section-desc">
          Your base hourly rate depends on the type of work. Bonus multipliers determine how much of your
          role/seniority/credential bonuses apply to each work type.
        </p>
        <div className="pay-prog__rates-grid">
          {workRates.sort((a, b) => b.base_rate - a.base_rate).map(r => (
            <div key={r.work_type} className="pay-prog__rate-card">
              <span className="pay-prog__rate-icon">{r.icon || '\u2699\uFE0F'}</span>
              <span className="pay-prog__rate-label">{r.label || r.work_type}</span>
              <span className="pay-prog__rate-amount">${r.base_rate.toFixed(2)}/hr</span>
              <div className="pay-prog__rate-meta">
                <span className={`pay-prog__rate-mult pay-prog__rate-mult--${getMultiplierLabel(r.bonus_multiplier).toLowerCase().replace('%','')}`}>
                  {getMultiplierLabel(r.bonus_multiplier)} bonus
                </span>
                {r.max_bonus_cap && (
                  <span className="pay-prog__rate-cap">cap ${r.max_bonus_cap.toFixed(0)}/hr</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="pay-prog__section-note">
          <strong>How it works:</strong> Specialized work (field, drafting, supervision, legal) applies your
          full bonuses. Lower-skill tasks (driving, maintenance, education) apply 50% of bonuses with a hard cap,
          keeping pay fair and sustainable.
        </p>
      </div>

      {/* Role Tier Progression */}
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
                  {r.max_effective_rate && (
                    <span className="pay-prog__timeline-cap">max ${r.max_effective_rate.toFixed(0)}/hr</span>
                  )}
                </div>
                {i < roles.length - 1 && <div className="pay-prog__timeline-connector" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Seniority Milestones */}
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
        <p className="pay-prog__section-desc">
          Each certification or credential you earn adds to your hourly rate. Total credential
          bonus is capped at <strong>$8.00/hr</strong> to keep compensation sustainable.
        </p>
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
        <p className="pay-prog__section-desc">
          Earn XP by completing modules, quizzes, and exams. Every 10,000 XP earns +$0.50/hr,
          capped at <strong>$3.00/hr</strong> total from XP milestones.
        </p>
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
          capped at <strong>$3.00/hr</strong> total from courses (6 classes). Plus XP towards your milestone bonuses!
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
              <li>Receive <strong>+$1.00/hr credential bonus</strong> upon passing</li>
            </ul>
          </div>
          <div className="pay-prog__incentive-card">
            <h4>Skip FS Prep Course</h4>
            <ul>
              <li>Pay for FS exam out of pocket</li>
              <li>Still receive <strong>+$1.00/hr credential bonus</strong> upon passing</li>
              <li>No FS Ready badge or XP bonus</li>
            </ul>
          </div>
          <div className="pay-prog__incentive-card pay-prog__incentive-card--highlight">
            <h4>SIT Certification</h4>
            <ul>
              <li><strong>+$1.50/hr credential bonus</strong></li>
              <li>Earn <strong>5,000 XP</strong></li>
              <li>Unlocks RPLS prep pathway</li>
            </ul>
          </div>
          <div className="pay-prog__incentive-card pay-prog__incentive-card--highlight">
            <h4>RPLS License</h4>
            <ul>
              <li><strong>+$2.00/hr credential bonus</strong></li>
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
          <div className="pay-prog__formula-item">Credential Bonuses (capped $8/hr)</div>
          <div className="pay-prog__formula-op">+</div>
          <div className="pay-prog__formula-item">XP Milestones (capped $3/hr)</div>
          <div className="pay-prog__formula-op">+</div>
          <div className="pay-prog__formula-item">Course Bonuses (capped $3/hr)</div>
          <div className="pay-prog__formula-op">=</div>
          <div className="pay-prog__formula-item">Raw Bonus Total</div>
        </div>
        <div className="pay-prog__formula" style={{ marginTop: '1rem' }}>
          <div className="pay-prog__formula-item">Raw Bonus x Work Type Multiplier</div>
          <div className="pay-prog__formula-op">=</div>
          <div className="pay-prog__formula-item">Adjusted Bonus (capped per work type)</div>
          <div className="pay-prog__formula-op">+</div>
          <div className="pay-prog__formula-item">Base Rate</div>
          <div className="pay-prog__formula-op">=</div>
          <div className="pay-prog__formula-item pay-prog__formula-item--total">Your Hourly Rate</div>
        </div>
        <p className="pay-prog__section-note" style={{ marginTop: '1rem' }}>
          Each role has a maximum effective rate ceiling to ensure sustainable pay progression.
          Specialized work gets your full bonuses; driving, maintenance, and training apply 50% of bonuses.
        </p>
      </div>

      {/* Full Pay System Transparency */}
      <div className="pay-prog__section">
        <h3 className="pay-prog__section-title">&#x1F4CB; Full Pay System Transparency</h3>
        <p className="pay-prog__section-desc">
          We believe in <strong>complete transparency</strong> about how every employee&apos;s pay is calculated.
          Below is a detailed breakdown of every mechanic, cap, and safeguard in our compensation system.
        </p>

        <div className="pay-prog__transparency">
          {/* 1. Base Rates */}
          <div className="pay-prog__transparency-block">
            <h4 className="pay-prog__transparency-title">1. Base Hourly Rates by Work Type</h4>
            <p className="pay-prog__transparency-text">
              Every hour you work is assigned a <strong>work type</strong> that determines your base hourly rate.
              Different types of work require different levels of skill, risk, and responsibility. Your base rate
              is the starting point before any bonuses are applied. These rates are set by the company and reviewed periodically.
            </p>
            <ul className="pay-prog__transparency-list">
              <li><strong>Field Surveying ($20/hr base)</strong> — Active survey work in the field requiring technical skill and physical effort</li>
              <li><strong>Supervision/Project Mgmt ($20/hr base)</strong> — Overseeing crews and managing projects</li>
              <li><strong>Legal/Expert Witness ($22/hr base)</strong> — Expert testimony and legal survey documentation</li>
              <li><strong>CAD/Drafting ($18/hr base)</strong> — Producing survey drawings and plats</li>
              <li><strong>Research/Title ($17/hr base)</strong> — Deed research, title examination, record review</li>
              <li><strong>Office/Admin ($16/hr base)</strong> — General office and administrative tasks</li>
              <li><strong>Driving ($16/hr base)</strong> — Travel time between job sites</li>
              <li><strong>Equipment Maintenance ($15/hr base)</strong> — Maintaining and repairing survey equipment</li>
              <li><strong>Education/Training ($15/hr base)</strong> — Training time, continuing education</li>
              <li><strong>Miscellaneous ($14/hr base)</strong> — Any other work not covered above</li>
            </ul>
          </div>

          {/* 2. Bonus Multipliers */}
          <div className="pay-prog__transparency-block">
            <h4 className="pay-prog__transparency-title">2. Bonus Multipliers &amp; Why They Exist</h4>
            <p className="pay-prog__transparency-text">
              Not all work types receive the same percentage of your bonuses. Highly skilled work
              applies 100% of your earned bonuses, while lower-skill tasks apply a reduced percentage. This prevents
              the situation where a Senior RPLS earns $65+/hr for simply driving between sites.
            </p>
            <ul className="pay-prog__transparency-list">
              <li><strong>100% Multiplier (Full)</strong> — Field work, CAD/drafting, supervision, legal work. These require your full expertise and credentials.</li>
              <li><strong>75% Multiplier</strong> — Research/title work and office/admin. These benefit from experience but aren&apos;t as specialized.</li>
              <li><strong>50% Multiplier</strong> — Driving, equipment maintenance, education/training, miscellaneous. These tasks don&apos;t require advanced credentials.</li>
            </ul>
            <p className="pay-prog__transparency-text">
              <strong>Example:</strong> If your total bonuses add up to $20/hr, you&apos;d receive the full $20 for field work,
              $15 for research, or $10 for driving time.
            </p>
          </div>

          {/* 3. Per-Work-Type Bonus Caps */}
          <div className="pay-prog__transparency-block">
            <h4 className="pay-prog__transparency-title">3. Per-Work-Type Bonus Caps</h4>
            <p className="pay-prog__transparency-text">
              In addition to the multiplier, each work type has an absolute <strong>maximum bonus cap</strong>.
              Even after applying the multiplier, if the adjusted bonus exceeds the cap for that work type,
              it is reduced to the cap amount. This provides a hard ceiling on what any employee can earn
              for each type of work, regardless of how many bonuses they&apos;ve stacked.
            </p>
            <ul className="pay-prog__transparency-list">
              <li><strong>Field Work</strong> — Max bonus cap: $55/hr</li>
              <li><strong>CAD/Drafting</strong> — Max bonus cap: $45/hr</li>
              <li><strong>Supervision</strong> — Max bonus cap: $50/hr</li>
              <li><strong>Legal/Expert</strong> — Max bonus cap: $55/hr</li>
              <li><strong>Research/Title</strong> — Max bonus cap: $35/hr</li>
              <li><strong>Office/Admin</strong> — Max bonus cap: $30/hr</li>
              <li><strong>Driving</strong> — Max bonus cap: $25/hr</li>
              <li><strong>Equipment Maint.</strong> — Max bonus cap: $22/hr</li>
              <li><strong>Education/Training</strong> — Max bonus cap: $20/hr</li>
              <li><strong>Miscellaneous</strong> — Max bonus cap: $18/hr</li>
            </ul>
          </div>

          {/* 4. Role Tier Bonuses */}
          <div className="pay-prog__transparency-block">
            <h4 className="pay-prog__transparency-title">4. Role Tier Bonuses</h4>
            <p className="pay-prog__transparency-text">
              Your <strong>role tier</strong> reflects your current position within the company. As you advance
              through training, certification, and demonstrated competence, you move up to higher role tiers.
              Each tier adds a fixed bonus per hour to your pay.
            </p>
            <ul className="pay-prog__transparency-list">
              <li><strong>Apprentice</strong> — +$0.00/hr (entry level, first 90 days)</li>
              <li><strong>Rodman/Chainman</strong> — +$1.50/hr</li>
              <li><strong>Instrument Operator</strong> — +$3.50/hr</li>
              <li><strong>Survey Technician</strong> — +$5.00/hr</li>
              <li><strong>Party Chief</strong> — +$8.00/hr</li>
              <li><strong>Project Manager</strong> — +$12.00/hr</li>
              <li><strong>SIT (Surveyor-in-Training)</strong> — +$15.00/hr, max effective rate $48/hr</li>
              <li><strong>RPLS</strong> — +$18.00/hr, max effective rate $68/hr</li>
              <li><strong>Senior RPLS</strong> — +$24.00/hr, max effective rate $78/hr</li>
              <li><strong>Owner/Principal</strong> — +$40.00/hr (no cap)</li>
            </ul>
            <p className="pay-prog__transparency-text">
              <strong>Max Effective Rate:</strong> Some roles have a ceiling on the total hourly rate (base + all bonuses).
              For example, an SIT can never exceed $48/hr regardless of other bonuses. This ensures fair compensation
              while capping liability. Roles below SIT have no ceiling because their bonus stacking potential is naturally limited.
            </p>
          </div>

          {/* 5. Seniority Bonuses */}
          <div className="pay-prog__transparency-block">
            <h4 className="pay-prog__transparency-title">5. Seniority (Loyalty) Bonuses</h4>
            <p className="pay-prog__transparency-text">
              The longer you work with the company, the higher your seniority bonus. This rewards loyalty and
              long-term commitment. Your seniority is calculated from your hire date automatically.
            </p>
            <ul className="pay-prog__transparency-list">
              <li><strong>0–1 years</strong> — +$0.00/hr</li>
              <li><strong>1–2 years</strong> — +$0.50/hr</li>
              <li><strong>2–3 years</strong> — +$1.00/hr</li>
              <li><strong>3–5 years</strong> — +$1.75/hr</li>
              <li><strong>5–7 years</strong> — +$2.50/hr</li>
              <li><strong>7–9 years</strong> — +$3.50/hr</li>
              <li><strong>10–14 years</strong> — +$5.00/hr</li>
              <li><strong>15–19 years</strong> — +$6.50/hr</li>
              <li><strong>20+ years</strong> — +$8.00/hr</li>
            </ul>
          </div>

          {/* 6. Credential Bonuses */}
          <div className="pay-prog__transparency-block">
            <h4 className="pay-prog__transparency-title">6. Credential &amp; Certification Bonuses</h4>
            <p className="pay-prog__transparency-text">
              Every professional credential and certification you earn adds to your hourly rate. However,
              the <strong>total credential bonus is capped at $8.00/hr</strong> to keep pay sustainable.
              If your individual credential bonuses add up to more than $8.00, only $8.00 is applied.
            </p>
            <ul className="pay-prog__transparency-list">
              <li><strong>FS Exam Passed</strong> — +$1.00/hr</li>
              <li><strong>SIT Certification</strong> — +$1.50/hr</li>
              <li><strong>RPLS License</strong> — +$2.00/hr</li>
              <li><strong>Drone (Part 107)</strong> — +$1.00/hr</li>
              <li><strong>OSHA 30-Hour</strong> — +$0.50/hr</li>
              <li><strong>First Aid/CPR</strong> — +$0.50/hr</li>
              <li><strong>HAZWOPER</strong> — +$0.75/hr</li>
              <li><strong>CST (Certified Survey Technician)</strong> — +$0.75/hr</li>
            </ul>
            <p className="pay-prog__transparency-text">
              <strong>Why the cap?</strong> Without a cap, an employee who holds every single credential would stack bonuses
              that far exceed what the market would pay. The $8.00/hr cap ensures we can always honor our commitments.
            </p>
          </div>

          {/* 7. XP Milestone Bonuses */}
          <div className="pay-prog__transparency-block">
            <h4 className="pay-prog__transparency-title">7. XP Milestone Bonuses</h4>
            <p className="pay-prog__transparency-text">
              XP (experience points) are earned by completing learning modules, quizzes, exams, and other
              activities on the platform. For every <strong>10,000 XP milestone</strong> you reach, you earn
              an additional <strong>+$0.50/hr</strong>. This bonus is capped at <strong>$3.00/hr</strong> total
              (6 milestones = 60,000 XP).
            </p>
            <p className="pay-prog__transparency-text">
              <strong>Why the cap?</strong> XP milestones encourage engagement with learning, but should complement
              (not replace) real-world experience and credentials as compensation drivers.
            </p>
          </div>

          {/* 8. Course Completion Bonuses */}
          <div className="pay-prog__transparency-block">
            <h4 className="pay-prog__transparency-title">8. College Course Completion Bonuses</h4>
            <p className="pay-prog__transparency-text">
              Each surveying-related college course you pass earns a permanent <strong>+$0.50/hr</strong> pay increase.
              This is capped at <strong>$3.00/hr</strong> total (6 courses max). The company also reimburses
              tuition based on the following rules:
            </p>
            <ul className="pay-prog__transparency-list">
              <li><strong>First attempt, pass</strong> — Company pays 100% of tuition</li>
              <li><strong>Second attempt</strong> — Company pays 50% of tuition</li>
              <li><strong>Third attempt</strong> — Employee pays 100% of tuition</li>
              <li><strong>After passing, the reimbursement resets</strong> for the next semester&apos;s class</li>
            </ul>
          </div>

          {/* 9. Stacking Safeguards */}
          <div className="pay-prog__transparency-block">
            <h4 className="pay-prog__transparency-title">9. Stacking Safeguards — How Caps Work Together</h4>
            <p className="pay-prog__transparency-text">
              Our pay system has <strong>three layers of protection</strong> to ensure pay remains fair and sustainable:
            </p>
            <ol className="pay-prog__transparency-list">
              <li><strong>Individual Category Caps:</strong> Credentials capped at $8/hr, XP at $3/hr, courses at $3/hr. You can never earn more than these from each category, no matter how many you accumulate.</li>
              <li><strong>Work-Type Multiplier &amp; Cap:</strong> After adding all bonuses, the total is multiplied by the work type&apos;s multiplier (50%–100%) and then capped at the work type&apos;s maximum bonus. This prevents high bonuses on low-skill work.</li>
              <li><strong>Role Effective Rate Ceiling:</strong> Finally, your total hourly rate (base + adjusted bonus) cannot exceed your role&apos;s maximum effective rate. An SIT is capped at $48/hr, an RPLS at $68/hr, etc.</li>
            </ol>
          </div>

          {/* 10. Worked Example */}
          <div className="pay-prog__transparency-block">
            <h4 className="pay-prog__transparency-title">10. Worked Example — High-Achieving Employee</h4>
            <p className="pay-prog__transparency-text">
              Here&apos;s a real example of how pay is calculated for a well-credentialed employee:
            </p>
            <div className="pay-prog__example">
              <div className="pay-prog__example-header">
                <strong>Profile:</strong> RPLS, 6 years seniority, 50,000 XP, 9 college courses, drone &amp; OSHA certified, FS passed, SIT &amp; RPLS earned
              </div>
              <div className="pay-prog__example-calc">
                <div className="pay-prog__example-row">
                  <span>Role Bonus (RPLS)</span><span>+$18.00/hr</span>
                </div>
                <div className="pay-prog__example-row">
                  <span>Seniority (6 years)</span><span>+$2.50/hr</span>
                </div>
                <div className="pay-prog__example-row">
                  <span>Credentials (FS $1 + SIT $1.50 + RPLS $2 + Drone $1 + OSHA $0.50 + First Aid $0.50 = $6.50, under $8 cap)</span><span>+$6.50/hr</span>
                </div>
                <div className="pay-prog__example-row">
                  <span>XP Milestones (5 x $0.50 = $2.50, under $3 cap)</span><span>+$2.50/hr</span>
                </div>
                <div className="pay-prog__example-row">
                  <span>Courses (9 passed, capped at 6 = $3.00)</span><span>+$3.00/hr</span>
                </div>
                <div className="pay-prog__example-row pay-prog__example-row--subtotal">
                  <span><strong>Raw Bonus Total</strong></span><span><strong>$32.50/hr</strong></span>
                </div>
              </div>
              <div className="pay-prog__example-scenarios">
                <div className="pay-prog__example-scenario">
                  <strong>Field Work (100% multiplier, $55 cap):</strong><br/>
                  $32.50 x 1.0 = $32.50 (under $55 cap) &#10003;<br/>
                  Base $20 + $32.50 = <strong>$52.50/hr</strong> (under RPLS $68 ceiling) &#10003;
                </div>
                <div className="pay-prog__example-scenario">
                  <strong>Driving (50% multiplier, $25 cap):</strong><br/>
                  $32.50 x 0.50 = $16.25 (under $25 cap) &#10003;<br/>
                  Base $16 + $16.25 = <strong>$32.25/hr</strong> (under RPLS $68 ceiling) &#10003;
                </div>
                <div className="pay-prog__example-scenario">
                  <strong>Research (75% multiplier, $35 cap):</strong><br/>
                  $32.50 x 0.75 = $24.38 (under $35 cap) &#10003;<br/>
                  Base $17 + $24.38 = <strong>$41.38/hr</strong> (under RPLS $68 ceiling) &#10003;
                </div>
              </div>
            </div>
          </div>

          {/* 11. Overtime */}
          <div className="pay-prog__transparency-block">
            <h4 className="pay-prog__transparency-title">11. Overtime</h4>
            <p className="pay-prog__transparency-text">
              Overtime is calculated at <strong>1.5x your effective hourly rate</strong> for any hours worked over 40
              in a single work week (Monday–Sunday), in accordance with federal and state labor laws. The effective rate
              used for overtime is the rate after all bonuses and caps have been applied for that specific work type.
            </p>
          </div>

          {/* 12. Changes & Review */}
          <div className="pay-prog__transparency-block">
            <h4 className="pay-prog__transparency-title">12. System Updates &amp; Reviews</h4>
            <p className="pay-prog__transparency-text">
              Pay rates, caps, and multipliers are reviewed annually and may be adjusted based on business performance,
              market conditions, and inflation. Any changes will be communicated to all employees before they take effect.
              <strong> The system is designed to be fair:</strong> it rewards skill, loyalty, and education while maintaining
              caps that ensure the company can always honor its compensation commitments.
            </p>
          </div>
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
