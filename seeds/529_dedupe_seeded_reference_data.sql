-- seeds/529_dedupe_seeded_reference_data.sql — 2,400 rows of the same reference data, seventeen times.
--
-- FOUND BY A REACT WARNING. The pay-progression page logged "Encountered two children with the same
-- key" while being browser-checked for the item-18 split. The keys come from the data, so the data
-- had duplicates: `seniority_brackets` held 153 rows where the seed defines 9 — every bracket
-- seventeen times, once per time anybody has run the seeds since February.
--
-- ── THE CAUSE IS ONE CLAUSE THAT LOOKS LIKE A GUARD AND IS NOT ──────────────────────────────────
--
--     INSERT INTO seniority_brackets (…) VALUES (…) ON CONFLICT DO NOTHING;
--
-- `ON CONFLICT DO NOTHING` with no target does nothing **unless a unique constraint is actually
-- violated**. `seniority_brackets` has exactly one unique index: its primary key, on a
-- `gen_random_uuid()` column. A fresh INSERT never conflicts with a generated id, so the clause has
-- never once fired. Its neighbours in the same file — `role_tiers`, `work_type_rates`,
-- `credential_bonuses` — name a target column (`ON CONFLICT (role_key)`) and have the constraint to
-- match, which is why those tables are clean and this one multiplied.
--
-- Sweeping every seed for the same shape found nine tables. Measured against production:
--
--     table                  rows    distinct   redundant
--     seniority_brackets      153           9         144
--     rewards_catalog         459          27         432
--     module_xp_config        574          38         536
--     block_templates         150          10         140
--     analysis_templates       45           3          42
--     drawing_templates        30           2          28
--     question_bank         4,406       3,281       1,125
--     learning_topics          80          53          27
--     flashcards            1,948       1,936          12
--
-- These are not invisible. The rewards store lists 27 prizes as 459. The seniority ladder draws 153
-- rungs. A quiz drawing from `question_bank` can serve the same question fifteen times in a row and
-- look like a coincidence.
--
-- ── WHAT THIS DOES ─────────────────────────────────────────────────────────────────────────────
--
-- Per table: repoint anything referencing a duplicate at the keeper, delete the rest, then add the
-- unique index the ON CONFLICT always assumed existed. The keeper is the EARLIEST row (created_at,
-- then id) — the one that was there before the multiplication started, so any hand-edit made to the
-- original survives and the newest identical copies go.
--
-- The three content tables are keyed on their content, not on their title:
--   * `question_bank` legitimately holds three groups of same-text questions with DIFFERENT answers
--     (module variants). Keying on text alone would delete real questions, so the key is text +
--     answer + options. That is what makes two questions the same question.
--   * `flashcards` — term + definition, for the same reason.
--   * `learning_topics` — lesson + title + body.
--
-- Idempotent: after the first run every group is a single row, so the deletes match nothing and the
-- indexes already exist.

BEGIN;

-- ── 1. seniority_brackets — no inbound FKs ─────────────────────────────────────────────────────
DELETE FROM seniority_brackets s
 WHERE EXISTS (
   SELECT 1 FROM seniority_brackets k
    WHERE k.min_years = s.min_years
      AND coalesce(k.org_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(s.org_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND (k.created_at, k.id) < (s.created_at, s.id));

-- COALESCE rather than the bare column: Postgres treats NULLs as distinct in a unique index, so a
-- row with no org would still be insertable forever. org_id is nullable by design (seed 513).
CREATE UNIQUE INDEX IF NOT EXISTS uq_seniority_brackets_org_years
  ON seniority_brackets (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), min_years);

-- ── 2. rewards_catalog — rewards_purchases.item_id points at it ────────────────────────────────
UPDATE rewards_purchases p
   SET item_id = k.id
  FROM rewards_catalog dup
  JOIN LATERAL (
        SELECT c.id FROM rewards_catalog c
         WHERE c.name = dup.name
         ORDER BY c.created_at, c.id LIMIT 1
       ) k ON TRUE
 WHERE p.item_id = dup.id AND k.id <> dup.id;

DELETE FROM rewards_catalog r
 WHERE EXISTS (SELECT 1 FROM rewards_catalog k
                WHERE k.name = r.name AND (k.created_at, k.id) < (r.created_at, r.id));

CREATE UNIQUE INDEX IF NOT EXISTS uq_rewards_catalog_name ON rewards_catalog (name);

-- ── 3. module_xp_config — no inbound FKs ───────────────────────────────────────────────────────
DELETE FROM module_xp_config m
 WHERE EXISTS (
   SELECT 1 FROM module_xp_config k
    WHERE k.module_type = m.module_type
      AND k.module_id IS NOT DISTINCT FROM m.module_id
      AND (k.created_at, k.id) < (m.created_at, m.id));

CREATE UNIQUE INDEX IF NOT EXISTS uq_module_xp_config_target
  ON module_xp_config (module_type, coalesce(module_id::text, ''));

-- ── 4. block_templates — no inbound FKs ────────────────────────────────────────────────────────
DELETE FROM block_templates b
 WHERE EXISTS (SELECT 1 FROM block_templates k
                WHERE k.name = b.name AND (k.created_at, k.id) < (b.created_at, b.id));

CREATE UNIQUE INDEX IF NOT EXISTS uq_block_templates_name ON block_templates (name);

-- ── 5. analysis_templates — research_projects.analysis_template_id points at it ────────────────
UPDATE research_projects p
   SET analysis_template_id = k.id
  FROM analysis_templates dup
  JOIN LATERAL (
        SELECT t.id FROM analysis_templates t
         WHERE t.name = dup.name ORDER BY t.created_at, t.id LIMIT 1
       ) k ON TRUE
 WHERE p.analysis_template_id = dup.id AND k.id <> dup.id;

DELETE FROM analysis_templates a
 WHERE EXISTS (SELECT 1 FROM analysis_templates k
                WHERE k.name = a.name AND (k.created_at, k.id) < (a.created_at, a.id));

CREATE UNIQUE INDEX IF NOT EXISTS uq_analysis_templates_name ON analysis_templates (name);

-- ── 6. drawing_templates — rendered_drawings.drawing_template_id points at it ──────────────────
UPDATE rendered_drawings d
   SET drawing_template_id = k.id
  FROM drawing_templates dup
  JOIN LATERAL (
        SELECT t.id FROM drawing_templates t
         WHERE t.name = dup.name ORDER BY t.created_at, t.id LIMIT 1
       ) k ON TRUE
 WHERE d.drawing_template_id = dup.id AND k.id <> dup.id;

DELETE FROM drawing_templates t
 WHERE EXISTS (SELECT 1 FROM drawing_templates k
                WHERE k.name = t.name AND (k.created_at, k.id) < (t.created_at, t.id));

CREATE UNIQUE INDEX IF NOT EXISTS uq_drawing_templates_name ON drawing_templates (name);

-- ── 7. learning_topics — question_bank.topic_id and fieldbook_notes.topic_id point at it ───────
UPDATE question_bank q
   SET topic_id = k.id
  FROM learning_topics dup
  JOIN LATERAL (
        SELECT t.id FROM learning_topics t
         WHERE t.lesson_id IS NOT DISTINCT FROM dup.lesson_id
           AND t.title = dup.title
           AND coalesce(t.content, '') = coalesce(dup.content, '')
         ORDER BY t.created_at, t.id LIMIT 1
       ) k ON TRUE
 WHERE q.topic_id = dup.id AND k.id <> dup.id;

UPDATE fieldbook_notes f
   SET topic_id = k.id
  FROM learning_topics dup
  JOIN LATERAL (
        SELECT t.id FROM learning_topics t
         WHERE t.lesson_id IS NOT DISTINCT FROM dup.lesson_id
           AND t.title = dup.title
           AND coalesce(t.content, '') = coalesce(dup.content, '')
         ORDER BY t.created_at, t.id LIMIT 1
       ) k ON TRUE
 WHERE f.topic_id = dup.id AND k.id <> dup.id;

DELETE FROM learning_topics t
 WHERE EXISTS (
   SELECT 1 FROM learning_topics k
    WHERE k.lesson_id IS NOT DISTINCT FROM t.lesson_id
      AND k.title = t.title
      AND coalesce(k.content, '') = coalesce(t.content, '')
      AND (k.created_at, k.id) < (t.created_at, t.id));

CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_topics_content
  ON learning_topics (coalesce(lesson_id::text, ''), title, md5(coalesce(content, '')));

-- ── 8. question_bank — quiz_attempt_answers.question_id points at it ───────────────────────────
--
-- Keyed on the ANSWER as well as the text. Three same-text groups in production carry different
-- correct answers; they are different questions and both must survive.
UPDATE quiz_attempt_answers a
   SET question_id = k.id
  FROM question_bank dup
  JOIN LATERAL (
        SELECT q.id FROM question_bank q
         WHERE q.module_id IS NOT DISTINCT FROM dup.module_id
           AND q.question_text = dup.question_text
           AND coalesce(q.correct_answer::text, '') = coalesce(dup.correct_answer::text, '')
           AND coalesce(q.options::text, '') = coalesce(dup.options::text, '')
         ORDER BY q.created_at, q.id LIMIT 1
       ) k ON TRUE
 WHERE a.question_id = dup.id AND k.id <> dup.id;

DELETE FROM question_bank q
 WHERE EXISTS (
   SELECT 1 FROM question_bank k
    WHERE k.module_id IS NOT DISTINCT FROM q.module_id
      AND k.question_text = q.question_text
      AND coalesce(k.correct_answer::text, '') = coalesce(q.correct_answer::text, '')
      AND coalesce(k.options::text, '') = coalesce(q.options::text, '')
      AND (k.created_at, k.id) < (q.created_at, q.id));

CREATE UNIQUE INDEX IF NOT EXISTS uq_question_bank_content
  ON question_bank (
    coalesce(module_id::text, ''),
    md5(question_text),
    md5(coalesce(correct_answer::text, '') || '|' || coalesce(options::text, ''))
  );

-- ── 9. flashcards — no inbound FKs ─────────────────────────────────────────────────────────────
DELETE FROM flashcards f
 WHERE EXISTS (
   SELECT 1 FROM flashcards k
    WHERE k.module_id IS NOT DISTINCT FROM f.module_id
      AND k.term = f.term
      AND coalesce(k.definition, '') = coalesce(f.definition, '')
      AND (k.created_at, k.id) < (f.created_at, f.id));

CREATE UNIQUE INDEX IF NOT EXISTS uq_flashcards_content
  ON flashcards (coalesce(module_id::text, ''), term, md5(coalesce(definition, '')));

COMMIT;

-- Verification:
--   SELECT count(*) FROM seniority_brackets;   -- 9, not 153
--   SELECT count(*) FROM rewards_catalog;      -- 27, not 459
--   SELECT count(*) FROM question_bank;        -- 3,281, not 4,406
