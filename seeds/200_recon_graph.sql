-- ============================================================================
-- 200_recon_graph.sql
-- STARR RECON / Starr Recon — Document Graph Schema
--
-- Adds a property-research graph layer ALONGSIDE the existing relational
-- tables in 090_research_tables.sql. Nothing here drops or alters the
-- relational schema. Backfill from existing extracted_data_points + research_documents
-- happens in a Phase A migration script — not in this file.
--
-- Design notes:
--
-- * Polymorphic nodes. One `recon_nodes` table with a `type` discriminator
--   and a JSONB `attrs` column. Adding a new node type does NOT require a
--   migration — just register it in worker/src/services/graph-schema.ts.
--   This is the right tradeoff for a research graph where new node types
--   show up irregularly (FEMA letter of map revision, GLO patent, etc.).
--
-- * Edges are first-class. Each edge has its own row with confidence,
--   source-document attribution, and JSONB attrs. No edge-property graphs
--   inside-a-property-graph (which Postgres can't represent natively
--   without recursion).
--
-- * No graph database. Postgres + JSONB is sufficient at our scale (we are
--   never doing graph algorithms on millions of nodes). Stays in Supabase.
--
-- See docs/RECON_INVENTORY.md §7 and the schema enumeration in the build
-- plan for the full node/edge catalog and reasoning.
-- ============================================================================

BEGIN;

-- ── Node table ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recon_nodes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Polymorphic type discriminator. Enum-validated below.
    type            TEXT NOT NULL CHECK (type IN (
                        'property',
                        'document',
                        'person',
                        'entity',
                        'address',
                        'subdivision',
                        'lot',
                        'survey',
                        'metes_and_bounds_tract',
                        'gis_feature',
                        'easement',
                        'fact'
                    )),

    -- The research project this node belongs to. Nodes can be shared across
    -- projects (e.g. a Bell County subdivision used by 100 different jobs)
    -- — when shared, project_id is NULL and the node is "global".
    project_id      UUID REFERENCES research_projects(id) ON DELETE CASCADE,

    -- Polymorphic attributes. Schema enforced in code, not DB. See
    -- worker/src/services/graph-schema.ts for the per-type Zod schemas.
    attrs           JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Provenance / dedupe. For Document nodes this is the recording_ref
    -- ('Vol 412 Pg 88' or '2024-12345'); for Property nodes, the parcel_id;
    -- for Person/Entity, the normalized name; for others, NULL. Used by the
    -- node-dedupe partial index below.
    natural_key     TEXT,

    -- For nodes scraped from a county system, the FIPS code so we can scope
    -- queries by county without parsing JSONB. Mirrored from attrs.county_fips.
    county_fips     TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-type indexes.
CREATE INDEX IF NOT EXISTS idx_recon_nodes_type            ON recon_nodes(type);
CREATE INDEX IF NOT EXISTS idx_recon_nodes_project         ON recon_nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_recon_nodes_county          ON recon_nodes(county_fips);
CREATE INDEX IF NOT EXISTS idx_recon_nodes_type_county     ON recon_nodes(type, county_fips);

-- JSONB GIN for arbitrary attribute lookup ("find all properties with
-- attrs.acreage_calc > 5"). Use jsonb_path_ops for smaller, faster index
-- when we only do containment queries.
CREATE INDEX IF NOT EXISTS idx_recon_nodes_attrs_gin
    ON recon_nodes USING gin (attrs jsonb_path_ops);

-- Document dedupe: a recording_ref within a county should appear once.
-- Allow NULL natural_key (Fact nodes etc. don't have one).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_recon_nodes_document_natural
    ON recon_nodes(county_fips, natural_key)
    WHERE type = 'document' AND natural_key IS NOT NULL;

-- Property dedupe by parcel_id within county.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_recon_nodes_property_natural
    ON recon_nodes(county_fips, natural_key)
    WHERE type = 'property' AND natural_key IS NOT NULL;


-- ── Edge table ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recon_edges (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    from_node_id    UUID NOT NULL REFERENCES recon_nodes(id) ON DELETE CASCADE,
    to_node_id      UUID NOT NULL REFERENCES recon_nodes(id) ON DELETE CASCADE,

    -- Edge type discriminator. See per-type semantics in
    -- worker/src/services/graph-schema.ts.
    edge_type       TEXT NOT NULL CHECK (edge_type IN (
                        'located_at',           -- Property → Address
                        'part_of',              -- Lot → Subdivision; M&B → Survey
                        'described_by',         -- Property → Lot or → M&B
                        'adjoins',              -- Property ↔ Property; Property ↔ GISFeature
                        'conveys',              -- Document → Property
                        'grants_from',          -- Document → Person/Entity
                        'grants_to',            -- Document → Person/Entity
                        'surveyed_by',          -- Document → Person
                        'recorded_in',          -- Document → Subdivision
                        'references',           -- Document → Document
                        'amends',               -- Document → Document
                        'supersedes',           -- Document → Document
                        'burdens',              -- Easement → Property (servient)
                        'benefits',             -- Easement → Property (dominant)
                        'established_by',       -- M&B → Document
                        'extracted_from',       -- Fact → Document
                        'owned_by'              -- Property → Person/Entity (temporal)
                    )),

    -- Confidence in this edge being correct (0..1). Drives gate 9.
    confidence      DECIMAL(4,3) NOT NULL DEFAULT 1.000
                    CHECK (confidence >= 0 AND confidence <= 1),

    -- Provenance: which document proved this edge. NULL allowed for derived
    -- edges (e.g. an `adjoins` edge inferred from GIS overlay).
    source_document_id  UUID REFERENCES recon_nodes(id) ON DELETE SET NULL,

    -- Edge-specific attributes:
    --   owned_by:    { from_date, to_date, deed_node_id, ownership_type }
    --   adjoins:     { shared_segment_length_ft, common_call_ids[] }
    --   conveys:     { interest_conveyed: 'fee'|'partial'|'easement_only' }
    --   references:  { reference_text: "see Vol 412 Pg 88", page: 3 }
    --   extracted_from: { page, bbox, extractor: 'anthropic'|'regex'|'manual' }
    attrs           JSONB NOT NULL DEFAULT '{}'::jsonb,

    project_id      UUID REFERENCES research_projects(id) ON DELETE CASCADE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- An edge cannot point to itself (except for `references` self-edges,
    -- which a corrected deed CAN do — we allow with caveat).
    CONSTRAINT recon_edges_no_self_loop CHECK (
        from_node_id <> to_node_id OR edge_type IN ('references')
    )
);

-- Traversal indexes (the workhorses).
CREATE INDEX IF NOT EXISTS idx_recon_edges_from     ON recon_edges(from_node_id, edge_type);
CREATE INDEX IF NOT EXISTS idx_recon_edges_to       ON recon_edges(to_node_id, edge_type);
CREATE INDEX IF NOT EXISTS idx_recon_edges_project  ON recon_edges(project_id);
CREATE INDEX IF NOT EXISTS idx_recon_edges_source   ON recon_edges(source_document_id);
CREATE INDEX IF NOT EXISTS idx_recon_edges_attrs_gin
    ON recon_edges USING gin (attrs jsonb_path_ops);

-- Dedupe non-temporal edges. `owned_by` is excluded because the same
-- property genuinely has multiple ownership intervals over time.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_recon_edges_non_temporal
    ON recon_edges(from_node_id, to_node_id, edge_type)
    WHERE edge_type NOT IN ('owned_by');

-- For `owned_by` we want fast "what was the owner on date X" lookups.
CREATE INDEX IF NOT EXISTS idx_recon_edges_ownership_temporal
    ON recon_edges(from_node_id, ((attrs->>'from_date')::date), ((attrs->>'to_date')::date))
    WHERE edge_type = 'owned_by';


-- ── Touch trigger: bump updated_at automatically ────────────────────────────

CREATE OR REPLACE FUNCTION recon_touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recon_nodes_touch ON recon_nodes;
CREATE TRIGGER trg_recon_nodes_touch
    BEFORE UPDATE ON recon_nodes
    FOR EACH ROW EXECUTE FUNCTION recon_touch_updated_at();

DROP TRIGGER IF EXISTS trg_recon_edges_touch ON recon_edges;
CREATE TRIGGER trg_recon_edges_touch
    BEFORE UPDATE ON recon_edges
    FOR EACH ROW EXECUTE FUNCTION recon_touch_updated_at();


-- ── Helper view: orphan facts ───────────────────────────────────────────────
-- A Fact node is "orphaned" if it has no path Fact → EXTRACTED_FROM → Document
-- → CONVEYS → Property leading back to the project's target Property.
-- Used by the orphan-quarantine gate (gate 5) and the orphan-strip gate
-- (gate 11). The actual graph traversal is in code; this view materializes
-- the simple "Fact has no extracted_from edge at all" case.

CREATE OR REPLACE VIEW recon_orphan_facts AS
SELECT n.*
FROM recon_nodes n
WHERE n.type = 'fact'
  AND NOT EXISTS (
      SELECT 1
      FROM recon_edges e
      WHERE e.from_node_id = n.id
        AND e.edge_type = 'extracted_from'
  );


-- ── Helper view: chain of title for a property ──────────────────────────────
-- Returns the temporal ownership intervals for a given property in date order.
-- Usage from app code:
--   SELECT * FROM recon_chain_of_title('<property-node-uuid>');

CREATE OR REPLACE FUNCTION recon_chain_of_title(p_property_id UUID)
RETURNS TABLE (
    owner_node_id   UUID,
    owner_type      TEXT,
    owner_name      TEXT,
    from_date       DATE,
    to_date         DATE,
    deed_node_id    UUID,
    confidence      DECIMAL
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        e.to_node_id                                    AS owner_node_id,
        owner.type                                      AS owner_type,
        COALESCE(owner.attrs->>'name_normalized',
                 owner.attrs->>'name')                  AS owner_name,
        (e.attrs->>'from_date')::date                   AS from_date,
        NULLIF((e.attrs->>'to_date'), '')::date         AS to_date,
        NULLIF((e.attrs->>'deed_node_id'), '')::uuid    AS deed_node_id,
        e.confidence
    FROM recon_edges e
    JOIN recon_nodes owner ON owner.id = e.to_node_id
    WHERE e.from_node_id = p_property_id
      AND e.edge_type = 'owned_by'
    ORDER BY (e.attrs->>'from_date')::date NULLS FIRST;
$$;


-- ── Helper view: documents that ARE relevant to a property ─────────────────
-- A Document is relevant if it has a CONVEYS edge to the property, OR
-- (transitively) it is REFERENCED_BY a relevant document. We materialize
-- the direct-CONVEYS case here; deeper traversal stays in code.

CREATE OR REPLACE VIEW recon_property_documents AS
SELECT
    e.to_node_id    AS property_id,
    e.from_node_id  AS document_id,
    e.confidence    AS relevance_confidence,
    e.attrs         AS conveyance_attrs
FROM recon_edges e
WHERE e.edge_type = 'conveys';


COMMIT;
