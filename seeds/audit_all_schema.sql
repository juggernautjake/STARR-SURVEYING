-- ============================================================================
-- audit_all_schema.sql
--
-- Comprehensive schema diagnostic — lists every table the app code
-- queries and reports whether it exists on this DB. Helps identify
-- gaps from skipped or partial seed runs (pre-260 or otherwise).
--
-- Read-only. Safe to run anytime.
-- ============================================================================

WITH expected_tables(t, source_seed_hint) AS (
  VALUES
    -- Pre-SaaS-pivot (legacy admin schema)
    ('registered_users',          'pre-220'),
    ('jobs',                      'pre-220'),
    ('job_team',                  'pre-220'),
    ('job_tags',                  'pre-220'),
    ('job_equipment',             'pre-220'),
    ('job_files',                 'pre-220'),
    ('job_time_entries',          'pre-220'),
    ('job_stages_history',        'pre-220'),
    ('job_field_data',            'pre-220'),
    ('employees',                 'pre-220 (vestigial, no code refs)'),
    ('employee_profiles',         'pre-220'),
    ('employee_certifications',   'pre-220'),
    ('pay_raises',                'pre-220'),
    ('pay_rate_standards',        'pre-220'),
    ('role_pay_adjustments',      'pre-220'),
    ('payroll_runs',              'pre-220'),
    ('pay_stubs',                 'pre-220'),
    ('time_logs',                 'pre-220 (vestigial, no code refs)'),
    ('daily_time_logs',           'pre-220'),
    ('notifications',             'pre-220'),
    ('messages',                  'pre-220'),
    ('discussions',               'pre-220 (vestigial, no code refs)'),
    ('discussion_messages',       'pre-220 (vestigial, no code refs)'),
    ('message_contacts',          'pre-220 (vestigial, no code refs)'),
    ('notes',                     'pre-220 (vestigial, no code refs)'),
    ('activity_log',              'pre-220'),
    ('error_reports',             'pre-220'),
    ('equipment_inventory',       'pre-220'),
    ('equipment_reservations',    'pre-220'),
    ('vehicles',                  'pre-220'),
    ('assignments',               'pre-220'),
    ('leads',                     'pre-220 (vestigial, no code refs)'),
    ('mileage_entries',           'seed 282'),
    ('schedule_events',           'pre-220 (vestigial, no code refs)'),
    ('learning_progress',         'pre-220 (vestigial, no code refs)'),
    ('research_projects',         'pre-220'),
    ('research_documents',        'pre-220'),
    ('research_subscriptions',    'pre-220'),
    ('research_batch_jobs',       'pre-220'),
    ('document_wallet_balance',   'pre-220'),
    ('document_purchase_history', 'pre-220'),
    ('rewards_balance',           'pre-220 (vestigial, no code refs)'),
    ('rewards_history',           'pre-220 (vestigial, no code refs)'),
    -- Starr Field receipts module
    ('receipts',                  'seed 220'),
    ('receipt_line_items',        'seed 220'),
    ('receipt_attachments',       'no seed (vestigial, no code refs)'),
    -- Starr Field other modules
    ('field_data_points',         'seed 221'),
    ('location_pings',            'seed 223'),
    ('location_derivations',      'seed 224'),
    -- SaaS pivot
    ('organizations',                'seed 260'),
    ('organization_members',         'seed 260'),
    ('subscriptions',                'seed 260'),
    ('org_settings',                 'seed 260'),
    ('user_active_org',              'seed 260'),
    ('operator_users',               'seed 265'),
    ('impersonation_sessions',       'seed 265'),
    ('audit_log',                    'seed 265'),
    ('pending_operator_actions',     'seed 265'),
    ('invoices',                     'seed 266'),
    ('subscription_events',          'seed 266'),
    ('usage_events',                 'seed 266'),
    ('processed_webhook_events',     'seed 266'),
    ('org_invitations',              'seed 267'),
    ('org_notifications',            'seed 267'),
    ('releases',                     'seed 267'),
    ('release_acks',                 'seed 267'),
    ('support_tickets',              'seed 267'),
    ('support_ticket_messages',      'seed 267'),
    ('kb_articles',                  'seed 268'),
    ('ticket_subscribers',           'seed 268'),
    ('ticket_kb_links',              'seed 268'),
    ('email_templates',              'seed 268'),
    ('broadcasts',                   'seed 268'),
    ('user_notification_prefs',      'seed 271'),
    ('employee_payouts',             'seed 281')
),
present AS (
  SELECT table_name AS t
  FROM information_schema.tables
  WHERE table_schema = 'public'
)
SELECT
  e.source_seed_hint AS source_seed,
  e.t AS table_name,
  CASE WHEN p.t IS NULL THEN 'MISSING' ELSE 'present' END AS status
FROM expected_tables e
LEFT JOIN present p ON e.t = p.t
ORDER BY
  CASE WHEN p.t IS NULL THEN 0 ELSE 1 END,  -- MISSING rows first
  e.source_seed_hint,
  e.t;
