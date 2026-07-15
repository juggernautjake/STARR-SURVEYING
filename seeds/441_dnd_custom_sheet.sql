-- seeds/441_dnd_custom_sheet.sql — AI-built custom character sheet (Phase V, Slice 6).
-- The AI composes a character page from reusable building blocks and (optionally) authors
-- extra CSS; both are stored per character and rendered by the sheet engine inside a
-- locked-down sandboxed iframe (see lib/dnd/custom-sheet.ts). `custom_layout` is a JSON
-- object `{ title?, blocks: [...] }`; `custom_css` is a plain CSS string. When
-- `sheet_type = 'custom'` and `custom_layout` has blocks, the sheet renders from these
-- instead of the module engine. Idempotent.
ALTER TABLE dnd_characters ADD COLUMN IF NOT EXISTS custom_layout jsonb NOT NULL DEFAULT '{"blocks":[]}'::jsonb;
ALTER TABLE dnd_characters ADD COLUMN IF NOT EXISTS custom_css text NOT NULL DEFAULT '';
