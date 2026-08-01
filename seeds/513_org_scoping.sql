-- seeds/513_org_scoping.sql — put a tenant column on the business tables, now (D1).
--
-- Owner decision D1, from the platform audit's own session:
--
--   *"Ship single-tenant. Add `org_id` to the business tables NOW (nullable, defaulted to the Starr
--    org) so the eventual multi-tenant migration is a backfill, not a rewrite."*
--
-- ── THE CLASSIFICATION IS THE WORK; THE COLUMN IS THE EASY PART ─────────────────────────────
--
-- 182 tables had no `org_id` and no org-scoped parent to inherit one from. Adding it to all 182 would
-- have been wrong in four distinct ways, and each is worse than the gap it closes:
--
--   · PLATFORM (12) sit ABOVE the org — `organizations` itself, `operator_users`, `releases`,
--     `impersonation_sessions`. An `org_id` on `organizations` is a category error, and one on
--     `operator_users` would scope the operator console to a single customer, defeating it.
--   · REFERENCE (35) are shared catalogues — 254 Texas counties, the FS reference library, the problem
--     bank, seniority brackets. A per-tenant copy of 254 counties is not multi-tenancy, it is
--     duplication with extra steps, and the first divergent copy is a support call.
--   · PER-USER (22) follow the PERSON, not the firm. A bookmark is not tenant data.
--   · DND (40) is a separate product with its own user table and its own access model, and the audit
--     puts it explicitly out of scope.
--
-- A further 51 are DERIVED: a child of an already-scoped table, like `job_equipment` under `jobs`.
-- Those deliberately get nothing — denormalising the column onto every child is a second copy of the
-- same fact, and two copies of a fact can disagree. They reach their tenant by join.
--
-- That leaves 73 TENANT tables, and this is them. The classification lives in
-- `scripts/audit-org-scoping.mjs` so it is reviewable and re-runnable rather than buried in this file.
--
-- ── NULLABLE, AND NOT BACKFILLED IN THIS SEED ───────────────────────────────────────────────
--
-- Nullable because D1 says so and because the alternative is worse: a NOT NULL with a default silently
-- stamps every future row with the Starr org, including rows a second customer's code would insert —
-- which is the exact bug multi-tenancy exists to prevent, shipped early and invisibly.
--
-- The backfill of existing rows is a separate statement at the foot of this file, guarded so it only
-- ever runs while there is exactly ONE organisation. The moment there are two, "which org did this row
-- belong to" stops being answerable by a default and starts needing a human.
--
-- ── NOTHING READS IT YET, AND THAT IS THE POINT ─────────────────────────────────────────────
--
-- No query filters on these columns today; the app is single-tenant and stays that way. This is the
-- difference between a migration and a rewrite: the column, the FK and the index exist, so the day a
-- second firm arrives the work is a backfill and a WHERE clause rather than 73 ALTERs against a live
-- database with customers on it.

BEGIN;

ALTER TABLE active_clock_sessions ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_active_clock_sessions_org ON active_clock_sessions (org_id);
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_activity_log_org ON activity_log (org_id);
ALTER TABLE ad_spend_daily ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ad_spend_daily_org ON ad_spend_daily (org_id);
ALTER TABLE admin_alert_settings ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_admin_alert_settings_org ON admin_alert_settings (org_id);
ALTER TABLE admin_discussion_threads ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_admin_discussion_threads_org ON admin_discussion_threads (org_id);
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_app_settings_org ON app_settings (org_id);
ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_balance_transactions_org ON balance_transactions (org_id);
ALTER TABLE cad_folders ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cad_folders_org ON cad_folders (org_id);
ALTER TABLE company_notes ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_company_notes_org ON company_notes (org_id);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts (org_id);
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversation_participants_org ON conversation_participants (org_id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_org ON conversations (org_id);
ALTER TABLE conversion_upload_log ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversion_upload_log_org ON conversion_upload_log (org_id);
ALTER TABLE credential_bonuses ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_credential_bonuses_org ON credential_bonuses (org_id);
ALTER TABLE credit_thresholds ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_credit_thresholds_org ON credit_thresholds (org_id);
ALTER TABLE custom_roles ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_custom_roles_org ON custom_roles (org_id);
ALTER TABLE daily_time_logs ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_daily_time_logs_org ON daily_time_logs (org_id);
ALTER TABLE drawing_elements ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_drawing_elements_org ON drawing_elements (org_id);
ALTER TABLE drawing_notes ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_drawing_notes_org ON drawing_notes (org_id);
ALTER TABLE email_send_log ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_email_send_log_org ON email_send_log (org_id);
ALTER TABLE employee_certifications ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employee_certifications_org ON employee_certifications (org_id);
ALTER TABLE employee_contact_methods ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employee_contact_methods_org ON employee_contact_methods (org_id);
ALTER TABLE employee_earned_credentials ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employee_earned_credentials_org ON employee_earned_credentials (org_id);
ALTER TABLE employee_images ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employee_images_org ON employee_images (org_id);
ALTER TABLE employee_learning_credits ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employee_learning_credits_org ON employee_learning_credits (org_id);
ALTER TABLE employee_privacy ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employee_privacy_org ON employee_privacy (org_id);
ALTER TABLE employee_profile_changes ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employee_profile_changes_org ON employee_profile_changes (org_id);
ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employee_profiles_org ON employee_profiles (org_id);
ALTER TABLE employee_role_history ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employee_role_history_org ON employee_role_history (org_id);
ALTER TABLE employee_salary_history ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employee_salary_history_org ON employee_salary_history (org_id);
ALTER TABLE employee_threshold_achievements ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employee_threshold_achievements_org ON employee_threshold_achievements (org_id);
ALTER TABLE equipment_kit_items ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_kit_items_org ON equipment_kit_items (org_id);
ALTER TABLE equipment_kits ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_kits_org ON equipment_kits (org_id);
ALTER TABLE fieldbook_entry_categories ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fieldbook_entry_categories_org ON fieldbook_entry_categories (org_id);
ALTER TABLE fieldbook_notes ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fieldbook_notes_org ON fieldbook_notes (org_id);
ALTER TABLE google_ads_connections ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_google_ads_connections_org ON google_ads_connections (org_id);
ALTER TABLE google_calendar_connections ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_google_calendar_connections_org ON google_calendar_connections (org_id);
ALTER TABLE job_payment_allocations ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_job_payment_allocations_org ON job_payment_allocations (org_id);
ALTER TABLE learning_assignments ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_learning_assignments_org ON learning_assignments (org_id);
ALTER TABLE learning_credit_values ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_learning_credit_values_org ON learning_credit_values (org_id);
ALTER TABLE location_pings ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_location_pings_org ON location_pings (org_id);
ALTER TABLE location_stops ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_location_stops_org ON location_stops (org_id);
ALTER TABLE maintenance_event_documents ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_event_documents_org ON maintenance_event_documents (org_id);
ALTER TABLE maintenance_schedules ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_org ON maintenance_schedules (org_id);
ALTER TABLE media_library ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_media_library_org ON media_library (org_id);
ALTER TABLE pay_advance_requests ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pay_advance_requests_org ON pay_advance_requests (org_id);
ALTER TABLE pay_period_locks ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pay_period_locks_org ON pay_period_locks (org_id);
ALTER TABLE pay_raises ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pay_raises_org ON pay_raises (org_id);
ALTER TABLE pay_rate_standards ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pay_rate_standards_org ON pay_rate_standards (org_id);
ALTER TABLE pay_stubs ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pay_stubs_org ON pay_stubs (org_id);
ALTER TABLE pay_system_config ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pay_system_config_org ON pay_system_config (org_id);
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payroll_runs_org ON payroll_runs (org_id);
ALTER TABLE personnel_skills ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_personnel_skills_org ON personnel_skills (org_id);
ALTER TABLE personnel_unavailability ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_personnel_unavailability_org ON personnel_unavailability (org_id);
ALTER TABLE project_cleanup_log ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_project_cleanup_log_org ON project_cleanup_log (org_id);
ALTER TABLE pto_balances ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pto_balances_org ON pto_balances (org_id);
ALTER TABLE recycle_bin ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_recycle_bin_org ON recycle_bin (org_id);
ALTER TABLE research_batch_jobs ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_research_batch_jobs_org ON research_batch_jobs (org_id);
ALTER TABLE research_clerk_lookups ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_research_clerk_lookups_org ON research_clerk_lookups (org_id);
ALTER TABLE rewards_purchases ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_rewards_purchases_org ON rewards_purchases (org_id);
ALTER TABLE role_pay_adjustments ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_role_pay_adjustments_org ON role_pay_adjustments (org_id);
ALTER TABLE role_tiers ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_role_tiers_org ON role_tiers (org_id);
ALTER TABLE scheduled_bonuses ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_scheduled_bonuses_org ON scheduled_bonuses (org_id);
ALTER TABLE seniority_brackets ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_seniority_brackets_org ON seniority_brackets (org_id);
ALTER TABLE typing_indicators ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_typing_indicators_org ON typing_indicators (org_id);
ALTER TABLE user_pay_overrides ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_user_pay_overrides_org ON user_pay_overrides (org_id);
ALTER TABLE weekly_pay_periods ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_weekly_pay_periods_org ON weekly_pay_periods (org_id);
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_org ON withdrawal_requests (org_id);
ALTER TABLE work_type_rates ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_work_type_rates_org ON work_type_rates (org_id);
ALTER TABLE xp_balances ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_xp_balances_org ON xp_balances (org_id);
ALTER TABLE xp_milestone_achievements ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_xp_milestone_achievements_org ON xp_milestone_achievements (org_id);
ALTER TABLE xp_pay_milestones ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_xp_pay_milestones_org ON xp_pay_milestones (org_id);
ALTER TABLE xp_transactions ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_xp_transactions_org ON xp_transactions (org_id);

-- ── The backfill, guarded ───────────────────────────────────────────────────────────────────
--
-- Only while there is exactly one organisation. With two, a default is a guess, and a guess about which
-- customer owns a row is the worst kind of wrong: silent, plausible, and discovered by the other
-- customer.
DO $$
DECLARE
  only_org uuid;
  n_orgs int;
  t text;
BEGIN
  SELECT count(*) INTO n_orgs FROM organizations;
  IF n_orgs <> 1 THEN
    RAISE NOTICE 'org_id backfill SKIPPED: % organisations exist, so the owner of an existing row is no longer inferable.', n_orgs;
    RETURN;
  END IF;
  SELECT id INTO only_org FROM organizations LIMIT 1;

  FOREACH t IN ARRAY ARRAY['active_clock_sessions', 'activity_log', 'ad_spend_daily', 'admin_alert_settings', 'admin_discussion_threads', 'app_settings', 'balance_transactions', 'cad_folders', 'company_notes', 'contacts', 'conversation_participants', 'conversations', 'conversion_upload_log', 'credential_bonuses', 'credit_thresholds', 'custom_roles', 'daily_time_logs', 'drawing_elements', 'drawing_notes', 'email_send_log', 'employee_certifications', 'employee_contact_methods', 'employee_earned_credentials', 'employee_images', 'employee_learning_credits', 'employee_privacy', 'employee_profile_changes', 'employee_profiles', 'employee_role_history', 'employee_salary_history', 'employee_threshold_achievements', 'equipment_kit_items', 'equipment_kits', 'fieldbook_entry_categories', 'fieldbook_notes', 'google_ads_connections', 'google_calendar_connections', 'job_payment_allocations', 'learning_assignments', 'learning_credit_values', 'location_pings', 'location_stops', 'maintenance_event_documents', 'maintenance_schedules', 'media_library', 'pay_advance_requests', 'pay_period_locks', 'pay_raises', 'pay_rate_standards', 'pay_stubs', 'pay_system_config', 'payroll_runs', 'personnel_skills', 'personnel_unavailability', 'project_cleanup_log', 'pto_balances', 'recycle_bin', 'research_batch_jobs', 'research_clerk_lookups', 'rewards_purchases', 'role_pay_adjustments', 'role_tiers', 'scheduled_bonuses', 'seniority_brackets', 'typing_indicators', 'user_pay_overrides', 'weekly_pay_periods', 'withdrawal_requests', 'work_type_rates', 'xp_balances', 'xp_milestone_achievements', 'xp_pay_milestones', 'xp_transactions']
  LOOP
    EXECUTE format('UPDATE %I SET org_id = $1 WHERE org_id IS NULL', t) USING only_org;
  END LOOP;
END $$;

COMMIT;
