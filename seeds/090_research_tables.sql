-- ============================================================================
-- 090_research_tables.sql
-- AI Property Research & Plat Drawing Renderer — Database Schema
--
-- Creates all tables needed for the property research feature:
--   1. analysis_templates    — saved analysis configurations
--   2. drawing_templates     — saved drawing format configurations
--   3. research_projects     — top-level research sessions
--   4. research_documents    — uploaded/discovered documents
--   5. extracted_data_points — atomic data extracted by AI
--   6. discrepancies         — issues found during analysis
--   7. rendered_drawings     — generated plat drawings
--   8. drawing_elements      — individual elements in a drawing
--
-- Depends on: registered_users table (from existing schema)
-- Usage:  Run via Supabase SQL Editor or psql
-- ============================================================================

BEGIN;

-- ── 1. analysis_templates ────────────────────────────────────────────────────
-- Saved configurations for what data to extract and how to display it.

CREATE TABLE IF NOT EXISTS analysis_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by      TEXT NOT NULL,                  -- email from registered_users
    name            TEXT NOT NULL,
    description     TEXT,
    is_default      BOOLEAN DEFAULT false,
    is_system       BOOLEAN DEFAULT false,

    -- What to extract (filter checkboxes)
    extract_config  JSONB NOT NULL DEFAULT '{
        "bearings_distances": true,
        "monuments": true,
        "curve_data": true,
        "point_of_beginning": true,
        "easements": true,
        "setbacks": true,
        "right_of_way": true,
        "adjoiners": true,
        "area_calculations": true,
        "recording_references": true,
        "surveyor_info": true,
        "legal_description": true,
        "lot_block_subdivision": true,
        "coordinates": false,
        "elevations": false,
        "zoning": false,
        "flood_zone": false,
        "utilities": false
    }',

    -- How to display results
    display_config  JSONB NOT NULL DEFAULT '{
        "group_by": "category",
        "sort_order": "sequence",
        "show_confidence": true,
        "show_source_attribution": true,
        "highlight_discrepancies": true,
        "collapse_low_confidence": false
    }',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── 2. drawing_templates ─────────────────────────────────────────────────────
-- Saved drawing format configurations (paper size, colors, styles).

CREATE TABLE IF NOT EXISTS drawing_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by      TEXT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    is_default      BOOLEAN DEFAULT false,
    is_system       BOOLEAN DEFAULT false,

    -- Paper and canvas settings
    paper_config    JSONB NOT NULL DEFAULT '{
        "size": "24x36",
        "orientation": "landscape",
        "units": "feet",
        "scale": "1:100",
        "margin": { "top": 1, "right": 1, "bottom": 1.5, "left": 1 }
    }',

    -- Feature class color/style mapping for Feature Classification view
    feature_styles  JSONB NOT NULL DEFAULT '{
        "property_boundary": { "stroke": "#000000", "strokeWidth": 2, "dasharray": "" },
        "easement":          { "stroke": "#CC0000", "strokeWidth": 1.5, "dasharray": "10,5" },
        "setback":           { "stroke": "#0066CC", "strokeWidth": 1, "dasharray": "5,5" },
        "right_of_way":      { "stroke": "#666666", "strokeWidth": 1.5, "dasharray": "15,5,5,5" },
        "road":              { "stroke": "#8B4513", "strokeWidth": 2, "fill": "#F5DEB3" },
        "building":          { "stroke": "#333333", "strokeWidth": 1.5, "fill": "#B0C4DE" },
        "fence":             { "stroke": "#228B22", "strokeWidth": 1, "dasharray": "4,4" },
        "utility":           { "stroke": "#FF8C00", "strokeWidth": 1, "dasharray": "8,3,2,3" },
        "water_feature":     { "stroke": "#0077BE", "strokeWidth": 1, "fill": "#B0E0E6" },
        "tree_line":         { "stroke": "#006400", "strokeWidth": 1, "dasharray": "2,4" },
        "contour":           { "stroke": "#8B6914", "strokeWidth": 0.5, "dasharray": "" },
        "lot_line":          { "stroke": "#444444", "strokeWidth": 1, "dasharray": "6,3" },
        "centerline":        { "stroke": "#666666", "strokeWidth": 1, "dasharray": "15,5,5,5" },
        "monument":          { "stroke": "#CC0000", "strokeWidth": 1.5, "fill": "#CC0000" },
        "control_point":     { "stroke": "#0000CC", "strokeWidth": 1.5, "fill": "#0000CC" },
        "annotation":        { "stroke": "#000000", "strokeWidth": 0.5, "fontSize": 10 },
        "title_block":       { "stroke": "#000000", "strokeWidth": 1 },
        "other":             { "stroke": "#999999", "strokeWidth": 1 }
    }',

    -- Label configuration
    label_config    JSONB NOT NULL DEFAULT '{
        "show_bearings": true,
        "show_distances": true,
        "show_monuments": true,
        "show_lot_labels": true,
        "bearing_precision": 0,
        "distance_precision": 2,
        "font_family": "Arial",
        "font_size": 8
    }',

    -- Title block layout
    title_block     JSONB DEFAULT '{
        "show": true,
        "position": "bottom_right",
        "fields": ["project_name", "address", "county", "state", "date", "scale", "surveyor", "sheet"]
    }',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── 3. research_projects ─────────────────────────────────────────────────────
-- Top-level container for a property research session.

CREATE TABLE IF NOT EXISTS research_projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by      TEXT NOT NULL,                  -- email from registered_users
    job_id          UUID,                           -- optional link to a jobs record
    name            TEXT NOT NULL,
    description     TEXT,
    property_address TEXT,
    county          TEXT,
    state           TEXT DEFAULT 'TX',
    parcel_id       TEXT,                           -- county appraisal district parcel ID
    legal_description_summary TEXT,                 -- one-liner for quick reference

    -- Workflow state
    status          TEXT NOT NULL DEFAULT 'upload'
                    CHECK (status IN ('upload','configure','analyzing','review','drawing','verifying','complete')),

    -- AI analysis configuration (set during configure step)
    analysis_template_id UUID REFERENCES analysis_templates(id),
    analysis_filters JSONB DEFAULT '{}',            -- checkbox selections for what to extract

    -- Analysis metadata (for reproducibility)
    analysis_metadata JSONB DEFAULT '{}',           -- prompt versions, model used, etc.

    -- Metadata
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    archived_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_research_projects_created_by ON research_projects(created_by);
CREATE INDEX IF NOT EXISTS idx_research_projects_status ON research_projects(status);
CREATE INDEX IF NOT EXISTS idx_research_projects_job ON research_projects(job_id);


-- ── 4. research_documents ────────────────────────────────────────────────────
-- Every file uploaded or discovered during research.

CREATE TABLE IF NOT EXISTS research_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,

    -- Source info
    source_type     TEXT NOT NULL CHECK (source_type IN (
                        'user_upload',
                        'property_search',
                        'linked_reference',
                        'manual_entry'
                    )),
    original_filename TEXT,
    file_type       TEXT,                           -- pdf, png, jpg, tiff, docx, txt
    file_size_bytes BIGINT,
    storage_path    TEXT,                           -- Supabase Storage path or S3 key
    storage_url     TEXT,                           -- public/signed URL
    source_url      TEXT,                           -- if discovered from web

    -- Document classification
    document_type   TEXT CHECK (document_type IN (
                        'deed', 'plat', 'survey', 'legal_description',
                        'title_commitment', 'easement', 'restrictive_covenant',
                        'field_notes', 'subdivision_plat', 'metes_and_bounds',
                        'county_record', 'appraisal_record', 'aerial_photo',
                        'topo_map', 'utility_map', 'other'
                    )),
    document_label  TEXT,                           -- user-friendly name

    -- Processing pipeline state
    processing_status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (processing_status IN ('pending','extracting','extracted','analyzing','analyzed','error')),
    processing_error TEXT,

    -- Extracted raw content
    extracted_text  TEXT,
    extracted_text_method TEXT,                     -- 'pdf-parse', 'ocr-vision', 'manual'
    page_count      INTEGER,

    -- OCR-specific data
    ocr_confidence  DECIMAL(5,2),
    ocr_regions     JSONB,

    -- Metadata
    recorded_date   DATE,
    recording_info  TEXT,                           -- volume, page, clerk file number
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_docs_project ON research_documents(research_project_id);
CREATE INDEX IF NOT EXISTS idx_research_docs_type ON research_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_research_docs_status ON research_documents(processing_status);


-- ── 5. extracted_data_points ─────────────────────────────────────────────────
-- Every piece of usable data the AI pulls from a document.

CREATE TABLE IF NOT EXISTS extracted_data_points (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    document_id     UUID NOT NULL REFERENCES research_documents(id) ON DELETE CASCADE,

    -- What was extracted
    data_category   TEXT NOT NULL CHECK (data_category IN (
                        'bearing', 'distance', 'call', 'monument',
                        'point_of_beginning', 'curve_data', 'area',
                        'boundary_description', 'easement', 'setback',
                        'right_of_way', 'adjoiner', 'recording_reference',
                        'date_reference', 'surveyor_info', 'legal_description',
                        'lot_block', 'subdivision_name', 'coordinate',
                        'elevation', 'zoning', 'flood_zone', 'utility_info',
                        'annotation', 'symbol', 'other'
                    )),

    -- The extracted value
    raw_value       TEXT NOT NULL,
    normalized_value JSONB,
    display_value   TEXT,
    unit            TEXT,

    -- Source attribution
    source_page     INTEGER,
    source_location TEXT,
    source_bounding_box JSONB,
    source_text_excerpt TEXT,

    -- Ordering for sequential data (call sequences)
    sequence_order  INTEGER,
    sequence_group  TEXT,

    -- Confidence
    extraction_confidence DECIMAL(5,2),
    confidence_reasoning TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_points_project ON extracted_data_points(research_project_id);
CREATE INDEX IF NOT EXISTS idx_data_points_document ON extracted_data_points(document_id);
CREATE INDEX IF NOT EXISTS idx_data_points_category ON extracted_data_points(data_category);
CREATE INDEX IF NOT EXISTS idx_data_points_sequence ON extracted_data_points(sequence_group, sequence_order);


-- ── 6. discrepancies ─────────────────────────────────────────────────────────
-- Issues, contradictions, or uncertainties found during analysis.

CREATE TABLE IF NOT EXISTS discrepancies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,

    severity        TEXT NOT NULL CHECK (severity IN (
                        'info', 'unclear', 'uncertain',
                        'discrepancy', 'contradiction', 'error'
                    )),

    probable_cause  TEXT CHECK (probable_cause IN (
                        'clerical_error', 'drawing_error', 'surveying_error',
                        'transcription_error', 'rounding_difference',
                        'datum_difference', 'age_difference', 'legal_ambiguity',
                        'missing_information', 'ocr_uncertainty', 'unknown'
                    )),

    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    ai_recommendation TEXT,

    -- Linked data points
    data_point_ids  UUID[] NOT NULL DEFAULT '{}',
    document_ids    UUID[] NOT NULL DEFAULT '{}',

    -- Impact assessment
    affects_boundary BOOLEAN DEFAULT false,
    affects_area     BOOLEAN DEFAULT false,
    affects_closure  BOOLEAN DEFAULT false,
    estimated_impact TEXT,

    -- Resolution
    resolution_status TEXT NOT NULL DEFAULT 'open'
                    CHECK (resolution_status IN ('open','reviewing','resolved','accepted','deferred')),
    resolved_by     TEXT,                           -- email of resolver
    resolution_notes TEXT,
    resolved_value  JSONB,
    resolved_at     TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discrepancies_project ON discrepancies(research_project_id);
CREATE INDEX IF NOT EXISTS idx_discrepancies_severity ON discrepancies(severity);
CREATE INDEX IF NOT EXISTS idx_discrepancies_status ON discrepancies(resolution_status);


-- ── 7. rendered_drawings ─────────────────────────────────────────────────────
-- Generated plat drawings (one project can have multiple drawing versions).

CREATE TABLE IF NOT EXISTS rendered_drawings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    drawing_template_id UUID REFERENCES drawing_templates(id),

    name            TEXT NOT NULL DEFAULT 'Drawing v1',
    version         INTEGER NOT NULL DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'rendering', 'rendered', 'verified', 'exported', 'error')),

    -- Canvas configuration
    canvas_config   JSONB NOT NULL DEFAULT '{
        "width": 3600,
        "height": 2400,
        "scale": 100,
        "units": "feet",
        "origin": [100, 2300],
        "background": "#FFFFFF"
    }',

    -- Title block data
    title_block     JSONB DEFAULT '{}',

    -- Comparison results (populated during verify step)
    overall_confidence DECIMAL(5,2),
    confidence_breakdown JSONB,
    comparison_notes TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drawings_project ON rendered_drawings(research_project_id);


-- ── 8. drawing_elements ──────────────────────────────────────────────────────
-- Every line, symbol, label, and shape in a rendered drawing.

CREATE TABLE IF NOT EXISTS drawing_elements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drawing_id      UUID NOT NULL REFERENCES rendered_drawings(id) ON DELETE CASCADE,

    -- Element type and classification
    element_type    TEXT NOT NULL CHECK (element_type IN (
                        'line', 'curve', 'polyline', 'polygon',
                        'point', 'label', 'dimension', 'symbol',
                        'hatch', 'callout'
                    )),

    feature_class   TEXT NOT NULL CHECK (feature_class IN (
                        'property_boundary', 'easement', 'setback',
                        'right_of_way', 'road', 'concrete', 'building',
                        'fence', 'utility', 'water_feature', 'tree_line',
                        'contour', 'lot_line', 'centerline', 'monument',
                        'control_point', 'annotation', 'title_block', 'other'
                    )),

    -- Geometry
    geometry        JSONB NOT NULL,
    svg_path        TEXT,

    -- Surveying attributes
    attributes      JSONB NOT NULL DEFAULT '{}',

    -- Style properties
    style           JSONB NOT NULL DEFAULT '{
        "stroke": "#000000",
        "strokeWidth": 1,
        "strokeDasharray": "",
        "fill": "none",
        "opacity": 1
    }',

    -- Layer and visibility
    layer           TEXT DEFAULT 'default',
    z_index         INTEGER DEFAULT 0,
    visible         BOOLEAN DEFAULT true,
    locked          BOOLEAN DEFAULT false,

    -- Confidence and AI analysis
    confidence_score DECIMAL(5,2) DEFAULT 0,
    confidence_factors JSONB DEFAULT '{}',
    ai_report       TEXT,

    -- Source traceability
    source_references JSONB DEFAULT '[]',
    data_point_ids  UUID[] DEFAULT '{}',
    discrepancy_ids UUID[] DEFAULT '{}',

    -- User modifications
    user_modified   BOOLEAN DEFAULT false,
    user_notes      TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_elements_drawing ON drawing_elements(drawing_id);
CREATE INDEX IF NOT EXISTS idx_elements_type ON drawing_elements(element_type);
CREATE INDEX IF NOT EXISTS idx_elements_feature ON drawing_elements(feature_class);


-- ── Seed Data: System Analysis Templates ─────────────────────────────────────

INSERT INTO analysis_templates (created_by, name, description, is_system, is_default, extract_config)
VALUES
(
    'system',
    'Full Survey Analysis',
    'Extract all available data from survey documents — bearings, distances, monuments, easements, and more.',
    true, true,
    '{
        "bearings_distances": true, "monuments": true, "curve_data": true,
        "point_of_beginning": true, "easements": true, "setbacks": true,
        "right_of_way": true, "adjoiners": true, "area_calculations": true,
        "recording_references": true, "surveyor_info": true, "legal_description": true,
        "lot_block_subdivision": true, "coordinates": true, "elevations": false,
        "zoning": false, "flood_zone": false, "utilities": false
    }'
),
(
    'system',
    'Boundary Only',
    'Extract only boundary-related data — bearings, distances, monuments, and POB. Skip easements, zoning, and utilities.',
    true, false,
    '{
        "bearings_distances": true, "monuments": true, "curve_data": true,
        "point_of_beginning": true, "easements": false, "setbacks": false,
        "right_of_way": false, "adjoiners": true, "area_calculations": true,
        "recording_references": true, "surveyor_info": true, "legal_description": true,
        "lot_block_subdivision": true, "coordinates": false, "elevations": false,
        "zoning": false, "flood_zone": false, "utilities": false
    }'
),
(
    'system',
    'Deed Research',
    'Focus on legal descriptions, recording references, and ownership chain data.',
    true, false,
    '{
        "bearings_distances": true, "monuments": false, "curve_data": true,
        "point_of_beginning": true, "easements": true, "setbacks": false,
        "right_of_way": false, "adjoiners": true, "area_calculations": true,
        "recording_references": true, "surveyor_info": false, "legal_description": true,
        "lot_block_subdivision": true, "coordinates": false, "elevations": false,
        "zoning": false, "flood_zone": false, "utilities": false
    }'
)
ON CONFLICT DO NOTHING;


-- ── Seed Data: System Drawing Templates ──────────────────────────────────────

INSERT INTO drawing_templates (created_by, name, description, is_system, is_default)
VALUES
(
    'system',
    'Standard B&W',
    'Classic black and white survey plat style. Best for printing and official filings.',
    true, true
),
(
    'system',
    'Professional Color',
    'Color-coded feature classes with standard survey conventions. Best for client presentations.',
    true, false
)
ON CONFLICT DO NOTHING;

COMMIT;
