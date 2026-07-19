-- seeds/452_job_instructions.sql — the Work Mode JOB INSTRUCTIONS text (owner 2026-07-18: "a page where the
-- RPLS can clearly list out all of the instructions for the job … hyperlink files/documents/images in the
-- instructions"). Plain text with markdown-flavoured [label](job-file:<id>) embeds parsed by
-- lib/jobs/instructions.ts (no new store — the embeds reference existing job_files/field_media ids).
-- Idempotent.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS instructions TEXT;
COMMENT ON COLUMN jobs.instructions IS
  'RPLS-authored job instructions (plain text with [label](job-file:<id>) / ![alt](job-file:<id>) embeds). Parsed by lib/jobs/instructions.ts.';
