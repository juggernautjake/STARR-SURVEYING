-- seeds/461_dnd_discord_webhook.sql — a campaign can post its rolls to Discord (P10-4, plan item).
--
-- One column. The webhook URL is a CREDENTIAL: anyone holding it can post to that channel as the campaign,
-- forever, until it is rotated. So it lives in its own column rather than in the `theme` jsonb, which is
-- selected wholesale by several routes and would have leaked it to every campaign member the moment it was
-- set. A column can be left out of a `select` list; a jsonb key inside a selected blob cannot.
--
-- No index: it is read only by id, alongside the campaign row itself.

ALTER TABLE dnd_campaigns
  ADD COLUMN IF NOT EXISTS discord_webhook_url text;

COMMENT ON COLUMN dnd_campaigns.discord_webhook_url IS
  'Discord webhook for this campaign''s roll feed (P10-4). A CREDENTIAL — DM-only, never returned to '
  'players, redacted from the campaign export, and validated against Discord''s own hosts before use.';
