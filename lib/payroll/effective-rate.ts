// lib/payroll/effective-rate.ts
//
// Canonical effective-rate calculation for the pay-progression system.
// P-16 of PAY_PROGRESSION_OVERHAUL.md.
//
// One function, deterministic, no I/O. Consumed by:
//   - app/admin/pay-progression/page.tsx (hero card, what-if calculator)
//   - the per-user override preview (P-17)
//   - the read-side of the payroll-run engine, eventually
//
// The math mirrors §3.1 of PAY_PROGRESSION_OVERHAUL.md exactly. When
// changing the formula, change this function and the unit tests in
// __tests__/payroll/effective-rate.test.ts in the same commit.

export interface WorkTypeRow {
  work_type: string;
  base_rate: number;
  bonus_multiplier: number | null;
  max_bonus_cap: number | null;
}

export interface RoleTierRow {
  role_key: string;
  base_bonus: number;
  max_effective_rate: number | null;
}

export interface SeniorityBracketRow {
  min_years: number;
  max_years: number | null;
  bonus_per_hour: number;
  label?: string | null;
}

export interface CredentialRow {
  credential_key: string;
  bonus_per_hour: number;
}

export interface XpMilestoneRow {
  xp_threshold: number;
  bonus_per_hour: number;
}

export interface PayOverrideRow {
  fixed_rate?: number | null;
  role_bonus_multiplier?: number | null;
  seniority_multiplier?: number | null;
  flat_addition?: number | null;
}

export interface SystemCaps {
  max_credential_stack?: number;
  max_xp_milestone_bonus?: number;
}

export interface EffectiveRateInputs {
  workType: WorkTypeRow;
  tier: RoleTierRow | null;
  yearsEmployed: number;
  seniority: SeniorityBracketRow[];
  earnedCredentialKeys: string[];
  credentials: CredentialRow[];
  totalXp: number;
  xpMilestones: XpMilestoneRow[];
  override?: PayOverrideRow | null;
  caps?: SystemCaps;
}

export interface EffectiveRateBreakdown {
  baseRate: number;
  roleBonus: number;
  seniorityBonus: number;
  credentialBonusRaw: number;
  credentialBonusCapped: number;
  xpBonusRaw: number;
  xpBonusCapped: number;
  flatAddition: number;
  rawBonusTotal: number;
  multiplier: number;
  adjustedBonus: number;
  workCapApplied: boolean;
  cappedBonus: number;
  preCeilingTotal: number;
  ceilingApplied: boolean;
  effectiveRate: number;
  fixedRateApplied: boolean;
}

const DEFAULT_CREDENTIAL_CAP = 8;
const DEFAULT_XP_CAP = 3;

/**
 * Pick the seniority bracket whose [min_years, max_years] contains years.
 *
 * ── max_years IS INCLUSIVE (fixed 2026-08-04) ─────────────────────────────────────────────────
 *
 * This was `years < b.max_years`, which tiles correctly against half-open brackets (0–1, 1–3, 3–5)
 * — the shape this function's own unit-test fixtures used. **The firm's live `seniority_brackets`
 * rows are inclusive ranges**: 0–0, 1–1, 2–2, 3–4, 5–6, 7–9, 10–14, 15–19, 20–null.
 *
 * Against those rows the exclusive test matched nothing at 1, 2, 4, 6, 9, 14 and 19 years, so
 * `findSeniorityBracket` returned null and the bonus silently became $0. The firm's one employee —
 * hired 2025-07-15, one year in — was losing $0.50/hr this way, and any bracket whose min equals
 * its max (three of the nine) could never match anybody at all.
 *
 * That is the failure this codebase keeps producing: a lookup that finds nothing returns an absence
 * that renders as a legitimate zero. Nobody sees an error; somebody just gets paid less.
 *
 * Inclusive alone is not enough, because half-open rows then overlap (year 3 sits in both 1–3 and
 * 3–5). So the most specific match wins: the highest `min_years` among the brackets that contain
 * the year. That reproduces the previous answers for half-open data and is correct for inclusive
 * data, which means both shapes can coexist in the table without a migration.
 */
export function findSeniorityBracket(brackets: SeniorityBracketRow[], years: number): SeniorityBracketRow | null {
  let best: SeniorityBracketRow | null = null;
  for (const b of brackets) {
    const inRange = years >= b.min_years && (b.max_years === null || years <= b.max_years);
    if (inRange && (best === null || b.min_years > best.min_years)) best = b;
  }
  return best;
}

/** Compute the effective hourly rate per §3.1 of the plan. */
export function computeEffectiveRate(input: EffectiveRateInputs): EffectiveRateBreakdown {
  const override = input.override ?? null;
  const caps = input.caps ?? {};
  const credentialCap = caps.max_credential_stack ?? DEFAULT_CREDENTIAL_CAP;
  const xpCap = caps.max_xp_milestone_bonus ?? DEFAULT_XP_CAP;

  // Override.fixed_rate short-circuits the entire formula.
  if (override?.fixed_rate !== null && override?.fixed_rate !== undefined) {
    return {
      baseRate: 0,
      roleBonus: 0,
      seniorityBonus: 0,
      credentialBonusRaw: 0,
      credentialBonusCapped: 0,
      xpBonusRaw: 0,
      xpBonusCapped: 0,
      flatAddition: 0,
      rawBonusTotal: 0,
      multiplier: 1,
      adjustedBonus: 0,
      workCapApplied: false,
      cappedBonus: 0,
      preCeilingTotal: Number(override.fixed_rate),
      ceilingApplied: false,
      effectiveRate: Number(override.fixed_rate),
      fixedRateApplied: true,
    };
  }

  const baseRate = Number(input.workType.base_rate || 0);

  const roleMultiplier = Number(override?.role_bonus_multiplier ?? 1);
  const roleBonusRaw = Number(input.tier?.base_bonus || 0);
  const roleBonus = roleBonusRaw * roleMultiplier;

  const senMultiplier = Number(override?.seniority_multiplier ?? 1);
  const bracket = findSeniorityBracket(input.seniority, input.yearsEmployed);
  const seniorityBonus = Number(bracket?.bonus_per_hour || 0) * senMultiplier;

  const earned = new Set(input.earnedCredentialKeys);
  const credentialBonusRaw = input.credentials
    .filter(c => earned.has(c.credential_key))
    .reduce((sum, c) => sum + Number(c.bonus_per_hour || 0), 0);
  const credentialBonusCapped = Math.min(credentialBonusRaw, credentialCap);

  const xpBonusRaw = input.xpMilestones
    .filter(m => input.totalXp >= m.xp_threshold)
    .reduce((sum, m) => sum + Number(m.bonus_per_hour || 0), 0);
  const xpBonusCapped = Math.min(xpBonusRaw, xpCap);

  const flatAddition = Number(override?.flat_addition ?? 0);

  const rawBonusTotal = roleBonus + seniorityBonus + credentialBonusCapped + xpBonusCapped + flatAddition;

  const multiplier = Number(input.workType.bonus_multiplier ?? 1);
  const adjustedBonus = rawBonusTotal * multiplier;

  const workCap = input.workType.max_bonus_cap;
  const workCapApplied = workCap !== null && workCap !== undefined && adjustedBonus > Number(workCap);
  const cappedBonus = workCapApplied ? Number(workCap) : adjustedBonus;

  const preCeilingTotal = baseRate + cappedBonus;

  const roleCeiling = input.tier?.max_effective_rate;
  const ceilingApplied = roleCeiling !== null && roleCeiling !== undefined && preCeilingTotal > Number(roleCeiling);
  const effectiveRate = ceilingApplied ? Number(roleCeiling) : preCeilingTotal;

  return {
    baseRate,
    roleBonus,
    seniorityBonus,
    credentialBonusRaw,
    credentialBonusCapped,
    xpBonusRaw,
    xpBonusCapped,
    flatAddition,
    rawBonusTotal,
    multiplier,
    adjustedBonus,
    workCapApplied,
    cappedBonus,
    preCeilingTotal,
    ceilingApplied,
    effectiveRate,
    fixedRateApplied: false,
  };
}
