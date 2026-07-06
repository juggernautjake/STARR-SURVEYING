-- 411_dnd_storage.sql — Supabase Storage buckets for the D&D platform (Phase A9)
-- Public buckets (URLs carry unguessable UUIDs; the whole /dnd area is hidden + auth-gated).
-- Uploads happen via the service role in API routes. Idempotent.
BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('dnd-media', 'dnd-media', true),   -- character art, tokens, maps, handouts, reveals, avatars
  ('dnd-audio', 'dnd-audio', true)    -- soundboard SFX + music
ON CONFLICT (id) DO NOTHING;

SELECT 'dnd storage buckets: ' || string_agg(id, ', ') AS status
FROM storage.buckets WHERE id IN ('dnd-media', 'dnd-audio');

COMMIT;
