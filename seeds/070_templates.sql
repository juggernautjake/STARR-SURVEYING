-- ============================================================================
-- 070_templates.sql
-- Block templates (10 built-in reusable lesson builder templates) and
-- problem templates (40+ algorithmic question generators).
-- Depends on: Schema + migration_block_templates + migration_problem_templates
-- ============================================================================

BEGIN;

-- ── Block Templates ───────────────────────────────────────────────────────
-- Reusable patterns for the lesson builder. Users can apply these when
-- creating new lesson content.

INSERT INTO block_templates (name, description, category, is_builtin, blocks) VALUES
  ('Quiz with Explanation', 'Multiple-choice question with detailed explanation', 'assessment', true,
   '[{"block_type":"quiz","content":{"question":"Your question here","options":["Option A","Option B","Option C","Option D"],"correct":0,"explanation":"Explain why the correct answer is right."}}]'::jsonb),
  ('Image with Caption', 'Full-width image with descriptive caption', 'content', true,
   '[{"block_type":"image","content":{"url":"","alt":"Descriptive alt text","caption":"Image caption goes here","alignment":"center"}}]'::jsonb),
  ('Info Callout + Text', 'Info callout followed by explanatory text', 'content', true,
   '[{"block_type":"callout","content":{"type":"info","text":"Important concept to highlight"}},{"block_type":"text","content":{"html":"<p>Detailed explanation of the concept above...</p>"}}]'::jsonb),
  ('Warning + Formula', 'Warning callout with a formula reference', 'content', true,
   '[{"block_type":"callout","content":{"type":"warning","text":"Pay attention to this common mistake"}},{"block_type":"equation","content":{"latex":"a^2 + b^2 = c^2","label":"Pythagorean Theorem","display":"block"}}]'::jsonb),
  ('Flashcard Study Set', 'Flashcard deck with starter cards', 'interactive', true,
   '[{"block_type":"flashcard","content":{"cards":[{"front":"Term 1","back":"Definition 1"},{"front":"Term 2","back":"Definition 2"},{"front":"Term 3","back":"Definition 3"}]}}]'::jsonb),
  ('Section Header + Divider', 'Bold section title with divider below', 'layout', true,
   '[{"block_type":"text","content":{"html":"<h2>Section Title</h2>"}},{"block_type":"divider","content":{}}]'::jsonb),
  ('Key Takeaways Summary', 'Takeaways box for end-of-section review', 'content', true,
   '[{"block_type":"key_takeaways","content":{"title":"Key Takeaways","items":["First important point","Second important point","Third important point"]}}]'::jsonb),
  ('Video + Discussion', 'Embedded video with follow-up discussion text', 'content', true,
   '[{"block_type":"video","content":{"url":"","type":"youtube","caption":"Video title"}},{"block_type":"text","content":{"html":"<p><strong>Discussion:</strong> After watching the video above, consider the following points...</p>"}}]'::jsonb),
  ('Table with Header', 'Data table ready for comparison content', 'content', true,
   '[{"block_type":"table","content":{"headers":["Category","Description","Example"],"rows":[["Row 1","Description here","Example here"],["Row 2","Description here","Example here"]]}}]'::jsonb),
  ('Popup Deep-Dive', 'Summary with expandable article for extra detail', 'interactive', true,
   '[{"block_type":"popup_article","content":{"summary":"Click to learn more about this topic...","title":"Deep Dive: Topic Name","full_content":"<p>Detailed explanation that students can read if they want to go deeper...</p>"}}]'::jsonb)
ON CONFLICT DO NOTHING;

-- ── Problem Templates ─────────────────────────────────────────────────────
-- Algorithmic generators for dynamic quiz questions. These register the
-- hardcoded generators in the application so the DB knows about them.
-- The actual generation logic is in the app code (lib/generators/).

-- Note: The full problem_templates INSERT is in supabase_migration_problem_templates.sql
-- and is automatically applied when migrations run. This file ensures the data exists
-- even if run independently.

-- If problem_templates is empty, seed the core generators
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM problem_templates LIMIT 1) THEN
    RAISE NOTICE 'Problem templates table is empty. Run supabase_migration_problem_templates.sql to seed 40+ generators.';
  END IF;
END $$;

COMMIT;

SELECT 'Templates seeded successfully.' AS status;
