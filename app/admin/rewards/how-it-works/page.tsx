// app/admin/rewards/how-it-works/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface XPConfig { xp_value: number; expiry_months: number; }
interface Milestone { xp_threshold: number; bonus_per_hour: number; label: string; }
interface Badge { name: string; xp_reward: number; badge_key: string; }

export default function HowItWorksPage() {
  const [moduleXpRange, setModuleXpRange] = useState<{ min: number; max: number }>({ min: 400, max: 600 });
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [badgeXpRange, setBadgeXpRange] = useState<{ min: number; max: number }>({ min: 50, max: 5000 });
  const [fsReadyXp, setFsReadyXp] = useState(3500);
  const [sitXp, setSitXp] = useState(5000);
  const [rplsXp, setRplsXp] = useState(10000);

  useEffect(() => {
    // Fetch dynamic XP values
    Promise.all([
      fetch('/api/admin/learn/xp-config').then(r => r.ok ? r.json() : null),
      fetch('/api/admin/rewards?section=pay').then(r => r.ok ? r.json() : null),
      fetch('/api/admin/rewards?section=badges').then(r => r.ok ? r.json() : null),
    ]).then(([xpData, payData, badgeData]) => {
      if (xpData?.learning_modules?.length) {
        const vals = xpData.learning_modules.map((m: XPConfig) => m.xp_value);
        setModuleXpRange({ min: Math.min(...vals), max: Math.max(...vals) });
      }
      if (payData?.xp_milestones?.length) {
        setMilestones(payData.xp_milestones);
      }
      if (badgeData?.badges?.length) {
        const xps = badgeData.badges.filter((b: Badge) => b.xp_reward > 0).map((b: Badge) => b.xp_reward);
        if (xps.length) setBadgeXpRange({ min: Math.min(...xps), max: Math.max(...xps) });
        const fs = badgeData.badges.find((b: Badge) => b.badge_key === 'fs_ready');
        if (fs) setFsReadyXp(fs.xp_reward);
        const sit = badgeData.badges.find((b: Badge) => b.badge_key === 'sit_certified');
        if (sit) setSitXp(sit.xp_reward);
        const rpls = badgeData.badges.find((b: Badge) => b.badge_key === 'rpls_certified');
        if (rpls) setRplsXp(rpls.xp_reward);
      }
    }).catch(() => {});
  }, []);

  const fmtRange = (min: number, max: number) =>
    min === max ? `+${min.toLocaleString()} XP` : `+${min.toLocaleString()}-${max.toLocaleString()} XP`;

  const firstMilestone = milestones[0];
  const milestoneDesc = firstMilestone
    ? `Every ${firstMilestone.xp_threshold.toLocaleString()} total XP = +$${firstMilestone.bonus_per_hour.toFixed(2)}/hr permanent bonus.`
    : 'Every 10,000 total XP = +$0.50/hr permanent bonus.';

  return (
    <>
      <div className="admin-learn__header">
        <Link href="/admin/rewards" className="admin-module-detail__back">&larr; Back to Rewards</Link>
        <h2 className="admin-learn__title">&#x1F4A1; How Rewards Work</h2>
        <p className="admin-learn__subtitle">
          Everything you need to know about earning XP, getting pay increases, and redeeming rewards.
        </p>
      </div>

      {/* XP System */}
      <div className="hiw__section">
        <h3 className="hiw__title">&#x2B50; The XP System</h3>
        <p className="hiw__text">
          XP (Experience Points) is our way of rewarding you for growing your skills and knowledge.
          You earn XP by completing learning modules, passing quizzes, earning certifications, and more.
        </p>

        <div className="hiw__two-col">
          <div className="hiw__card">
            <h4>How to Earn XP</h4>
            <table className="hiw__table">
              <tbody>
                <tr><td>Complete a learning module</td><td className="hiw__table-xp">{fmtRange(moduleXpRange.min, moduleXpRange.max)}</td></tr>
                <tr><td>Complete FS prep course</td><td className="hiw__table-xp">+{fsReadyXp.toLocaleString()} XP</td></tr>
                <tr><td>Pass SIT/FS exam</td><td className="hiw__table-xp">+{sitXp.toLocaleString()} XP</td></tr>
                <tr><td>Pass RPLS exam</td><td className="hiw__table-xp">+{rplsXp.toLocaleString()} XP</td></tr>
                <tr><td>Earn a badge</td><td className="hiw__table-xp">{fmtRange(badgeXpRange.min, badgeXpRange.max)}</td></tr>
                <tr><td>Pass a college surveying class</td><td className="hiw__table-xp">+1,000 XP</td></tr>
                <tr><td>Retake expired module</td><td className="hiw__table-xp">Full XP again</td></tr>
              </tbody>
            </table>
          </div>

          <div className="hiw__card">
            <h4>Two XP Balances</h4>
            <div className="hiw__callout hiw__callout--blue">
              <strong>All-Time Total XP</strong>
              <p>This number only goes up. It determines your XP milestone pay bonuses. Every XP you ever earn counts toward this total, even after spending XP in the store.</p>
            </div>
            <div className="hiw__callout hiw__callout--green">
              <strong>Spendable XP Balance</strong>
              <p>This is what you can spend in the company store. When you buy something, it deducts from your spendable balance but your all-time total stays the same.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pay Increases */}
      <div className="hiw__section">
        <h3 className="hiw__title">&#x1F4B5; How Pay Increases Work</h3>
        <p className="hiw__text">
          Your hourly pay is made up of several components that stack together.
          There are multiple ways to increase your pay!
        </p>

        <div className="hiw__pay-paths">
          <div className="hiw__pay-path">
            <div className="hiw__pay-path-icon" style={{ background: '#10B981' }}>1</div>
            <h4>Seniority</h4>
            <p>Automatic bonuses as you stay with the company. 6 months = +$0.50/hr, 1 year = +$0.50/hr more, growing up to +$12/hr at 20+ years.</p>
          </div>
          <div className="hiw__pay-path">
            <div className="hiw__pay-path-icon" style={{ background: '#1D3095' }}>2</div>
            <h4>Credentials</h4>
            <p>Each certification adds to your pay. SIT = +$2/hr, RPLS = +$3/hr, OSHA = +$0.25-0.75/hr, and more. These all stack!</p>
          </div>
          <div className="hiw__pay-path">
            <div className="hiw__pay-path-icon" style={{ background: '#F59E0B' }}>3</div>
            <h4>XP Milestones</h4>
            <p>{milestoneDesc} Keep earning!</p>
          </div>
          <div className="hiw__pay-path">
            <div className="hiw__pay-path-icon" style={{ background: '#BD1218' }}>4</div>
            <h4>Education</h4>
            <p>Each surveying college class passed = +$0.50/hr. The company pays for classes you pass on the first try!</p>
          </div>
          <div className="hiw__pay-path">
            <div className="hiw__pay-path-icon" style={{ background: '#7C3AED' }}>5</div>
            <h4>Role Advancement</h4>
            <p>Moving up in your career role brings the biggest bonuses. Field Hand = +$1/hr, Party Chief = +$8/hr, RPLS = +$22/hr.</p>
          </div>
        </div>
      </div>

      {/* Module Expiration */}
      <div className="hiw__section">
        <h3 className="hiw__title">&#x1F504; Module Expiration &amp; Retakes</h3>
        <p className="hiw__text">
          Knowledge needs to stay fresh! Completed modules expire after 12-20 months (depending on the module).
          When a module expires:
        </p>
        <ul className="hiw__list">
          <li>You&apos;ll be notified that it&apos;s time to review</li>
          <li>The module content may have been updated with new information</li>
          <li>You can retake the module and <strong>re-earn the full XP</strong></li>
          <li>This keeps your knowledge current and your XP balance growing</li>
          <li>Your all-time XP total grows with every retake, unlocking more pay milestones</li>
        </ul>
      </div>

      {/* Company Store */}
      <div className="hiw__section">
        <h3 className="hiw__title">&#x1F6CD;&#xFE0F; Company Store</h3>
        <p className="hiw__text">
          Spend your XP on real rewards! Items can be purchased with XP or cash. The store has five tiers of items:
        </p>
        <div className="hiw__tiers">
          <div className="hiw__tier" style={{ borderColor: '#CD7F32' }}>
            <strong style={{ color: '#CD7F32' }}>Bronze (500-2K XP)</strong>
            <p>Stickers, decals, koozies, pens, small gift cards</p>
          </div>
          <div className="hiw__tier" style={{ borderColor: '#C0C0C0' }}>
            <strong style={{ color: '#808080' }}>Silver (2K-5K XP)</strong>
            <p>T-shirts, hats, water bottles, $10-20 gift cards</p>
          </div>
          <div className="hiw__tier" style={{ borderColor: '#FFD700' }}>
            <strong style={{ color: '#B8860B' }}>Gold (5K-10K XP)</strong>
            <p>$50 gift cards, polo shirts, cash bonuses, multi-tools</p>
          </div>
          <div className="hiw__tier" style={{ borderColor: '#E5E4E2' }}>
            <strong style={{ color: '#666' }}>Platinum (10K-20K XP)</strong>
            <p>Work boots, knives, Bluetooth speakers, Yeti gear</p>
          </div>
          <div className="hiw__tier" style={{ borderColor: '#87CEEB' }}>
            <strong style={{ color: '#4682B4' }}>Diamond (20K+ XP)</strong>
            <p>Carhartt jackets, $100+ cash bonuses, premium coolers</p>
          </div>
        </div>
      </div>

      {/* Education Reimbursement */}
      <div className="hiw__section">
        <h3 className="hiw__title">&#x1F393; Education Reimbursement Rules</h3>
        <div className="hiw__edu-flow">
          <div className="hiw__edu-step hiw__edu-step--pass">
            <strong>First Try &mdash; Pass</strong>
            <p>Company pays 100%. You get +$0.50/hr raise. XP awarded. Resets for next class.</p>
          </div>
          <div className="hiw__edu-arrow">&rarr;</div>
          <div className="hiw__edu-step hiw__edu-step--fail">
            <strong>First Try &mdash; Fail</strong>
            <p>No reimbursement. Move to Attempt 2.</p>
          </div>
          <div className="hiw__edu-arrow">&darr;</div>
          <div className="hiw__edu-step hiw__edu-step--warn">
            <strong>Second Try</strong>
            <p>Company pays 50%. If you pass, reset to 100% for next semester.</p>
          </div>
          <div className="hiw__edu-arrow">&darr;</div>
          <div className="hiw__edu-step hiw__edu-step--fail">
            <strong>Third Try</strong>
            <p>Employee pays 100%. If pass, company resets to 100% for next class.</p>
          </div>
          <div className="hiw__edu-arrow">&darr;</div>
          <div className="hiw__edu-step hiw__edu-step--fail">
            <strong>Fourth+ Try (after consecutive failures)</strong>
            <p>Employee pays 100% until they pass. After passing, full reset.</p>
          </div>
        </div>
      </div>

      {/* FS Prep Incentive */}
      <div className="hiw__section">
        <h3 className="hiw__title">&#x1F3AF; FS Exam Prep Incentive</h3>
        <p className="hiw__text">
          Complete the full FS Exam Prep course (all 8 modules + passing the mock exam) to earn:
        </p>
        <ul className="hiw__list hiw__list--highlight">
          <li>The <strong>FS Ready</strong> badge on your profile</li>
          <li><strong>{fsReadyXp.toLocaleString()} XP</strong> bonus</li>
          <li>The company will <strong>pay for your FS exam registration</strong></li>
          <li>A <strong>+$5.00/hr raise</strong> when you pass the actual FS exam</li>
          <li>An additional <strong>+$10.00/hr</strong> when you get your SIT certification</li>
        </ul>
        <p className="hiw__text">
          If you choose not to do the prep course, you can still take the FS exam on your own &mdash;
          but you&apos;ll pay for it out of pocket. You&apos;ll still get the +$5.00/hr raise for passing.
        </p>
      </div>

      <div style={{ textAlign: 'center', margin: '2rem 0' }}>
        <Link href="/admin/rewards" className="admin-btn admin-btn--primary" style={{ marginRight: '1rem' }}>
          Go to Rewards Store
        </Link>
        <Link href="/admin/pay-progression" className="admin-btn admin-btn--secondary">
          View Pay Progression
        </Link>
      </div>
    </>
  );
}
