-- seeds/413_dnd_directed_invites.sql — directed invites + in-app notifications (Phase P).
--
-- Extends the existing link-based invite model (seeds/410) so a DM can invite a specific
-- signed-in user by name. A directed invite carries `invited_user_id` and a `status`; the
-- invitee sees it as a notification on the /dnd hub and can accept (→ becomes a campaign
-- member) or decline. Link invites (invited_user_id NULL) keep working exactly as before.
-- Idempotent: safe to re-run.

ALTER TABLE dnd_invites
  ADD COLUMN IF NOT EXISTS invited_user_id uuid REFERENCES dnd_users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','revoked'));

-- Fast lookup of a user's pending notifications.
CREATE INDEX IF NOT EXISTS idx_dnd_invites_invited_user ON dnd_invites (invited_user_id, status);
