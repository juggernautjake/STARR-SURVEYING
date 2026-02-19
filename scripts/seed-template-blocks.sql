-- ============================================================================
-- BLOCK-BASED SEED TEMPLATE
-- Use this template when creating new lesson content.
-- Instead of inserting HTML into learning_lessons.content, insert structured
-- blocks into lesson_blocks with proper JSONB content.
-- ============================================================================

-- Step 1: Create the lesson (content field left empty, blocks hold the content)
INSERT INTO learning_lessons (id, module_id, title, content, content_migrated, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES (
  'LESSON-UUID-HERE',
  'MODULE-UUID-HERE',
  'Lesson Title Here',
  '',                                    -- Empty: content lives in lesson_blocks
  TRUE,                                  -- Mark as migrated (block-based)
  ARRAY['Takeaway 1', 'Takeaway 2'],
  1,                                     -- order_index within module
  30,                                    -- estimated_minutes
  '[]'::jsonb,                           -- resources JSON array
  '[]'::jsonb,                           -- videos JSON array
  ARRAY['tag1', 'tag2'],
  'published'
);

-- Step 2: Insert lesson blocks (order_index determines display sequence)
-- Delete existing blocks for this lesson first (idempotent)
DELETE FROM lesson_blocks WHERE lesson_id = 'LESSON-UUID-HERE';

INSERT INTO lesson_blocks (id, lesson_id, block_type, content, order_index, created_at, updated_at)
VALUES
  -- ── TEXT BLOCK (rich HTML) ──
  (gen_random_uuid(), 'LESSON-UUID-HERE', 'text',
   '{"html": "<h2>Section Title</h2><p>Paragraph content with <strong>bold</strong> and <em>italic</em>.</p><ul><li>List item 1</li><li>List item 2</li></ul>"}'::jsonb,
   0, now(), now()),

  -- ── CALLOUT BLOCK ──
  -- Types: info, note, tip, warning, danger, example, formula
  (gen_random_uuid(), 'LESSON-UUID-HERE', 'callout',
   '{"type": "info", "text": "This is an important note about the topic."}'::jsonb,
   1, now(), now()),

  -- ── TABLE BLOCK ──
  (gen_random_uuid(), 'LESSON-UUID-HERE', 'table',
   '{"headers": ["Column A", "Column B", "Column C"], "rows": [["Row 1A", "Row 1B", "Row 1C"], ["Row 2A", "Row 2B", "Row 2C"]]}'::jsonb,
   2, now(), now()),

  -- ── IMAGE BLOCK ──
  (gen_random_uuid(), 'LESSON-UUID-HERE', 'image',
   '{"url": "/images/example.png", "alt": "Description of image", "caption": "Figure 1: Example diagram", "alignment": "center"}'::jsonb,
   3, now(), now()),

  -- ── VIDEO BLOCK ──
  (gen_random_uuid(), 'LESSON-UUID-HERE', 'video',
   '{"url": "https://www.youtube.com/watch?v=VIDEOID", "type": "youtube", "caption": "Instructional video"}'::jsonb,
   4, now(), now()),

  -- ── DIVIDER BLOCK ──
  (gen_random_uuid(), 'LESSON-UUID-HERE', 'divider',
   '{}'::jsonb,
   5, now(), now()),

  -- ── QUIZ BLOCK (inline check-your-knowledge) ──
  (gen_random_uuid(), 'LESSON-UUID-HERE', 'quiz',
   '{"question": "What is the primary purpose of a level in surveying?", "options": ["Measuring angles", "Establishing horizontal plane", "Measuring distance", "Recording data"], "correct": 1, "explanation": "A level establishes a horizontal line of sight for measuring elevation differences."}'::jsonb,
   6, now(), now()),

  -- ── EQUATION BLOCK (LaTeX) ──
  (gen_random_uuid(), 'LESSON-UUID-HERE', 'equation',
   '{"latex": "\\Delta h = S \\cdot \\cos(\\theta)", "label": "Slope to elevation", "display": "block"}'::jsonb,
   7, now(), now()),

  -- ── KEY TAKEAWAYS BLOCK ──
  (gen_random_uuid(), 'LESSON-UUID-HERE', 'key_takeaways',
   '{"title": "Key Takeaways", "items": ["First important point", "Second important point", "Third important point"]}'::jsonb,
   8, now(), now()),

  -- ── FLASHCARD BLOCK ──
  (gen_random_uuid(), 'LESSON-UUID-HERE', 'flashcard',
   '{"cards": [{"front": "What is EDM?", "back": "Electronic Distance Measurement — uses infrared or laser to measure distances"}, {"front": "What is a benchmark?", "back": "A permanent point of known elevation used as a reference"}], "layout": "single"}'::jsonb,
   9, now(), now()),

  -- ── PRACTICE PROBLEM BLOCK ──
  (gen_random_uuid(), 'LESSON-UUID-HERE', 'practice_problem',
   '{"title": "Slope Distance Conversion", "problem_statement": "Convert a slope distance of 250.00 ft at a zenith angle of 85°30''00\" to horizontal distance.", "difficulty": "medium", "category": "Distance Measurement", "steps": [{"label": "Identify given values", "content": "Slope distance = 250.00 ft, Zenith angle = 85°30''", "hint": "The zenith angle is measured from vertical"}, {"label": "Apply formula", "content": "HD = SD × sin(zenith) = 250.00 × sin(85°30'') = 250.00 × 0.99692", "hint": "Use HD = SD × sin(Z) for zenith angles"}, {"label": "Calculate", "content": "HD = 249.23 ft", "hint": "Round to nearest hundredth"}], "final_answer": "249.23 ft", "explanation": "Horizontal distance is always less than slope distance when the line is not perfectly horizontal."}'::jsonb,
   10, now(), now()),

  -- ── TABS BLOCK ──
  (gen_random_uuid(), 'LESSON-UUID-HERE', 'tabs',
   '{"tabs": [{"title": "Theory", "content": "<p>Theoretical explanation...</p>"}, {"title": "Practice", "content": "<p>Practical application...</p>"}, {"title": "Example", "content": "<p>Worked example...</p>"}], "activeTab": 0}'::jsonb,
   11, now(), now()),

  -- ── ACCORDION BLOCK ──
  (gen_random_uuid(), 'LESSON-UUID-HERE', 'accordion',
   '{"sections": [{"title": "What is a benchmark?", "content": "<p>A benchmark is a permanent point of known elevation...</p>", "open": false}, {"title": "Types of benchmarks", "content": "<p>USGS brass disks, concrete monuments, etc.</p>", "open": false}]}'::jsonb,
   12, now(), now()),

  -- ── LINK REFERENCE BLOCK ──
  (gen_random_uuid(), 'LESSON-UUID-HERE', 'link_reference',
   '{"links": [{"title": "TBPELS Official Website", "url": "https://www.tbpels.texas.gov", "type": "website", "description": "Texas Board of Professional Engineers and Land Surveyors"}, {"title": "Study Guide PDF", "url": "/resources/study-guide.pdf", "type": "pdf", "description": "Downloadable study material"}]}'::jsonb,
   13, now(), now()),

  -- ── POPUP ARTICLE BLOCK (expandable deep-dive) ──
  (gen_random_uuid(), 'LESSON-UUID-HERE', 'popup_article',
   '{"summary": "Click to learn more about the history of the Gunter chain", "title": "The Gunter Chain", "full_content": "<p>Edmund Gunter invented the surveying chain in 1620...</p>"}'::jsonb,
   14, now(), now()),

  -- ── HIGHLIGHT BLOCK ──
  (gen_random_uuid(), 'LESSON-UUID-HERE', 'highlight',
   '{"items": [{"text": "Horizontal distance is always measured, never slope distance", "style": "blue"}, {"text": "Always check your prism constant before measuring", "style": "yellow"}]}'::jsonb,
   15, now(), now()),

  -- ── COLUMNS BLOCK (side-by-side) ──
  (gen_random_uuid(), 'LESSON-UUID-HERE', 'columns',
   '{"columnCount": 2, "columns": [{"html": "<h4>Advantages</h4><ul><li>Fast measurement</li><li>High accuracy</li></ul>"}, {"html": "<h4>Disadvantages</h4><ul><li>Expensive equipment</li><li>Requires clear line of sight</li></ul>"}]}'::jsonb,
   16, now(), now());
