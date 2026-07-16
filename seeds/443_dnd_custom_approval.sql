-- seeds/443_dnd_custom_approval.sql — custom/vanilla provenance + DM approval workflow
-- (Phase V, Intuitive Games builder Slice 3).
--
-- Characters gain a submission/approval lifecycle and a flagged custom-content inventory:
--   submission_status : draft | submitted | approved | rejected  (default draft)
--   dm_review_notes   : the DM's approve/reject notes (shown to the player on rejection)
--   custom_content    : the provenance inventory computed at submit time — a JSON list of
--                       { kind, name, source, grantedBy?, mechanics? } so the DM sees exactly
--                       what is custom vs vanilla vs dm-granted
--   dm_granted        : DM-authored custom elements granted to this character (always allowed,
--                       even in vanilla-only campaigns) — { kind, name, mechanics, grantedBy }
-- Campaigns gain a custom-content policy:
--   allow_custom      : when false the campaign is VANILLA-ONLY — a character with any non-DM-granted
--                       custom content cannot be submitted to it (default true, backward compatible)
-- Idempotent.
ALTER TABLE dnd_characters ADD COLUMN IF NOT EXISTS submission_status text NOT NULL DEFAULT 'draft';
ALTER TABLE dnd_characters ADD COLUMN IF NOT EXISTS dm_review_notes text;
ALTER TABLE dnd_characters ADD COLUMN IF NOT EXISTS custom_content jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE dnd_characters ADD COLUMN IF NOT EXISTS dm_granted jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE dnd_characters ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE dnd_characters ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE dnd_campaigns ADD COLUMN IF NOT EXISTS allow_custom boolean NOT NULL DEFAULT true;
