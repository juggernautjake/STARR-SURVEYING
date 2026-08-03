-- seeds/571_dnd_campaign_thumbnail.sql — the campaign's own picture, promoted out of the theme jsonb (P14-10).
--
-- Owner, 2026-07-29: *"Please make it so that the dm can add a main image to be the campaign thumbnail …
-- This should show up everywhere the campaign shows up to be opened more or less."*
--
-- ── ONE PICTURE, NOT TWO ─────────────────────────────────────────────────────────────────────────────
--
-- A campaign image ALREADY existed, as `theme.artUrl`, and it rendered in exactly one place: a full-width
-- banner on the player hub. The obvious reading of the request — "add a thumbnail field" — would have
-- given a DM two pictures to set and no way to tell which one a given screen would use. A DM who uploads
-- "the campaign's image" means one thing by it.
--
-- So this PROMOTES the existing value rather than adding a second one. The same image is the hub banner
-- and the card thumbnail; the crop differs per surface (`object-fit: cover`), the source does not.
--
-- ── WHY A COLUMN AND NOT THE JSONB KEY IT ALREADY WAS ────────────────────────────────────────────────
--
-- Because "everywhere" is the requirement. Every listing surface — the public grid, the two "your tables"
-- lists, the DM dashboard, the lobby, the profile panel, invites — loads campaigns through narrow
-- `select('id, name, blurb, …')` lists that deliberately do NOT pull `theme`. Reaching the thumbnail from
-- the jsonb would mean widening each of those selects to fetch a blob that also carries `dmNotes`, which
-- is exactly the leak `461_dnd_discord_webhook.sql` warns about one column over: *"a column can be left
-- out of a select list; a jsonb key inside a selected blob cannot."*
--
-- ── BACKFILL, SO NOBODY LOSES THE PICTURE THEY ALREADY SET ───────────────────────────────────────────
--
-- Idempotent: only fills rows whose column is still null, so re-running never overwrites a newer upload
-- with a stale jsonb value. `theme.artUrl` is deliberately LEFT IN PLACE rather than stripped — a seed
-- that deletes the only copy of a user's data has no undo, and a stale key that nothing reads costs
-- nothing. The application reads the column and falls back to the key only when the column is null, so a
-- campaign written by an older deploy still shows its art.

ALTER TABLE dnd_campaigns
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

UPDATE dnd_campaigns
   SET thumbnail_url = NULLIF(btrim(theme->>'artUrl'), '')
 WHERE thumbnail_url IS NULL
   AND NULLIF(btrim(theme->>'artUrl'), '') IS NOT NULL;

COMMENT ON COLUMN dnd_campaigns.thumbnail_url IS
  'The campaign''s picture (P14-10) — the hub banner AND the thumbnail on every card, row and picker. '
  'Promoted from theme->>''artUrl'' so a DM sets ONE image; that key is left in place as a read fallback '
  'for rows written before this seed. Public: it is shown to anyone who can see the campaign listing.';
