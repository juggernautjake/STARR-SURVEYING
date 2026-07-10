-- 425_fs_prep_static_diagrams.sql
-- FS Exam Alignment Buildout — Slice S8.
-- Give STATIC question_bank rows a fixed figure. The quiz GET route resolves
-- question_bank.diagram (a DiagramSpec with literal values) via
-- buildDiagramFromSpec(spec, {}) and returns it as _diagram, which QuizRunner
-- renders. Back-fills the figures onto the already-live drag_label Q13
-- (tilted-photo geometry) and hotspot Q28 (h = H + N height systems).
-- Idempotent: ADD COLUMN IF NOT EXISTS + UPDATE by id.

ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS diagram jsonb;

-- Q13 (drag_label — tilted photograph geometry)
UPDATE question_bank
   SET diagram = '{"type":"tiltedPhoto","tilt":18}'::jsonb
 WHERE id = 'fa230000-0000-0000-0000-000000000001';

-- Q28 (hotspot — geoid height, h = H + N)
UPDATE question_bank
   SET diagram = '{"type":"heightRelations","orthoH":150,"ellipH":190,"geoidN":40}'::jsonb
 WHERE id = 'fa240000-0000-0000-0000-000000000001';
