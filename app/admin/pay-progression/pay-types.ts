// app/admin/pay-progression/pay-types.ts — the pay-config row shapes.
//
// Split out for platform audit item 18: the page, the calculator and the editors all read these,
// and three copies of a shape that mirrors /api/admin/pay-config is how they drift apart.

export interface WorkTypeRate {
  work_type: string;
  base_rate: number;
  icon: string;
  label: string;
  max_bonus_cap: number | null;
  bonus_multiplier: number | null;
}

export interface RoleTier {
  role_key: string;
  label: string;
  base_bonus: number;
  max_effective_rate: number | null;
  description?: string | null;
  sort_order?: number | null;
  icon?: string | null;
}

export interface SeniorityBracket {
  min_years: number;
  max_years: number | null;
  bonus_per_hour: number;
  label: string;
}

export interface CredentialBonus {
  credential_key: string;
  label: string;
  bonus_per_hour: number;
  credential_type: string;
}

export interface XpMilestone {
  xp_threshold: number;
  bonus_per_hour: number;
  label: string;
  achieved: boolean;
}

export interface Profile {
  hire_date: string;
  job_title: string;
  hourly_rate: number;
}

export interface XpBalance {
  current_balance: number;
  total_earned: number;
  total_spent: number;
}
