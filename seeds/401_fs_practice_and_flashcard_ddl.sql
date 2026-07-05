-- 401_fs_practice_and_flashcard_ddl.sql
--
-- (1) Two NEW tables for the FS-prep per-module study loop:
--       fs_practice_progress  — untimed practice tallies per user+module
--       fs_section_progress   — which lesson sections a user has read (unlock-as-you-read)
-- (2) Idempotent DDL CAPTURE for tables that were created directly in Supabase and
--     never checked in: flashcards, user_flashcards, flashcard_reviews,
--     user_flashcard_discovery, fs_study_modules. These are CREATE TABLE IF NOT
--     EXISTS, so they are no-ops against the live DB (which already has them) and
--     only matter when standing up a fresh database. Column sets mirror the live
--     schema (introspected 2026-07-05) and the flashcards API usage; types are
--     best-effort where a live row wasn't available to confirm.
--
-- Apply: node scripts/apply-seeds.mjs --only 401_fs_practice_and_flashcard_ddl.sql

-- ── NEW: FS practice progress ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fs_practice_progress (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email     text NOT NULL,
  module_id      uuid NOT NULL,
  attempted      integer NOT NULL DEFAULT 0,
  correct        integer NOT NULL DEFAULT 0,
  last_practiced_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_email, module_id)
);
CREATE INDEX IF NOT EXISTS idx_fs_practice_progress_user ON fs_practice_progress (user_email);
ALTER TABLE fs_practice_progress ENABLE ROW LEVEL SECURITY;

-- ── NEW: FS section (reading) progress ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS fs_section_progress (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email     text NOT NULL,
  module_id      uuid NOT NULL,
  section_type   text NOT NULL,           -- overview|concepts|formulas|examples|tips
  viewed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_email, module_id, section_type)
);
CREATE INDEX IF NOT EXISTS idx_fs_section_progress_user_mod ON fs_section_progress (user_email, module_id);
ALTER TABLE fs_section_progress ENABLE ROW LEVEL SECURITY;

-- ── CAPTURE: flashcards (built-in cards) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS flashcards (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term             text NOT NULL,
  definition       text NOT NULL,
  hint_1           text,
  hint_2           text,
  hint_3           text,
  module_id        uuid,
  lesson_id        uuid,
  keywords         text[],
  tags             text[],
  category         text,
  difficulty_level text,
  times_shown      integer NOT NULL DEFAULT 0,
  times_correct    integer NOT NULL DEFAULT 0,
  is_published     boolean NOT NULL DEFAULT true,
  review_status    text NOT NULL DEFAULT 'approved',
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flashcards_module ON flashcards (module_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_lesson ON flashcards (lesson_id);

-- ── CAPTURE: user_flashcards (user-created cards) ────────────────────────────
CREATE TABLE IF NOT EXISTS user_flashcards (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email       text NOT NULL,
  term             text NOT NULL,
  definition       text NOT NULL,
  hint_1           text,
  hint_2           text,
  hint_3           text,
  module_id        uuid,
  lesson_id        uuid,
  keywords         text[],
  tags             text[],
  category         text,
  difficulty_level text,
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_flashcards_user ON user_flashcards (user_email);
CREATE INDEX IF NOT EXISTS idx_user_flashcards_module ON user_flashcards (module_id);
ALTER TABLE user_flashcards ENABLE ROW LEVEL SECURITY;

-- ── CAPTURE: flashcard_reviews (SM-2 SRS state) ──────────────────────────────
CREATE TABLE IF NOT EXISTS flashcard_reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email     text NOT NULL,
  card_id        uuid NOT NULL,
  card_source    text NOT NULL DEFAULT 'builtin',   -- builtin|user
  ease_factor    numeric NOT NULL DEFAULT 2.5,
  interval_days  integer NOT NULL DEFAULT 0,
  repetitions    integer NOT NULL DEFAULT 0,
  next_review_at timestamptz,
  last_rating    text,
  times_reviewed integer NOT NULL DEFAULT 0,
  times_correct  integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_email, card_id, card_source)
);
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_user_due ON flashcard_reviews (user_email, next_review_at);
ALTER TABLE flashcard_reviews ENABLE ROW LEVEL SECURITY;

-- ── CAPTURE: user_flashcard_discovery (unlock built-in cards on progress) ─────
CREATE TABLE IF NOT EXISTS user_flashcard_discovery (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email            text NOT NULL,
  card_id               uuid NOT NULL,
  next_yearly_review_at timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_email, card_id)
);
CREATE INDEX IF NOT EXISTS idx_flashcard_discovery_user ON user_flashcard_discovery (user_email);
ALTER TABLE user_flashcard_discovery ENABLE ROW LEVEL SECURITY;

-- ── CAPTURE: fs_study_modules (FS course module content) ─────────────────────
CREATE TABLE IF NOT EXISTS fs_study_modules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_number       integer UNIQUE NOT NULL,
  title               text NOT NULL,
  description         text,
  week_range          text,
  exam_weight_percent integer,
  key_topics          text[],
  key_formulas        jsonb,
  content_sections    jsonb,
  prerequisite_module integer,
  passing_score       integer DEFAULT 70,
  question_count      integer,
  icon                text,
  xp_reward           integer,
  is_published        boolean DEFAULT true,
  review_status       text DEFAULT 'approved',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
