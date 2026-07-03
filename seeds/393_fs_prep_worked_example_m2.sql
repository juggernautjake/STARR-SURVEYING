-- seeds/393_fs_prep_worked_example_m2.sql
-- Enrich the thinnest examples section (module 2, Leveling) with a complete,
-- step-by-step worked closed-loop differential-leveling example (arithmetic
-- node-verified). Idempotent append.
BEGIN;
CREATE OR REPLACE FUNCTION fs_append_section(p_mod int, p_type text, p_text text)
RETURNS void AS $fn$
DECLARE arr jsonb; i int; el jsonb;
BEGIN
  SELECT content_sections INTO arr FROM fs_study_modules WHERE module_number = p_mod;
  IF arr IS NULL THEN RETURN; END IF;
  FOR i IN 0 .. jsonb_array_length(arr) - 1 LOOP
    el := arr -> i;
    IF el ->> 'type' = p_type AND position(left(p_text,40) IN coalesce(el ->> 'content','')) = 0 THEN
      arr := jsonb_set(arr, ARRAY[i::text,'content'], to_jsonb((el ->> 'content') || E'\n\n' || p_text));
    END IF;
  END LOOP;
  UPDATE fs_study_modules SET content_sections = arr WHERE module_number = p_mod;
END;
$fn$ LANGUAGE plpgsql;

SELECT fs_append_section(2, 'examples',
E'### Worked example: a closed differential-leveling loop\n\n'
'A level loop begins and ends on **BM-A (elevation 100.00 ft)**, turning on TP1 and TP2. The three instrument setups read:\n\n'
'- **Setup 1** — BS on BM-A = 4.52 ft; FS on TP1 = 5.31 ft\n'
'- **Setup 2** — BS on TP1 = 6.02 ft; FS on TP2 = 3.18 ft\n'
'- **Setup 3** — BS on TP2 = 2.44 ft; FS on BM-A = 4.62 ft\n\n'
'**Step 1 — carry the elevations** (HI = elevation + BS; next elevation = HI − FS):\n\n'
'- HI-1 = 100.00 + 4.52 = 104.52 → TP1 = 104.52 − 5.31 = **99.21 ft**\n'
'- HI-2 = 99.21 + 6.02 = 105.23 → TP2 = 105.23 − 3.18 = **102.05 ft**\n'
'- HI-3 = 102.05 + 2.44 = 104.49 → BM-A (closing) = 104.49 − 4.62 = **99.87 ft**\n\n'
'**Step 2 — misclosure.** The loop must return to 100.00 ft but closes at 99.87 ft, so the misclosure is **99.87 − 100.00 = −0.13 ft**. Check: ΣBS − ΣFS = 12.98 − 13.11 = −0.13 ft — the two must agree, confirming the arithmetic.\n\n'
'**Step 3 — is it acceptable?** Compare against an allowable such as C = 0.02·√(loop-miles). For a 0.36-mile loop, C = 0.02·0.6 ≈ 0.012 ft; the −0.13 ft misclosure far exceeds it, so the circuit should be re-run before adjusting. When a loop *is* within tolerance, distribute the misclosure in proportion to the setup distances (or equally among the turning points), with the sign opposite to the misclosure.');

DROP FUNCTION IF EXISTS fs_append_section(int, text, text);
COMMIT;
