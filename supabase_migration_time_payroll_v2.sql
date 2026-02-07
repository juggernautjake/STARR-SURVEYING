-- ============================================================
-- TIME LOGGING, PAY RATES & APPROVAL SYSTEM v2
-- Extends existing payroll schema with:
--   - Work-type base rates with seniority & credential scaling
--   - Daily time logging by work category
--   - Supervisor/admin approval workflow
--   - Pay advance requests
--   - Scheduled bonuses
--   - Weekly pay (paid for previous week's work)
-- ============================================================

-- ── Work Type Base Rates ──
-- Each type of work has its own hourly base rate
CREATE TABLE IF NOT EXISTS work_type_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  work_type TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  base_rate DECIMAL(10,2) NOT NULL,
  icon TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default work type rates
INSERT INTO work_type_rates (work_type, label, base_rate, icon, description, sort_order) VALUES
  ('field_work',    'Field Work',           20.00, '📡', 'Data collection, staking, GPS/total station work in the field', 1),
  ('drawing',       'Drawing / Drafting',   23.00, '📐', 'CAD drafting, plat drawing, map creation', 2),
  ('driving',       'Driving',              16.00, '🚗', 'Travel to/from job sites, equipment transport', 3),
  ('research',      'Research',             18.00, '🔍', 'Deed research, title search, record retrieval', 4),
  ('equipment_maint','Equipment Maintenance',14.00, '🔧', 'Calibration, cleaning, repair of survey instruments', 5),
  ('education',     'Education / Training', 15.00, '📚', 'Coursework, study time, exam prep, training sessions', 6),
  ('office',        'Office / Admin',       16.00, '🏢', 'General office work, data entry, filing, calls', 7),
  ('supervision',   'Supervision',          22.00, '👔', 'Managing crew, job oversight, quality review', 8),
  ('legal',         'Legal / Compliance',   20.00, '⚖️', 'Legal descriptions, court prep, regulatory compliance', 9),
  ('misc',          'Miscellaneous',        15.00, '📋', 'Other tasks not covered by specific categories', 10)
ON CONFLICT (work_type) DO NOTHING;

-- ── Role Tiers ──
-- Each employee role has a base pay bonus added to work type rates
CREATE TABLE IF NOT EXISTS role_tiers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role_key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  base_bonus DECIMAL(10,2) NOT NULL DEFAULT 0,
  description TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO role_tiers (role_key, label, base_bonus, description, sort_order) VALUES
  ('intern',           'Intern',                    0.00, 'Student or entry-level intern, learning the trade',                1),
  ('field_hand',       'Field Hand',                1.00, 'Entry-level field worker, assists survey crew',                    2),
  ('rodman',           'Rodman',                    2.00, 'Holds rod/prism, assists instrument operator',                    3),
  ('instrument_op',    'Instrument Operator',       4.00, 'Operates total station, GPS receiver in field',                   4),
  ('survey_tech',      'Survey Technician',         6.00, 'Experienced tech, can run field or office tasks',                 5),
  ('party_chief',      'Party Chief',              10.00, 'Leads field crew, makes field decisions',                         6),
  ('sit',              'Surveyor in Training (SIT)', 8.00, 'Passed SIT exam, working toward RPLS',                           7),
  ('survey_drafter',   'Survey Drafter',            7.00, 'Specializes in CAD/drafting work',                                8),
  ('project_manager',  'Project Manager',          12.00, 'Manages multiple jobs, client relations',                         9),
  ('rpls',             'RPLS',                     22.00, 'Registered Professional Land Surveyor',                          10),
  ('senior_rpls',      'Senior RPLS',              28.00, 'Senior RPLS with 10+ years licensed',                            11),
  ('owner',            'Owner / Principal',        45.00, 'Company owner or principal surveyor',                            12),
  ('admin_staff',      'Administrative Staff',      2.00, 'Secretary, office manager, receptionist',                        13),
  ('it_support',       'IT / Tech Support',         5.00, 'Technology, website, software support',                          14)
ON CONFLICT (role_key) DO NOTHING;

-- ── Seniority Brackets ──
-- Bonus per hour based on years of employment
CREATE TABLE IF NOT EXISTS seniority_brackets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  min_years INT NOT NULL,
  max_years INT, -- NULL = no upper limit
  bonus_per_hour DECIMAL(10,2) NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO seniority_brackets (min_years, max_years, bonus_per_hour, label) VALUES
  (0,  0,  0.00, 'New Hire (< 1 year)'),
  (1,  1,  0.50, '1 year'),
  (2,  2,  1.00, '2 years'),
  (3,  4,  2.00, '3-4 years'),
  (5,  6,  3.50, '5-6 years'),
  (7,  9,  5.00, '7-9 years'),
  (10, 14, 7.00, '10-14 years'),
  (15, 19, 9.00, '15-19 years'),
  (20, NULL, 12.00, '20+ years')
ON CONFLICT DO NOTHING;

-- ── Credential Pay Bonuses ──
-- Stackable bonuses for exams passed, licenses held, courses completed
CREATE TABLE IF NOT EXISTS credential_bonuses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  credential_key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  bonus_per_hour DECIMAL(10,2) NOT NULL DEFAULT 0,
  credential_type TEXT DEFAULT 'external', -- 'exam', 'license', 'in_house', 'safety'
  description TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO credential_bonuses (credential_key, label, bonus_per_hour, credential_type, description, sort_order) VALUES
  ('sit_exam',       'SIT Exam Passed',            2.00, 'exam',     'Surveyor in Training examination',                      1),
  ('fs_exam',        'FS Exam Passed',             1.50, 'exam',     'Fundamentals of Surveying examination',                 2),
  ('rpls_license',   'RPLS License',               3.00, 'license',  'Registered Professional Land Surveyor license',         3),
  ('osha_30',        'OSHA 30-Hour',               0.50, 'safety',   'OSHA 30-hour construction safety certification',        4),
  ('osha_10',        'OSHA 10-Hour',               0.25, 'safety',   'OSHA 10-hour general safety certification',             5),
  ('faa_part107',    'FAA Part 107 (Drone)',        1.00, 'license',  'FAA remote pilot certificate for drone operations',     6),
  ('first_aid_cpr',  'First Aid / CPR',            0.25, 'safety',   'Current first aid and CPR certification',               7),
  ('hazwoper',       'HAZWOPER 40-Hour',           0.75, 'safety',   'Hazardous waste operations certification',              8),
  ('cad_cert',       'CAD Certification',          0.50, 'in_house', 'Completed internal CAD proficiency course',             9),
  ('trimble_cert',   'Trimble Certified',          0.50, 'in_house', 'Completed Trimble equipment proficiency course',       10),
  ('gis_cert',       'GIS Certification',          0.50, 'in_house', 'Completed GIS proficiency course',                     11),
  ('field_safety',   'Field Safety Course',        0.25, 'in_house', 'Completed internal field safety training',             12),
  ('boundary_course','Boundary Law Course',        0.50, 'in_house', 'Completed boundary law & evidence course',             13),
  ('legal_desc',     'Legal Description Course',   0.25, 'in_house', 'Completed legal description writing course',           14)
ON CONFLICT (credential_key) DO NOTHING;

-- ── Employee Credentials Earned ──
-- Track which credentials each employee has
CREATE TABLE IF NOT EXISTS employee_earned_credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  credential_key TEXT NOT NULL REFERENCES credential_bonuses(credential_key),
  earned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  verified BOOLEAN DEFAULT false,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  expiry_date DATE, -- NULL = never expires
  document_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, credential_key)
);

CREATE INDEX IF NOT EXISTS idx_eec_email ON employee_earned_credentials(user_email);

-- ── Daily Time Logs ──
-- Employees log hours by work type per day
CREATE TABLE IF NOT EXISTS daily_time_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  log_date DATE NOT NULL,
  work_type TEXT NOT NULL,
  hours DECIMAL(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  job_id UUID, -- optional link to specific job
  job_name TEXT, -- cached for display
  description TEXT NOT NULL, -- what they did (required)
  notes TEXT, -- additional notes

  -- Approval workflow
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','disputed','adjusted')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  adjustment_note TEXT,
  adjusted_hours DECIMAL(5,2), -- if admin adjusts hours

  -- Pay calculation (filled when approved)
  base_rate DECIMAL(10,2),
  role_bonus DECIMAL(10,2),
  seniority_bonus DECIMAL(10,2),
  credential_bonus DECIMAL(10,2),
  effective_rate DECIMAL(10,2),
  total_pay DECIMAL(10,2),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dtl_email ON daily_time_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_dtl_date ON daily_time_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_dtl_status ON daily_time_logs(status);
CREATE INDEX IF NOT EXISTS idx_dtl_email_date ON daily_time_logs(user_email, log_date);

-- ── Pay Advance Requests ──
-- Employees can request early payment with reason
CREATE TABLE IF NOT EXISTS pay_advance_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','paid','cancelled')),
  requested_at TIMESTAMPTZ DEFAULT now(),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  denial_reason TEXT,
  pay_date DATE, -- when advance will be paid (set on approval)
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_par_email ON pay_advance_requests(user_email);
CREATE INDEX IF NOT EXISTS idx_par_status ON pay_advance_requests(status);

-- ── Scheduled Bonuses ──
-- Admin can schedule bonuses for specific dates/times
CREATE TABLE IF NOT EXISTS scheduled_bonuses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  bonus_type TEXT DEFAULT 'performance' CHECK (bonus_type IN ('performance','holiday','referral','retention','spot','completion','other')),
  reason TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME DEFAULT '09:00:00',
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','paid','cancelled')),
  created_by TEXT NOT NULL,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sb_email ON scheduled_bonuses(user_email);
CREATE INDEX IF NOT EXISTS idx_sb_date ON scheduled_bonuses(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_sb_status ON scheduled_bonuses(status);

-- ── Weekly Pay Periods ──
-- Auto-generated weekly pay periods (Mon-Sun, paid following Friday)
CREATE TABLE IF NOT EXISTS weekly_pay_periods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start DATE NOT NULL, -- Monday
  week_end DATE NOT NULL,   -- Sunday
  pay_date DATE NOT NULL,   -- Following Friday
  status TEXT DEFAULT 'open' CHECK (status IN ('open','review','approved','processing','paid','cancelled')),
  total_hours DECIMAL(10,2) DEFAULT 0,
  total_gross DECIMAL(10,2) DEFAULT 0,
  total_net DECIMAL(10,2) DEFAULT 0,
  employee_count INT DEFAULT 0,
  processed_by TEXT,
  processed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wpp_dates ON weekly_pay_periods(week_start, week_end);

-- ── RLS Policies ──
ALTER TABLE work_type_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE seniority_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_earned_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_advance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_pay_periods ENABLE ROW LEVEL SECURITY;

-- Service role bypass for all tables
CREATE POLICY "service_role_all_wtr" ON work_type_rates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_rt" ON role_tiers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_sb" ON seniority_brackets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_cb" ON credential_bonuses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_eec" ON employee_earned_credentials FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_dtl" ON daily_time_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_par" ON pay_advance_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_sbo" ON scheduled_bonuses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_wpp" ON weekly_pay_periods FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════
-- PAY CALCULATION REFERENCE
-- ══════════════════════════════════════════════
--
-- EFFECTIVE HOURLY RATE = Work Type Base Rate
--                       + Role Tier Bonus
--                       + Seniority Bonus (based on years since hire_date)
--                       + Sum of Credential Bonuses (verified only)
--                       + Custom Bonus (from employee_profiles if any)
--
-- EXAMPLES:
--
-- Field Hand, 2 years, no creds, field work:
--   $20.00 (field_work) + $1.00 (field_hand) + $1.00 (2yr) = $22.00/hr
--
-- SIT, 7 years, SIT exam + FS exam, field work:
--   $20.00 (field_work) + $8.00 (sit) + $5.00 (7yr) + $2.00 (sit_exam) + $1.50 (fs_exam) = $36.50/hr
--
-- RPLS, 15 years, RPLS + SIT + FS + OSHA30, field work:
--   $20.00 (field_work) + $22.00 (rpls) + $9.00 (15yr) + $3.00 + $2.00 + $1.50 + $0.50 = $58.00/hr
--
-- RPLS, 15 years, drawing:
--   $23.00 (drawing) + $22.00 (rpls) + $9.00 (15yr) + $6.50 (creds) = $60.50/hr
--
-- Owner, 20+ years, field work:
--   $20.00 (field_work) + $45.00 (owner) + $12.00 (20yr) + creds = $77.00+/hr
--
-- Intern, 0 years, education:
--   $15.00 (education) + $0.00 (intern) + $0.00 (0yr) = $15.00/hr
--
-- Admin Staff, 5 years, office:
--   $16.00 (office) + $2.00 (admin_staff) + $3.50 (5yr) = $21.50/hr
--
-- WEEKLY PAY SCHEDULE:
--   Work week: Monday through Sunday
--   Hours due: End of each work day
--   Approval deadline: Tuesday following the work week
--   Pay day: Friday following the work week
--   Example: Work Jan 6-12 → Hours approved by Jan 14 → Paid Jan 17
--
-- ADVANCE REQUESTS:
--   Employee submits request with reason and amount
--   Admin approves/denies
--   If approved, pay date is set (can be same day or future)
--   Amount deducted from next regular paycheck
--
-- SCHEDULED BONUSES:
--   Admin creates bonus with target date/time
--   System processes on scheduled date
--   Types: performance, holiday, referral, retention, spot, completion, other
