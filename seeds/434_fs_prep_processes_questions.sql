-- 434_fs_prep_processes_questions.sql
-- FS Exam Alignment Buildout — Slice S18.
-- Surveying Processes & Methods / Surveying Principles (NCEES Cat 1 & 4):
-- Q5 survey type to link infrastructure, Q34 error ellipses, Q50 redundant
-- observation, plus siblings (types of surveys, least squares, plane vs geodetic).
-- (Q1 leveling curvature/refraction multi_select shipped in S1.)
-- Idempotent: delete-by-tag then insert.

DELETE FROM question_bank WHERE 'fs-processes' = ANY(tags);

INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty, module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
-- Q5 mirror — survey type to link infrastructure
('fa340000-0000-0000-0000-000000000001',
 'The most effective way to link the proposed infrastructure of a development to the existing adjacent infrastructure is determined by a:',
 'multiple_choice','["boundary survey","topographic survey","control survey","geodetic survey"]'::jsonb,'topographic survey',
 'A topographic survey captures the existing natural terrain and man-made features (roads, drainage, utilities), so it is what ties the proposed infrastructure to the existing adjacent infrastructure. (A control survey only sets the reference framework.)',
 'medium','f5000001-0000-0000-0000-000000000001','FS',ARRAY['fs-processes','fs-m1','fs-exam-mirror','genre:measurement-error']::text[],true,'approved','[{"type":"handbook","label":"Types of surveys"}]'::jsonb,false,0.01),
-- Q5 sibling — what a topographic survey shows
('fa340000-0000-0000-0000-000000000002',
 'A topographic survey primarily depicts:',
 'multiple_choice','["only property boundaries and corners","the natural terrain (relief/contours) and man-made features","only the geodetic control network","only subsurface utilities"]'::jsonb,'the natural terrain (relief/contours) and man-made features',
 'A topographic survey maps relief (contours/spot elevations) plus planimetric features — both natural (streams, tree lines) and man-made (roads, buildings, utilities).',
 'easy','f5000001-0000-0000-0000-000000000001','FS',ARRAY['fs-processes','fs-m1','genre:measurement-error']::text[],true,'approved','[]'::jsonb,false,0.01),
-- sibling — control survey purpose
('fa340000-0000-0000-0000-000000000003',
 'The primary purpose of a control survey is to:',
 'multiple_choice','["determine property ownership lines","establish an accurate network of horizontal and/or vertical reference points","map the existing terrain","stake construction offsets"]'::jsonb,'establish an accurate network of horizontal and/or vertical reference points',
 'A control survey establishes a framework of monumented points of known position/elevation to which all subsequent mapping, boundary, and construction work is referenced.',
 'easy','f5000001-0000-0000-0000-000000000001','FS',ARRAY['fs-processes','fs-m1','genre:measurement-error']::text[],true,'approved','[]'::jsonb,false,0.01),
-- sibling — boundary/cadastral survey
('fa340000-0000-0000-0000-000000000004',
 'A survey performed to locate, describe, or re-establish the lines and corners of a parcel of land is a:',
 'multiple_choice','["topographic survey","boundary (cadastral) survey","hydrographic survey","construction survey"]'::jsonb,'boundary (cadastral) survey',
 'A boundary (cadastral) survey locates, marks, describes, or re-establishes property lines and corners; cadastral specifically refers to surveys of the public lands and property boundaries.',
 'easy','f5000001-0000-0000-0000-000000000001','FS',ARRAY['fs-processes','fs-m1','genre:measurement-error']::text[],true,'approved','[]'::jsonb,false,0.01),
-- sibling — plane vs geodetic survey
('fa340000-0000-0000-0000-000000000005',
 'A plane survey differs from a geodetic survey in that a plane survey:',
 'multiple_choice','["accounts for the curvature of the earth","neglects the curvature of the earth (treats it as flat), suitable for limited areas","can only be done with GNSS","is always more accurate"]'::jsonb,'neglects the curvature of the earth (treats it as flat), suitable for limited areas',
 'A plane survey treats the earth''s surface as a flat plane, which is acceptable over limited areas. A geodetic survey accounts for the earth''s curvature and is used over large areas / for high accuracy.',
 'medium','f5000001-0000-0000-0000-000000000001','FS',ARRAY['fs-processes','fs-m1','genre:measurement-error']::text[],true,'approved','[]'::jsonb,false,0.01),
-- Q34 mirror — error ellipses
('fa340000-0000-0000-0000-000000000006',
 'In a least squares adjustment, error ellipses depict a two-dimensional representation of the uncertainties of the:',
 'multiple_choice','["adjusted coordinates","adjusted angles","raw measurements","unadjusted coordinates"]'::jsonb,'adjusted coordinates',
 'Error ellipses graphically show the positional uncertainty (and its directionality) of the ADJUSTED station coordinates produced by the least squares adjustment.',
 'medium','f5000004-0000-0000-0000-000000000004','FS',ARRAY['fs-processes','fs-m4','fs-exam-mirror','genre:traverse-cogo']::text[],true,'approved','[{"type":"handbook","label":"Least squares — error ellipses"}]'::jsonb,false,0.01),
-- Q34 sibling — semi-major axis
('fa340000-0000-0000-0000-000000000007',
 'The semi-major axis of a station''s standard error ellipse indicates the:',
 'multiple_choice','["direction and magnitude of maximum positional uncertainty","elevation error","direction of minimum uncertainty","measurement of the largest angle"]'::jsonb,'direction and magnitude of maximum positional uncertainty',
 'The semi-major axis gives the direction and size of the greatest positional uncertainty; the semi-minor axis (perpendicular) gives the least. A near-circular ellipse indicates uniform precision.',
 'medium','f5000004-0000-0000-0000-000000000004','FS',ARRAY['fs-processes','fs-m4','genre:traverse-cogo']::text[],true,'approved','[]'::jsonb,false,0.01),
-- Q50 mirror — redundant observation
('fa340000-0000-0000-0000-000000000008',
 'As the instrument operator, you are asked to take a redundant observation to strengthen a least squares analysis of the field traverse network. One way to do this is to:',
 'multiple_choice','["turn an extra angle between two control points that were not traversed sequentially","determine the prism offset for your instrument","re-level the instrument","check the optical plumb of the tribrach"]'::jsonb,'turn an extra angle between two control points that were not traversed sequentially',
 'Redundant observations are extra measurements beyond the minimum needed, giving the adjustment geometric checks. Turning an extra angle between non-sequential control points adds a redundant observation; the other choices are instrument setup/calibration tasks.',
 'medium','f5000004-0000-0000-0000-000000000004','FS',ARRAY['fs-processes','fs-m4','fs-exam-mirror','genre:traverse-cogo']::text[],true,'approved','[{"type":"handbook","label":"Least squares — redundancy"}]'::jsonb,false,0.01),
-- sibling — what least squares minimizes
('fa340000-0000-0000-0000-000000000009',
 'A least squares adjustment finds the most probable values by minimizing the:',
 'multiple_choice','["number of observations","sum of the weighted squared residuals","largest single residual","total traverse length"]'::jsonb,'sum of the weighted squared residuals',
 'Least squares minimizes Σ(w·v²), the sum of the weighted squares of the residuals, yielding the most probable values and rigorous error statistics.',
 'medium','f5000004-0000-0000-0000-000000000004','FS',ARRAY['fs-processes','fs-m4','genre:traverse-cogo']::text[],true,'approved','[]'::jsonb,false,0.01),
-- sibling — redundancy/degrees of freedom
('fa340000-0000-0000-0000-00000000000a',
 'In a survey network, having more observations than the minimum required to determine the unknowns provides:',
 'multiple_choice','["nothing useful","redundancy that allows blunder detection and error estimation","a guarantee of no error","fewer degrees of freedom than unknowns"]'::jsonb,'redundancy that allows blunder detection and error estimation',
 'Redundant (extra) observations create degrees of freedom, enabling the adjustment to detect blunders, distribute misclosure, and estimate the precision of the results.',
 'medium','f5000004-0000-0000-0000-000000000004','FS',ARRAY['fs-processes','fs-m4','genre:traverse-cogo']::text[],true,'approved','[]'::jsonb,false,0.01);
