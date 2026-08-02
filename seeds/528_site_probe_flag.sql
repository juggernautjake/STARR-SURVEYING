-- seeds/528_site_probe_flag.sql — the switch for §8.3's site probe.
--
-- The research roadmap's §9.9 guardrails say every outward-facing capability in this subsystem ships
-- off and is turned on deliberately. The probe opens a county's website in a real browser, so it is
-- exactly that kind of capability — and it lives on the same singleton the scheduled sweep and the
-- auto-apply already use, rather than in a new table or an env var:
--
--   * an env var cannot be turned off without a deploy, which is the wrong shape for "stop touching
--     that county's site right now";
--   * a second settings table would give this subsystem two places to look for "are we allowed to".
--
-- Idempotent.

ALTER TABLE research_self_heal_settings
  ADD COLUMN IF NOT EXISTS site_probe_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN research_self_heal_settings.site_probe_enabled IS
  'Whether §8.3''s site probe may open an unregistered county portal in a headless browser. OFF by '
  'default per §9.9. The probe loads ONE page and never submits the search form, so enabling it does '
  'not put queries into a county''s system — but it is still a request to somebody else''s server '
  'made on our behalf, which is a decision rather than a default.';
