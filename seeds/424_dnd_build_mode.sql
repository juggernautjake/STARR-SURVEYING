-- seeds/424_dnd_build_mode.sql — the AI creation mode chosen for a character (Phase V, Slice 4):
-- 'ruthless' (build it all, no questions), 'questioning' (build the obvious, ask on gaps), or
-- 'stepbystep' (user defines every field, guided). Nullable-safe default. Idempotent.
ALTER TABLE dnd_characters ADD COLUMN IF NOT EXISTS build_mode text NOT NULL DEFAULT 'questioning';
