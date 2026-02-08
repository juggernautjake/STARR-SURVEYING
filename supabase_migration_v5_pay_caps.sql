-- ============================================================
-- PAY SYSTEM v5 — Rate Caps & Bonus Rebalancing
-- ============================================================
-- Reduces total compensation ~8-10% across the board by:
--   1. Adding per-work-type bonus caps (e.g., driving capped at $25 bonus)
--   2. Adding a global max effective rate per role
--   3. Reducing some credential bonuses
--   4. Reducing seniority bonuses at higher tiers
--   5. Capping XP milestone bonuses and course bonuses
--
-- Key principle: bonuses for role, seniority, and credentials
-- should reflect the VALUE of that expertise for the specific
-- work type. An RPLS's expertise isn't worth $22/hr extra when
-- driving a truck.
-- ============================================================

-- ── 1. Add work-type bonus cap column ──
-- This caps how much TOTAL bonus (role+seniority+credentials+XP+courses)
-- can be stacked on top of the base rate for each work type.
ALTER TABLE work_type_rates ADD COLUMN IF NOT EXISTS max_bonus_cap DECIMAL(10,2);
ALTER TABLE work_type_rates ADD COLUMN IF NOT EXISTS bonus_multiplier DECIMAL(4,2) DEFAULT 1.00;

-- Set caps per work type:
-- Field/Drawing/Supervision/Legal: full bonuses (1.0x multiplier, high cap)
-- Research/Office: moderate bonuses (0.75x multiplier)
-- Driving/Equip Maint/Education/Misc: reduced bonuses (0.50x multiplier)
UPDATE work_type_rates SET max_bonus_cap = 55.00, bonus_multiplier = 1.00 WHERE work_type = 'field_work';
UPDATE work_type_rates SET max_bonus_cap = 55.00, bonus_multiplier = 1.00 WHERE work_type = 'drawing';
UPDATE work_type_rates SET max_bonus_cap = 50.00, bonus_multiplier = 1.00 WHERE work_type = 'supervision';
UPDATE work_type_rates SET max_bonus_cap = 50.00, bonus_multiplier = 1.00 WHERE work_type = 'legal';
UPDATE work_type_rates SET max_bonus_cap = 35.00, bonus_multiplier = 0.75 WHERE work_type = 'research';
UPDATE work_type_rates SET max_bonus_cap = 30.00, bonus_multiplier = 0.75 WHERE work_type = 'office';
UPDATE work_type_rates SET max_bonus_cap = 25.00, bonus_multiplier = 0.50 WHERE work_type = 'driving';
UPDATE work_type_rates SET max_bonus_cap = 20.00, bonus_multiplier = 0.50 WHERE work_type = 'equipment_maint';
UPDATE work_type_rates SET max_bonus_cap = 20.00, bonus_multiplier = 0.50 WHERE work_type = 'education';
UPDATE work_type_rates SET max_bonus_cap = 20.00, bonus_multiplier = 0.50 WHERE work_type = 'misc';

-- ── 2. Add global max effective rate per role tier ──
-- This is an absolute ceiling regardless of stacking.
ALTER TABLE role_tiers ADD COLUMN IF NOT EXISTS max_effective_rate DECIMAL(10,2);

-- Role tier bonus reductions (8-10% lower):
-- Keep intern/field_hand/rodman the same (low pay, no reduction needed)
-- Reduce higher tiers slightly
UPDATE role_tiers SET base_bonus = 0.00,  max_effective_rate = 22.00  WHERE role_key = 'intern';
UPDATE role_tiers SET base_bonus = 1.00,  max_effective_rate = 28.00  WHERE role_key = 'field_hand';
UPDATE role_tiers SET base_bonus = 2.00,  max_effective_rate = 32.00  WHERE role_key = 'rodman';
UPDATE role_tiers SET base_bonus = 3.50,  max_effective_rate = 36.00  WHERE role_key = 'instrument_op';
UPDATE role_tiers SET base_bonus = 5.00,  max_effective_rate = 42.00  WHERE role_key = 'survey_tech';
UPDATE role_tiers SET base_bonus = 8.00,  max_effective_rate = 52.00  WHERE role_key = 'party_chief';
UPDATE role_tiers SET base_bonus = 7.00,  max_effective_rate = 48.00  WHERE role_key = 'sit';
UPDATE role_tiers SET base_bonus = 6.00,  max_effective_rate = 45.00  WHERE role_key = 'survey_drafter';
UPDATE role_tiers SET base_bonus = 10.00, max_effective_rate = 58.00  WHERE role_key = 'project_manager';
UPDATE role_tiers SET base_bonus = 18.00, max_effective_rate = 68.00  WHERE role_key = 'rpls';
UPDATE role_tiers SET base_bonus = 24.00, max_effective_rate = 78.00  WHERE role_key = 'senior_rpls';
UPDATE role_tiers SET base_bonus = 40.00, max_effective_rate = NULL   WHERE role_key = 'owner';
UPDATE role_tiers SET base_bonus = 2.00,  max_effective_rate = 30.00  WHERE role_key = 'admin_staff';
UPDATE role_tiers SET base_bonus = 4.50,  max_effective_rate = 38.00  WHERE role_key = 'it_support';

-- ── 3. Reduce seniority bonuses slightly (flatten the top end) ──
UPDATE seniority_brackets SET bonus_per_hour = 0.00  WHERE min_years = 0  AND max_years = 0;
UPDATE seniority_brackets SET bonus_per_hour = 0.50  WHERE min_years = 1  AND max_years = 1;
UPDATE seniority_brackets SET bonus_per_hour = 1.00  WHERE min_years = 2  AND max_years = 2;
UPDATE seniority_brackets SET bonus_per_hour = 1.75  WHERE min_years = 3  AND max_years = 4;
UPDATE seniority_brackets SET bonus_per_hour = 2.50  WHERE min_years = 5  AND max_years = 6;
UPDATE seniority_brackets SET bonus_per_hour = 3.50  WHERE min_years = 7  AND max_years = 9;
UPDATE seniority_brackets SET bonus_per_hour = 5.00  WHERE min_years = 10 AND max_years = 14;
UPDATE seniority_brackets SET bonus_per_hour = 6.50  WHERE min_years = 15 AND max_years = 19;
UPDATE seniority_brackets SET bonus_per_hour = 8.00  WHERE min_years = 20 AND max_years IS NULL;

-- ── 4. Reduce credential bonuses ──
-- Remove double-counting: if you're in the SIT role tier, the sit_exam
-- credential adds less. RPLS license credential reduced since the role
-- tier already accounts for it heavily.
UPDATE credential_bonuses SET bonus_per_hour = 1.50 WHERE credential_key = 'sit_exam';
UPDATE credential_bonuses SET bonus_per_hour = 1.00 WHERE credential_key = 'fs_exam';
UPDATE credential_bonuses SET bonus_per_hour = 2.00 WHERE credential_key = 'rpls_license';
UPDATE credential_bonuses SET bonus_per_hour = 0.50 WHERE credential_key = 'osha_30';
UPDATE credential_bonuses SET bonus_per_hour = 0.25 WHERE credential_key = 'osha_10';
UPDATE credential_bonuses SET bonus_per_hour = 0.75 WHERE credential_key = 'faa_part107';
UPDATE credential_bonuses SET bonus_per_hour = 0.25 WHERE credential_key = 'first_aid_cpr';
UPDATE credential_bonuses SET bonus_per_hour = 0.50 WHERE credential_key = 'hazwoper';
UPDATE credential_bonuses SET bonus_per_hour = 0.50 WHERE credential_key = 'cad_cert';
UPDATE credential_bonuses SET bonus_per_hour = 0.50 WHERE credential_key = 'trimble_cert';
UPDATE credential_bonuses SET bonus_per_hour = 0.50 WHERE credential_key = 'gis_cert';
UPDATE credential_bonuses SET bonus_per_hour = 0.25 WHERE credential_key = 'field_safety';
UPDATE credential_bonuses SET bonus_per_hour = 0.50 WHERE credential_key = 'boundary_course';
UPDATE credential_bonuses SET bonus_per_hour = 0.25 WHERE credential_key = 'legal_desc';

-- ── 5. Add pay system config table ──
-- Global settings that control caps and multipliers
CREATE TABLE IF NOT EXISTS pay_system_config (
  key TEXT PRIMARY KEY,
  value DECIMAL(10,2) NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO pay_system_config (key, value, description) VALUES
  ('max_credential_stack',  8.00,  'Maximum total $/hr from all credential bonuses combined'),
  ('max_seniority_bonus',   8.00,  'Maximum seniority bonus $/hr (should match 20+ yr bracket)'),
  ('max_xp_milestone_bonus', 3.00, 'Maximum total $/hr from XP milestones (6 milestones x $0.50 = $3 cap)'),
  ('max_course_bonus',      3.00,  'Maximum total $/hr from completed college courses (6 courses x $0.50 = $3 cap)'),
  ('xp_milestone_bonus',    0.50,  'Bonus per hour per XP milestone achieved'),
  ('xp_milestone_interval', 10000, 'XP required per milestone'),
  ('course_bonus',          0.50,  'Bonus per hour per surveying course passed'),
  ('overtime_multiplier',   1.50,  'Overtime rate multiplier'),
  ('overtime_threshold_weekly', 40, 'Hours per week before overtime kicks in')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = now();

ALTER TABLE pay_system_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "service_role_all_psc" ON pay_system_config FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ══════════════════════════════════════════════════════════════
-- PAY CALCULATION REFERENCE (UPDATED v5)
-- ══════════════════════════════════════════════════════════════
--
-- STEP 1: Calculate raw bonuses
--   raw_role_bonus     = role_tiers.base_bonus
--   raw_seniority      = seniority_brackets.bonus_per_hour
--   raw_credentials    = MIN(SUM(credential_bonuses), max_credential_stack)
--   raw_xp_milestones  = MIN(count * $0.50, max_xp_milestone_bonus)
--   raw_courses        = MIN(count * $0.50, max_course_bonus)
--   raw_total_bonus    = sum of above
--
-- STEP 2: Apply work-type multiplier
--   adjusted_bonus = raw_total_bonus * work_type_rates.bonus_multiplier
--
-- STEP 3: Apply work-type bonus cap
--   capped_bonus = MIN(adjusted_bonus, work_type_rates.max_bonus_cap)
--
-- STEP 4: Calculate effective rate
--   effective_rate = work_type_rates.base_rate + capped_bonus
--
-- STEP 5: Apply role max effective rate ceiling
--   final_rate = MIN(effective_rate, role_tiers.max_effective_rate)
--   (Owner has no ceiling — max_effective_rate is NULL)
--
-- ══════════════════════════════════════════════════════════════
-- EXAMPLE: High achiever (your test case)
-- SIT role, 6 years, 50K XP, 9 courses, SIT+FS+RPLS+OSHA30+FAA+FirstAid+Trimble+CAD
-- ══════════════════════════════════════════════════════════════
--
-- Raw bonuses:
--   Role (SIT):        $7.00
--   Seniority (6yr):   $2.50
--   Credentials:       $1.50+$1.00+$2.00+$0.50+$0.75+$0.25+$0.50+$0.50 = $7.00
--     → capped at $8.00, so $7.00 (under cap)
--   XP (5 milestones): 5 * $0.50 = $2.50 → capped at $3.00, so $2.50
--   Courses (9):       9 * $0.50 = $4.50 → capped at $3.00, so $3.00
--   Raw total:         $7.00 + $2.50 + $7.00 + $2.50 + $3.00 = $22.00
--
-- Field work (1.0x multiplier, $55 cap):
--   Adjusted: $22.00 * 1.0 = $22.00 (under $55 cap)
--   Rate: $20.00 + $22.00 = $42.00/hr
--   Role ceiling (SIT): $48.00 → final: $42.00/hr
--   Annualized: $87,360
--
-- Driving (0.5x multiplier, $25 cap):
--   Adjusted: $22.00 * 0.5 = $11.00 (under $25 cap)
--   Rate: $16.00 + $11.00 = $27.00/hr
--   Role ceiling (SIT): $48.00 → final: $27.00/hr
--
-- Education (0.5x multiplier, $20 cap):
--   Adjusted: $22.00 * 0.5 = $11.00 (under $20 cap)
--   Rate: $15.00 + $11.00 = $26.00/hr
--
-- ══════════════════════════════════════════════════════════════
-- EXAMPLE: Senior RPLS, 20 years, all credentials, max XP
-- ══════════════════════════════════════════════════════════════
--
-- Raw bonuses:
--   Role (Senior RPLS): $24.00
--   Seniority (20yr):   $8.00
--   Credentials (all):  capped at $8.00
--   XP (6 milestones):  capped at $3.00
--   Courses (6 cap):    capped at $3.00
--   Raw total:          $24.00 + $8.00 + $8.00 + $3.00 + $3.00 = $46.00
--
-- Field work (1.0x, $55 cap):
--   Adjusted: $46.00 (under $55 cap)
--   Rate: $20.00 + $46.00 = $66.00/hr
--   Role ceiling: $78.00 → final: $66.00/hr
--   Annualized: $137,280 (was $149,240 → ~8% reduction)
--
-- Driving (0.5x, $25 cap):
--   Adjusted: $46.00 * 0.5 = $23.00 (under $25 cap)
--   Rate: $16.00 + $23.00 = $39.00/hr
--   (was $67.75 → 42% reduction for driving!)
--
-- Equipment maintenance (0.5x, $20 cap):
--   Adjusted: $46.00 * 0.5 = $23.00 → capped at $20.00
--   Rate: $14.00 + $20.00 = $34.00/hr
--   (was $65.75 → 48% reduction for maintenance!)
--
-- ══════════════════════════════════════════════════════════════
