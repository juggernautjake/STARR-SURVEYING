-- seeds/397_fs_prep_imagery_batch1.sql
-- FS imagery batch 1: seven original SVG diagrams generated + visually evaluated
-- (Playwright screenshot) → injected into module concepts. Copyright-safe
-- originals (textbook figures are not reproduced).
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

SELECT fs_add_figure(1,'concepts','![Accuracy vs. precision: a tight cluster on the bullseye is both accurate and precise; a tight cluster off-center is precise but not accurate (a systematic error); a scattered pattern centered on the bullseye is accurate on average but not precise.](/lessons/fs/diagrams/accuracy-precision.svg "Original diagram — Starr SIT Prep")');
SELECT fs_add_figure(1,'concepts','![The normal (Gaussian) distribution of random errors: about 68.3% fall within ±1σ, 95.4% within ±2σ, and 99.7% within ±3σ of the mean.](/lessons/fs/diagrams/normal-error-curve.svg "Original diagram — Starr SIT Prep")');
SELECT fs_add_figure(4,'concepts','![A closed-loop traverse A→B→C→D→A: each course is measured by bearing and distance; latitudes and departures should sum to zero, and the small leftover is the linear misclosure, distributed by the compass (Bowditch) rule.](/lessons/fs/diagrams/closed-traverse.svg "Original diagram — Starr SIT Prep")');
SELECT fs_add_figure(5,'concepts','![The average-end-area method for earthwork volume: V = ½·(A₁ + A₂)·L, the mean of the two cross-section end areas times the distance between them.](/lessons/fs/diagrams/average-end-area.svg "Original diagram — Starr SIT Prep")');
SELECT fs_add_figure(6,'concepts','![GNSS positioning by trilateration: measured ranges to at least four satellites fix the receiver''s position (X, Y, Z), with the fourth range solving the receiver clock bias.](/lessons/fs/diagrams/gnss-trilateration.svg "Original diagram — Starr SIT Prep")');
SELECT fs_add_figure(7,'concepts','![A metes-and-bounds description: bearing-and-distance calls run from the point of beginning (POB) around the tract and must close back on it — the Texas/colonial method, in contrast to the PLSS.](/lessons/fs/diagrams/metes-and-bounds.svg "Original diagram — Starr SIT Prep")');
SELECT fs_add_figure(8,'concepts','![Aerial photo overlap: successive photos along a flight line share about 60% forward (end) lap so every ground point appears on at least two photos for stereo viewing; adjacent flight strips share about 30% side lap.](/lessons/fs/diagrams/stereo-overlap.svg "Original diagram — Starr SIT Prep")');

DROP FUNCTION IF EXISTS fs_add_figure(int, text, text);
COMMIT;
