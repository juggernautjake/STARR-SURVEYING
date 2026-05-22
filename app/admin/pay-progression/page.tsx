// app/admin/pay-progression/page.tsx
'use client';
import '../styles/AdminPayroll.css';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
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
  description?: string | null;
  sort_order?: number | null;
  icon?: string | null;
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

interface XpBalance {
  current_balance: number;
  total_earned: number;
  total_spent: number;
}

export default function PayProgressionPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.roles?.includes('admin') ?? false;
  // Admin edit mode (P-9). When on, Phase 3 CRUD affordances (P-10..P-14)
  // render their pencil icons on each config value. Off by default so
  // non-admins (and admins reading the page normally) see the same view.
  const [editMode, setEditMode] = useState(false);

  const [workRates, setWorkRates] = useState<WorkTypeRate[]>([]);
  const [roles, setRoles] = useState<RoleTier[]>([]);
  const [seniority, setSeniority] = useState<SeniorityBracket[]>([]);
  const [credentials, setCredentials] = useState<CredentialBonus[]>([]);
  const [xpMilestones, setXpMilestones] = useState<XpMilestone[]>([]);
  const [earnedCreds, setEarnedCreds] = useState<{ credential_key: string; earned_date?: string }[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [balance, setBalance] = useState<XpBalance | null>(null);
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
        setBalance(data.balance || null);
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

  // ── Hero "You are here" computations (P-1) ───────────────────────────────
  // Resolve the user's tier_key. job_title is the legacy string field; we
  // match it case-insensitively against role_tiers.role_key (e.g.
  // "Party Chief" → "party_chief"). Phase 2 (P-6) replaces this with a
  // direct FK on employee_profiles.tier_key.
  const currentTierKey = profile?.job_title?.toLowerCase().replace(/\s+/g, '_');
  const currentTier = roles.find(r => r.role_key === currentTierKey);
  const sortedRoles = [...roles].sort((a, b) => a.base_bonus - b.base_bonus);
  const currentTierIndex = currentTier ? sortedRoles.findIndex(r => r.role_key === currentTier.role_key) : -1;
  const nextTier = currentTierIndex >= 0 && currentTierIndex < sortedRoles.length - 1
    ? sortedRoles[currentTierIndex + 1]
    : null;

  const credentialsBonus = credentials
    .filter(c => earnedCredKeys.has(c.credential_key))
    .reduce((sum, c) => sum + Number(c.bonus_per_hour || 0), 0);
  const seniorityBonus = Number(currentSeniority?.bonus_per_hour || 0);
  const roleBonus = Number(currentTier?.base_bonus || 0);
  const baseRateGuess = profile ? Math.max(0, Number(profile.hourly_rate || 0) - roleBonus - seniorityBonus - credentialsBonus) : 0;

  // Pick the closest unlock-able next milestone (cheapest path to a raise).
  const nextSeniority = seniority.find(s => s.min_years > yearsEmployed);
  const yearsToNextSeniority = nextSeniority ? nextSeniority.min_years - yearsEmployed : null;
  const nextCredentialBest = credentials
    .filter(c => !earnedCredKeys.has(c.credential_key))
    .sort((a, b) => Number(b.bonus_per_hour) - Number(a.bonus_per_hour))[0];

  function pickNextMilestone(): { label: string; delta: number; detail: string } | null {
    const candidates: Array<{ label: string; delta: number; detail: string }> = [];
    if (nextTier) candidates.push({
      label: `Promote to ${nextTier.label || nextTier.role_key}`,
      delta: Number(nextTier.base_bonus) - roleBonus,
      detail: `Next tier on the ladder`,
    });
    if (nextSeniority && yearsToNextSeniority !== null) candidates.push({
      label: `${yearsToNextSeniority} more year${yearsToNextSeniority === 1 ? '' : 's'} with the company`,
      delta: Number(nextSeniority.bonus_per_hour) - seniorityBonus,
      detail: `Seniority bracket: ${nextSeniority.label}`,
    });
    if (nextCredentialBest) candidates.push({
      label: `Earn ${nextCredentialBest.label || nextCredentialBest.credential_key}`,
      delta: Number(nextCredentialBest.bonus_per_hour),
      detail: `Credential bonus`,
    });
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => b.delta - a.delta)[0];
  }
  const nextMilestone = pickNextMilestone();
  // ─────────────────────────────────────────────────────────────────────────

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
    <div className={`pay-prog-page ${editMode ? 'pay-prog-page--edit' : ''}`}>
      <div className="admin-learn__header">
        <h2 className="admin-learn__title">&#x1F4B0; Pay Progression Roadmap</h2>
        <p className="admin-learn__subtitle">
          See how your hourly pay grows through seniority, credentials, education, and XP milestones.
          Multiple paths to earning more!
        </p>
      </div>

      {/* Admin edit-mode toggle (P-9). Floating pill in the top-right.
       * Toggling sets the .pay-prog-page--edit class on the root, which
       * Phase 3 slices (P-10..P-14) use to reveal inline pencil icons
       * next to every editable config value. Hidden for non-admins. */}
      {isAdmin && (
        <button
          type="button"
          className={`pay-prog-edit-pill ${editMode ? 'pay-prog-edit-pill--on' : ''}`}
          onClick={() => setEditMode(prev => !prev)}
          aria-pressed={editMode}
          title={editMode ? 'Exit edit mode' : 'Enable admin edit mode'}
        >
          {editMode ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Edit mode on</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <span>Edit pay system</span>
            </>
          )}
        </button>
      )}

      {isAdmin && editMode && (
        <div className="pay-prog-edit-banner" role="status">
          <span className="pay-prog-edit-banner__dot" aria-hidden="true" />
          <span>
            <strong>Admin edit mode is on.</strong>{' '}
            Pencil icons next to each value let you edit work-type rates, role tiers,
            seniority brackets, credentials, XP milestones, and system caps. Changes save through
            the rewards API (Phase 3 slices P-10–P-14 wire each one up).
          </span>
        </div>
      )}

      {/* Hero: "You are here" — P-1 of PAY_PROGRESSION_OVERHAUL.md.
       * Replaces the read-as-printout 4-column grid with a card that
       * communicates: current effective rate (large), how it breaks down
       * (visual chips), and the cheapest next milestone with its $/hr delta. */}
      {profile && (
        <div className="pay-prog__hero">
          <div className="pay-prog__hero-left">
            <span className="pay-prog__hero-eyebrow">You are here</span>
            <span className="pay-prog__hero-tier">
              {currentTier?.label || profile.job_title || 'Set your role'}
            </span>
            <div className="pay-prog__hero-rate-row">
              <span className="pay-prog__hero-rate">${Number(profile.hourly_rate || 0).toFixed(2)}</span>
              <span className="pay-prog__hero-rate-unit">/hr</span>
            </div>
            <div className="pay-prog__hero-chips">
              <span className="pay-prog__hero-chip" title="Base hourly rate before any bonuses">
                Base ${baseRateGuess.toFixed(2)}
              </span>
              {roleBonus > 0 && (
                <span className="pay-prog__hero-chip pay-prog__hero-chip--accent" title="Role tier bonus">
                  Role +${roleBonus.toFixed(2)}
                </span>
              )}
              {seniorityBonus > 0 && (
                <span className="pay-prog__hero-chip pay-prog__hero-chip--accent" title={currentSeniority?.label || ''}>
                  Seniority +${seniorityBonus.toFixed(2)}
                </span>
              )}
              {credentialsBonus > 0 && (
                <span className="pay-prog__hero-chip pay-prog__hero-chip--accent" title={`${earnedCreds.length} credential${earnedCreds.length === 1 ? '' : 's'} earned`}>
                  Credentials +${credentialsBonus.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          <div className="pay-prog__hero-right">
            {nextMilestone ? (
              <>
                <span className="pay-prog__hero-eyebrow">Closest next raise</span>
                <span className="pay-prog__hero-next-delta">+${nextMilestone.delta.toFixed(2)}/hr</span>
                <span className="pay-prog__hero-next-label">{nextMilestone.label}</span>
                <span className="pay-prog__hero-next-detail">{nextMilestone.detail}</span>
              </>
            ) : (
              <>
                <span className="pay-prog__hero-eyebrow">Status</span>
                <span className="pay-prog__hero-next-label">Top of every track 🎉</span>
                <span className="pay-prog__hero-next-detail">No further milestones in the default system.</span>
              </>
            )}
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
          {[...workRates].sort((a, b) => b.base_rate - a.base_rate).map(r => (
            <WorkTypeRateCard
              key={r.work_type}
              rate={r}
              editMode={isAdmin && editMode}
              getMultiplierLabel={getMultiplierLabel}
              onChanged={fetchData}
            />
          ))}
          {isAdmin && editMode && (
            <AddWorkTypeButton onAdded={fetchData} />
          )}
        </div>
        <p className="pay-prog__section-note">
          <strong>How it works:</strong> Specialized work (field, drafting, supervision, legal) applies your
          full bonuses. Lower-skill tasks (driving, maintenance, education) apply 50% of bonuses with a hard cap,
          keeping pay fair and sustainable.
        </p>
      </div>

      {/* Role tier ladder — P-2 of PAY_PROGRESSION_OVERHAUL.md.
       * Vertical step-by-step ladder ordered by base_bonus ascending. Each
       * tier renders as a row with a state-aware marker (✓ unlocked,
       * highlighted current, lock icon for future), tier label + $/hr
       * bonus + optional cap + description. Connectors between rows
       * communicate the path. Replaces the horizontal scroll timeline. */}
      <div className="pay-prog__section">
        <h3 className="pay-prog__section-title">&#x1F4CA; Role Tier Ladder</h3>
        <p className="pay-prog__section-desc">
          Every tier you climb adds to your role bonus on top of the base work-type rate.
          Your current position is highlighted; tiers below are unlocked, tiers above show what&apos;s next.
        </p>
        <ol className="pay-prog__ladder" aria-label="Role tier progression">
          {sortedRoles.map((r, i) => {
            const isCurrent = currentTier?.role_key === r.role_key;
            const isUnlocked = currentTierIndex >= 0 && i < currentTierIndex;
            const isLocked = currentTierIndex >= 0 && i > currentTierIndex;
            const state = isCurrent ? 'current' : isUnlocked ? 'unlocked' : isLocked ? 'locked' : 'neutral';
            return (
              <TierRung
                key={r.role_key}
                tier={r}
                state={state}
                isCurrent={isCurrent}
                isUnlocked={isUnlocked}
                isLocked={isLocked}
                editMode={isAdmin && editMode}
                onChanged={fetchData}
              />
            );
          })}
        </ol>
        {isAdmin && editMode && <AddTierButton onAdded={fetchData} />}
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

      {/* Credentials gallery \u2014 P-3 of PAY_PROGRESSION_OVERHAUL.md.
       * Replaces the vertical flex list with a responsive grid of badge
       * cards. Earned badges render in full color with the earned date
       * below; locked badges are grayscaled with a "Earn to unlock" hint
       * so the bonus impact is visible before earning. */}
      <div className="pay-prog__section">
        <div className="pay-prog__section-header">
          <h3 className="pay-prog__section-title">&#x1F4DC; Credential Bonuses</h3>
          <span className="pay-prog__section-count">
            {earnedCreds.length} of {credentials.length} earned \u00B7 cap +$8.00/hr
          </span>
        </div>
        <p className="pay-prog__section-desc">
          Each certification or credential you earn adds to your hourly rate. Total credential
          bonus is capped at <strong>$8.00/hr</strong> to keep compensation sustainable.
        </p>
        <div className="pay-prog__badges">
          {credentials
            .sort((a, b) => Number(b.bonus_per_hour) - Number(a.bonus_per_hour))
            .map(c => {
              const earnedEntry = earnedCreds.find(e => e.credential_key === c.credential_key);
              const earned = !!earnedEntry;
              const earnedDate = earnedEntry?.earned_date
                ? new Date(earnedEntry.earned_date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
                : null;
              return (
                <div
                  key={c.credential_key}
                  className={`pay-prog__badge ${earned ? 'pay-prog__badge--earned' : 'pay-prog__badge--locked'}`}
                  title={earned ? `Earned ${earnedDate || ''}` : `Earn to unlock +$${Number(c.bonus_per_hour).toFixed(2)}/hr`}
                >
                  <div className="pay-prog__badge-medal" aria-hidden="true">
                    {earned ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="6" />
                        <polyline points="8.21 13.89 7 22 12 19 17 22 15.79 13.88" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="4" y="11" width="16" height="10" rx="2" />
                        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                    )}
                  </div>
                  <div className="pay-prog__badge-body">
                    <span className="pay-prog__badge-name">{c.label || c.credential_key}</span>
                    <span className="pay-prog__badge-type">{c.credential_type}</span>
                  </div>
                  <div className="pay-prog__badge-meta">
                    <span className="pay-prog__badge-bonus">+${Number(c.bonus_per_hour).toFixed(2)}/hr</span>
                    {earned && earnedDate && (
                      <span className="pay-prog__badge-date">Earned {earnedDate}</span>
                    )}
                    {!earned && (
                      <span className="pay-prog__badge-hint">Locked</span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* XP milestones bar \u2014 P-4 of PAY_PROGRESSION_OVERHAUL.md.
       * Horizontal progress track with notches at each xp_threshold.
       * Bar fill width = currentXp / maxThreshold, clamped at 100%.
       * Each notch tags the $/hr it unlocks; passed notches glow gold.
       * Replaces the horizontal-scroll milestone strip. */}
      {(() => {
        const sortedMilestones = [...xpMilestones].sort((a, b) => a.xp_threshold - b.xp_threshold);
        const currentXp = Number(balance?.total_earned || 0);
        const maxThreshold = sortedMilestones.length > 0 ? sortedMilestones[sortedMilestones.length - 1].xp_threshold : 0;
        const fillPct = maxThreshold > 0 ? Math.min(100, (currentXp / maxThreshold) * 100) : 0;
        const nextMilestone = sortedMilestones.find(m => currentXp < m.xp_threshold);
        const xpToNext = nextMilestone ? nextMilestone.xp_threshold - currentXp : 0;
        const xpBonusEarned = sortedMilestones
          .filter(m => currentXp >= m.xp_threshold)
          .reduce((sum, m) => sum + Number(m.bonus_per_hour || 0), 0);
        return (
          <div className="pay-prog__section">
            <div className="pay-prog__section-header">
              <h3 className="pay-prog__section-title">&#x2B50; XP Milestones</h3>
              <span className="pay-prog__section-count">
                {currentXp.toLocaleString()} XP earned \u00b7 +${xpBonusEarned.toFixed(2)}/hr unlocked \u00b7 cap +$3.00/hr
              </span>
            </div>
            <p className="pay-prog__section-desc">
              Earn XP by completing modules, quizzes, and exams. Every 10,000 XP earns +$0.50/hr,
              capped at <strong>$3.00/hr</strong> total from XP milestones.
            </p>
            <div className="pay-prog__xp-bar">
              <div className="pay-prog__xp-track" role="progressbar" aria-valuenow={Math.round(fillPct)} aria-valuemin={0} aria-valuemax={100}>
                <div className="pay-prog__xp-fill" style={{ width: `${fillPct}%` }} />
                {sortedMilestones.map(m => {
                  const left = maxThreshold > 0 ? (m.xp_threshold / maxThreshold) * 100 : 0;
                  const passed = currentXp >= m.xp_threshold;
                  return (
                    <div
                      key={m.xp_threshold}
                      className={`pay-prog__xp-notch ${passed ? 'pay-prog__xp-notch--passed' : ''}`}
                      style={{ left: `${left}%` }}
                      aria-hidden="true"
                    >
                      <span className="pay-prog__xp-notch-dot" />
                      <span className="pay-prog__xp-notch-tag">+${Number(m.bonus_per_hour).toFixed(2)}/hr</span>
                      <span className="pay-prog__xp-notch-label">{(m.xp_threshold / 1000).toFixed(0)}k</span>
                    </div>
                  );
                })}
              </div>
              {nextMilestone && (
                <p className="pay-prog__xp-next">
                  <strong>{xpToNext.toLocaleString()} XP</strong> to next milestone
                  &nbsp;\u00b7&nbsp;
                  unlocks <strong>+${Number(nextMilestone.bonus_per_hour).toFixed(2)}/hr</strong>
                </p>
              )}
              {!nextMilestone && sortedMilestones.length > 0 && (
                <p className="pay-prog__xp-next">All XP milestones unlocked &mdash; you&apos;ve maxed the XP track \ud83c\udf89</p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Interactive calculator — P-5 of PAY_PROGRESSION_OVERHAUL.md.
       * "What-if" tool. Pick a role, work type, years, credentials,
       * and XP — see the effective hourly rate update in real time.
       * Pre-fills with the user's current values so the displayed
       * result matches the hero until they start tweaking. */}
      <PayCalculator
        roles={sortedRoles}
        workRates={workRates}
        credentials={credentials}
        seniority={seniority}
        xpMilestones={xpMilestones}
        defaults={{
          roleKey: currentTier?.role_key || (sortedRoles[Math.floor(sortedRoles.length / 2)]?.role_key ?? null),
          workType: workRates[0]?.work_type || null,
          years: yearsEmployed,
          credentialKeys: earnedCreds.map(c => c.credential_key),
          xp: Number(balance?.total_earned || 0),
        }}
      />

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
    </div>
  );
}

// ─── Interactive "what-if" calculator (P-5) ──────────────────────────────────
// Stateful sandbox for users to see how role, seniority, credentials, XP, and
// work-type combine into an effective hourly rate. Reads the same config arrays
// the rest of the page uses, so the math stays consistent. Phase 4 (P-16) lifts
// this calculation into lib/payroll/effective-rate.ts so the override page can
// reuse it.

interface CalculatorDefaults {
  roleKey: string | null;
  workType: string | null;
  years: number;
  credentialKeys: string[];
  xp: number;
}

interface PayCalculatorProps {
  roles: RoleTier[];
  workRates: WorkTypeRate[];
  credentials: CredentialBonus[];
  seniority: SeniorityBracket[];
  xpMilestones: XpMilestone[];
  defaults: CalculatorDefaults;
}

function PayCalculator({ roles, workRates, credentials, seniority, xpMilestones, defaults }: PayCalculatorProps) {
  const [roleKey, setRoleKey] = useState<string | null>(defaults.roleKey);
  const [workType, setWorkType] = useState<string | null>(defaults.workType);
  const [years, setYears] = useState<number>(defaults.years);
  const [credKeys, setCredKeys] = useState<Set<string>>(new Set(defaults.credentialKeys));
  const [xp, setXp] = useState<number>(defaults.xp);

  const tier = roles.find(r => r.role_key === roleKey);
  const work = workRates.find(w => w.work_type === workType);
  const bracket = seniority.find(s => years >= s.min_years && (!s.max_years || years < s.max_years));

  const credentialBonus = credentials
    .filter(c => credKeys.has(c.credential_key))
    .reduce((sum, c) => sum + Number(c.bonus_per_hour || 0), 0);
  const credentialCapped = Math.min(credentialBonus, 8); // pay_system_config.max_credential_stack

  const xpBonus = xpMilestones
    .filter(m => xp >= m.xp_threshold)
    .reduce((sum, m) => sum + Number(m.bonus_per_hour || 0), 0);
  const xpCapped = Math.min(xpBonus, 3); // pay_system_config.max_xp_milestone_bonus

  const roleBonus = Number(tier?.base_bonus || 0);
  const seniorityBonus = Number(bracket?.bonus_per_hour || 0);
  const rawBonusTotal = roleBonus + seniorityBonus + credentialCapped + xpCapped;

  const multiplier = Number(work?.bonus_multiplier ?? 1);
  const adjustedBonus = rawBonusTotal * multiplier;
  const workCap = work?.max_bonus_cap ?? null;
  const cappedBonus = workCap !== null ? Math.min(adjustedBonus, Number(workCap)) : adjustedBonus;

  const baseRate = Number(work?.base_rate || 0);
  const preCeilingTotal = baseRate + cappedBonus;
  const roleCeiling = tier?.max_effective_rate ?? null;
  const effectiveRate = roleCeiling !== null ? Math.min(preCeilingTotal, Number(roleCeiling)) : preCeilingTotal;
  const ceilingApplied = roleCeiling !== null && preCeilingTotal > Number(roleCeiling);

  function toggleCred(key: string) {
    setCredKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="pay-prog__section">
      <div className="pay-prog__section-header">
        <h3 className="pay-prog__section-title">&#x1F9EE; Try the Calculator</h3>
        <span className="pay-prog__section-count">Pre-filled with your values</span>
      </div>
      <p className="pay-prog__section-desc">
        Play with the inputs to see how the pay system stacks up for any combination of role, seniority,
        credentials, XP, and work type. Live math; no changes are saved.
      </p>

      <div className="pay-prog__calc">
        <div className="pay-prog__calc-inputs">
          <label className="pay-prog__calc-field">
            <span className="pay-prog__calc-label">Role tier</span>
            <select
              className="pay-prog__calc-select"
              value={roleKey || ''}
              onChange={e => setRoleKey(e.target.value || null)}
            >
              {roles.map(r => (
                <option key={r.role_key} value={r.role_key}>{r.label || r.role_key}</option>
              ))}
            </select>
          </label>

          <label className="pay-prog__calc-field">
            <span className="pay-prog__calc-label">Work type</span>
            <select
              className="pay-prog__calc-select"
              value={workType || ''}
              onChange={e => setWorkType(e.target.value || null)}
            >
              {workRates.map(w => (
                <option key={w.work_type} value={w.work_type}>{w.label || w.work_type}</option>
              ))}
            </select>
          </label>

          <label className="pay-prog__calc-field">
            <span className="pay-prog__calc-label">Years employed</span>
            <input
              type="number"
              min={0}
              max={50}
              className="pay-prog__calc-input"
              value={years}
              onChange={e => setYears(Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
            />
          </label>

          <label className="pay-prog__calc-field">
            <span className="pay-prog__calc-label">XP earned</span>
            <input
              type="number"
              min={0}
              step={1000}
              className="pay-prog__calc-input"
              value={xp}
              onChange={e => setXp(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>

          <fieldset className="pay-prog__calc-field pay-prog__calc-field--full">
            <legend className="pay-prog__calc-label">Credentials held</legend>
            <div className="pay-prog__calc-creds">
              {credentials.map(c => {
                const checked = credKeys.has(c.credential_key);
                return (
                  <label key={c.credential_key} className={`pay-prog__calc-cred ${checked ? 'pay-prog__calc-cred--on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCred(c.credential_key)}
                    />
                    <span>{c.label || c.credential_key}</span>
                    <span className="pay-prog__calc-cred-bonus">+${Number(c.bonus_per_hour).toFixed(2)}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="pay-prog__calc-output">
          <div className="pay-prog__calc-result">
            <span className="pay-prog__calc-result-label">Effective rate</span>
            <span className="pay-prog__calc-result-rate">${effectiveRate.toFixed(2)}<span className="pay-prog__calc-result-unit">/hr</span></span>
          </div>
          <ul className="pay-prog__calc-stack">
            <li><span>Base ({work?.label || work?.work_type || '—'})</span><span>${baseRate.toFixed(2)}</span></li>
            <li><span>Role bonus ({tier?.label || tier?.role_key || '—'})</span><span>+${roleBonus.toFixed(2)}</span></li>
            <li><span>Seniority ({bracket?.label || '—'})</span><span>+${seniorityBonus.toFixed(2)}</span></li>
            <li>
              <span>Credentials {credentialBonus !== credentialCapped && <em>(capped from ${credentialBonus.toFixed(2)})</em>}</span>
              <span>+${credentialCapped.toFixed(2)}</span>
            </li>
            <li>
              <span>XP milestones {xpBonus !== xpCapped && <em>(capped from ${xpBonus.toFixed(2)})</em>}</span>
              <span>+${xpCapped.toFixed(2)}</span>
            </li>
            <li className="pay-prog__calc-stack-sub">
              <span>Raw bonus</span><span>+${rawBonusTotal.toFixed(2)}</span>
            </li>
            <li>
              <span>Work-type multiplier ({Math.round(multiplier * 100)}%)</span>
              <span>×{multiplier.toFixed(2)}</span>
            </li>
            {workCap !== null && adjustedBonus > Number(workCap) && (
              <li className="pay-prog__calc-stack-warn">
                <span>Work-type cap applied (${Number(workCap).toFixed(0)})</span>
                <span>→ +${cappedBonus.toFixed(2)}</span>
              </li>
            )}
            {ceilingApplied && (
              <li className="pay-prog__calc-stack-warn">
                <span>Role ceiling applied (${Number(roleCeiling).toFixed(0)})</span>
                <span>→ ${effectiveRate.toFixed(2)}</span>
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Work-type rate card (P-10) ─────────────────────────────────────────────
// Renders as the original read-only card by default. When editMode is on,
// shows a pencil button; clicking swaps to an inline form whose Save calls
// PUT /api/admin/pay-config/work-types and Delete calls DELETE. The parent
// page refetches via onChanged so the optimistic-update path stays simple.

interface WorkTypeRateCardProps {
  rate: WorkTypeRate;
  editMode: boolean;
  getMultiplierLabel: (m: number | null) => string;
  onChanged: () => void;
}

function WorkTypeRateCard({ rate, editMode, getMultiplierLabel, onChanged }: WorkTypeRateCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    base_rate: rate.base_rate,
    bonus_multiplier: rate.bonus_multiplier ?? 1,
    max_bonus_cap: rate.max_bonus_cap,
    icon: rate.icon || '',
    label: rate.label || rate.work_type,
  });

  // Reset draft if the underlying row changes (e.g. another admin saved).
  useEffect(() => {
    setDraft({
      base_rate: rate.base_rate,
      bonus_multiplier: rate.bonus_multiplier ?? 1,
      max_bonus_cap: rate.max_bonus_cap,
      icon: rate.icon || '',
      label: rate.label || rate.work_type,
    });
  }, [rate.work_type, rate.base_rate, rate.bonus_multiplier, rate.max_bonus_cap, rate.icon, rate.label]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pay-config/work-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_type: rate.work_type,
          base_rate: Number(draft.base_rate),
          bonus_multiplier: Number(draft.bonus_multiplier),
          max_bonus_cap: draft.max_bonus_cap === null || draft.max_bonus_cap === undefined || (draft.max_bonus_cap as unknown as string) === ''
            ? null
            : Number(draft.max_bonus_cap),
          icon: draft.icon || null,
          label: draft.label || null,
        }),
      });
      if (res.ok) {
        setEditing(false);
        onChanged();
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove "${rate.label || rate.work_type}" from the pay system? This affects every employee's calculation immediately.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/pay-config/work-types?work_type=${encodeURIComponent(rate.work_type)}`, { method: 'DELETE' });
      if (res.ok) onChanged();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="pay-prog__rate-card pay-prog__rate-card--editing">
        <div className="pay-prog__rate-edit-row">
          <input
            className="pay-prog__rate-edit-icon"
            value={draft.icon}
            onChange={e => setDraft(d => ({ ...d, icon: e.target.value }))}
            placeholder="🏗️"
            aria-label="Icon"
            maxLength={4}
          />
          <input
            className="pay-prog__rate-edit-label"
            value={draft.label}
            onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
            placeholder="Label"
            aria-label="Label"
          />
        </div>
        <label className="pay-prog__rate-edit-field">
          <span>Base rate $/hr</span>
          <input
            type="number"
            step="0.25"
            min="0"
            value={draft.base_rate}
            onChange={e => setDraft(d => ({ ...d, base_rate: Number(e.target.value) }))}
          />
        </label>
        <label className="pay-prog__rate-edit-field">
          <span>Bonus multiplier</span>
          <select
            value={String(draft.bonus_multiplier ?? 1)}
            onChange={e => setDraft(d => ({ ...d, bonus_multiplier: Number(e.target.value) }))}
          >
            <option value="1">100% (full)</option>
            <option value="0.75">75%</option>
            <option value="0.5">50%</option>
            <option value="0">0% (no bonus)</option>
          </select>
        </label>
        <label className="pay-prog__rate-edit-field">
          <span>Max bonus cap $/hr (optional)</span>
          <input
            type="number"
            step="1"
            min="0"
            value={draft.max_bonus_cap ?? ''}
            onChange={e => setDraft(d => ({ ...d, max_bonus_cap: e.target.value === '' ? null : Number(e.target.value) }))}
            placeholder="No cap"
          />
        </label>
        <div className="pay-prog__rate-edit-actions">
          <button type="button" className="btn btn--sm btn--primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn btn--sm btn--secondary" disabled={saving} onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn--sm btn--danger" disabled={saving} onClick={remove}>
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pay-prog__rate-card">
      {editMode && (
        <button
          type="button"
          className="pay-prog__edit-pencil"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${rate.label || rate.work_type}`}
          title="Edit"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </button>
      )}
      <span className="pay-prog__rate-icon">{rate.icon || '⚙️'}</span>
      <span className="pay-prog__rate-label">{rate.label || rate.work_type}</span>
      <span className="pay-prog__rate-amount">${Number(rate.base_rate).toFixed(2)}/hr</span>
      <div className="pay-prog__rate-meta">
        <span className={`pay-prog__rate-mult pay-prog__rate-mult--${getMultiplierLabel(rate.bonus_multiplier).toLowerCase().replace('%','')}`}>
          {getMultiplierLabel(rate.bonus_multiplier)} bonus
        </span>
        {rate.max_bonus_cap && (
          <span className="pay-prog__rate-cap">cap ${Number(rate.max_bonus_cap).toFixed(0)}/hr</span>
        )}
      </div>
    </div>
  );
}

// ─── Add work-type button (P-10) ────────────────────────────────────────────

function AddWorkTypeButton({ onAdded }: { onAdded: () => void }) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    work_type: '',
    label: '',
    icon: '',
    base_rate: 18,
    bonus_multiplier: 1,
    max_bonus_cap: null as number | null,
  });

  async function save() {
    if (!draft.work_type.trim()) {
      window.alert('Work type key is required (e.g. "office_clerical").');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pay-config/work-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_type: draft.work_type.trim(),
          label: draft.label || draft.work_type,
          icon: draft.icon || null,
          base_rate: Number(draft.base_rate),
          bonus_multiplier: Number(draft.bonus_multiplier),
          max_bonus_cap: draft.max_bonus_cap,
        }),
      });
      if (res.ok) {
        setAdding(false);
        setDraft({ work_type: '', label: '', icon: '', base_rate: 18, bonus_multiplier: 1, max_bonus_cap: null });
        onAdded();
      } else {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || 'Failed to add work type');
      }
    } finally {
      setSaving(false);
    }
  }

  if (!adding) {
    return (
      <button
        type="button"
        className="pay-prog__rate-card pay-prog__rate-card--add"
        onClick={() => setAdding(true)}
      >
        <span aria-hidden="true" style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.25rem' }}>+</span>
        <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Add work type</span>
      </button>
    );
  }

  return (
    <div className="pay-prog__rate-card pay-prog__rate-card--editing">
      <label className="pay-prog__rate-edit-field">
        <span>Key (snake_case)</span>
        <input
          value={draft.work_type}
          onChange={e => setDraft(d => ({ ...d, work_type: e.target.value }))}
          placeholder="e.g. site_visit"
        />
      </label>
      <div className="pay-prog__rate-edit-row">
        <input
          className="pay-prog__rate-edit-icon"
          value={draft.icon}
          onChange={e => setDraft(d => ({ ...d, icon: e.target.value }))}
          placeholder="🏗️"
          aria-label="Icon"
          maxLength={4}
        />
        <input
          className="pay-prog__rate-edit-label"
          value={draft.label}
          onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
          placeholder="Label"
        />
      </div>
      <label className="pay-prog__rate-edit-field">
        <span>Base rate $/hr</span>
        <input
          type="number"
          step="0.25"
          min="0"
          value={draft.base_rate}
          onChange={e => setDraft(d => ({ ...d, base_rate: Number(e.target.value) }))}
        />
      </label>
      <label className="pay-prog__rate-edit-field">
        <span>Bonus multiplier</span>
        <select
          value={String(draft.bonus_multiplier)}
          onChange={e => setDraft(d => ({ ...d, bonus_multiplier: Number(e.target.value) }))}
        >
          <option value="1">100% (full)</option>
          <option value="0.75">75%</option>
          <option value="0.5">50%</option>
          <option value="0">0% (no bonus)</option>
        </select>
      </label>
      <label className="pay-prog__rate-edit-field">
        <span>Max bonus cap $/hr (optional)</span>
        <input
          type="number"
          step="1"
          min="0"
          value={draft.max_bonus_cap ?? ''}
          onChange={e => setDraft(d => ({ ...d, max_bonus_cap: e.target.value === '' ? null : Number(e.target.value) }))}
          placeholder="No cap"
        />
      </label>
      <div className="pay-prog__rate-edit-actions">
        <button type="button" className="btn btn--sm btn--primary" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Add'}
        </button>
        <button type="button" className="btn btn--sm btn--secondary" disabled={saving} onClick={() => setAdding(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Tier rung (P-11) ───────────────────────────────────────────────────────
// Read-only display by default. When editMode is on, shows a pencil button
// in the rung-stats column; clicking swaps the row into an inline editor
// for label/base_bonus/max_effective_rate/description/icon. Save calls
// /api/admin/pay-config/role-tiers (PUT); Delete calls DELETE (which
// refuses if any employee still references this tier).

interface TierRungProps {
  tier: RoleTier;
  state: 'current' | 'unlocked' | 'locked' | 'neutral';
  isCurrent: boolean;
  isUnlocked: boolean;
  isLocked: boolean;
  editMode: boolean;
  onChanged: () => void;
}

function TierRung({ tier, state, isCurrent, isUnlocked, isLocked, editMode, onChanged }: TierRungProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    label: tier.label || tier.role_key,
    description: tier.description || '',
    icon: '',
    base_bonus: tier.base_bonus,
    max_effective_rate: tier.max_effective_rate,
    sort_order: tier.sort_order ?? null,
  });

  useEffect(() => {
    setDraft({
      label: tier.label || tier.role_key,
      description: tier.description || '',
      icon: '',
      base_bonus: tier.base_bonus,
      max_effective_rate: tier.max_effective_rate,
      sort_order: tier.sort_order ?? null,
    });
  }, [tier.role_key, tier.label, tier.description, tier.base_bonus, tier.max_effective_rate, tier.sort_order]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pay-config/role-tiers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_key: tier.role_key,
          label: draft.label,
          description: draft.description || null,
          icon: draft.icon || undefined,
          base_bonus: Number(draft.base_bonus),
          max_effective_rate: draft.max_effective_rate === null || (draft.max_effective_rate as unknown as string) === ''
            ? null
            : Number(draft.max_effective_rate),
          sort_order: draft.sort_order === null || (draft.sort_order as unknown as string) === ''
            ? null
            : Number(draft.sort_order),
        }),
      });
      if (res.ok) {
        setEditing(false);
        onChanged();
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove tier "${tier.label || tier.role_key}"? This is blocked if any employees still reference it.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/pay-config/role-tiers?role_key=${encodeURIComponent(tier.role_key)}`, { method: 'DELETE' });
      if (res.ok) {
        onChanged();
      } else {
        const body = await res.json().catch(() => ({}));
        window.alert(body.error || 'Failed to delete tier');
      }
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <li className="pay-prog__rung pay-prog__rung--editing">
        <div className="pay-prog__rung-marker" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </div>
        <div className="pay-prog__rung-edit-body">
          <div className="pay-prog__rate-edit-row">
            <input
              className="pay-prog__rate-edit-icon"
              value={draft.icon}
              onChange={e => setDraft(d => ({ ...d, icon: e.target.value }))}
              placeholder={tier.icon || '🏅'}
              aria-label="Icon"
              maxLength={4}
            />
            <input
              className="pay-prog__rate-edit-label"
              value={draft.label}
              onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
              placeholder="Label"
            />
          </div>
          <label className="pay-prog__rate-edit-field">
            <span>Description</span>
            <input
              value={draft.description}
              onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
              placeholder="What this tier does"
            />
          </label>
          <div className="pay-prog__rung-edit-grid">
            <label className="pay-prog__rate-edit-field">
              <span>Base bonus $/hr</span>
              <input
                type="number"
                step="0.25"
                min="0"
                value={draft.base_bonus}
                onChange={e => setDraft(d => ({ ...d, base_bonus: Number(e.target.value) }))}
              />
            </label>
            <label className="pay-prog__rate-edit-field">
              <span>Max effective $/hr</span>
              <input
                type="number"
                step="1"
                min="0"
                value={draft.max_effective_rate ?? ''}
                onChange={e => setDraft(d => ({ ...d, max_effective_rate: e.target.value === '' ? null : Number(e.target.value) }))}
                placeholder="No ceiling"
              />
            </label>
            <label className="pay-prog__rate-edit-field">
              <span>Sort order</span>
              <input
                type="number"
                step="1"
                value={draft.sort_order ?? ''}
                onChange={e => setDraft(d => ({ ...d, sort_order: e.target.value === '' ? null : Number(e.target.value) }))}
                placeholder="Auto"
              />
            </label>
          </div>
          <div className="pay-prog__rate-edit-actions">
            <button type="button" className="btn btn--sm btn--primary" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn--sm btn--secondary" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn--sm btn--danger" disabled={saving} onClick={remove}>
              Delete
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className={`pay-prog__rung pay-prog__rung--${state}`}>
      <div className="pay-prog__rung-marker" aria-hidden="true">
        {isUnlocked && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        )}
        {isCurrent && <span className="pay-prog__rung-marker-pulse" />}
        {isLocked && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        )}
      </div>
      <div className="pay-prog__rung-body">
        <div className="pay-prog__rung-head">
          <span className="pay-prog__rung-label">
            {tier.icon && <span className="pay-prog__rung-icon" aria-hidden="true">{tier.icon}</span>}
            {tier.label || tier.role_key}
          </span>
          {isCurrent && <span className="pay-prog__rung-badge">You are here</span>}
        </div>
        {tier.description && <p className="pay-prog__rung-desc">{tier.description}</p>}
      </div>
      <div className="pay-prog__rung-stats">
        {editMode && (
          <button
            type="button"
            className="pay-prog__edit-pencil"
            onClick={() => setEditing(true)}
            aria-label={`Edit ${tier.label || tier.role_key}`}
            title="Edit tier"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
        )}
        <span className="pay-prog__rung-bonus">+${Number(tier.base_bonus).toFixed(2)}/hr</span>
        {tier.max_effective_rate && (
          <span className="pay-prog__rung-cap">cap ${Number(tier.max_effective_rate).toFixed(0)}/hr</span>
        )}
      </div>
    </li>
  );
}

// ─── Add tier button (P-11) ─────────────────────────────────────────────────

function AddTierButton({ onAdded }: { onAdded: () => void }) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    role_key: '',
    label: '',
    description: '',
    icon: '',
    base_bonus: 0,
    max_effective_rate: null as number | null,
    sort_order: null as number | null,
  });

  async function save() {
    if (!draft.role_key.trim()) {
      window.alert('Tier key is required (e.g. "senior_party_chief").');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pay-config/role-tiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_key: draft.role_key.trim(),
          label: draft.label || draft.role_key,
          description: draft.description || null,
          icon: draft.icon || null,
          base_bonus: Number(draft.base_bonus),
          max_effective_rate: draft.max_effective_rate,
          sort_order: draft.sort_order,
        }),
      });
      if (res.ok) {
        setAdding(false);
        setDraft({ role_key: '', label: '', description: '', icon: '', base_bonus: 0, max_effective_rate: null, sort_order: null });
        onAdded();
      } else {
        const body = await res.json().catch(() => ({}));
        window.alert(body.error || 'Failed to add tier');
      }
    } finally {
      setSaving(false);
    }
  }

  if (!adding) {
    return (
      <button
        type="button"
        className="pay-prog__rung-add"
        onClick={() => setAdding(true)}
      >
        <span aria-hidden="true">+</span> Add tier
      </button>
    );
  }

  return (
    <div className="pay-prog__rung pay-prog__rung--editing">
      <div className="pay-prog__rung-marker" aria-hidden="true">+</div>
      <div className="pay-prog__rung-edit-body">
        <label className="pay-prog__rate-edit-field">
          <span>Key (snake_case)</span>
          <input
            value={draft.role_key}
            onChange={e => setDraft(d => ({ ...d, role_key: e.target.value }))}
            placeholder="e.g. senior_party_chief"
          />
        </label>
        <div className="pay-prog__rate-edit-row">
          <input
            className="pay-prog__rate-edit-icon"
            value={draft.icon}
            onChange={e => setDraft(d => ({ ...d, icon: e.target.value }))}
            placeholder="🏅"
            aria-label="Icon"
            maxLength={4}
          />
          <input
            className="pay-prog__rate-edit-label"
            value={draft.label}
            onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
            placeholder="Label"
          />
        </div>
        <label className="pay-prog__rate-edit-field">
          <span>Description</span>
          <input
            value={draft.description}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
          />
        </label>
        <div className="pay-prog__rung-edit-grid">
          <label className="pay-prog__rate-edit-field">
            <span>Base bonus $/hr</span>
            <input
              type="number"
              step="0.25"
              min="0"
              value={draft.base_bonus}
              onChange={e => setDraft(d => ({ ...d, base_bonus: Number(e.target.value) }))}
            />
          </label>
          <label className="pay-prog__rate-edit-field">
            <span>Max effective $/hr</span>
            <input
              type="number"
              step="1"
              min="0"
              value={draft.max_effective_rate ?? ''}
              onChange={e => setDraft(d => ({ ...d, max_effective_rate: e.target.value === '' ? null : Number(e.target.value) }))}
              placeholder="No ceiling"
            />
          </label>
          <label className="pay-prog__rate-edit-field">
            <span>Sort order</span>
            <input
              type="number"
              step="1"
              value={draft.sort_order ?? ''}
              onChange={e => setDraft(d => ({ ...d, sort_order: e.target.value === '' ? null : Number(e.target.value) }))}
              placeholder="Auto"
            />
          </label>
        </div>
        <div className="pay-prog__rate-edit-actions">
          <button type="button" className="btn btn--sm btn--primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Add'}
          </button>
          <button type="button" className="btn btn--sm btn--secondary" disabled={saving} onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
