-- seeds/425_dnd_build_questions.sql — open design questions the AI builder needs the user to resolve
-- (Phase V, Slice 5): gaps, ambiguities, or conflicting uploads. A JSON array of question strings,
-- surfaced on the character's build panel; cleared once answered + re-ingested. Idempotent.
ALTER TABLE dnd_characters ADD COLUMN IF NOT EXISTS build_questions jsonb NOT NULL DEFAULT '[]'::jsonb;
