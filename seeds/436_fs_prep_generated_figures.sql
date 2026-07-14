-- 436_fs_prep_generated_figures.sql
-- FS Exam Alignment Buildout — Slice S20.
-- Embed the newly-generated parametric survey figures (rendered to static SVGs
-- under public/lessons/fs/diagrams/ by scripts/gen-lesson-figures.ts) into the
-- relevant module lessons, so the lessons illustrate the same figure families
-- the questions generate. Reuses the idempotent fs_add_figure helper (skips if
-- the figure is already embedded).
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

-- Module 3 — Distance & Angle Measurement
SELECT fs_add_figure(3,'concepts','![Height of an inaccessible point from two setups: sighting the top from two stations a known distance apart (angles A and B) gives h = d / (cot A − cot B).](/lessons/fs/diagrams/tower-two-angles.svg "Original diagram — Starr SIT Prep (generated)")');

-- Module 5 — Areas, Volumes & Curves
SELECT fs_add_figure(5,'concepts','![Horizontal curve elements: the tangent T, external E, middle ordinate M, long chord LC and radius R for a central angle I; the deflection from the back tangent to the long chord at the PC equals I/2.](/lessons/fs/diagrams/horizontal-curve-elements.svg "Original diagram — Starr SIT Prep (generated)")');
SELECT fs_add_figure(5,'concepts','![A rectangular lot with one 90° corner rounded by an arc of radius r: the area is the full rectangle minus the sliver r²(1 − π/4) between the square corner and the quarter circle.](/lessons/fs/diagrams/rounded-corner-lot.svg "Original diagram — Starr SIT Prep (generated)")');

-- Module 6 — GNSS/Geodesy
SELECT fs_add_figure(6,'concepts','![Height systems: the ellipsoidal height h (from GNSS) equals the orthometric height H (above the geoid) plus the geoid height N (geoid–ellipsoid separation): h = H + N.](/lessons/fs/diagrams/geoid-height-systems.svg "Original diagram — Starr SIT Prep (generated)")');

-- Module 7 — Boundary Law & Public Lands
SELECT fs_add_figure(7,'concepts','![A recorded plat with lots along a street and monuments A and B at the block ends: the full lots hold their record frontage and the remainder lot absorbs the measured excess or deficiency.](/lessons/fs/diagrams/recorded-plat-lots.svg "Original diagram — Starr SIT Prep (generated)")');

-- Module 8 — Photogrammetry, GIS & Construction
SELECT fs_add_figure(8,'concepts','![Reading a contour map: the interval is found from the spacing of the labeled index contours (every fifth line), then the highest (innermost) closed contour on the hill gives the summit contour elevation.](/lessons/fs/diagrams/contour-hill.svg "Original diagram — Starr SIT Prep (generated)")');
SELECT fs_add_figure(8,'concepts','![Tilted photograph geometry: the plumb line drops from the exposure station L to the ground nadir; the optical axis is perpendicular to the tilted photo through the principal point o; the principal line joins o and the photo nadir n.](/lessons/fs/diagrams/tilted-photo-geometry.svg "Original diagram — Starr SIT Prep (generated)")');
SELECT fs_add_figure(8,'concepts','![Sewer grade profile: the invert runs on a uniform grade between manholes; interpolating the flow line at a station and subtracting from the grade-stake elevation gives the cut.](/lessons/fs/diagrams/sewer-grade-profile.svg "Original diagram — Starr SIT Prep (generated)")');
SELECT fs_add_figure(8,'concepts','![Typical fill cross-section for slope staking: from the edge of road the side slope descends at s:1 to meet existing ground at the catch point; the catch-point offset from centerline = half-width + s·(fill height).](/lessons/fs/diagrams/cut-fill-section.svg "Original diagram — Starr SIT Prep (generated)")');

DROP FUNCTION IF EXISTS fs_add_figure(int, text, text);
COMMIT;
