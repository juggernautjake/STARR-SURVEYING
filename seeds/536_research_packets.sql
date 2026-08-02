-- 536_research_packets.sql — the deliverable, versioned and approved (plan R25).
--
-- Everything the research produces is scattered across tables: facts in `extracted_data_points`,
-- conflicts in `discrepancies`, the gameplan in `research_survey_plans`, documents and their markup
-- in `research_documents` / `document_annotations`. There is no object that says "these, in this
-- order, are what we are handing the crew" — so what the crew received was whatever the screens
-- happened to show on the day, and nobody could reproduce it afterwards.
--
-- ── CONTENTS ARE REFERENCES, NOT COPIES ─────────────────────────────────────────────────────────
--
-- `contents` stores ids and ordering, not duplicated fact text. A packet that copied its facts would
-- silently disagree with the corrected values the moment somebody fixed one (R23), and the packet is
-- the thing a surveyor stakes a boundary from. `rendered_json` is the snapshot taken AT APPROVAL —
-- that one is a copy on purpose, because what was approved must stay what was approved.
--
-- ── APPROVAL IS A SIGNATURE, NOT A FLAG ─────────────────────────────────────────────────────────
--
-- `approved_by` and `approved_at` are set together and never cleared by an edit: editing an approved
-- packet creates the NEXT version. A mutable "approved" boolean on an editable row means somebody
-- can approve a packet and then change what they approved.

CREATE TABLE IF NOT EXISTS research_packets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,

    version             INTEGER NOT NULL,
    title               TEXT NOT NULL,
    -- Free text from the surveyor, printed on the cover page.
    cover_notes         TEXT,

    -- [{ kind, refId, order, note }] — kind ∈ fact | document | conflict | plan | drawing | imagery.
    contents            JSONB NOT NULL DEFAULT '[]',

    status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'approved', 'superseded')),

    -- Snapshot as approved. Null while draft: an unapproved packet has no frozen form, and writing
    -- one would imply a version of the truth nobody signed.
    rendered_json       JSONB,
    pdf_path            TEXT,

    created_by          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_by         TEXT,
    approved_at         TIMESTAMPTZ
);

-- Approval is all-or-nothing: a row cannot claim approved status without a name and a time on it.
ALTER TABLE research_packets DROP CONSTRAINT IF EXISTS research_packets_approval_complete;
ALTER TABLE research_packets
  ADD CONSTRAINT research_packets_approval_complete
  CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND rendered_json IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS idx_packets_version
    ON research_packets (research_project_id, version);

CREATE INDEX IF NOT EXISTS idx_packets_project
    ON research_packets (research_project_id, version DESC);

-- "What is the current approved packet for this job" — the question the job page asks.
CREATE INDEX IF NOT EXISTS idx_packets_approved
    ON research_packets (research_project_id, approved_at DESC)
    WHERE status = 'approved';
