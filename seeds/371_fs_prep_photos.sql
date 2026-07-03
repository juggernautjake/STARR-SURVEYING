-- seeds/371_fs_prep_photos.sql
-- SIT / FS exam-prep — sourced photograph(s) with attribution.
-- Image licensing: geodetic-benchmark-disk.jpg is a photograph of a geodetic
-- control monument disk by Wikimedia Commons user "Ebyabe", licensed CC BY 2.5,
-- resized for the lesson. Attribution is rendered inline as the figure credit.

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
        arr := jsonb_set(arr, ARRAY[i::text, 'content'],
                 to_jsonb((el ->> 'content') || E'\n\n' || p_fig));
      END IF;
    END IF;
  END LOOP;
  UPDATE fs_study_modules SET content_sections = arr WHERE module_number = p_mod;
END;
$fn$ LANGUAGE plpgsql;

-- Module 1 — Fundamentals: a real geodetic control monument disk. Surveys are
-- tied to physical monuments like this; a set disk carries the station name and
-- agency and marks a point of known horizontal and/or vertical control.
SELECT fs_add_figure(1, 'concepts',
  '![A geodetic control monument disk. Surveys are referenced to physical monuments like this one, which mark points of known horizontal and/or vertical control and carry the station designation and setting agency.](/lessons/fs/photos/geodetic-benchmark-disk.jpg "Photo: Ebyabe, CC BY 2.5, via Wikimedia Commons")');

DROP FUNCTION IF EXISTS fs_add_figure(int, text, text);

COMMIT;
