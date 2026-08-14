-- seeds/593_job_notification_prefs.sql — slice N4 of
-- docs/planning/in-progress/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
--
-- Owner, 2026-08-14: *"Every time something happens with a job that someone is assigned to, they
-- should get a notification about that thing."*
--
-- ── WHY THE VOLUME CONTROL SHIPS WITH THE WIRING, NOT AFTER IT ──────────────────────────────────
--
-- N3 turns twelve silent job mutations into twelve notified ones. On a busy job that is a phone
-- buzzing every few minutes all afternoon: four photos uploaded, a receipt linked, the schedule
-- nudged, a file replaced. Every one of those is genuinely something the owner asked to be told
-- about, and the sum of them is a phone that gets muted — after which the ONE that mattered (the
-- briefing that says the gate code changed) is missed too.
--
-- So "tell me about everything" and "tell me about everything at once" are separated. Nothing is
-- dropped: an event routed to `digest` is still delivered, in a single message at the end of the
-- day, with a link per line. `off` is the only setting that loses anything, and it is never a
-- default.
--
-- ── WHY A JSONB MAP AND NOT A COLUMN PER EVENT ──────────────────────────────────────────────────
--
-- `JobEventKind` in lib/notifications/job-event.ts is a union that grows — the plan says adding a
-- kind should be the whole cost of notifying about it. A column per kind makes that a migration,
-- and a migration nobody writes is a new event that silently has no preference and falls through to
-- whatever the code's default is. A map means an unknown key resolves against the code's defaults
-- table, which is exactly the right behaviour for an event that did not exist when the row was
-- written.

CREATE TABLE IF NOT EXISTS job_notification_prefs (
  user_email   TEXT PRIMARY KEY,
  -- event kind → 'immediate' | 'digest' | 'off'. Sparse on purpose: a key that is absent means
  -- "whatever the product decided", so improving a default improves it for everyone who never
  -- opened the settings page, which is almost everyone.
  channels     JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- The hour (0–23, US/Central — the firm is in Texas and has no other office) the daily digest
  -- goes out. Stored per user because the office and the field keep different days.
  digest_hour  INTEGER NOT NULL DEFAULT 17,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_notification_prefs_hour_chk') THEN
    ALTER TABLE job_notification_prefs ADD CONSTRAINT job_notification_prefs_hour_chk
      CHECK (digest_hour BETWEEN 0 AND 23);
  END IF;
END $$;

-- ── THE QUEUE ───────────────────────────────────────────────────────────────────────────────────
--
-- A digested event is written here INSTEAD of to `notifications`, and the cron turns a day's rows
-- into one notification. Rows are kept after sending rather than deleted: "why did I not hear about
-- that" is a question that gets asked, and a queue that empties itself cannot answer it.
CREATE TABLE IF NOT EXISTS job_notification_digest_queue (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email  TEXT NOT NULL,
  job_id      UUID REFERENCES jobs(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  link        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL until it has been folded into a digest. The cron claims by stamping this, so two
  -- overlapping runs cannot send the same line twice.
  sent_at     TIMESTAMPTZ
);

-- The only read the cron makes: this user's unsent lines, oldest first.
CREATE INDEX IF NOT EXISTS idx_job_digest_pending
  ON job_notification_digest_queue (user_email, created_at)
  WHERE sent_at IS NULL;

COMMENT ON TABLE job_notification_prefs IS
  'Per-user volume control for job events. Absent key = the code default (lib/notifications/'
  'job-prefs.ts). Exists because notifying about every job mutation without it trains people to '
  'swipe notifications away, which loses the ones that matter along with the ones that do not.';
COMMENT ON COLUMN job_notification_prefs.channels IS
  'JSONB map of JobEventKind → immediate | digest | off. Sparse: an absent kind falls through to '
  'DEFAULT_JOB_EVENT_CHANNELS in code, so a newly added event kind is never silently unconfigured.';
COMMENT ON TABLE job_notification_digest_queue IS
  'Job events routed to a daily digest rather than an immediate notification. One row per event '
  'per recipient; the digest cron folds a day of them into one notification and stamps sent_at.';
