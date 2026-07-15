-- seeds/442_dnd_system_variants.sql — per-character multi-system variants (Phase V, Slice 13).
-- A character can be built in several game systems at once (e.g. a D&D 5e-2024 build AND a
-- transposed 5e-2014 build). `system` (added in 422) is the ACTIVE system; `system_variants`
-- stores the OTHER systems' sheets keyed by system key:
--   { "<systemKey>": { data, sheet_type, custom_layout, custom_css } }
-- Switching the active system swaps the character's live columns with the chosen variant (and
-- snapshots the current active one back into the map first), so each system's sheet persists
-- independently. Transposing generates a new variant on demand, grounded in the target system.
-- Idempotent.
ALTER TABLE dnd_characters ADD COLUMN IF NOT EXISTS system_variants jsonb NOT NULL DEFAULT '{}'::jsonb;
