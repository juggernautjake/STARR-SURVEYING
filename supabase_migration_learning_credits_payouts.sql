-- ============================================================
-- LEARNING CREDITS, PAYOUT LOG & EMPLOYEE MANAGEMENT v1
-- Adds:
--   - Learning credit values for modules/lessons/quizzes
--   - Employee learning credit accumulation
--   - Credit thresholds that trigger pay raises/bonuses
--   - Comprehensive payout log (payouts, raises, bonuses)
--   - Employee role/promotion history
--   - Employee profile change log (visible to employee)
-- ============================================================

-- ── Learning Credit Values ──
-- Admin assigns point values to modules, lessons, and quiz pass thresholds
CREATE TABLE IF NOT EXISTS learning_credit_values (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('module','lesson','quiz_pass','exam_prep_pass','flashcard_mastery')),
  entity_id UUID, -- NULL for global defaults (e.g. "any quiz pass = 5pts")
  entity_label TEXT, -- cached label for display
  credit_points INT NOT NULL DEFAULT 0 CHECK (credit_points >= 0),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lcv_entity ON learning_credit_values(entity_type, entity_id);

-- ── Employee Learning Credits ──
-- Track credits earned by each employee
CREATE TABLE IF NOT EXISTS employee_learning_credits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  credit_value_id UUID REFERENCES learning_credit_values(id),
  entity_type TEXT NOT NULL,
  entity_id UUID,
  entity_label TEXT,
  points_earned INT NOT NULL DEFAULT 0,
  earned_at TIMESTAMPTZ DEFAULT now(),
  -- Link to the quiz attempt or progress record that triggered this
  source_type TEXT, -- 'quiz_attempt', 'lesson_complete', 'module_complete', 'manual'
  source_id UUID,
  awarded_by TEXT, -- NULL if automatic, admin email if manual
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_elc_email ON employee_learning_credits(user_email);
CREATE INDEX IF NOT EXISTS idx_elc_earned ON employee_learning_credits(earned_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_elc_unique_earn ON employee_learning_credits(user_email, entity_type, entity_id, source_id);

-- ── Credit Thresholds ──
-- When an employee accumulates enough points, trigger a pay event
CREATE TABLE IF NOT EXISTS credit_thresholds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  threshold_name TEXT NOT NULL,
  points_required INT NOT NULL CHECK (points_required > 0),
  reward_type TEXT NOT NULL CHECK (reward_type IN ('pay_raise','one_time_bonus','credential_unlock')),
  -- For pay_raise: amount added to hourly rate
  raise_amount DECIMAL(10,2) DEFAULT 0,
  -- For one_time_bonus: flat bonus amount
  bonus_amount DECIMAL(10,2) DEFAULT 0,
  -- For credential_unlock: which credential key to grant
  credential_key TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  is_repeatable BOOLEAN DEFAULT false, -- can earn multiple times?
  sort_order INT DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Threshold Achievements ──
-- Track which thresholds each employee has reached
CREATE TABLE IF NOT EXISTS employee_threshold_achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  threshold_id UUID NOT NULL REFERENCES credit_thresholds(id),
  achieved_at TIMESTAMPTZ DEFAULT now(),
  points_at_achievement INT NOT NULL,
  -- What action was taken
  action_taken TEXT, -- 'pay_raise_applied', 'bonus_scheduled', 'credential_granted', 'pending_admin'
  action_by TEXT, -- admin who approved or 'system'
  action_at TIMESTAMPTZ,
  payout_log_id UUID, -- link to payout_log if applicable
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, threshold_id) -- unless is_repeatable, handle in app logic
);

CREATE INDEX IF NOT EXISTS idx_eta_email ON employee_threshold_achievements(user_email);

-- ── Comprehensive Payout Log ──
-- Records ALL financial events: payroll, raises, bonuses, advances, adjustments
CREATE TABLE IF NOT EXISTS payout_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  payout_type TEXT NOT NULL CHECK (payout_type IN (
    'weekly_payroll',     -- regular weekly pay
    'pay_raise',          -- hourly rate increase
    'bonus',              -- one-time bonus
    'advance',            -- pay advance
    'advance_repayment',  -- advance deduction
    'adjustment',         -- manual correction
    'credential_bonus',   -- bonus for earning credential
    'education_bonus',    -- bonus for learning milestone
    'promotion_raise',    -- raise from role promotion
    'performance_bonus',  -- performance-based bonus
    'holiday_bonus',      -- holiday bonus
    'referral_bonus',     -- referral bonus
    'retention_bonus',    -- retention bonus
    'spot_bonus',         -- spot/ad-hoc bonus
    'completion_bonus'    -- project completion bonus
  )),
  amount DECIMAL(10,2) NOT NULL, -- positive = payout, negative = deduction
  -- Context
  reason TEXT NOT NULL, -- human-readable reason
  details TEXT, -- additional details/notes
  -- Rate change info (for pay_raise / promotion_raise)
  old_rate DECIMAL(10,2),
  new_rate DECIMAL(10,2),
  old_role TEXT,
  new_role TEXT,
  -- Links
  source_type TEXT, -- 'threshold', 'credential', 'admin_manual', 'payroll_run', 'advance_request'
  source_id UUID,
  -- Who & when
  processed_by TEXT, -- admin email or 'system'
  processed_at TIMESTAMPTZ DEFAULT now(),
  pay_period_start DATE,
  pay_period_end DATE,
  -- Status
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending','completed','cancelled','reversed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pl_email ON payout_log(user_email);
CREATE INDEX IF NOT EXISTS idx_pl_type ON payout_log(payout_type);
CREATE INDEX IF NOT EXISTS idx_pl_date ON payout_log(processed_at);
CREATE INDEX IF NOT EXISTS idx_pl_email_date ON payout_log(user_email, processed_at DESC);

-- ── Employee Role History ──
-- Track all role changes / promotions
CREATE TABLE IF NOT EXISTS employee_role_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  old_role TEXT,
  new_role TEXT NOT NULL,
  old_tier TEXT, -- role_tiers key
  new_tier TEXT, -- role_tiers key
  reason TEXT NOT NULL,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  changed_by TEXT NOT NULL, -- admin email
  pay_impact DECIMAL(10,2) DEFAULT 0, -- change in hourly rate
  payout_log_id UUID, -- link to payout_log entry
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erh_email ON employee_role_history(user_email);

-- ── Employee Profile Changes (visible to employee) ──
-- So employees can see what changed in their profile
CREATE TABLE IF NOT EXISTS employee_profile_changes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN (
    'role_change','pay_raise','credential_added','credential_removed',
    'bonus_awarded','profile_updated','tier_change','seniority_update',
    'note_added','status_change'
  )),
  title TEXT NOT NULL, -- short display title
  description TEXT, -- longer description
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epc_email ON employee_profile_changes(user_email);
CREATE INDEX IF NOT EXISTS idx_epc_unread ON employee_profile_changes(user_email, is_read);

-- ── RLS Policies ──
ALTER TABLE learning_credit_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_learning_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_threshold_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_role_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_profile_changes ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "service_all_lcv" ON learning_credit_values FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_elc" ON employee_learning_credits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_ct" ON credit_thresholds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_eta" ON employee_threshold_achievements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_pl" ON payout_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_erh" ON employee_role_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_epc" ON employee_profile_changes FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════
-- LEARNING CREDITS SYSTEM REFERENCE
-- ══════════════════════════════════════════════
--
-- HOW IT WORKS:
--
-- 1. Admin assigns credit_points to modules/lessons/quizzes via learning_credit_values
--    Example: "Boundary Law Module" = 50 points, "SIT Exam Prep Quiz Pass" = 25 points
--
-- 2. When employee completes a lesson, passes a quiz, or masters flashcards,
--    the system checks learning_credit_values for matching entity_type + entity_id
--    and auto-awards credits to employee_learning_credits
--
-- 3. System checks employee's total points against credit_thresholds
--    Example: "100 points = $0.50/hr raise", "250 points = $50 bonus"
--
-- 4. When threshold reached:
--    a. Admin is notified
--    b. Admin approves → system applies raise/bonus
--    c. Recorded in payout_log with reason
--    d. Employee notified via employee_profile_changes + notifications table
--
-- EXAMPLES:
--
-- Credit values:
--   Module completion: 20-100 points (varies by difficulty)
--   Lesson completion: 5-15 points
--   Quiz pass (70%+): 10-30 points
--   Quiz ace (90%+): bonus 5-15 points
--   Exam prep pass: 25-50 points
--   Flashcard mastery (all cards ease > 2.5): 10 points
--
-- Thresholds:
--   50 points  → "Learning Starter"    → $0.25/hr raise
--   150 points → "Knowledge Builder"   → $0.50/hr raise
--   300 points → "Subject Expert"      → $1.00/hr raise + $25 bonus
--   500 points → "Master Surveyor"     → $2.00/hr raise + $100 bonus
--   1000 points→ "Elite Scholar"       → $3.00/hr raise + $250 bonus
--
-- Payout log types:
--   weekly_payroll: "Weekly pay for Jan 6-12" amount=$1,200
--   pay_raise: "Passed SIT exam" old_rate=$22, new_rate=$24
--   bonus: "Christmas bonus" amount=$200
--   education_bonus: "Reached 300 Learning Points" amount=$25
--   promotion_raise: "Promoted to Party Chief" old_role="Survey Tech", new_role="Party Chief"
