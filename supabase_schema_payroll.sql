-- ============================================================
-- STARR Surveying — Payroll & Finances Schema
-- Run after: supabase_schema_v3.sql, supabase_schema_jobs.sql
-- ============================================================

-- 1. Employee profiles (pay rates, certifications, bank info)
CREATE TABLE IF NOT EXISTS employee_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT UNIQUE NOT NULL,
  user_name TEXT,
  job_title TEXT NOT NULL DEFAULT 'survey_technician',
  -- job_title: survey_technician, instrument_operator, party_chief, survey_drafter, office_tech, lead_rpls
  hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  salary_type TEXT NOT NULL DEFAULT 'hourly', -- hourly, salary
  annual_salary NUMERIC(12,2),
  pay_frequency TEXT NOT NULL DEFAULT 'biweekly', -- weekly, biweekly, monthly
  hire_date DATE,
  -- Balance / wallet
  available_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_withdrawn NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Bank info (encrypted in production, placeholder fields)
  bank_name TEXT,
  bank_routing_last4 TEXT,
  bank_account_last4 TEXT,
  bank_account_type TEXT DEFAULT 'checking', -- checking, savings
  bank_verified BOOLEAN DEFAULT FALSE,
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Certifications that affect pay
CREATE TABLE IF NOT EXISTS employee_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  certification_type TEXT NOT NULL,
  -- certification_type: sit_exam, rpls_license, lsit, drone_pilot, osha_10, osha_30, first_aid, cpr, hazwoper, etc.
  certification_name TEXT NOT NULL,
  issued_date DATE,
  expiry_date DATE,
  license_number TEXT,
  pay_bump_amount NUMERIC(10,2) DEFAULT 0, -- additional hourly rate for holding this cert
  pay_bump_percentage NUMERIC(5,2) DEFAULT 0, -- or percentage bump
  verified BOOLEAN DEFAULT FALSE,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  document_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Pay rates by job title (company standard rates)
CREATE TABLE IF NOT EXISTS pay_rate_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_title TEXT NOT NULL,
  -- job_title: survey_technician, instrument_operator, party_chief, survey_drafter, office_tech, lead_rpls
  min_rate NUMERIC(10,2) NOT NULL,
  max_rate NUMERIC(10,2) NOT NULL,
  default_rate NUMERIC(10,2) NOT NULL,
  description TEXT,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_current BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Pay raises history
CREATE TABLE IF NOT EXISTS pay_raises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  previous_rate NUMERIC(10,2) NOT NULL,
  new_rate NUMERIC(10,2) NOT NULL,
  raise_amount NUMERIC(10,2) NOT NULL,
  raise_percentage NUMERIC(5,2),
  reason TEXT,
  effective_date DATE NOT NULL,
  approved_by TEXT NOT NULL,
  next_review_date DATE,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Role-based pay adjustments (if working as party chief on a job, get different rate)
CREATE TABLE IF NOT EXISTS role_pay_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_title TEXT NOT NULL, -- employee's normal title
  role_on_job TEXT NOT NULL, -- role they're filling on this job
  adjustment_type TEXT NOT NULL DEFAULT 'flat', -- flat, percentage
  adjustment_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Payroll runs (batch payroll processing)
CREATE TABLE IF NOT EXISTS payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_period_start DATE NOT NULL,
  pay_period_end DATE NOT NULL,
  run_date TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'draft', -- draft, processing, completed, cancelled
  total_gross NUMERIC(12,2) DEFAULT 0,
  total_deductions NUMERIC(12,2) DEFAULT 0,
  total_net NUMERIC(12,2) DEFAULT 0,
  employee_count INT DEFAULT 0,
  processed_by TEXT NOT NULL,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Individual pay stubs per payroll run
CREATE TABLE IF NOT EXISTS pay_stubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id UUID REFERENCES payroll_runs(id),
  user_email TEXT NOT NULL,
  user_name TEXT,
  pay_period_start DATE NOT NULL,
  pay_period_end DATE NOT NULL,
  -- Hours
  regular_hours NUMERIC(8,2) DEFAULT 0,
  overtime_hours NUMERIC(8,2) DEFAULT 0,
  -- Rates
  base_rate NUMERIC(10,2) NOT NULL,
  overtime_rate NUMERIC(10,2),
  role_adjustment NUMERIC(10,2) DEFAULT 0,
  cert_adjustment NUMERIC(10,2) DEFAULT 0,
  effective_rate NUMERIC(10,2) NOT NULL, -- base + adjustments
  -- Amounts
  gross_pay NUMERIC(12,2) NOT NULL,
  -- Deductions (placeholders — real payroll uses a payroll provider)
  federal_tax NUMERIC(10,2) DEFAULT 0,
  state_tax NUMERIC(10,2) DEFAULT 0,
  social_security NUMERIC(10,2) DEFAULT 0,
  medicare NUMERIC(10,2) DEFAULT 0,
  other_deductions NUMERIC(10,2) DEFAULT 0,
  deduction_notes TEXT,
  total_deductions NUMERIC(12,2) DEFAULT 0,
  net_pay NUMERIC(12,2) NOT NULL,
  -- Disbursement
  disbursement_method TEXT DEFAULT 'balance', -- balance (added to employee wallet), direct_deposit, check
  disbursement_status TEXT DEFAULT 'pending', -- pending, credited, deposited, failed
  credited_at TIMESTAMPTZ,
  -- Job breakdown
  job_hours JSONB DEFAULT '[]', -- [{job_id, job_name, hours, role, rate}]
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Balance transactions (credits from payroll, withdrawals to bank)
CREATE TABLE IF NOT EXISTS balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  transaction_type TEXT NOT NULL, -- credit_payroll, withdrawal, adjustment, bonus, reimbursement
  amount NUMERIC(12,2) NOT NULL, -- positive for credits, negative for debits
  balance_before NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  description TEXT,
  reference_type TEXT, -- pay_stub, withdrawal_request, manual
  reference_id UUID,
  status TEXT NOT NULL DEFAULT 'completed', -- pending, processing, completed, failed, reversed
  processed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Withdrawal requests
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  destination TEXT NOT NULL DEFAULT 'bank_account', -- bank_account, check, other
  bank_name TEXT,
  bank_account_last4 TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, processing, completed, rejected, cancelled
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  transaction_id UUID REFERENCES balance_transactions(id),
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Job payment allocations (link job payments to employee work)
CREATE TABLE IF NOT EXISTS job_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  job_payment_id UUID, -- references job_payments table
  user_email TEXT NOT NULL,
  hours_worked NUMERIC(8,2) NOT NULL,
  hourly_rate NUMERIC(10,2) NOT NULL,
  role_on_job TEXT,
  total_amount NUMERIC(12,2) NOT NULL,
  pay_stub_id UUID REFERENCES pay_stubs(id),
  status TEXT DEFAULT 'pending', -- pending, included_in_payroll, paid
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_employee_profiles_email ON employee_profiles(user_email);
CREATE INDEX IF NOT EXISTS idx_employee_certs_email ON employee_certifications(user_email);
CREATE INDEX IF NOT EXISTS idx_pay_rate_standards_title ON pay_rate_standards(job_title, is_current);
CREATE INDEX IF NOT EXISTS idx_pay_raises_email ON pay_raises(user_email);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_dates ON payroll_runs(pay_period_start, pay_period_end);
CREATE INDEX IF NOT EXISTS idx_pay_stubs_email ON pay_stubs(user_email);
CREATE INDEX IF NOT EXISTS idx_pay_stubs_run ON pay_stubs(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_balance_tx_email ON balance_transactions(user_email);
CREATE INDEX IF NOT EXISTS idx_withdrawal_email ON withdrawal_requests(user_email);
CREATE INDEX IF NOT EXISTS idx_job_alloc_email ON job_payment_allocations(user_email);
CREATE INDEX IF NOT EXISTS idx_job_alloc_job ON job_payment_allocations(job_id);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_timestamp() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_employee_profiles_ts') THEN
    CREATE TRIGGER trg_employee_profiles_ts BEFORE UPDATE ON employee_profiles FOR EACH ROW EXECUTE FUNCTION update_timestamp();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_employee_certs_ts') THEN
    CREATE TRIGGER trg_employee_certs_ts BEFORE UPDATE ON employee_certifications FOR EACH ROW EXECUTE FUNCTION update_timestamp();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pay_rate_standards_ts') THEN
    CREATE TRIGGER trg_pay_rate_standards_ts BEFORE UPDATE ON pay_rate_standards FOR EACH ROW EXECUTE FUNCTION update_timestamp();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_payroll_runs_ts') THEN
    CREATE TRIGGER trg_payroll_runs_ts BEFORE UPDATE ON payroll_runs FOR EACH ROW EXECUTE FUNCTION update_timestamp();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pay_stubs_ts') THEN
    CREATE TRIGGER trg_pay_stubs_ts BEFORE UPDATE ON pay_stubs FOR EACH ROW EXECUTE FUNCTION update_timestamp();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_withdrawal_requests_ts') THEN
    CREATE TRIGGER trg_withdrawal_requests_ts BEFORE UPDATE ON withdrawal_requests FOR EACH ROW EXECUTE FUNCTION update_timestamp();
  END IF;
END $$;

-- RLS Policies
ALTER TABLE employee_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_rate_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_raises ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_pay_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_stubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_payment_allocations ENABLE ROW LEVEL SECURITY;

-- Service role bypass — wrapped in DO blocks so re-running is safe
DO $$ BEGIN CREATE POLICY "Service role bypass employee_profiles" ON employee_profiles FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Service role bypass employee_certifications" ON employee_certifications FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Service role bypass pay_rate_standards" ON pay_rate_standards FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Service role bypass pay_raises" ON pay_raises FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Service role bypass role_pay_adjustments" ON role_pay_adjustments FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Service role bypass payroll_runs" ON payroll_runs FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Service role bypass pay_stubs" ON pay_stubs FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Service role bypass balance_transactions" ON balance_transactions FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Service role bypass withdrawal_requests" ON withdrawal_requests FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Service role bypass job_payment_allocations" ON job_payment_allocations FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Insert default pay rate standards
INSERT INTO pay_rate_standards (job_title, min_rate, max_rate, default_rate, description) VALUES
  ('survey_technician', 15.00, 25.00, 18.00, 'Entry-level field technician'),
  ('instrument_operator', 18.00, 30.00, 22.00, 'Operates total station and GPS equipment'),
  ('party_chief', 22.00, 40.00, 28.00, 'Leads field survey crew'),
  ('survey_drafter', 20.00, 35.00, 25.00, 'CAD drafting and drawing production'),
  ('office_tech', 16.00, 28.00, 20.00, 'Office administrative and technical support'),
  ('lead_rpls', 35.00, 75.00, 50.00, 'Registered Professional Land Surveyor')
ON CONFLICT DO NOTHING;

-- Insert default role pay adjustments
INSERT INTO role_pay_adjustments (base_title, role_on_job, adjustment_type, adjustment_amount, description) VALUES
  ('survey_technician', 'party_chief', 'flat', 5.00, 'Tech acting as party chief gets $5/hr bump'),
  ('survey_technician', 'instrument_operator', 'flat', 2.00, 'Tech operating instruments gets $2/hr bump'),
  ('instrument_operator', 'party_chief', 'flat', 3.00, 'IO acting as party chief gets $3/hr bump'),
  ('survey_drafter', 'party_chief', 'flat', 5.00, 'Drafter acting as party chief gets $5/hr bump'),
  ('party_chief', 'lead_rpls', 'flat', 10.00, 'PC acting as lead RPLS gets $10/hr bump')
ON CONFLICT DO NOTHING;
