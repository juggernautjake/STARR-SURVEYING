-- 412_dnd_streamer_skin.sql — point the demo streamer character (id c4) at the
-- bespoke "streamer" pixel/CRT sheet skin and its handle, xxRainbowKittenUwU37xx (§6.9).
-- The demo roster is created by scripts/dnd-seed-demo.ts with fixed UUIDs; this flips
-- an existing row's name + sheet_type so the skin renders without a re-seed.
-- Idempotent + safe: matches by her stable id and no-ops elsewhere.
BEGIN;

UPDATE dnd_characters
   SET sheet_type = 'streamer',
       name = 'xxRainbowKittenUwU37xx'
 WHERE id = '1a2200aa-0000-4000-8000-0000000000c4'
   AND (sheet_type IS DISTINCT FROM 'streamer' OR name IS DISTINCT FROM 'xxRainbowKittenUwU37xx');

SELECT 'streamer skin applied to rows: ' || count(*)::text AS status
  FROM dnd_characters
 WHERE id = '1a2200aa-0000-4000-8000-0000000000c4' AND sheet_type = 'streamer';

COMMIT;
