-- seeds/679_video_transcripts.sql — a video's transcript, every word with its time.
--
-- Owner, 2026-11-09: "I want to transcribe videos and have time stamps for the words … We need to be
-- able to search the transcript for each instance of a word/phrase." The videos are field
-- walk-throughs: building materials, fence types, power poles and how they connect, utilities,
-- improvements, anomalies — said out loud while filming.
--
-- ── ONE ROW PER FILE, KEYED BY THE VIEWER'S FILE ID ─────────────────────────────────────────────
--
-- `file_id` is the id the file viewer knows the file by: a mounted file's `mnt:job-files:<uuid>`,
-- or a file node's uuid. Text, not a foreign key, because those ids span several source tables —
-- the same reason file_comments keys on (subject_type, subject_id). The access check is the file's
-- own, made by the API on every read and write (app/api/admin/files/[id]/transcript).
--
-- `words` is the whole timed transcript as one JSON array of {w, s, e, c} (lib/transcripts/model.ts):
-- it is always read whole, to draw it and search it in the browser, so one column beats a row per
-- word. `transcript` is the plain text beside it, for anything that wants text.
--
-- Additive; safe twice.

create table if not exists public.video_transcripts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  file_id text not null,
  file_name text,
  status text not null default 'processing' check (status in ('processing', 'done', 'failed')),
  provider text not null default 'deepgram',
  model text,
  words jsonb not null default '[]'::jsonb,
  transcript text,
  duration_seconds numeric,
  error text,
  requested_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (org_id, file_id)
);

comment on table public.video_transcripts is
  'Speech-to-text of a video file, every word timed (words: [{w, s, e, c}] in seconds). One row per '
  'file, keyed by the file viewer''s id. Written and read only through /api/admin/files/[id]/transcript, '
  'which applies the file''s own access check.';

-- The server reads and writes with the service role; nobody reaches this table from the browser.
alter table public.video_transcripts enable row level security;
