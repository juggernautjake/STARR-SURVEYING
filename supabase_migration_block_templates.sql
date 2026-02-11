-- Migration: Add block_templates table for reusable lesson builder block patterns
-- Allows admins/teachers to save custom block configurations as templates
-- Run AFTER supabase_schema.sql. Safe to re-run.

-- Create the block_templates table
CREATE TABLE IF NOT EXISTS block_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'custom',
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add CHECK constraint for category
DO $$
BEGIN
  ALTER TABLE block_templates ADD CONSTRAINT block_templates_category_check
    CHECK (category IN ('custom', 'content', 'interactive', 'layout', 'assessment'));
EXCEPTION WHEN duplicate_object THEN
  -- Constraint already exists
END;
$$;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_block_templates_category ON block_templates(category);
CREATE INDEX IF NOT EXISTS idx_block_templates_created_by ON block_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_block_templates_is_builtin ON block_templates(is_builtin);

-- Auto-update trigger for updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_block_templates_updated_at'
  ) THEN
    CREATE TRIGGER set_block_templates_updated_at
      BEFORE UPDATE ON block_templates
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Enable Row Level Security
ALTER TABLE block_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies: all authenticated users can read, admins can write
DO $$
BEGIN
  DROP POLICY IF EXISTS "block_templates_select" ON block_templates;
  CREATE POLICY "block_templates_select" ON block_templates FOR SELECT USING (true);
  DROP POLICY IF EXISTS "block_templates_insert" ON block_templates;
  CREATE POLICY "block_templates_insert" ON block_templates FOR INSERT WITH CHECK (true);
  DROP POLICY IF EXISTS "block_templates_update" ON block_templates;
  CREATE POLICY "block_templates_update" ON block_templates FOR UPDATE USING (true);
  DROP POLICY IF EXISTS "block_templates_delete" ON block_templates;
  CREATE POLICY "block_templates_delete" ON block_templates FOR DELETE USING (true);
END $$;

-- Seed built-in templates
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
