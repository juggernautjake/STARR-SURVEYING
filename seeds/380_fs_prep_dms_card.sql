-- seeds/380_fs_prep_dms_card.sql — DMS conversion reference in module 9.
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
SELECT fs_add_figure(9, 'concepts',
  '![Converting between degrees-minutes-seconds and decimal degrees: dd = D + M/60 + S/3600, and back. Set the calculator to DEG mode and carry full precision until the final answer.](/lessons/fs/diagrams/dms-conversion.svg "Original diagram — Starr SIT Prep")');
DROP FUNCTION IF EXISTS fs_add_figure(int, text, text);
COMMIT;
