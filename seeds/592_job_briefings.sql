-- seeds/592_job_briefings.sql — slice B1 of
-- docs/planning/in-progress/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
--
-- Owner, 2026-08-14: *"I also want my dad to be able to take screen recordings and talk at the same
-- time so that he can go over everything with the given job and post the video so I can watch it on
-- my own time… Once he has compiled his notes and instructions and stuff, he can post it and make it
-- so that all of the people involved in the job can see it. He will also be able to add more stuff
-- later, like files and pictures and notes/instructions if needed."*
--
-- ── WHY THIS IS NOT JUST ANOTHER ROW IN job_files ────────────────────────────────────────────────
--
-- The obvious shape is "upload the video as a job file and be done". That loses four things the
-- owner asked for in one sentence:
--
--   · the NOTES that go with the video — a file has a description, not a document;
--   · the moment it becomes visible — he assembles it over a morning and posts it when it is ready,
--     which is a draft state, and a file has none;
--   · the "add more stuff later" — a briefing grows after it is published;
--   · one notification for the whole thing rather than one per artefact.
--
-- So a briefing is a POST with a draft state, and its parts point at `job_files`. It never owns
-- bytes. That keeps the file manager the one place a file lives — a briefing is a view over job
-- artefacts, not a second filing cabinet, and a video posted here still appears in the job folder
-- for somebody who never opens the briefing.
--
-- ── DRAFT AND PUBLISHED ARE NOT THE SAME AS EMPTY AND FULL ───────────────────────────────────────
--
-- `published_at IS NULL` is the whole visibility rule: a draft is visible to its author and to nobody
-- else, however much is in it. Storing that as a timestamp rather than a boolean means "when did the
-- crew become responsible for knowing this" is answerable, which is the question that gets asked
-- after somebody drives to the wrong gate.

CREATE TABLE IF NOT EXISTS job_briefings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  org_id         UUID REFERENCES organizations(id) ON DELETE SET NULL,
  author_email   TEXT NOT NULL,
  title          TEXT,
  -- The notes/instructions written alongside the recording. Same `[label](job-file:<id>)` embed
  -- syntax as `jobs.instructions`, so `lib/jobs/instructions.ts` resolves both and there is one
  -- answer to "what does an embedded file link look like".
  body           TEXT,
  state          TEXT NOT NULL DEFAULT 'draft',
  published_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_briefing_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id      UUID NOT NULL REFERENCES job_briefings(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL,
  -- The artefact, when there is one. NOT NULL for every kind except 'note', which is text typed
  -- directly into the briefing and has no file behind it.
  job_file_id      UUID REFERENCES job_files(id) ON DELETE CASCADE,
  note_text        TEXT,
  -- Video only. Duration is stored because reading it back off the file needs the file; a list that
  -- says "8 min" without downloading 120 MB is the difference between a useful index and a wait.
  duration_seconds INTEGER,
  poster_path      TEXT,
  added_by         TEXT NOT NULL,
  added_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  sort_order       INTEGER NOT NULL DEFAULT 0
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_briefings_state_chk') THEN
    ALTER TABLE job_briefings ADD CONSTRAINT job_briefings_state_chk
      CHECK (state IN ('draft', 'published'));
  END IF;

  -- The pair that must agree. A row claiming to be published with no timestamp cannot answer "since
  -- when", and a draft carrying one has been published and then un-published, which this feature
  -- deliberately does not allow: telling twelve people to read something and then withdrawing it
  -- silently is worse than leaving it up with a correction appended.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_briefings_published_chk') THEN
    ALTER TABLE job_briefings ADD CONSTRAINT job_briefings_published_chk
      CHECK ((state = 'published' AND published_at IS NOT NULL)
          OR (state = 'draft'     AND published_at IS NULL));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_briefing_items_kind_chk') THEN
    ALTER TABLE job_briefing_items ADD CONSTRAINT job_briefing_items_kind_chk
      CHECK (kind IN ('video', 'file', 'photo', 'note'));
  END IF;

  -- Every kind except a note is a pointer at a real file. Without this, a 'video' row with no
  -- `job_file_id` is a briefing item that renders as nothing and reads as a bug in the player.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_briefing_items_payload_chk') THEN
    ALTER TABLE job_briefing_items ADD CONSTRAINT job_briefing_items_payload_chk
      CHECK ((kind = 'note' AND note_text IS NOT NULL AND job_file_id IS NULL)
          OR (kind <> 'note' AND job_file_id IS NOT NULL));
  END IF;
END $$;

COMMENT ON TABLE job_briefings IS
  'A post on a job: a screen recording, the notes written alongside it, and any files or photos. '
  'Assembled as a draft and published when the author chooses, at which point everyone on the job '
  'is notified once and can see it. Items point at job_files — a briefing never owns bytes, so a '
  'video posted here is also in the job folder for somebody who never opens the briefing.';
COMMENT ON COLUMN job_briefings.published_at IS
  'When the crew became responsible for knowing this. NULL means draft: visible to its author and '
  'nobody else, however much is in it.';
COMMENT ON COLUMN job_briefing_items.kind IS
  '''video'' | ''file'' | ''photo'' | ''note''. Everything except a note points at a job_files row; '
  'a note is text typed into the briefing itself.';

-- "What is on this job's briefings, newest first" and "what is in this briefing, in order" are the
-- only two reads this feature makes.
CREATE INDEX IF NOT EXISTS idx_job_briefings_job ON job_briefings (job_id, published_at DESC NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_job_briefing_items_briefing ON job_briefing_items (briefing_id, sort_order);
