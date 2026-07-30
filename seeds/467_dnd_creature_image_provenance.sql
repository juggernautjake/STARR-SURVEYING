-- seeds/467_dnd_creature_image_provenance.sql — an image carries its own licence (B2-3).
--
-- ── WHY THE CREATURE'S ATTRIBUTION IS NOT THE IMAGE'S ────────────────────────────────────────────────
--
-- `dnd_creatures` already has `source` / `licence` / `attribution`, all NOT NULL, and they describe the
-- STAT BLOCK: "SRD 5.1, CC-BY-4.0, Wizards of the Coast". An illustration of that creature is a different
-- work by a different author under a different licence — a wolf photograph on Wikimedia Commons might be
-- CC-BY-SA-4.0 by a named photographer, and a Doré engraving is public domain with no author to credit.
--
-- Reusing the stat block's attribution line for the picture would therefore state something false, and
-- CC-BY's whole requirement is that the credit be accurate. Hence three more columns rather than one.
--
-- ── WHY NOT THE SRD'S OWN IMAGES ─────────────────────────────────────────────────────────────────────
--
-- Worth recording, because it is the obvious shortcut and it is closed. Every one of the 334 SRD creatures
-- imported by B1-3 carries an `image` path, and those files are served. But the SRD **contains no
-- artwork** — the CC-BY-4.0 release covers the rules text. The publishing project states that its CODE is
-- MIT and the UNDERLYING MATERIAL is OGL 1.0a; neither statement covers the PNGs, and the project makes no
-- claim about their provenance at all.
--
-- So their licence cannot be stated, and B2-3's ground rule (inherited from G3) is that content whose
-- licence we cannot state does not get imported. `image_licence` is NOT NULL when `image_url` is set,
-- below, so that rule is enforced by the schema rather than by remembering it.

BEGIN;

ALTER TABLE dnd_creatures ADD COLUMN IF NOT EXISTS image_licence      text;
ALTER TABLE dnd_creatures ADD COLUMN IF NOT EXISTS image_attribution  text;
ALTER TABLE dnd_creatures ADD COLUMN IF NOT EXISTS image_source_url   text;
-- Where the file lives in our own storage. Never a hotlink: an image we do not hold is one that can change
-- or vanish under us, and a bestiary of other people's bandwidth is not a bestiary.
ALTER TABLE dnd_creatures ADD COLUMN IF NOT EXISTS image_storage_path text;

-- THE RULE, IN THE SCHEMA. An image without a licence and a credit cannot be stored, so no future importer
-- can add art "temporarily" and leave the attribution for later.
DO $$ BEGIN
  ALTER TABLE dnd_creatures ADD CONSTRAINT dnd_creatures_image_licensed
    CHECK (
      image_url IS NULL
      OR (length(btrim(coalesce(image_licence, ''))) > 0
          AND length(btrim(coalesce(image_attribution, ''))) > 0)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN dnd_creatures.image_licence IS
  'The licence of the PICTURE, which is a different work from the stat block — "CC-BY-SA-4.0", "PD-old-100". Required whenever image_url is set.';
COMMENT ON COLUMN dnd_creatures.image_attribution IS
  'The exact credit line the image licence requires. Not the stat block''s attribution: a different author, often a different licence.';

COMMIT;
