-- 438_fs_prep_exam_logistics.sql
-- FS Exam Alignment Buildout — Slice S25.
-- Encode the real NCEES FS exam logistics + strategy into the course so students
-- know exactly what to expect on exam day. Appends an "On exam day" block to the
-- existing Module 9 (Test Strategy) `tips` content section — idempotent via a
-- marker string — and adds 6 logistics flashcards (fs:module-9 category).
BEGIN;

-- ── 1) Append the logistics/strategy block to Module 9's `tips` section ───────
-- The lesson renderer surfaces the FIRST section of each type per tab, so we
-- append into the existing `tips` section rather than adding a new one.
CREATE OR REPLACE FUNCTION fs_append_section(p_mod int, p_type text, p_marker text, p_md text)
RETURNS void AS $fn$
DECLARE arr jsonb; i int; el jsonb; found boolean := false;
BEGIN
  SELECT content_sections INTO arr FROM fs_study_modules WHERE module_number = p_mod;
  IF arr IS NULL THEN RETURN; END IF;
  FOR i IN 0 .. jsonb_array_length(arr) - 1 LOOP
    el := arr -> i;
    IF el ->> 'type' = p_type THEN
      found := true;
      IF position(p_marker IN coalesce(el ->> 'content', '')) = 0 THEN
        arr := jsonb_set(arr, ARRAY[i::text, 'content'], to_jsonb((el ->> 'content') || E'\n\n' || p_md));
      END IF;
      EXIT;  -- only the first matching section is rendered
    END IF;
  END LOOP;
  -- If the module has no section of that type yet, create one.
  IF NOT found THEN
    arr := arr || jsonb_build_object('type', p_type, 'title', 'Test-Day Strategy', 'content', p_md);
  END IF;
  UPDATE fs_study_modules SET content_sections = arr WHERE module_number = p_mod;
END;
$fn$ LANGUAGE plpgsql;

SELECT fs_append_section(9, 'tips', '## On exam day — what to expect', $md$## On exam day — what to expect

Knowing the *format* removes surprises so every minute goes to solving problems, not to figuring out the mechanics.

**Registration & cost**
- The FS exam is **$225** (NCEES fee), scheduled year-round at **Pearson VUE** test centers.
- You may take it **once per calendar quarter, and no more than three times in any 12-month period**.

**Structure & timing**
- **110 questions total**: about **100 are scored** and roughly **10 are unscored pretest** items mixed in — you can't tell which, so answer every one as if it counts.
- **5 hours 20 minutes of working time**, delivered in **two halves** with a **scheduled 25-minute break** between them. Once you leave the first half you can't return to it, so finish and review each half before moving on.
- That's just under **3 minutes per question** on average. Bank time on the quick recall items to spend on the multi-step computations.

**Rules & resources**
- **Closed-book**, but you have the **searchable on-screen FS Reference Handbook** — the *only* reference allowed. Practice with it open (free download from your MyNCEES account) so you know *where* each formula lives before exam day.
- Questions are posed in **both SI (metric) and US customary units** — watch the units in every stem and answer.
- Only **NCEES-approved calculators** are permitted (see the calculator lesson above).

**Scoring**
- Pass/fail on a **scaled score** (not a fixed percentage); the cut score is set by a panel of surveyors, so there's no published "70%."
- **No penalty for wrong answers** — an unanswered question and a wrong answer score the same, so **never leave a question blank**. If you're low on time, flag-and-guess the remainder before the clock runs out.

**Blueprint (scored-question weights)** — study time should roughly follow these:

| NCEES knowledge area | Scored questions |
|---|---|
| Boundary Law & Real Property | 19–29 |
| Survey Computations & Computer Apps | 17–26 |
| Surveying Processes & Methods | 16–24 |
| Mapping Processes & Methods | 14–21 |
| Surveying Principles | 13–20 |
| Business Concepts | 11–17 |
| Applied Mathematics & Statistics | 10–15 |

**Pacing plan**
1. **First pass:** answer everything you can in under ~90 seconds; **flag** anything longer and move on.
2. **Second pass:** return to flagged multi-step problems with your remaining time.
3. **Final 5 minutes:** make sure **no question is blank** — educated guesses cost nothing.

> Take the course's **FS Exam Simulator** (110 questions, blueprint-balanced, timed to 5h20m) at least once before exam day so the pace and format feel routine.$md$);

DROP FUNCTION IF EXISTS fs_append_section(int, text, text, text);

-- ── 2) Logistics flashcards (Module 9) ───────────────────────────────────────
DELETE FROM flashcards WHERE category = 'fs:f5000009-0000-0000-0000-000000000009' AND 'fs-exam-logistics' = ANY(tags);
INSERT INTO flashcards (id, term, definition, hint_1, hint_2, hint_3, module_id, keywords, tags, category, difficulty_level, is_published, review_status)
VALUES
 ('fb09e000-0000-0000-0000-000000000001',
  'How many questions are on the FS exam, and how many are scored?',
  '110 questions total — about 100 are scored and roughly 10 are unscored pretest items mixed in. You cannot tell which is which, so answer every question as if it counts.',
  '110 total.', NULL, NULL, NULL,
  ARRAY['fs exam','questions','pretest']::text[],
  ARRAY['fs-flashcards','fs-m9','fs-exam-logistics']::text[],
  'fs:f5000009-0000-0000-0000-000000000009', 'beginner', true, 'approved'),
 ('fb09e000-0000-0000-0000-000000000002',
  'How much working time do you get on the FS exam, and how is it structured?',
  '5 hours 20 minutes of working time, split into two halves with a scheduled 25-minute break between them. You cannot return to the first half after leaving it.',
  '5h20m, two halves.', NULL, NULL, NULL,
  ARRAY['fs exam','time','format','break']::text[],
  ARRAY['fs-flashcards','fs-m9','fs-exam-logistics']::text[],
  'fs:f5000009-0000-0000-0000-000000000009', 'beginner', true, 'approved'),
 ('fb09e000-0000-0000-0000-000000000003',
  'Is the FS exam open-book? What reference is allowed?',
  'Closed-book. The only reference is the searchable on-screen NCEES FS Reference Handbook. Questions are posed in both SI and US customary units.',
  'Searchable handbook only.', NULL, NULL, NULL,
  ARRAY['fs exam','reference handbook','closed book','units']::text[],
  ARRAY['fs-flashcards','fs-m9','fs-exam-logistics']::text[],
  'fs:f5000009-0000-0000-0000-000000000009', 'beginner', true, 'approved'),
 ('fb09e000-0000-0000-0000-000000000004',
  'Is there a penalty for wrong answers on the FS exam?',
  'No. A wrong answer scores the same as a blank, so never leave a question unanswered — always make an educated guess before time expires.',
  'No penalty — never blank.', NULL, NULL, NULL,
  ARRAY['fs exam','scoring','guessing']::text[],
  ARRAY['fs-flashcards','fs-m9','fs-exam-logistics']::text[],
  'fs:f5000009-0000-0000-0000-000000000009', 'beginner', true, 'approved'),
 ('fb09e000-0000-0000-0000-000000000005',
  'How is the FS exam scored, and how often can you take it?',
  'Pass/fail on a scaled score set by a panel of surveyors (no fixed percentage). The fee is $225; you may take it once per calendar quarter and no more than three times in any 12-month period, year-round at Pearson VUE.',
  'Pass/fail, scaled; 1/quarter.', NULL, NULL, NULL,
  ARRAY['fs exam','scoring','fee','attempts','pearson vue']::text[],
  ARRAY['fs-flashcards','fs-m9','fs-exam-logistics']::text[],
  'fs:f5000009-0000-0000-0000-000000000009', 'intermediate', true, 'approved'),
 ('fb09e000-0000-0000-0000-000000000006',
  'Which two NCEES knowledge areas carry the most scored questions on the FS exam?',
  'Boundary Law & Real Property (19–29) and Survey Computations & Computer Applications (17–26). Weight your study time toward the heavier areas.',
  'Boundary Law + Survey Computations.', NULL, NULL, NULL,
  ARRAY['fs exam','blueprint','boundary law','computations']::text[],
  ARRAY['fs-flashcards','fs-m9','fs-exam-logistics']::text[],
  'fs:f5000009-0000-0000-0000-000000000009', 'intermediate', true, 'approved');

COMMIT;
