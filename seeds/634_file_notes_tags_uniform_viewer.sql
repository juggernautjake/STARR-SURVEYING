-- seeds/634_file_notes_tags_uniform_viewer.sql — notes and tags on every kind of file the viewer shows.
--
-- Owner, 2026-09-09: "We need to be able to attach notes and metadata/tags and stuff to files and
-- folders." One viewer now serves the File Explorer, a job's attachments and the research documents
-- (app/admin/components/files/FileViewer.tsx). Job files already carried `label`, `tags` and
-- `description` (seed 607); the other two tables had nothing a person could write on a file.
--
--   file_nodes          notes + tags — on FILES and FOLDERS alike (a folder is a node)
--   research_documents  notes + tags — `document_label` already serves as the display name
--
-- Tags are lower-cased short words (lib/files/labels.ts normalises them); the GIN indexes are for
-- the tag filters the lists offer.

BEGIN;

ALTER TABLE file_nodes ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE file_nodes ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_file_nodes_tags ON file_nodes USING GIN (tags);
COMMENT ON COLUMN file_nodes.notes IS 'What someone opening this file or folder should know. Written from the shared file viewer (2026-09-09).';
COMMENT ON COLUMN file_nodes.tags IS 'Lower-cased short tags, normalised by lib/files/labels.ts. Shared viewer, 2026-09-09.';

ALTER TABLE research_documents ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE research_documents ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_research_documents_tags ON research_documents USING GIN (tags);
COMMENT ON COLUMN research_documents.notes IS 'A person''s note on the document — distinct from the AI summary in analysis_metadata. Shared viewer, 2026-09-09.';
COMMENT ON COLUMN research_documents.tags IS 'Lower-cased short tags, normalised by lib/files/labels.ts. Shared viewer, 2026-09-09.';

COMMIT;
