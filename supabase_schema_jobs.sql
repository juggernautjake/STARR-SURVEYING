-- ==========================================================================
-- STARR Surveying — Job Management Schema
-- ==========================================================================
-- Run this in Supabase SQL Editor to create all job management tables.
-- Requires: supabase_schema_messaging.sql (for job thread linking)

-- --------------------------------------------------------------------------
-- 1. jobs — Core job record
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number TEXT UNIQUE NOT NULL,            -- e.g. "2024-0147"
  name TEXT NOT NULL,                          -- Short job name
  description TEXT,                            -- Detailed description

  -- Location
  address TEXT,
  city TEXT,
  state TEXT DEFAULT 'TX',
  zip TEXT,
  county TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),

  -- Classification
  survey_type TEXT NOT NULL DEFAULT 'boundary', -- boundary, topographic, construction, subdivision, alta, elevation_cert, route, as_built, control, other
  acreage NUMERIC(12,4),
  lot_number TEXT,
  subdivision TEXT,
  abstract_number TEXT,

  -- Stage lifecycle
  stage TEXT NOT NULL DEFAULT 'quote',          -- quote, research, fieldwork, drawing, legal, delivery, completed, cancelled, on_hold
  stage_changed_at TIMESTAMPTZ DEFAULT now(),

  -- Dates
  date_received TIMESTAMPTZ DEFAULT now(),
  date_quoted TIMESTAMPTZ,
  date_accepted TIMESTAMPTZ,
  date_started TIMESTAMPTZ,
  date_fieldwork_complete TIMESTAMPTZ,
  date_drawing_complete TIMESTAMPTZ,
  date_legal_complete TIMESTAMPTZ,
  date_delivered TIMESTAMPTZ,
  deadline TIMESTAMPTZ,

  -- Financial
  quote_amount NUMERIC(12,2),
  final_amount NUMERIC(12,2),
  amount_paid NUMERIC(12,2) DEFAULT 0,
  payment_status TEXT DEFAULT 'unpaid',         -- unpaid, partial, paid, waived
  payment_notes TEXT,

  -- Client info
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  client_company TEXT,
  client_address TEXT,

  -- Relationships
  lead_rpls_email TEXT,                         -- email of lead RPLS (links to user)
  conversation_id UUID,                         -- linked messaging thread

  -- Flags
  is_priority BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  is_legacy BOOLEAN DEFAULT false,              -- imported from old system

  -- Metadata
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_jobs_stage ON jobs(stage);
CREATE INDEX idx_jobs_job_number ON jobs(job_number);
CREATE INDEX idx_jobs_created_by ON jobs(created_by);
CREATE INDEX idx_jobs_is_archived ON jobs(is_archived);
CREATE INDEX idx_jobs_survey_type ON jobs(survey_type);
CREATE INDEX idx_jobs_lead_rpls ON jobs(lead_rpls_email);

-- --------------------------------------------------------------------------
-- 2. job_tags — Flexible tagging system
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_job_tags_job ON job_tags(job_id);
CREATE INDEX idx_job_tags_tag ON job_tags(tag);
CREATE UNIQUE INDEX idx_job_tags_unique ON job_tags(job_id, tag);

-- --------------------------------------------------------------------------
-- 3. job_team — People assigned with roles
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_team (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  user_name TEXT,
  role TEXT NOT NULL,                           -- lead_rpls, party_chief, survey_technician, survey_drafter, rod_person, instrument_operator, office_tech, other
  assigned_at TIMESTAMPTZ DEFAULT now(),
  removed_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX idx_job_team_job ON job_team(job_id);
CREATE INDEX idx_job_team_user ON job_team(user_email);
CREATE UNIQUE INDEX idx_job_team_unique ON job_team(job_id, user_email, role) WHERE removed_at IS NULL;

-- --------------------------------------------------------------------------
-- 4. job_equipment — Equipment used on the job
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  equipment_name TEXT NOT NULL,                  -- e.g. "Trimble S7 Total Station"
  equipment_type TEXT,                           -- total_station, gps_receiver, level, drone, data_collector, other
  serial_number TEXT,
  checked_out_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  checked_out_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_job_equipment_job ON job_equipment(job_id);

-- --------------------------------------------------------------------------
-- 5. job_files — File management with backup tracking
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,                                -- drawing, field_data, image, satellite_image, voice_memo, document, deed, plat, legal, cad, trimble, backup, other
  file_url TEXT,
  file_size BIGINT,
  mime_type TEXT,
  is_backup BOOLEAN DEFAULT false,               -- true = this is a backup copy
  backup_of UUID REFERENCES job_files(id),       -- links to the original file
  section TEXT DEFAULT 'general',                 -- general, research, fieldwork, drawing, legal, delivery
  description TEXT,
  uploaded_by TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT false
);

CREATE INDEX idx_job_files_job ON job_files(job_id);
CREATE INDEX idx_job_files_section ON job_files(section);
CREATE INDEX idx_job_files_type ON job_files(file_type);

-- --------------------------------------------------------------------------
-- 6. job_research — Research documents and data for a job
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  category TEXT NOT NULL,                        -- title_info, deed_info, legal_description, previous_survey, plat_records, corner_records, field_notes, satellite_imagery, maps, easements, right_of_way, flood_zone, utilities, other
  title TEXT NOT NULL,
  content TEXT,                                  -- Rich text content
  source TEXT,                                   -- Where did this come from
  reference_number TEXT,                         -- Document/recording number
  date_of_record TIMESTAMPTZ,
  file_id UUID REFERENCES job_files(id),         -- Linked file if any
  added_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_job_research_job ON job_research(job_id);
CREATE INDEX idx_job_research_category ON job_research(category);

-- --------------------------------------------------------------------------
-- 7. job_stages_history — Audit trail of stage transitions
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_stages_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_job_stages_history_job ON job_stages_history(job_id);

-- --------------------------------------------------------------------------
-- 8. job_time_entries — Time tracking per job
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  user_name TEXT,
  work_type TEXT DEFAULT 'general',              -- field, office, research, drawing, legal, travel, other
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER,                      -- computed or manual
  description TEXT,
  billable BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_job_time_job ON job_time_entries(job_id);
CREATE INDEX idx_job_time_user ON job_time_entries(user_email);

-- --------------------------------------------------------------------------
-- 9. job_payments — Payment records
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  payment_type TEXT DEFAULT 'payment',           -- quote, deposit, payment, refund, adjustment, waiver
  payment_method TEXT,                           -- check, credit_card, ach, cash, wire, other
  reference_number TEXT,                         -- Check number, transaction ID
  notes TEXT,
  paid_at TIMESTAMPTZ DEFAULT now(),
  recorded_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_job_payments_job ON job_payments(job_id);

-- --------------------------------------------------------------------------
-- 10. job_field_data — Live field data entries
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_field_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  data_type TEXT NOT NULL,                       -- point, observation, measurement, photo, note, gps_position, total_station
  point_name TEXT,
  northing NUMERIC(15,6),
  easting NUMERIC(15,6),
  elevation NUMERIC(12,6),
  description TEXT,
  raw_data JSONB,                                -- Raw instrument data
  collected_by TEXT NOT NULL,
  collected_at TIMESTAMPTZ DEFAULT now(),
  instrument TEXT,                               -- Which instrument collected this
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_job_field_data_job ON job_field_data(job_id);
CREATE INDEX idx_job_field_data_type ON job_field_data(data_type);

-- --------------------------------------------------------------------------
-- 11. job_checklists — Stage-specific checklists
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,                           -- Which stage this checklist belongs to
  item TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  completed_by TEXT,
  completed_at TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_job_checklists_job ON job_checklists(job_id);

-- --------------------------------------------------------------------------
-- 12. equipment_inventory — Master equipment list
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equipment_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  equipment_type TEXT NOT NULL,                  -- total_station, gps_receiver, gps_base, gps_rover, level, rod, tripod, drone, data_collector, tablet, vehicle, other
  brand TEXT,
  model TEXT,
  serial_number TEXT,
  purchase_date DATE,
  last_calibration DATE,
  next_calibration_due DATE,
  status TEXT DEFAULT 'available',               -- available, checked_out, maintenance, retired
  current_job_id UUID REFERENCES jobs(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_equipment_status ON equipment_inventory(status);

-- --------------------------------------------------------------------------
-- Triggers for updated_at
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$ BEGIN
  CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_job_research_updated_at BEFORE UPDATE ON job_research FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_equipment_updated_at BEFORE UPDATE ON equipment_inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- --------------------------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------------------------
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_research ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_stages_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_field_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_inventory ENABLE ROW LEVEL SECURITY;

-- Service role bypass (our API uses supabaseAdmin with service_role key)
CREATE POLICY "Service role bypass" ON jobs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bypass" ON job_tags FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bypass" ON job_team FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bypass" ON job_equipment FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bypass" ON job_files FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bypass" ON job_research FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bypass" ON job_stages_history FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bypass" ON job_time_entries FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bypass" ON job_payments FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bypass" ON job_field_data FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bypass" ON job_checklists FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bypass" ON equipment_inventory FOR ALL USING (auth.role() = 'service_role');
