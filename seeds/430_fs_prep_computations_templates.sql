-- 430_fs_prep_computations_templates.sql
-- FS Exam Alignment Buildout — Slice S14.
-- Survey Computations (NCEES Cat 5) exam-mirror questions as regenerable dynamic
-- templates: Q35 fractional-lot area, Q36 rounded-corner lot area (+figure),
-- Q37 curve tangent-chord angle = I/2 (+figure), Q38 sag vertical-curve low
-- point, Q33 trig leveling, Q40 slope→horizontal. (Q32 traverse-adjustment order
-- is the S2 ordering question.) Idempotent: delete-by-tag then insert.

DELETE FROM question_bank WHERE 'fs-computations' = ANY(tags);
DELETE FROM problem_templates WHERE 'fs-computations' = ANY(tags);

INSERT INTO problem_templates
  (id, name, description, category, subcategory, question_type, difficulty, question_template, answer_formula, answer_format, parameters, computed_vars, solution_steps_template, options_generator, explanation_template, module_id, exam_category, tags, diagram, is_active, created_by)
VALUES
-- Q35 — fractional government lot area (trapezoid), in acres
('fa30f000-0000-0000-0000-000000000001',
 'Fractional government lot area','Area of a fractional PLSS lot from its four recorded sides (chains).',
 'FS — Survey Computations','Areas','numeric_input','hard',
 'The original government record of a fractional lot shows the following sides in chains: north {{nSide:f2}}, south {{sSide:f2}}, east {{eSide:f2}}, west {{wSide:f2}}. The area of the lot (acres) is most nearly:',
 '((eSide+wSide)/2)*((nSide+sSide)/2)/10','{"decimals":2,"unit":"acres","tolerance":0.03}',
 '[{"name":"nSide","type":"float","min":19,"max":21,"decimals":2},{"name":"sSide","type":"float","min":19,"max":21,"decimals":2},{"name":"eSide","type":"float","min":18,"max":20,"decimals":2},{"name":"wSide","type":"float","min":18,"max":20,"decimals":2}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Trapezoid area = avg(E,W) × avg(N,S)","calculation_template":"(({{eSide:f2}}+{{wSide:f2}})/2) × (({{nSide:f2}}+{{sSide:f2}})/2)"},{"step_number":2,"title":"Convert sq chains → acres (÷10)","result_template":"{{_answer}} acres"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Treat the lot as a trapezoid: area = [(E+W)/2]·[(N+S)/2] sq chains, then ÷10 sq ch/acre = {{_answer}} acres.',
 'f5000005-0000-0000-0000-000000000005','FS',
 ARRAY['fs-computations','fs-m5','fs-dynamic','fs-exam-mirror','genre:areas-volumes']::text[],NULL,true,'fs:m5'),

-- Q36 — rounded-corner lot area (+figure)
('fa30f000-0000-0000-0000-000000000002',
 'Lot area with a rounded corner','Area of a rectangular lot with one 90° corner replaced by an arc.',
 'FS — Survey Computations','Areas','numeric_input','medium',
 'A {{W}}-ft × {{L}}-ft lot, otherwise rectangular, has one corner rounded by a curve of radius {{r}} ft (central angle 90°). The area of the lot (ft²) is most nearly:',
 'L*W - r*r*(1 - PI/4)','{"decimals":0,"unit":"ft^2","tolerance":1}',
 '[{"name":"L","type":"choice","choices":[100,120,150,180]},{"name":"W","type":"choice","choices":[50,60,75]},{"name":"r","type":"choice","choices":[15,20,25]}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Area = L·W − (corner square − quarter circle)","calculation_template":"{{L}}·{{W}} − ({{r}}² − π·{{r}}²/4)"},{"step_number":2,"title":"Area","result_template":"{{_answer}} ft²"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Full rectangle minus the material removed at the rounded corner: A = L·W − [r² − πr²/4] = {{L}}·{{W}} − {{r}}²(1 − π/4) = {{_answer}} ft².',
 'f5000005-0000-0000-0000-000000000005','FS',
 ARRAY['fs-computations','fs-m5','fs-dynamic','fs-exam-mirror','genre:areas-volumes']::text[],
 '{"type":"roundedLot","lengthVar":"L","widthVar":"W","radiusVar":"r"}'::jsonb,true,'fs:m5'),

-- Q37 — curve tangent-chord (deflection) angle = I/2 (+figure)
('fa30f000-0000-0000-0000-000000000003',
 'Tangent-chord angle of a horizontal curve','Deflection angle from the back tangent to the long chord at the PC.',
 'FS — Survey Computations','Horizontal curves','numeric_input','medium',
 'For the horizontal curve shown (R = {{R}} ft, central angle I = {{I}}°), the angle between the back tangent (PC→PI) and the long chord (PC→PT), measured at the PC, is (in degrees):',
 'I/2','{"decimals":2,"unit":"deg","tolerance":0.05}',
 '[{"name":"R","type":"choice","choices":[400,500,600,800,1000]},{"name":"I","type":"integer","min":30,"max":110}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"The tangent-chord (deflection) angle at the PC = half the central angle","calculation_template":"I/2 = {{I}}°/2"},{"step_number":2,"title":"Angle","result_template":"{{_answer}}°"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'The deflection angle between the back tangent and the long chord at the PC equals half the central angle: I/2 = {{I}}°/2 = {{_answer}}°.',
 'f5000005-0000-0000-0000-000000000005','FS',
 ARRAY['fs-computations','fs-m5','fs-dynamic','fs-exam-mirror','genre:horizontal-curves']::text[],
 '{"type":"curve","rVar":"R","iVar":"I"}'::jsonb,true,'fs:m5'),

-- Q38 — sag vertical curve low point (distance from BVC)
('fa30f000-0000-0000-0000-000000000004',
 'Sag vertical curve low point','Distance from the BVC to the low point of a sag vertical curve.',
 'FS — Survey Computations','Vertical curves','numeric_input','medium',
 'A sag vertical curve is {{L}} ft long with an entering grade of {{g1}}% and an exiting grade of {{g2}}%. The low point is located how many feet beyond the BVC (PC)?',
 '-g1*L/(g2-g1)','{"decimals":1,"unit":"ft","tolerance":0.5}',
 '[{"name":"g1","type":"choice","choices":[-1,-1.5,-2,-2.5,-3]},{"name":"g2","type":"choice","choices":[2,2.5,3,3.5,4]},{"name":"L","type":"choice","choices":[300,400,500,600]}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"x = −g1·L / (g2 − g1)","calculation_template":"−({{g1}})·{{L}} / ({{g2}} − ({{g1}}))"},{"step_number":2,"title":"Distance from BVC","result_template":"{{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'The turning point is where the grade reaches zero: x = −g1·L/(g2 − g1) = {{_answer}} ft beyond the BVC.',
 'f5000005-0000-0000-0000-000000000005','FS',
 ARRAY['fs-computations','fs-m5','fs-dynamic','fs-exam-mirror','genre:vertical-curves']::text[],NULL,true,'fs:m5'),

-- Q33 — trigonometric leveling elevation
('fa30f000-0000-0000-0000-000000000005',
 'Trigonometric leveling elevation','Elevation of a point from a total-station slope distance and depression angle.',
 'FS — Survey Computations','Trigonometric leveling','numeric_input','hard',
 'A total station {{hi}} ft above a benchmark (elevation {{elevBM:f2}} ft) measures a depression angle of {{angleDeg:f2}}° and a slope distance of {{S:f2}} ft to a reflector {{rod:f2}} ft above point B. Ignoring curvature and refraction, the elevation of B (ft) is most nearly:',
 'elevBM + hi - S*sin(toRad(angleDeg)) - rod','{"decimals":2,"unit":"ft","tolerance":0.05}',
 '[{"name":"elevBM","type":"float","min":600,"max":1200,"decimals":2},{"name":"hi","type":"float","min":4.5,"max":5.5,"decimals":2},{"name":"angleDeg","type":"float","min":2,"max":5,"decimals":2},{"name":"S","type":"float","min":400,"max":800,"decimals":2},{"name":"rod","type":"float","min":4,"max":6,"decimals":2}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"ELEV_B = ELEV_BM + HI − S·sin(angle) − rod","calculation_template":"{{elevBM:f2}} + {{hi:f2}} − {{S:f2}}·sin({{angleDeg:f2}}°) − {{rod:f2}}"},{"step_number":2,"title":"Elevation of B","result_template":"{{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'ELEV_B = ELEV_BM + HI − S·sin(angle) − rod = {{elevBM:f2}} + {{hi:f2}} − {{S:f2}}·sin({{angleDeg:f2}}°) − {{rod:f2}} = {{_answer}} ft (the depression angle lowers the reflector).',
 'f5000002-0000-0000-0000-000000000002','FS',
 ARRAY['fs-computations','fs-m2','fs-dynamic','fs-exam-mirror','genre:leveling']::text[],NULL,true,'fs:m2'),

-- Q40 — slope distance to horizontal
('fa30f000-0000-0000-0000-000000000006',
 'Slope distance to horizontal','Reduce a slope distance on a percent grade to horizontal.',
 'FS — Survey Computations','Distance reduction','numeric_input','medium',
 'A survey crew tapes {{S}}.00 ft along a straight rail on a {{gradePct}}% grade. Reduced to a horizontal measurement, the distance (ft) is most nearly:',
 'sqrt(S*S - (S*gradePct/100)*(S*gradePct/100))','{"decimals":2,"unit":"ft","tolerance":0.05}',
 '[{"name":"S","type":"choice","choices":[1000,1500,2000,2500]},{"name":"gradePct","type":"choice","choices":[3,4,5,6,8]}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Vertical = grade × slope; horizontal = √(S² − V²)","calculation_template":"√({{S}}² − ({{S}}·{{gradePct}}%)²)"},{"step_number":2,"title":"Horizontal distance","result_template":"{{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'The rise is V = grade·S = {{S}}·{{gradePct}}%; horizontal = √(S² − V²) = {{_answer}} ft.',
 'f5000003-0000-0000-0000-000000000003','FS',
 ARRAY['fs-computations','fs-m3','fs-dynamic','fs-exam-mirror','genre:distance-edm']::text[],NULL,true,'fs:m3');

-- linked question_bank rows
INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty, module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, template_id, tolerance)
VALUES
('fa30b000-0000-0000-0000-000000000001','(dynamic — fractional lot area)','numeric_input','[]'::jsonb,'0','Trapezoid area of a fractional lot in acres.','hard','f5000005-0000-0000-0000-000000000005','FS',ARRAY['fs-computations','fs-m5','fs-dynamic']::text[],true,'approved','[{"type":"handbook","label":"Areas"}]'::jsonb,true,'fa30f000-0000-0000-0000-000000000001',0.03),
('fa30b000-0000-0000-0000-000000000002','(dynamic — rounded corner lot area)','numeric_input','[]'::jsonb,'0','Rectangle minus the rounded-corner sliver.','medium','f5000005-0000-0000-0000-000000000005','FS',ARRAY['fs-computations','fs-m5','fs-dynamic']::text[],true,'approved','[{"type":"handbook","label":"Areas"}]'::jsonb,true,'fa30f000-0000-0000-0000-000000000002',1),
('fa30b000-0000-0000-0000-000000000003','(dynamic — curve tangent-chord angle)','numeric_input','[]'::jsonb,'0','Deflection angle = I/2.','medium','f5000005-0000-0000-0000-000000000005','FS',ARRAY['fs-computations','fs-m5','fs-dynamic']::text[],true,'approved','[{"type":"handbook","label":"Horizontal curves"}]'::jsonb,true,'fa30f000-0000-0000-0000-000000000003',0.05),
('fa30b000-0000-0000-0000-000000000004','(dynamic — vertical curve low point)','numeric_input','[]'::jsonb,'0','x = −g1·L/(g2−g1) from the BVC.','medium','f5000005-0000-0000-0000-000000000005','FS',ARRAY['fs-computations','fs-m5','fs-dynamic']::text[],true,'approved','[{"type":"handbook","label":"Vertical curves"}]'::jsonb,true,'fa30f000-0000-0000-0000-000000000004',0.5),
('fa30b000-0000-0000-0000-000000000005','(dynamic — trig leveling)','numeric_input','[]'::jsonb,'0','ELEV_B = ELEV_BM + HI − S·sin(angle) − rod.','hard','f5000002-0000-0000-0000-000000000002','FS',ARRAY['fs-computations','fs-m2','fs-dynamic']::text[],true,'approved','[{"type":"handbook","label":"Trigonometric leveling"}]'::jsonb,true,'fa30f000-0000-0000-0000-000000000005',0.05),
('fa30b000-0000-0000-0000-000000000006','(dynamic — slope to horizontal)','numeric_input','[]'::jsonb,'0','Horizontal = √(S² − V²).','medium','f5000003-0000-0000-0000-000000000003','FS',ARRAY['fs-computations','fs-m3','fs-dynamic']::text[],true,'approved','[{"type":"handbook","label":"Distance reduction"}]'::jsonb,true,'fa30f000-0000-0000-0000-000000000006',0.05);
