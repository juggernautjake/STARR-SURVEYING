-- seeds/399_fs_prep_imagery_batch3.sql
-- FS imagery batch 3: two more original diagrams (angle measurement, road
-- profile/grade), Arial-bold dark text, verified 0 overlaps/overflow.
BEGIN;
CREATE OR REPLACE FUNCTION fs_add_figure(p_mod int, p_type text, p_fig text)
RETURNS void AS $fn$
DECLARE arr jsonb; i int; el jsonb;
BEGIN
  SELECT content_sections INTO arr FROM fs_study_modules WHERE module_number = p_mod;
  IF arr IS NULL THEN RETURN; END IF;
  FOR i IN 0 .. jsonb_array_length(arr) - 1 LOOP
    el := arr -> i;
    IF el ->> 'type' = p_type AND position(p_fig IN coalesce(el ->> 'content','')) = 0 THEN
      arr := jsonb_set(arr, ARRAY[i::text,'content'], to_jsonb((el ->> 'content') || E'\n\n' || p_fig));
    END IF;
  END LOOP;
  UPDATE fs_study_modules SET content_sections = arr WHERE module_number = p_mod;
END;
$fn$ LANGUAGE plpgsql;
SELECT fs_add_figure(3,'concepts','![Measuring a horizontal angle: the instrument occupies station B, sights the backsight A, then the foresight C; the clockwise angle A→C is the measured angle. Averaging a direct and a reversed (plunged) reading cancels instrument errors.](/lessons/fs/diagrams/angle-measurement.svg "Original diagram — Starr SIT Prep")');
SELECT fs_add_figure(5,'concepts','![A road profile: the proposed grade line (two tangent grades meeting at a summit vertical curve at the PVI) against the existing ground. Where the grade is above the ground it is fill; where it is below, cut.](/lessons/fs/diagrams/profile-grade.svg "Original diagram — Starr SIT Prep")');
DROP FUNCTION IF EXISTS fs_add_figure(int, text, text);
COMMIT;
