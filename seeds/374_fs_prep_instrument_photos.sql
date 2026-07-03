-- seeds/374_fs_prep_instrument_photos.sql
-- SIT / FS exam-prep — sourced instrument photographs (with attribution),
-- placed in the module Overview sections so lessons open with a real photo of
-- the instrument they discuss. Images resized for the lesson.
--   total-station.jpg   — public domain, via Wikimedia Commons
--   automatic-level.jpg — Photo: Kecko, CC BY 2.0, via Wikimedia Commons
--   gnss-receiver.jpg   — Photo: LubGua987, CC BY-SA 4.0, via Wikimedia Commons

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

-- Module 2 — Leveling: an automatic (dumpy) level on a tripod
SELECT fs_add_figure(2, 'overview',
  '![An automatic level set up on a tripod. Levered onto a horizontal line of sight, it reads a graduated rod for differential leveling.](/lessons/fs/photos/automatic-level.jpg "Photo: Kecko, CC BY 2.0, via Wikimedia Commons")');

-- Module 3 — Distance & Angle Measurement: a robotic total station
SELECT fs_add_figure(3, 'overview',
  '![A modern total station. It combines an electronic theodolite (angle measurement) with an EDM (electronic distance measurement) to capture horizontal and vertical angles plus slope distance in one setup.](/lessons/fs/photos/total-station.jpg "Photo: public domain, via Wikimedia Commons")');

-- Module 6 — GNSS/GPS & Geodesy: a survey-grade GNSS receiver
SELECT fs_add_figure(6, 'overview',
  '![A survey-grade GNSS receiver on a tripod. It tracks multiple satellite constellations to fix a precise position; results are ellipsoidal coordinates and heights that a geoid model converts to orthometric elevations.](/lessons/fs/photos/gnss-receiver.jpg "Photo: LubGua987, CC BY-SA 4.0, via Wikimedia Commons")');

DROP FUNCTION IF EXISTS fs_add_figure(int, text, text);

COMMIT;
