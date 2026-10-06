-- seeds/666_lock_remaining_open_rls.sql — the public key reads nothing private.
--
-- Follow-up to seeds/665. Found 2026-10-05: 44 more tables carried a policy written
-- `FOR ALL TO public USING (true) WITH CHECK (true)` — named "service" something, granted to
-- everyone. Verified live before this file, with the anon key that ships in every browser bundle:
-- staff private messages, conversations, the activity log, error reports (request bodies, emails)
-- and the pay-rate tables were all readable — and, by the same policy, writable and deletable.
--
-- Nothing in the app depends on it. Every query on these tables runs through `supabaseAdmin`
-- (service role, which bypasses RLS). The only browser/mobile `supabase.from(...)` calls in the
-- codebase touch equipment_events, equipment_inventory, field_data_points, receipts and
-- registered_users — and of those, only equipment_events is here; its authenticated-read policy is
-- left exactly as it is. Realtime use is broadcast channels only (DnD), which RLS does not govern.
--
-- So each open policy is re-pointed at what its name always claimed: the service role. Three
-- "any signed-in user may write" policies (assignments, notifications, nav_events) go the same way —
-- the server writes those rows, and a signed-in user forging a notification to an admin is not a
-- feature anybody asked for.
--
-- Idempotent: drops by name, recreates.

BEGIN;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('acc_course_enrollments',          'service_all_ace'),
    ('activity_log',                    'service_all'),
    ('admin_discussion_threads',        'discussion_threads_service'),
    ('conversation_participants',       'conv_participants_service'),
    ('conversations',                   'conversations_service'),
    ('credit_thresholds',               'service_all'),
    ('employee_earned_credentials',     'service_role_all_eec'),
    ('employee_learning_credits',       'service_all'),
    ('employee_profile_changes',        'service_all'),
    ('employee_role_history',           'service_all'),
    ('employee_threshold_achievements', 'service_all'),
    ('error_reports',                   'service_all'),
    ('exam_prep_categories',            'service_all'),
    ('flashcard_reviews',               'service_all'),
    ('flashcards',                      'service_all'),
    ('kb_articles',                     'service_all'),
    ('learning_assignments',            'service_all_la'),
    ('learning_credit_values',          'service_all'),
    ('learning_lessons',                'service_all'),
    ('learning_modules',                'service_all'),
    ('learning_topics',                 'service_all'),
    ('lesson_blocks',                   'service_all'),
    ('lesson_required_articles',        'service_all'),
    ('lesson_versions',                 'service_all'),
    ('media_library',                   'service_all'),
    ('message_reactions',               'reactions_service'),
    ('message_read_receipts',           'read_receipts_service'),
    ('messages',                        'messages_service'),
    ('messaging_preferences',           'msg_prefs_service'),
    ('pinned_messages',                 'pinned_service'),
    ('question_bank',                   'service_all'),
    ('quiz_attempt_answers',            'service_all'),
    ('quiz_attempts',                   'service_all'),
    ('role_tiers',                      'service_role_all_rt'),
    ('seniority_brackets',              'service_role_all_sb'),
    ('typing_indicators',               'typing_service'),
    ('user_article_completions',        'service_all'),
    ('user_bookmarks',                  'service_all'),
    ('user_flashcard_discovery',        'service_all'),
    ('user_flashcards',                 'service_all'),
    ('user_lesson_progress',            'service_all_ulp'),
    ('user_presence',                   'presence_service'),
    ('user_progress',                   'service_all'),
    ('work_type_rates',                 'service_role_all_wtr')
  ) AS v(tbl, pol)
  LOOP
    IF to_regclass('public.' || t.tbl) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t.pol, t.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t.pol, t.tbl);
  END LOOP;
END $$;

-- Signed-in users may no longer write these directly; the server does it with the service role.
DROP POLICY IF EXISTS "Admins can insert assignments" ON public.assignments;
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

-- nav_events: written and read by the server (the nav telemetry API); a signed-in user reading
-- every other person's page views was never intended.
DROP POLICY IF EXISTS nav_events_service_write ON public.nav_events;
DROP POLICY IF EXISTS nav_events_admin_read ON public.nav_events;
CREATE POLICY nav_events_service_write ON public.nav_events FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY nav_events_admin_read ON public.nav_events FOR SELECT TO service_role USING (true);

-- research_clerk_lookups: read only by server routes.
DROP POLICY IF EXISTS research_clerk_lookups_read_all ON public.research_clerk_lookups;
CREATE POLICY research_clerk_lookups_read_all ON public.research_clerk_lookups FOR SELECT TO service_role USING (true);

-- Left as they are, deliberately:
--   equipment_events_authenticated_read — the mobile app reads it with the user's own session.
--   authenticated_read_cleanup_log (project_cleanup_log) — read-only, no personal data.

COMMIT;
