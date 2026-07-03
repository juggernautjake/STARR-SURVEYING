-- seeds/389_fs_prep_surveyor_photo.sql — field-survey photo in the Traversing
-- module overview. Photo: "Random Guy of the Century", CC BY-SA 3.0, Wikimedia.
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
SELECT fs_add_figure(4, 'overview',
  '![Running a traverse in the field: the instrument occupies each station in turn, measuring the angle and distance to the next, and those observations are reduced to coordinates by latitudes and departures.](/lessons/fs/photos/field-surveyor.jpg "Photo: Random Guy of the Century, CC BY-SA 3.0, via Wikimedia Commons")');
DROP FUNCTION IF EXISTS fs_add_figure(int, text, text);
COMMIT;
