'use client';
// app/admin/pay-progression/PayCalculator.tsx — the P-5 "what-if" calculator.
//
// Lifted out of page.tsx for platform audit item 18 (2,578 lines). Verbatim: it already took every
// config array it reads as a prop, and its arithmetic already lived in lib/payroll/effective-rate.
import { useState } from 'react';
import { Calculator } from 'lucide-react';
import { computeEffectiveRate, findSeniorityBracket } from '@/lib/payroll/effective-rate';
import type { CredentialBonus, RoleTier, SeniorityBracket, WorkTypeRate, XpMilestone } from './pay-types';

// ─── Interactive "what-if" calculator (P-5) ──────────────────────────────────
// Stateful sandbox for users to see how role, seniority, credentials, XP, and
// work-type combine into an effective hourly rate. Reads the same config arrays
// the rest of the page uses, so the math stays consistent. Phase 4 (P-16) lifts
// this calculation into lib/payroll/effective-rate.ts so the override page can
// reuse it.

export interface CalculatorDefaults {
  roleKey: string | null;
  workType: string | null;
  years: number;
  credentialKeys: string[];
  xp: number;
}

export interface PayCalculatorProps {
  roles: RoleTier[];
  workRates: WorkTypeRate[];
  credentials: CredentialBonus[];
  seniority: SeniorityBracket[];
  xpMilestones: XpMilestone[];
  defaults: CalculatorDefaults;
}

export function PayCalculator({ roles, workRates, credentials, seniority, xpMilestones, defaults }: PayCalculatorProps) {
  const [roleKey, setRoleKey] = useState<string | null>(defaults.roleKey);
  const [workType, setWorkType] = useState<string | null>(defaults.workType);
  const [years, setYears] = useState<number>(defaults.years);
  const [credKeys, setCredKeys] = useState<Set<string>>(new Set(defaults.credentialKeys));
  const [xp, setXp] = useState<number>(defaults.xp);

  // P-16: use the canonical effective-rate calculator. All caps + cap logic
  // live in lib/payroll/effective-rate.ts so the math here always matches
  // what the per-user override page (P-17) will compute.
  const tier = roles.find(r => r.role_key === roleKey) || null;
  const work = workRates.find(w => w.work_type === workType);
  const result = work
    ? computeEffectiveRate({
        workType: work,
        tier,
        yearsEmployed: years,
        seniority,
        earnedCredentialKeys: Array.from(credKeys),
        credentials,
        totalXp: xp,
        xpMilestones,
      })
    : null;

  const baseRate = result?.baseRate ?? 0;
  const roleBonus = result?.roleBonus ?? 0;
  const seniorityBonus = result?.seniorityBonus ?? 0;
  const credentialBonus = result?.credentialBonusRaw ?? 0;
  const credentialCapped = result?.credentialBonusCapped ?? 0;
  const xpBonus = result?.xpBonusRaw ?? 0;
  const xpCapped = result?.xpBonusCapped ?? 0;
  const rawBonusTotal = result?.rawBonusTotal ?? 0;
  const multiplier = result?.multiplier ?? 1;
  const adjustedBonus = result?.adjustedBonus ?? 0;
  const workCap = work?.max_bonus_cap ?? null;
  const cappedBonus = result?.cappedBonus ?? 0;
  const effectiveRate = result?.effectiveRate ?? 0;
  const roleCeiling = tier?.max_effective_rate ?? null;
  const ceilingApplied = result?.ceilingApplied ?? false;
  const bracket = findSeniorityBracket(seniority, years);

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
        <h3 className="pay-prog__section-title"><Calculator size={18} style={{ verticalAlign: "-3px", marginRight: "0.4rem" }} />Try the Calculator</h3>
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
