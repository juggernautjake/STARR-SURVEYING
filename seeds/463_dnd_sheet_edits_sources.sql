-- seeds/463_dnd_sheet_edits_sources.sql — let the audit trail record who really changed a sheet.
--
-- FOUND BY EXERCISING THE GRANT PATH, not by reading it. A library grant to a 5e character returned
-- `{ ok: true, batchId }`, and `dnd_sheet_edits` contained **zero rows** for that batch — so the change
-- landed on the sheet with no audit trail, and `revert-batch` answered "That change was not found".
--
-- THE CAUSE. `dnd_sheet_edits_source_chk` allowed only `'ai' | 'manual' | 'revert'`. It predates the
-- library-grant feature (P6-14/G-…), which inserts `source: 'library-grant'` — deliberately, so a grant
-- is distinguishable from a hand edit in the review queue. Postgres rejected every one of those rows,
-- and the insert is fire-and-forget (`.then(() => {}, () => {})`), so nothing ever surfaced.
--
-- WHY WIDEN THE CONSTRAINT RATHER THAN CHANGE THE CODE. The code is right and the constraint is stale.
-- Rewriting the route to say `'manual'` would make a grant indistinguishable from an edit the character's
-- own player made by hand — and this is the one path where SOMEONE ELSE (a DM) reaches into a player's
-- sheet. That distinction is exactly what an audit trail is for; erasing it to satisfy a CHECK would be
-- fixing the symptom by deleting the evidence.
--
-- `ig-edit` is included for the same reason, ahead of need: the IG branch of `grant-content` deliberately
-- writes NO audit row today, because those rows are SheetEdit-shaped and replaying a 5e op against the IG
-- sidecar would corrupt the sheet. When IG history is built (a known gap) it will need a source value of
-- its own, and adding it now costs nothing.
--
-- The values stay a CHECK rather than becoming free text: an audit `source` nobody constrains is one that
-- accumulates typos, and a typo'd source is a row the review queue silently never shows.
BEGIN;

ALTER TABLE dnd_sheet_edits
  DROP CONSTRAINT IF EXISTS dnd_sheet_edits_source_chk;

ALTER TABLE dnd_sheet_edits
  ADD CONSTRAINT dnd_sheet_edits_source_chk
  CHECK (source IS NULL OR source = ANY (ARRAY['ai', 'manual', 'revert', 'library-grant', 'ig-edit']));

COMMENT ON COLUMN dnd_sheet_edits.source IS
  'How the change was made: ai / manual / revert / library-grant / ig-edit. Constrained, not free text — an unconstrained source accumulates typos, and a typo''d source is a row the review queue silently never shows. `library-grant` was rejected by the previous CHECK, so every DM grant to a 5e sheet went unaudited.';

COMMIT;
