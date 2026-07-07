-- 412_dnd_nova_skin.sql — assign Nova Vex the bespoke "nova" pixel/CRT sheet skin (§6.9).
-- The demo roster is created by scripts/dnd-seed-demo.ts with fixed UUIDs; this flips
-- her existing row's sheet_type to 'nova' so the pixel "digital being" skin renders
-- without re-seeding. Idempotent + safe: matches by her stable id and no-ops elsewhere.
BEGIN;

UPDATE dnd_characters
   SET sheet_type = 'nova'
 WHERE id = '1a2200aa-0000-4000-8000-0000000000c4'
   AND sheet_type IS DISTINCT FROM 'nova';

SELECT 'nova skin applied to rows: ' || count(*)::text AS status
  FROM dnd_characters
 WHERE id = '1a2200aa-0000-4000-8000-0000000000c4' AND sheet_type = 'nova';

COMMIT;
