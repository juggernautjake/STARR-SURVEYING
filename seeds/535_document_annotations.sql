-- 535_document_annotations.sql — markup that survives closing the viewer (plan R24).
--
-- `SourceDocumentViewer` has had a full drawing canvas — colours, widths, freehand strokes, per page
-- — since it was written. `drawPaths` is React state and nothing else. Close the viewer and every
-- mark a surveyor made is gone. The feature looks complete and keeps nothing, which is worse than
-- not having it: somebody marks up a plat, closes the tab, and only then discovers it was never
-- saved.
--
-- ── THE ORIGINAL FILE IS NEVER TOUCHED ──────────────────────────────────────────────────────────
--
-- Annotations live here, in their own table, keyed to the document. Nothing writes to
-- `research_documents.storage_path` or re-encodes the image. The download a client gets is
-- byte-identical to what was fetched from the county — which is the whole point of a recorded
-- instrument, and the fourth place this contract now holds (after `research_survey_plans.ai_plan`,
-- `extracted_data_points.corrected_value`, and `rendered_drawings.user_annotations`).
--
-- ── COORDINATES ARE FRACTIONS OF THE PAGE ───────────────────────────────────────────────────────
--
-- The viewer draws into a canvas sized to `img.naturalWidth`. Storing those pixels would pin every
-- stroke to one particular rendering of one particular scan: re-upload the page at a different
-- resolution — which R18's re-run path does — and the markup lands somewhere else on the page,
-- silently. Strokes are stored as 0–1 fractions, the same contract R17 set for fact bounding boxes.

CREATE TABLE IF NOT EXISTS document_annotations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    document_id         UUID NOT NULL REFERENCES research_documents(id) ON DELETE CASCADE,

    -- Zero-based, matching the viewer's own page index.
    page                INTEGER NOT NULL DEFAULT 0,

    -- Layers can be named, toggled and reordered. A layer per purpose ("as-called", "as-occupied",
    -- "questions for the crew") is the point — one flat scribble layer is what a whiteboard is for.
    layer_name          TEXT NOT NULL DEFAULT 'Markup',
    layer_color         TEXT,
    layer_order         INTEGER NOT NULL DEFAULT 0,
    visible             BOOLEAN NOT NULL DEFAULT true,

    -- [{ kind, points: [{x,y}], color, width, text? }] with x/y as 0–1 fractions of the page.
    strokes             JSONB NOT NULL DEFAULT '[]',

    -- Attributable: markup on a survey document is a professional statement, and "who drew this"
    -- is the first question anybody asks about it.
    author_email        TEXT NOT NULL,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per (document, page, layer, author): saving is an upsert of that layer rather than an
-- append, so re-saving after two more strokes does not accumulate duplicate rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_annotations_layer
    ON document_annotations (document_id, page, layer_name, author_email);

CREATE INDEX IF NOT EXISTS idx_doc_annotations_document
    ON document_annotations (document_id, page);

CREATE INDEX IF NOT EXISTS idx_doc_annotations_project
    ON document_annotations (research_project_id);
