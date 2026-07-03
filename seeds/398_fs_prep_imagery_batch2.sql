-- seeds/398_fs_prep_imagery_batch2.sql
-- FS imagery batch 2: four original SVG diagrams, generated + visually evaluated
-- (Playwright screenshot; caption overflow, clipped labels, and a misleading
-- "to scale" bar chart all corrected) → injected into module concepts.
BEGIN;
CREATE OR REPLACE FUNCTION fs_add_figure(p_mod int, p_type text, p_fig text)
RETURNS void AS $fn$
DECLARE arr jsonb; i int; el jsonb;
BEGIN
  SELECT content_sections INTO arr FROM fs_study_modules WHERE module_number = p_mod;
  IF arr IS NULL THEN RETURN; END IF;
  FOR i IN 0 .. jsonb_array_length(arr) - 1 LOOP
    el := arr -> i;
    IF el ->> 'type' = p_type THEN
      IF position(p_fig IN coalesce(el ->> 'content', '')) = 0 THEN
        arr := jsonb_set(arr, ARRAY[i::text, 'content'], to_jsonb((el ->> 'content') || E'\n\n' || p_fig));
      END IF;
    END IF;
  END LOOP;
  UPDATE fs_study_modules SET content_sections = arr WHERE module_number = p_mod;
END;
$fn$ LANGUAGE plpgsql;

SELECT fs_add_figure(1,'concepts','![Traditional survey units drawn to scale: 1 foot, 1 Texas vara (2.78 ft = 33⅓ in), 1 rod (16.5 ft), and 1 Gunter''s chain (66 ft = 4 rods = 100 links). 10 square chains = 1 acre.](/lessons/fs/diagrams/survey-units.svg "Original diagram — Starr SIT Prep")');
SELECT fs_add_figure(2,'concepts','![Curvature and refraction on a level sight: the earth curves away from the horizontal line of sight (making a distant reading too high), while atmospheric refraction bends the ray back down by about one-seventh; the net effect is c − r ≈ 0.0206·F² ft (F in thousands of feet).](/lessons/fs/diagrams/curvature-refraction.svg "Original diagram — Starr SIT Prep")');
SELECT fs_add_figure(3,'concepts','![Reducing a slope distance to horizontal: for slope distance S at vertical angle α, the horizontal distance is H = S·cos α and the vertical difference is V = S·sin α.](/lessons/fs/diagrams/slope-reduction.svg "Original diagram — Starr SIT Prep")');
SELECT fs_add_figure(6,'concepts','![Ground vs. grid distance: the ground distance is scaled to the ellipsoid by the elevation factor, then to the state-plane grid by the scale factor; their product is the combined (grid) factor, so grid distance = ground distance × combined factor.](/lessons/fs/diagrams/grid-ground.svg "Original diagram — Starr SIT Prep")');

DROP FUNCTION IF EXISTS fs_add_figure(int, text, text);
COMMIT;
