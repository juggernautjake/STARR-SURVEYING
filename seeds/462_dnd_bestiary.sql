-- seeds/462_dnd_bestiary.sql — the bestiary gets its tables (P13-2).
--
-- WHAT THIS UNBLOCKS. P13-1 finished the creature model: `lib/dnd/homebrew/statblock.ts` now carries
-- senses, languages, CR, resistances, immunities, condition immunities, spellcasting and a tagged
-- traits/actions/reactions/legendary/lair list, on top of P6-13's numeric core. Every later bestiary
-- slice — the SRD imports, the taxonomy, the interactive stat block, variants, forking, transposition,
-- adding a creature to a session — reads rows that do not exist yet. These are those rows.
--
-- ── WHY TWO TABLES AND NOT ONE, AND WHY NEITHER IS `dnd_homebrew` ────────────────────────────────────
--
-- `dnd_creatures` is the CATALOGUE: imported, immutable, owned by nobody, carrying a licence and an
-- attribution line. `dnd_homebrew` is authored content owned by a user, with a draft→approved lifecycle
-- and a visibility choice. They look similar and behave nothing alike: a catalogued creature has no
-- owner to scope it to, no lifecycle to advance, and a legal obligation (`licence` + `attribution`) that
-- authored content does not carry. Bolting 320 SRD rows into `dnd_homebrew` would make `owner_user_id`
-- nullable — the column every visibility rule in `policy.ts` keys off — to serve rows that are always
-- public. The fork path below is how the two connect, and it is deliberately one-directional.
--
-- ── THE FORK PATH: catalogue → your content ─────────────────────────────────────────────────────────
--
-- "Modify a version and it becomes their own personal version" (the brief) is NOT a mutation of a
-- catalogued row and NOT a third table. Forking writes a normal `dnd_homebrew` piece of kind `creature`,
-- with `payload` = the statblock and `forked_from` naming its ancestor. So a forked creature is editable,
-- shareable, public/private and adoptable by every mechanism the Studio already has, for free — and the
-- catalogue stays immutable, which is what lets an import be re-run without clobbering someone's work.
--
-- ── VARIANTS: A SEPARATE TABLE, AND ONLY FOR CREATURES THAT EARN ONE ────────────────────────────────
--
-- The brief is explicit that versioning is selective: *"a woodland rabbit would likely not need multiple
-- variant stat blocks … but for a lion or vampire, we might have multiple versions."* So variants are
-- rows, not columns: a creature with no variants has none, and `dnd_creatures.variant_eligible` records
-- the judgement (P13-9 derives it; this stores it) rather than every creature carrying three near-empty
-- statblock columns.
--
-- `tier` is the axis: 'weak' | 'base' | 'elite'. 'base' exists as a row only when a variant DIFFERS from
-- the parent statblock — normally the parent IS the base, and inventing a duplicate row for it would give
-- two places to fix one typo.
BEGIN;

CREATE TABLE IF NOT EXISTS dnd_creatures (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable across re-imports: 'srd51:adult-red-dragon'. An import UPSERTS on this, so re-running a
  -- corrected import fixes rows instead of duplicating the bestiary.
  slug              text NOT NULL,
  name              text NOT NULL,
  system            text NOT NULL,
  -- The creature's own taxonomy, as its source prints it. `type` is 'dragon' / 'undead' / 'beast';
  -- `size` is 'Medium'. Both free text: PF2 and 5e do not share a creature-type list, and normalising
  -- them into one enum would make every row slightly wrong in one system or the other.
  type              text,
  size              text,
  alignment         text,
  -- As written — '1/4', '13', '-1'. A string for the reason P13-1 gives: 5e CR is fractional below 1 and
  -- PF2 level is not the same scale, so no numeric column is honest for both.
  cr                text,
  -- Sortable companion to `cr`, written by the importer. Nullable, because a creature whose rating cannot
  -- be parsed should sort last rather than claim a rank it does not have.
  cr_sort           numeric,
  -- The P13-1 `Statblock`, whole. One JSONB rather than forty columns: the shape is per-system, already
  -- versioned in code, and every reader goes through `normalizeStatblock` anyway.
  statblock         jsonb NOT NULL DEFAULT '{}'::jsonb,
  description       text,
  image_url         text,
  -- P13-6's derived categories — 'woodland', 'abyssal', 'sea', 'boss', 'companion'. An array so one
  -- creature can be several, which most interesting ones are.
  tags              text[] NOT NULL DEFAULT '{}',
  environments      text[] NOT NULL DEFAULT '{}',
  -- LEGAL, NOT DECORATIVE. Every catalogued creature comes from a licensed source and the licence
  -- REQUIRES the attribution travel with it. NOT NULL on both, so an import cannot quietly omit them —
  -- there is no valid catalogued row without a provenance.
  source            text NOT NULL,
  licence           text NOT NULL,
  attribution       text NOT NULL,
  source_url        text,
  -- P13-9's judgement, stored rather than recomputed at read time so the library can filter on it.
  -- FALSE is the honest default: most creatures do not need three versions.
  variant_eligible  boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dnd_creatures_slug_system_unique UNIQUE (slug, system),
  CONSTRAINT dnd_creatures_name_present CHECK (length(btrim(name)) > 0),
  CONSTRAINT dnd_creatures_attribution_present CHECK (length(btrim(attribution)) > 0)
);

CREATE TABLE IF NOT EXISTS dnd_creature_variants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creature_id       uuid NOT NULL REFERENCES dnd_creatures(id) ON DELETE CASCADE,
  tier              text NOT NULL,
  -- What this version is called at the table — 'Weakened Owlbear', 'Ancient Vampire Lord'.
  name              text NOT NULL,
  cr                text,
  cr_sort           numeric,
  statblock         jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- HOW it was derived, in words: 'PF2 Weak adjustment' or the house formula's name. Stored per row
  -- because the brief asks for variants to be *stated and testable*, and a number nobody can trace back
  -- to a rule is exactly the "invented mechanic" Ground Rule 3 forbids.
  derivation        text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dnd_creature_variants_tier CHECK (tier IN ('weak', 'base', 'elite')),
  CONSTRAINT dnd_creature_variants_unique UNIQUE (creature_id, tier)
);

ALTER TABLE dnd_creatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE dnd_creature_variants ENABLE ROW LEVEL SECURITY;

-- Browse a system's bestiary, the library's default view: newest-irrelevant, so ordered by the rating a
-- DM actually picks on.
CREATE INDEX IF NOT EXISTS idx_dnd_creatures_browse
  ON dnd_creatures (system, cr_sort NULLS LAST, name);

-- Tag and environment filters — the brief's "bosses, woodland creatures, sea creatures, birds…". GIN,
-- because these are array-containment queries, which btree cannot serve.
CREATE INDEX IF NOT EXISTS idx_dnd_creatures_tags ON dnd_creatures USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_dnd_creatures_environments ON dnd_creatures USING GIN (environments);

-- Name search. `lower(name)` so a case-insensitive prefix match uses the index instead of scanning 320
-- rows per keystroke.
CREATE INDEX IF NOT EXISTS idx_dnd_creatures_name ON dnd_creatures (system, lower(name));

-- A creature's versions, for the browse-the-variants view.
CREATE INDEX IF NOT EXISTS idx_dnd_creature_variants_creature
  ON dnd_creature_variants (creature_id, tier);

-- The fork link, on the table that already holds authored content. A creature you forked from the
-- catalogue is an ordinary `dnd_homebrew` row that remembers where it came from — the whole reason the
-- fork path needs no third table. Nullable and unconstrained by FK on purpose: a fork must survive its
-- ancestor being removed from the catalogue, keeping its provenance TEXT even when the row is gone.
ALTER TABLE dnd_homebrew ADD COLUMN IF NOT EXISTS forked_from uuid;
ALTER TABLE dnd_homebrew ADD COLUMN IF NOT EXISTS forked_from_label text;
CREATE INDEX IF NOT EXISTS idx_dnd_homebrew_forked_from
  ON dnd_homebrew (forked_from)
  WHERE forked_from IS NOT NULL;

COMMENT ON TABLE dnd_creatures IS
  'The CATALOGUE: imported, immutable, owned by nobody, licensed. Distinct from dnd_homebrew (authored, owned, with a lifecycle) because a catalogued creature has no owner to scope it to and carries a legal attribution that authored content does not. Forking writes a dnd_homebrew row instead of mutating one of these.';
COMMENT ON COLUMN dnd_creatures.slug IS
  'Stable across re-imports (''srd51:adult-red-dragon''). Imports UPSERT on (slug, system), so a corrected re-run fixes rows rather than duplicating the bestiary.';
COMMENT ON COLUMN dnd_creatures.cr IS
  'As written — ''1/4'', ''13'', ''-1''. A string because 5e CR is fractional below 1 and PF2 level is a different scale; cr_sort carries the sortable companion, NULL when it cannot be parsed honestly.';
COMMENT ON COLUMN dnd_creatures.attribution IS
  'Required by the source licence and NOT NULL for that reason: there is no valid catalogued row without a provenance an import could quietly omit.';
COMMENT ON COLUMN dnd_creatures.variant_eligible IS
  'Whether this creature earns weak/elite versions. The brief is explicit that versioning is selective — a rabbit does not need three stat blocks, a vampire does. Defaults FALSE, the honest majority.';
COMMENT ON COLUMN dnd_creature_variants.derivation IS
  'How the numbers were reached, in words — ''PF2 Weak adjustment'', or our house formula''s name. The brief asks for variants to be stated and testable; a number nobody can trace to a rule is an invented mechanic.';
COMMENT ON COLUMN dnd_homebrew.forked_from IS
  'The catalogued creature this piece was forked from. Deliberately NOT a foreign key: a fork must outlive its ancestor leaving the catalogue, keeping forked_from_label as readable provenance when the row is gone.';

COMMIT;
