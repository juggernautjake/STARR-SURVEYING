BEGIN;

-- ============================================
-- XP SYSTEM TABLES
-- ============================================

-- XP transactions log (all XP earned/spent)
CREATE TABLE IF NOT EXISTS xp_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  amount INTEGER NOT NULL, -- positive = earned, negative = spent
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('module_complete','quiz_pass','exam_prep_complete','mock_exam_pass','credential_earned','course_pass','badge_earned','store_purchase','admin_adjustment','module_retake')),
  source_type TEXT, -- 'fs_module', 'learning_module', 'quiz', 'credential', 'course', 'admin', 'store'
  source_id TEXT, -- ID of the source entity
  description TEXT NOT NULL,
  balance_after INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- XP summary per user (materialized for fast lookups)
CREATE TABLE IF NOT EXISTS xp_balances (
  user_email TEXT PRIMARY KEY,
  current_balance INTEGER NOT NULL DEFAULT 0, -- spendable XP
  total_earned INTEGER NOT NULL DEFAULT 0, -- all-time total (never decreases)
  total_spent INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT now()
);

-- XP milestone pay bonuses (every 10,000 XP = +$0.50/hr)
CREATE TABLE IF NOT EXISTS xp_pay_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xp_threshold INTEGER NOT NULL UNIQUE,
  bonus_per_hour NUMERIC(6,2) NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Track which milestones each user has reached
CREATE TABLE IF NOT EXISTS xp_milestone_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  milestone_id UUID NOT NULL REFERENCES xp_pay_milestones(id),
  achieved_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, milestone_id)
);

-- ============================================
-- COMPANY STORE / REWARDS CATALOG
-- ============================================

CREATE TABLE IF NOT EXISTS rewards_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('apparel','gear','gift_cards','accessories','cash_bonus','other')),
  xp_cost INTEGER NOT NULL,
  image_url TEXT,
  tier TEXT NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze','silver','gold','platinum','diamond')),
  stock_quantity INTEGER DEFAULT -1, -- -1 means unlimited
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Purchase records
CREATE TABLE IF NOT EXISTS rewards_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  item_id UUID NOT NULL REFERENCES rewards_catalog(id),
  xp_spent INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','fulfilled','cancelled')),
  fulfilled_by TEXT,
  fulfilled_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- BADGES SYSTEM
-- ============================================

CREATE TABLE IF NOT EXISTS badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '🏆',
  category TEXT NOT NULL CHECK (category IN ('certification','achievement','milestone','special')),
  xp_reward INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  badge_id UUID NOT NULL REFERENCES badges(id),
  earned_at TIMESTAMPTZ DEFAULT now(),
  awarded_by TEXT, -- null = automatic, email = manual
  UNIQUE(user_email, badge_id)
);

-- ============================================
-- MODULE EXPIRATION & RETAKE TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS module_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  module_type TEXT NOT NULL, -- 'learning_module', 'fs_module'
  module_id UUID NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ, -- null = never expires
  xp_earned INTEGER DEFAULT 0,
  is_current BOOLEAN DEFAULT true, -- false after expiry or retake
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Module XP values (configurable by admin)
CREATE TABLE IF NOT EXISTS module_xp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_type TEXT NOT NULL, -- 'learning_module', 'fs_module'
  module_id UUID,  -- null for global defaults
  xp_value INTEGER NOT NULL DEFAULT 500,
  expiry_months INTEGER DEFAULT 18, -- months until knowledge expires
  difficulty_rating INTEGER DEFAULT 3 CHECK (difficulty_rating BETWEEN 1 AND 5),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- EDUCATION REIMBURSEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS education_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  course_name TEXT NOT NULL,
  institution TEXT,
  course_type TEXT NOT NULL CHECK (course_type IN ('college_surveying','college_other','certification_prep','continuing_ed','online_course')),
  semester TEXT,
  cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  passed BOOLEAN,
  grade TEXT,
  company_pays_percent INTEGER DEFAULT 100, -- auto-calculated based on attempt
  company_pays_amount NUMERIC(10,2) DEFAULT 0,
  employee_pays_amount NUMERIC(10,2) DEFAULT 0,
  reimbursement_status TEXT DEFAULT 'pending' CHECK (reimbursement_status IN ('pending','approved','paid','denied')),
  xp_earned INTEGER DEFAULT 0,
  pay_raise_amount NUMERIC(6,2) DEFAULT 0, -- hourly raise for passing
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- ADMIN NOTIFICATION PREFERENCES
-- ============================================

CREATE TABLE IF NOT EXISTS admin_alert_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL UNIQUE CHECK (alert_type IN ('module_complete','milestone_reached','store_purchase','exam_passed','badge_earned','credential_added','pay_raise_triggered','course_complete')),
  enabled BOOLEAN DEFAULT true,
  notify_admins BOOLEAN DEFAULT true,
  notify_employee BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_xp_transactions_user ON xp_transactions(user_email);
CREATE INDEX IF NOT EXISTS idx_xp_transactions_type ON xp_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_rewards_purchases_user ON rewards_purchases(user_email);
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_email);
CREATE INDEX IF NOT EXISTS idx_module_completions_user ON module_completions(user_email);
CREATE INDEX IF NOT EXISTS idx_education_courses_user ON education_courses(user_email);

-- ============================================
-- SEED DATA: XP Pay Milestones
-- ============================================

INSERT INTO xp_pay_milestones (xp_threshold, bonus_per_hour, label, description) VALUES
(5000, 0.25, 'XP Apprentice', 'First 5,000 XP earned - your journey has begun!'),
(10000, 0.50, 'XP Journeyman', '10,000 total XP - showing real dedication'),
(20000, 1.00, 'XP Craftsman', '20,000 total XP - a true professional'),
(30000, 1.50, 'XP Expert', '30,000 total XP - mastering the craft'),
(50000, 2.50, 'XP Master', '50,000 total XP - exceptional commitment'),
(75000, 3.75, 'XP Grand Master', '75,000 total XP - legendary dedication'),
(100000, 5.00, 'XP Legend', '100,000 total XP - the pinnacle of excellence')
ON CONFLICT (xp_threshold) DO UPDATE SET bonus_per_hour = EXCLUDED.bonus_per_hour, label = EXCLUDED.label;

-- ============================================
-- SEED DATA: Badges
-- ============================================

INSERT INTO badges (badge_key, name, description, icon, category, xp_reward, sort_order) VALUES
('fs_ready', 'FS Exam Ready', 'Completed all 8 FS prep modules and passed the mock exam with 70%+', '🎯', 'certification', 3500, 1),
('fs_all_modules', 'FS Scholar', 'Completed all 8 FS study modules with passing grades', '📚', 'achievement', 1000, 2),
('fs_perfect_mock', 'FS Ace', 'Scored 90%+ on the FS mock exam', '⭐', 'achievement', 2000, 3),
('first_module', 'First Steps', 'Completed your first learning module', '👣', 'milestone', 100, 10),
('five_modules', 'Knowledge Seeker', 'Completed 5 learning modules', '🔍', 'milestone', 250, 11),
('ten_modules', 'Dedicated Learner', 'Completed 10 learning modules', '📖', 'milestone', 500, 12),
('twenty_modules', 'Module Master', 'Completed 20 learning modules', '🏅', 'milestone', 1000, 13),
('first_quiz_pass', 'Quiz Champion', 'Passed your first quiz with 70%+', '✅', 'milestone', 50, 20),
('perfect_quiz', 'Perfect Score', 'Scored 100% on any quiz', '💯', 'achievement', 500, 21),
('sit_certified', 'SIT Certified', 'Passed the Surveyor Intern Test', '📋', 'certification', 5000, 30),
('rpls_certified', 'RPLS Licensed', 'Earned Registered Professional Land Surveyor license', '⚖️', 'certification', 5000, 31),
('one_year', 'One Year Strong', 'Completed 1 year with the company', '🗓️', 'milestone', 500, 40),
('three_years', 'Three Year Veteran', 'Completed 3 years with the company', '🌟', 'milestone', 1000, 41),
('five_years', 'Five Year Legend', 'Completed 5 years with the company', '🏆', 'milestone', 2000, 42),
('xp_5k', 'XP Apprentice', 'Earned 5,000 total XP', '🔰', 'milestone', 0, 50),
('xp_10k', 'XP Journeyman', 'Earned 10,000 total XP', '⚡', 'milestone', 0, 51),
('xp_25k', 'XP Expert', 'Earned 25,000 total XP', '🌊', 'milestone', 0, 52),
('xp_50k', 'XP Master', 'Earned 50,000 total XP', '🔥', 'milestone', 0, 53)
ON CONFLICT (badge_key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, xp_reward = EXCLUDED.xp_reward;

-- ============================================
-- SEED DATA: Rewards Catalog (Company Store)
-- ============================================

INSERT INTO rewards_catalog (name, description, category, xp_cost, tier, sort_order) VALUES
-- Bronze Tier (500-2000 XP)
('Company Sticker Pack', '5 assorted STARR Surveying vinyl stickers', 'accessories', 500, 'bronze', 1),
('Company Decal', 'STARR Surveying window/bumper decal for your vehicle', 'accessories', 750, 'bronze', 2),
('Company Koozie', 'Insulated drink koozie with STARR logo', 'accessories', 500, 'bronze', 3),
('$5 Gift Card', '$5 gift card to a restaurant of your choice', 'gift_cards', 500, 'bronze', 4),
('Company Pen Set', 'STARR Surveying branded pen and mechanical pencil set', 'accessories', 600, 'bronze', 5),
-- Silver Tier (2000-5000 XP)
('Company T-Shirt', 'STARR Surveying crew neck t-shirt (your choice of color)', 'apparel', 2000, 'silver', 10),
('Company Hat', 'STARR Surveying snapback cap', 'apparel', 2000, 'silver', 11),
('$10 Gift Card', '$10 gift card - Academy Sports, restaurant, or Amazon', 'gift_cards', 1000, 'silver', 12),
('Company Water Bottle', '32oz insulated STARR Surveying water bottle', 'gear', 1500, 'silver', 13),
('Phone Charger', 'Portable battery pack with STARR logo', 'gear', 2500, 'silver', 14),
('$20 Gift Card', '$20 gift card to Academy Sports or similar', 'gift_cards', 2000, 'silver', 15),
-- Gold Tier (5000-10000 XP)
('$50 Academy Gift Card', '$50 gift card to Academy Sports + Outdoors', 'gift_cards', 5000, 'gold', 20),
('$50 Steakhouse Gift Card', '$50 gift card to Texas Roadhouse or equivalent', 'gift_cards', 5000, 'gold', 21),
('Company Polo Shirt', 'Premium STARR Surveying polo shirt', 'apparel', 4000, 'gold', 22),
('$10 Cash Bonus', '$10 added to your next paycheck', 'cash_bonus', 1000, 'gold', 23),
('Leatherman Multi-Tool', 'Leatherman Wingman multi-tool', 'gear', 7500, 'gold', 24),
('$25 Cash Bonus', '$25 added to your next paycheck', 'cash_bonus', 2500, 'gold', 25),
-- Platinum Tier (10000-20000 XP)
('Work Boots', 'Quality work boots up to $150 value (your choice)', 'gear', 10000, 'platinum', 30),
('Quality Pocket Knife', 'Benchmade or Kershaw premium knife', 'gear', 10000, 'platinum', 31),
('$50 Cash Bonus', '$50 added to your next paycheck', 'cash_bonus', 5000, 'platinum', 32),
('Bluetooth Speaker', 'JBL Flip or equivalent portable Bluetooth speaker', 'gear', 12000, 'platinum', 33),
('Yeti Tumbler Set', 'Set of 2 Yeti Rambler tumblers', 'gear', 8000, 'platinum', 34),
-- Diamond Tier (20000+ XP)
('Carhartt Jacket', 'Carhartt Detroit jacket or equivalent (your choice)', 'apparel', 20000, 'diamond', 40),
('$100 Cash Bonus', '$100 added to your next paycheck', 'cash_bonus', 10000, 'diamond', 41),
('Premium Cooler', 'Yeti Roadie or RTIC 20 cooler', 'gear', 25000, 'diamond', 42),
('$200 Academy Gift Card', '$200 to Academy Sports + Outdoors', 'gift_cards', 20000, 'diamond', 43),
('Custom Embroidered Jacket', 'Premium jacket with your name and STARR logo embroidered', 'apparel', 15000, 'diamond', 44)
ON CONFLICT DO NOTHING;

-- ============================================
-- SEED DATA: Admin Alert Settings
-- ============================================

INSERT INTO admin_alert_settings (alert_type, enabled, notify_admins, notify_employee) VALUES
('module_complete', true, true, true),
('milestone_reached', true, true, true),
('store_purchase', true, true, true),
('exam_passed', true, true, true),
('badge_earned', true, true, true),
('credential_added', true, true, false),
('pay_raise_triggered', true, true, true),
('course_complete', true, true, true)
ON CONFLICT (alert_type) DO NOTHING;

-- ============================================
-- SEED DATA: Module XP Config defaults
-- ============================================

-- Default XP values for learning modules by difficulty
INSERT INTO module_xp_config (module_type, module_id, xp_value, expiry_months, difficulty_rating) VALUES
('learning_module', NULL, 500, 18, 3), -- default for any learning module
('fs_module', NULL, 500, 24, 4) -- default for FS prep modules
ON CONFLICT DO NOTHING;

-- ============================================
-- SEED DATA: Per-Module XP Config (all 28 curriculum modules)
-- Beginner = 400 XP, 20-month expiry, rating 2
-- Intermediate = 500 XP, 18-month expiry, rating 3
-- Advanced = 600 XP, 15-month expiry, rating 4
-- Exam Prep = 550 XP, 12-month expiry, rating 4
-- ============================================

-- Part I – Foundations (beginner)
INSERT INTO module_xp_config (module_type, module_id, xp_value, expiry_months, difficulty_rating) VALUES
('learning_module', 'c1000001-0000-0000-0000-000000000001', 400, 20, 2), -- Introduction to Land Surveying
('learning_module', 'c1000002-0000-0000-0000-000000000002', 450, 20, 2), -- Mathematics for Surveyors (higher due to math)
('learning_module', 'c1000003-0000-0000-0000-000000000003', 400, 20, 2), -- Measurements & Error Theory
('learning_module', 'c1000004-0000-0000-0000-000000000004', 400, 20, 2), -- Distance Measurement

-- Part II – Field Techniques (intermediate)
('learning_module', 'c1000005-0000-0000-0000-000000000005', 500, 18, 3), -- Angle and Direction Measurement
('learning_module', 'c1000006-0000-0000-0000-000000000006', 500, 18, 3), -- Leveling and Vertical Control

-- Part III – Coordinate Systems (intermediate)
('learning_module', 'c1000007-0000-0000-0000-000000000007', 550, 18, 3), -- Coordinate Systems and Datums
('learning_module', 'c1000008-0000-0000-0000-000000000008', 550, 18, 3), -- Traverse Computations
('learning_module', 'c1000009-0000-0000-0000-000000000009', 500, 18, 3), -- Area and Volume Computations

-- Part IV – Modern Technology (intermediate/advanced)
('learning_module', 'c100000a-0000-0000-0000-00000000000a', 500, 18, 3), -- Total Stations
('learning_module', 'c100000b-0000-0000-0000-00000000000b', 600, 15, 4), -- GPS/GNSS Surveying
('learning_module', 'c100000c-0000-0000-0000-00000000000c', 600, 15, 4), -- Robotic, Scanning, and UAS

-- Part V – Boundary & Legal (intermediate/advanced)
('learning_module', 'c100000d-0000-0000-0000-00000000000d', 550, 18, 3), -- Boundary Law Principles
('learning_module', 'c100000e-0000-0000-0000-00000000000e', 500, 18, 3), -- Metes and Bounds Descriptions
('learning_module', 'c100000f-0000-0000-0000-00000000000f', 550, 18, 3), -- Texas Land Titles and Records
('learning_module', 'c1000010-0000-0000-0000-000000000010', 600, 15, 4), -- Boundary Retracement and Resolution

-- Part VI – Subdivision, Planning & Construction (intermediate)
('learning_module', 'c1000011-0000-0000-0000-000000000011', 500, 18, 3), -- Subdivision Design and Platting
('learning_module', 'c1000012-0000-0000-0000-000000000012', 500, 18, 3), -- Construction Surveying
('learning_module', 'c1000013-0000-0000-0000-000000000013', 500, 18, 3), -- Topographic and Mapping Surveys

-- Part VII – Specialized (advanced)
('learning_module', 'c1000014-0000-0000-0000-000000000014', 600, 15, 4), -- Geodetic and Control Surveying
('learning_module', 'c1000015-0000-0000-0000-000000000015', 600, 15, 4), -- Hydrographic and Coastal
('learning_module', 'c1000016-0000-0000-0000-000000000016', 550, 15, 4), -- Mining and Industrial

-- Part VIII – Professional Practice (advanced)
('learning_module', 'c1000017-0000-0000-0000-000000000017', 550, 15, 4), -- Survey Business
('learning_module', 'c1000018-0000-0000-0000-000000000018', 600, 15, 4), -- Texas Surveying Law

-- Part IX – Exam Preparation
('learning_module', 'c1000019-0000-0000-0000-000000000019', 550, 12, 4), -- SIT Exam Review — Fundamentals
('learning_module', 'c100001a-0000-0000-0000-00000000001a', 550, 12, 4), -- SIT Exam Review — Advanced
('learning_module', 'c100001b-0000-0000-0000-00000000001b', 600, 12, 5), -- RPLS Review — Jurisprudence
('learning_module', 'c100001c-0000-0000-0000-00000000001c', 600, 12, 5)  -- RPLS Review — Practical
ON CONFLICT DO NOTHING;

-- ============================================
-- SEED DATA: FS Prep Module XP Config (8 modules)
-- All FS prep modules = 500 XP each, 24-month expiry
-- ============================================

INSERT INTO module_xp_config (module_type, module_id, xp_value, expiry_months, difficulty_rating) VALUES
('fs_module', 'f5000001-0000-0000-0000-000000000001', 450, 24, 3), -- FS Module 1
('fs_module', 'f5000002-0000-0000-0000-000000000002', 500, 24, 4), -- FS Module 2
('fs_module', 'f5000003-0000-0000-0000-000000000003', 500, 24, 4), -- FS Module 3
('fs_module', 'f5000004-0000-0000-0000-000000000004', 500, 24, 4), -- FS Module 4
('fs_module', 'f5000005-0000-0000-0000-000000000005', 500, 24, 4), -- FS Module 5
('fs_module', 'f5000006-0000-0000-0000-000000000006', 550, 24, 4), -- FS Module 6
('fs_module', 'f5000007-0000-0000-0000-000000000007', 500, 24, 4), -- FS Module 7
('fs_module', 'f5000008-0000-0000-0000-000000000008', 500, 24, 4)  -- FS Module 8
ON CONFLICT DO NOTHING;

COMMIT;
