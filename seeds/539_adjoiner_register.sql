-- 539_adjoiner_register.sql — the neighbours, as rows somebody can read (plan R31).
--
-- `AdjacentResearchOrchestrator` already runs inside the pipeline and writes a cross-validation
-- report to `/tmp/analysis/<project>/cross_validation_report.json`. That file is wiped with the
-- container, is invisible to the app, and is one blob rather than a row per neighbour — so a
-- reviewer cannot list the neighbours, cannot see which have recent surveys on file, and cannot ask
-- for one of them to be researched properly.
--
-- ── HOW A NEIGHBOUR WAS IDENTIFIED IS PART OF THE FACT ──────────────────────────────────────────
--
-- A neighbour named in a deed call, one found by polygon adjacency in GIS, and one taken from a plat
-- lot are three different claims with three different failure modes. A deed call names who the
-- adjoiner was ON THE DAY THE DEED WAS WRITTEN — often decades ago, and often no longer the owner.
-- GIS adjacency is current but only as good as the county's parcel polygons, which are drafting
-- aids rather than survey products. Flattening the three into "adjoiner" loses the reason to trust
-- or distrust each one.
--
-- ── SURVEY RECENCY IS THE FIELD THE OWNER ASKED FOR ─────────────────────────────────────────────
--
-- A neighbour with a 2023 survey on file is worth more than five with nothing, because a recent
-- survey is a professional's measured opinion of a line this property shares. NULL means "we do not
-- know", never "none" — the two are different answers and only one of them is a finding.

CREATE TABLE IF NOT EXISTS research_adjoiners (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,

    -- Identity. `parcel_id` is the county's account number where we have it; without one a neighbour
    -- is still worth recording, because a name from a deed call is how you find the parcel later.
    parcel_id           TEXT,
    owner_name          TEXT,
    situs_address       TEXT,
    legal_description   TEXT,
    acreage             NUMERIC(12,4),

    -- deed_call | gis_adjacency | plat_lot | manual — see the header: three different claims.
    identified_by       TEXT NOT NULL DEFAULT 'gis_adjacency'
                        CHECK (identified_by IN ('deed_call', 'gis_adjacency', 'plat_lot', 'manual')),
    -- Which side/line it adjoins, when known ("north line", "Lot 6").
    adjoins_where       TEXT,
    -- 0-1. How sure we are this IS a neighbour, not how sure we are of its details.
    match_confidence    NUMERIC(4,3),

    -- What the shallow pass found. Counts rather than joins: the documents live in
    -- research_documents against the neighbour's own project once one exists, and before that they
    -- are only pages we looked at.
    documents_found     INTEGER NOT NULL DEFAULT 0,
    -- The owner's key field. NULL means unknown, NOT "never surveyed".
    last_survey_date    DATE,
    last_survey_source  TEXT,
    -- Anything worth showing in a one-line description.
    notes               TEXT,

    -- ── Deepening (R33) ─────────────────────────────────────────────────────────────────────────
    -- 'shallow' is what the initial run does. A reviewer opts into 'requested', which queues a full
    -- run; the request and the resulting project are recorded so the subject's page can show where
    -- it got to.
    depth               TEXT NOT NULL DEFAULT 'shallow'
                        CHECK (depth IN ('shallow', 'requested', 'researched', 'declined')),
    deep_request_id     UUID REFERENCES research_requests(id) ON DELETE SET NULL,
    deep_project_id     UUID REFERENCES research_projects(id) ON DELETE SET NULL,
    requested_by        TEXT,
    requested_at        TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per neighbour per project. COALESCE because a neighbour found only by name has no parcel
-- id, and two nameless GIS neighbours are not the same neighbour.
CREATE UNIQUE INDEX IF NOT EXISTS idx_adjoiners_unique
    ON research_adjoiners (research_project_id, COALESCE(parcel_id, ''), COALESCE(owner_name, ''), identified_by);

CREATE INDEX IF NOT EXISTS idx_adjoiners_project ON research_adjoiners (research_project_id);

-- "Which neighbours have a recent survey on file" — the question the owner asked for, so it gets an
-- index rather than a sort over everything.
CREATE INDEX IF NOT EXISTS idx_adjoiners_survey
    ON research_adjoiners (research_project_id, last_survey_date DESC NULLS LAST);

-- The ones a reviewer asked to go deeper on.
CREATE INDEX IF NOT EXISTS idx_adjoiners_deep
    ON research_adjoiners (research_project_id)
    WHERE depth IN ('requested', 'researched');
