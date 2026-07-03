-- seeds/394_fs_prep_worked_examples_m1_m3.sql
-- Enrich the two other thin examples sections (module 1 Fundamentals, module 3
-- Distance & Angle) with complete worked examples. Arithmetic node-verified.
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

SELECT fs_append_section(1, 'examples',
E'### Worked example: most probable value and precision\n\n'
'A distance is measured four independent times: **100.02, 100.05, 100.01, 100.04 ft**.\n\n'
'**Step 1 — most probable value** (the mean): (100.02 + 100.05 + 100.01 + 100.04) / 4 = 400.12 / 4 = **100.03 ft**.\n\n'
'**Step 2 — residuals** v = observation − mean: −0.01, +0.02, −0.02, +0.01 ft. (They sum to 0, a useful check.)\n\n'
'**Step 3 — standard deviation** σ = √(Σv² / (n − 1)) = √(0.0010 / 3) = **±0.018 ft** (the spread of a single measurement).\n\n'
'**Step 4 — standard error of the mean** σ_m = σ / √n = 0.018 / √4 = **±0.009 ft**. The mean is more precise than any single reading, and its precision improves with the square root of the number of observations.');

SELECT fs_append_section(3, 'examples',
E'### Worked example: reducing a slope distance\n\n'
'A total station measures a **slope distance S = 345.67 ft** along a line inclined at a **vertical angle of 1°30′** above the horizontal.\n\n'
'**Step 1 — horizontal distance:** H = S·cos(θ) = 345.67 · cos(1.5°) = **345.55 ft**.\n\n'
'**Step 2 — vertical difference:** ΔElev = S·sin(θ) = 345.67 · sin(1.5°) = **9.05 ft** (the far end is higher by this amount).\n\n'
'**Step 3 — further corrections:** apply the instrument''s EDM scale/prism correction if specified, and for state-plane work multiply the horizontal distance by the combined (grid) factor to obtain the grid distance. Always carry full precision and round only at the end.');

DROP FUNCTION IF EXISTS fs_append_section(int, text, text);
COMMIT;
