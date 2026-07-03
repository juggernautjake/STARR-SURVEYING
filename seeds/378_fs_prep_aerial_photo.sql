-- seeds/378_fs_prep_aerial_photo.sql
-- SIT / FS exam-prep — a public-domain USGS vertical aerial photograph in the
-- Photogrammetry module overview. Image: U.S. Geological Survey, public domain.
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
SELECT fs_add_figure(8, 'overview',
  '![A vertical aerial photograph — the basic data of photogrammetry. Overlapping vertical photos are used to map planimetry and, in stereo, terrain elevations; photo scale S = f/H relates photo and ground distances.](/lessons/fs/photos/aerial-photo-usgs.jpg "Photo: U.S. Geological Survey (USGS), public domain")');
DROP FUNCTION IF EXISTS fs_add_figure(int, text, text);
COMMIT;
