-- ============================================================================
-- 011_curriculum_blocks.sql
-- Lesson blocks for core curriculum content. These structured blocks replace
-- monolithic HTML and enable full editing in the lesson builder.
-- Depends on: 010_curriculum.sql (lesson IDs must exist)
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Welcome lesson  (22222222-2222-2222-2222-222222222200)
-- Converted from legacy HTML to structured lesson blocks
-- ---------------------------------------------------------------------------
DELETE FROM lesson_blocks WHERE lesson_id = '22222222-2222-2222-2222-222222222200';
INSERT INTO lesson_blocks (id, lesson_id, block_type, content, order_index, created_at, updated_at)
VALUES
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222200', 'text', '{"html":"<h2>Welcome to the Starr Surveying Learning Hub</h2><p>Welcome to the team! Whether you''re a brand-new surveying intern (SIT) or a seasoned field veteran joining our company, this learning platform is designed to help you grow your skills, prepare for licensing exams, and stay up-to-date with best practices.</p>"}'::jsonb, 0, now(), now()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222200', 'text', '{"html":"<h3>What You''ll Learn Here</h3><p>This platform covers everything you need to succeed as a surveyor at Starr Surveying:</p><ul>\n  <li><strong>Fundamentals of Land Surveying</strong> — History, terminology, types of surveys, and core concepts</li>\n  <li><strong>Equipment &amp; Technology</strong> — Total stations, GNSS/GPS, data collectors, and modern tools</li>\n  <li><strong>Texas-Specific Knowledge</strong> — Texas property law, the vara, GLO records, and state regulations</li>\n  <li><strong>Field Procedures</strong> — How we conduct boundary surveys, topographic surveys, and construction layout</li>\n  <li><strong>Exam Preparation</strong> — Practice questions for the SIT and RPLS licensing exams</li>\n</ul>"}'::jsonb, 1, now(), now()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222200', 'text', '{"html":"<h3>How This Works</h3><p>Each module contains <strong>lessons</strong> you can read through at your own pace. After each lesson, you can:</p><ul>\n  <li><strong>Take a Quiz</strong> — Test your understanding of the material</li>\n  <li><strong>Study Flashcards</strong> — Review key terms with our spaced repetition system that adapts to how well you know each term</li>\n  <li><strong>Read Knowledge Base Articles</strong> — Dive deeper into specific topics</li>\n  <li><strong>Take Notes</strong> — Use your Field Notebook to jot down observations and reminders</li>\n</ul>"}'::jsonb, 2, now(), now()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222200', 'text', '{"html":"<h3>Getting Started</h3><p>Start with the next lesson, <strong>\"What is Land Surveying?\"</strong>, to learn the basics. If you already have surveying experience, feel free to jump ahead to the topics that interest you or go straight to the flashcards and quiz sections.</p>"}'::jsonb, 3, now(), now()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222200', 'text', '{"html":"<h3>About Starr Surveying</h3><p>Starr Surveying is committed to providing accurate, professional land surveying services. Our team uses the latest technology — including Trimble instruments, GNSS receivers, and CAD software — to deliver high-quality results. We believe in continuous learning and professional development, which is why we built this platform for our team.</p><p><strong>Let''s get started!</strong></p>"}'::jsonb, 4, now(), now());

-- Mark lesson as migrated (original HTML preserved as fallback)
UPDATE learning_lessons SET content_migrated = TRUE WHERE id = '22222222-2222-2222-2222-222222222200';

-- ---------------------------------------------------------------------------
-- NOTE: As more curriculum lessons get content, their blocks should be added
-- here following the same pattern — DELETE existing blocks for the lesson,
-- then INSERT the new structured blocks.
-- ---------------------------------------------------------------------------

COMMIT;
