-- seeds/662_surveyor_roster.sql
--
-- THE STATE'S OWN LIST OF WHO HOLDS EACH LICENCE (2026-09-24)
-- ══════════════════════════════════════════════════════════
--
-- Owner: *"Is there a name associated with the rpls number? Is there a way to look up that number
-- and name and make sure they match. Would this improve the certainty?"*
--
-- Yes, yes, and more than anything else tried so far.
--
-- ── WHAT THE MEASUREMENT SHOWED ─────────────────────────────────────────────────────────────────
--
-- The catalogue reads a surveyor's name and licence number off each plat and rates its own
-- confidence. Checked against the Texas Board of Professional Engineers and Land Surveyors roster,
-- of 145 name+number pairs from the first 198 sheets:
--
--     64 (44%)  the name matched the number exactly
--     71 (49%)  the name did NOT match the number
--      6 ( 4%)  the number is not a licence number at all
--
-- And the part that matters: **65 of the wrong readings were rated "high" confidence**. A model
-- reading a stamped seal can be perfectly confident and perfectly wrong, because it has no way to
-- know that CHARLES C LUCKO is a person and CHARLES C LIGORI is not. Self-reported confidence
-- cannot catch this class of error. An external register can, completely.
--
-- ── IT DOES NOT ONLY FLAG, IT REPAIRS ───────────────────────────────────────────────────────────
--
-- Of 69 disagreements, 59 were cases where the NAME is on the roster under a DIFFERENT number —
-- a single-digit misreading of a stamped seal:
--
--     CHARLES C LUCKO   read 4606 → roster 4636   (15 sheets)
--     GALE E MITCHELL   read 1682 → roster 1602
--     GARY W MITCHELL   read 4983 → roster 4982
--     MICHELLE E LEE    read 5972 → roster 5772
--     SETH H BARTON     read 6678 → roster 6878
--
-- So the roster hands back the correct number. That is a repair, not a warning.
--
-- ── WHY A TABLE AND NOT A LIVE LOOKUP ───────────────────────────────────────────────────────────
--
-- TBPELS publishes the roster as a CSV that is regenerated daily, ~5,400 licences. Fetching it once
-- a day and keeping it locally makes verification a join instead of a network call — which matters
-- when 8,000 documents are being catalogued, and matters more when the network is the thing that
-- fails. `synced_at` records how stale the copy is, because a verification against a roster from
-- last March should not be presented as if it were checked this morning.
--
-- ── CLOSED, EXPIRED AND DECEASED LICENCES ARE KEPT ──────────────────────────────────────────────
--
-- The roster includes statuses like Closed, Expired, Retired and Deceased, and those rows are the
-- valuable ones here: a 1963 plat was sealed by somebody whose licence closed in 1995. Keeping only
-- "Registered" would make the archive's oldest and most interesting sheets unverifiable — exactly
-- the ones where a surveyor's name is hardest to read.

CREATE TABLE IF NOT EXISTS surveyor_roster (
  /** The licence number, digits only, leading zeros stripped — the form the catalogue produces. */
  rpls_number  TEXT PRIMARY KEY,
  status       TEXT,
  last_name    TEXT,
  first_name   TEXT,
  middle_name  TEXT,
  /** Normalised "FIRST LAST" for matching, so every reader does not re-derive it. */
  full_name    TEXT,
  granted_on   DATE,
  expires_on   DATE,
  firm_number  TEXT,
  firm_name    TEXT,
  source       TEXT NOT NULL DEFAULT 'tbpels',
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE surveyor_roster IS
  'The Texas Board of Professional Engineers and Land Surveyors RPLS roster, refreshed from their daily CSV. Ground truth for verifying a surveyor name against a licence number read off a plat. Closed/Expired/Deceased rows are kept deliberately: old plats were sealed by surveyors whose licences have since lapsed.';
COMMENT ON COLUMN surveyor_roster.synced_at IS
  'How fresh this copy is. A verification is only as current as this, and the UI says so rather than implying the State was asked just now.';

-- Verification looks up by number (the common path) and by name (the repair path, where the number
-- was misread and the name is the only handle left).
CREATE INDEX IF NOT EXISTS surveyor_roster_last_name_idx ON surveyor_roster (last_name);
CREATE INDEX IF NOT EXISTS surveyor_roster_full_name_idx ON surveyor_roster (full_name);

-- ── THE VERDICT, STORED ON THE DOCUMENT ─────────────────────────────────────────────────────────
--
-- Kept on `research_documents` beside the catalogue rather than recomputed on every read: the
-- roster changes daily and the catalogue does not, so a stored verdict records what was true when
-- the check ran, and `surveyor_verified_at` says when that was.
ALTER TABLE research_documents
  ADD COLUMN IF NOT EXISTS surveyor_verification    JSONB,
  ADD COLUMN IF NOT EXISTS surveyor_verified_at     TIMESTAMPTZ;

COMMENT ON COLUMN research_documents.surveyor_verification IS
  'Per-surveyor result of checking the catalogued name+licence against surveyor_roster: confirmed, corrected (the roster supplied the right number), unmatched, or not_a_licence. See lib/research/surveyor-verification.ts.';

DO $$
DECLARE n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM surveyor_roster;
  RAISE NOTICE 'surveyor_roster: % licence(s) on file. Run scripts/sync-surveyor-roster.mjs to refresh.', n;
END $$;

-- ── THE THREE-WITNESS VERDICT (2026-09-24) ─────────────────────────────────────────────────────
--
-- Owner: *"check with other documents for the same rpls number and seal and name and compare that
-- to the registry of RPLSs to get more confidence."*
--
-- `surveyor_verification` above records what the REGISTER said. This records what all three
-- witnesses said together — the reading, the rest of the archive, and the register — because the
-- useful fact is usually which of them disagreed rather than a single blended score. See
-- lib/research/surveyor-corroboration.ts.
ALTER TABLE research_documents
  ADD COLUMN IF NOT EXISTS surveyor_certainty JSONB;

COMMENT ON COLUMN research_documents.surveyor_certainty IS
  'Per-surveyor certainty weighing three independent witnesses: the reading''s own confidence, agreement with other sheets bearing the same licence, and the State register. verified | register_only | archive_only | disputed | uncorroborated.';
