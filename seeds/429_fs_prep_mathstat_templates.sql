-- 429_fs_prep_mathstat_templates.sql
-- FS Exam Alignment Buildout — Slice S13.
-- Applied Mathematics & Statistics (NCEES Cat 7) exam-mirror questions as
-- regenerable dynamic templates: Q48 error propagation (perimeter), Q46 tower
-- height from two angles (WITH the towerTwoAngles figure), Q29 spherical
-- triangle, Q49 feet-inches→decimal feet, Q39 order of operations. Plus a static
-- Q47 (std dev of the mean from a data set) mirror; the parametric σ→σ_m form is
-- already covered by template fb015000 from seed 368.
-- Idempotent: delete-by-tag then insert.

DELETE FROM question_bank WHERE 'fs-mathstat' = ANY(tags);
DELETE FROM problem_templates WHERE 'fs-mathstat' = ANY(tags);

INSERT INTO problem_templates
  (id, name, description, category, subcategory, question_type, difficulty, question_template, answer_formula, answer_format, parameters, computed_vars, solution_steps_template, options_generator, explanation_template, module_id, exam_category, tags, diagram, is_active, created_by)
VALUES
-- Q48 — error propagation of a perimeter
('fa29f000-0000-0000-0000-000000000001',
 'Error propagation — perimeter of a rectangle',
 'Uncertainty in the perimeter of a rectangle from independent side-length uncertainties.',
 'FS — Applied Mathematics and Statistics','Error propagation','numeric_input','hard',
 'A surveyor measures the two adjacent sides of a rectangular lot as {{L:f2}} ± {{sL:f2}} ft and {{W:f2}} ± {{sW:f2}} ft. These measurements are independent. The uncertainty (ft) in the calculated perimeter is most nearly:',
 '2*sqrt(sL*sL + sW*sW)','{"decimals":2,"unit":"ft","tolerance":0.02}',
 '[{"name":"L","type":"float","min":50,"max":150,"decimals":2},{"name":"W","type":"float","min":80,"max":200,"decimals":2},{"name":"sL","type":"choice","choices":[0.10,0.15,0.20]},{"name":"sW","type":"choice","choices":[0.15,0.20,0.25]}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Perimeter = 2L + 2W → σ = √[(2σ_L)² + (2σ_W)²]","calculation_template":"√[(2·{{sL:f2}})² + (2·{{sW:f2}})²]"},{"step_number":2,"title":"Uncertainty","result_template":"{{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Perimeter = 2L + 2W, so σ_P = √[(2σ_L)² + (2σ_W)²] = 2√({{sL:f2}}² + {{sW:f2}}²) = {{_answer}} ft.',
 'f5000001-0000-0000-0000-000000000001','FS',
 ARRAY['fs-mathstat','fs-m1','fs-dynamic','fs-exam-mirror','genre:measurement-error']::text[],NULL,true,'fs:m1'),

-- Q46 — height of an inaccessible point from two angle stations (with figure)
('fa29f000-0000-0000-0000-000000000002',
 'Height from two angle stations',
 'Height of a tower/inaccessible point sighted from two setups d apart on a level baseline.',
 'FS — Applied Mathematics and Statistics','Trigonometry','numeric_input','hard',
 'To determine the height of a tower, a surveyor measures elevation angle A = {{alpha}}° to the top, then moves {{d}} ft toward the tower along level ground and measures angle B = {{beta}}°. The height of the tower (ft) is most nearly:',
 'd / ( (1/tan(toRad(alpha))) - (1/tan(toRad(beta))) )','{"decimals":2,"unit":"ft","tolerance":0.6}',
 '[{"name":"alpha","type":"integer","min":18,"max":30},{"name":"delta","type":"choice","choices":[12,15,18,20]},{"name":"d","type":"choice","choices":[80,100,120,150]}]'::jsonb,
 '[{"name":"beta","formula":"alpha+delta"}]'::jsonb,
 '[{"step_number":1,"title":"h = d / (cot A − cot B)","calculation_template":"{{d}} / (cot {{alpha}}° − cot {{beta}}°)"},{"step_number":2,"title":"Height","result_template":"{{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'From two stations d apart sighting the same top, h = d / (cot A − cot B) = {{d}} / (cot {{alpha}}° − cot {{beta}}°) = {{_answer}} ft.',
 'f5000003-0000-0000-0000-000000000003','FS',
 ARRAY['fs-mathstat','fs-m3','fs-dynamic','fs-exam-mirror','genre:angles-directions']::text[],
 '{"type":"towerTwoAngles","dVar":"d","alphaVar":"alpha","betaVar":"beta"}'::jsonb,true,'fs:m3'),

-- Q29 — spherical triangle (law of cosines for sides)
('fa29f000-0000-0000-0000-000000000003',
 'Spherical triangle — side from law of cosines',
 'Third side of a spherical triangle from two sides and the included angle.',
 'FS — Applied Mathematics and Statistics','Spherical trigonometry','numeric_input','hard',
 'On a spherical triangle, a = {{a}}°, b = {{b}}°, and the included angle C = {{C}}°. Find side c, in decimal degrees.',
 'toDeg(acos( cos(toRad(a))*cos(toRad(b)) + sin(toRad(a))*sin(toRad(b))*cos(toRad(C)) ))','{"decimals":3,"unit":"deg","tolerance":0.05}',
 '[{"name":"a","type":"integer","min":50,"max":80},{"name":"b","type":"integer","min":40,"max":70},{"name":"C","type":"integer","min":95,"max":140}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"cos c = cos a cos b + sin a sin b cos C","calculation_template":"cos c = cos{{a}}°·cos{{b}}° + sin{{a}}°·sin{{b}}°·cos{{C}}°"},{"step_number":2,"title":"c = arccos(...)","result_template":"{{_answer}}°"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Spherical law of cosines for sides: cos c = cos a cos b + sin a sin b cos C, so c = arccos(...) = {{_answer}}°.',
 'f5000006-0000-0000-0000-000000000006','FS',
 ARRAY['fs-mathstat','fs-m6','fs-dynamic','fs-exam-mirror','genre:gnss-geodesy']::text[],NULL,true,'fs:m6'),

-- Q49 — feet-inches (with fraction) to decimal feet
('fa29f000-0000-0000-0000-000000000004',
 'Feet-inches to decimal feet',
 'Convert a feet-inches-fraction plan dimension to decimal feet.',
 'FS — Applied Mathematics and Statistics','Unit conversion','numeric_input','easy',
 'An architectural plan shows a dimension of {{F}} ft {{I}} {{num}}/{{den}} in. Expressed in decimal feet, the dimension you should use is most nearly:',
 'F + (I + num/den)/12','{"decimals":2,"unit":"ft","tolerance":0.005}',
 '[{"name":"F","type":"integer","min":100,"max":800},{"name":"I","type":"integer","min":1,"max":11},{"name":"num","type":"choice","choices":[1,3,5,7]},{"name":"den","type":"choice","choices":[2,4,8]}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Inches → decimal feet","calculation_template":"{{F}} + ({{I}} + {{num}}/{{den}})/12"},{"step_number":2,"title":"Decimal feet","result_template":"{{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Convert the inches (including the fraction) to feet and add: {{F}} + ({{I}} + {{num}}/{{den}})/12 = {{_answer}} ft.',
 'f5000001-0000-0000-0000-000000000001','FS',
 ARRAY['fs-mathstat','fs-m1','fs-dynamic','fs-exam-mirror','genre:measurement-error']::text[],NULL,true,'fs:m1'),

-- Q39 — order of operations (spreadsheet/calculator)
('fa29f000-0000-0000-0000-000000000005',
 'Order of operations evaluation',
 'Evaluate an expression respecting exponent → multiply/divide → add precedence.',
 'FS — Applied Mathematics and Statistics','Computer applications','numeric_input','medium',
 'A spreadsheet evaluates A = B·C + D/C² with B = {{B}}, C = {{C}}, D = {{D}}. Following the standard order of operations, A is most nearly:',
 'B*C + D/pow(C,2)','{"decimals":2,"unit":"","tolerance":0.5}',
 '[{"name":"B","type":"integer","min":2,"max":6},{"name":"C","type":"choice","choices":[0.5,0.25,2,4]},{"name":"D","type":"integer","min":100,"max":200}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Exponent first, then multiply/divide, then add","calculation_template":"{{B}}·{{C}} + {{D}}/{{C}}²"},{"step_number":2,"title":"Result","result_template":"{{_answer}}"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Order of operations: exponent → multiply/divide → add. A = {{B}}·{{C}} + {{D}}/{{C}}² = {{_answer}}.',
 'f5000009-0000-0000-0000-000000000009','FS',
 ARRAY['fs-mathstat','fs-m9','fs-dynamic','fs-exam-mirror','genre:business-econ']::text[],NULL,true,'fs:m9');

-- linked question_bank rows that surface the dynamic templates
INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty, module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, template_id, tolerance)
VALUES
('fa29b000-0000-0000-0000-000000000001','(dynamic — perimeter error propagation)','numeric_input','[]'::jsonb,'0','σ_P = 2√(σ_L² + σ_W²).','hard','f5000001-0000-0000-0000-000000000001','FS',ARRAY['fs-mathstat','fs-m1','fs-dynamic']::text[],true,'approved','[{"type":"handbook","label":"Error propagation"}]'::jsonb,true,'fa29f000-0000-0000-0000-000000000001',0.02),
('fa29b000-0000-0000-0000-000000000002','(dynamic — tower height from two angles)','numeric_input','[]'::jsonb,'0','h = d/(cot A − cot B).','hard','f5000003-0000-0000-0000-000000000003','FS',ARRAY['fs-mathstat','fs-m3','fs-dynamic']::text[],true,'approved','[{"type":"handbook","label":"Trigonometry"}]'::jsonb,true,'fa29f000-0000-0000-0000-000000000002',0.6),
('fa29b000-0000-0000-0000-000000000003','(dynamic — spherical triangle side)','numeric_input','[]'::jsonb,'0','cos c = cos a cos b + sin a sin b cos C.','hard','f5000006-0000-0000-0000-000000000006','FS',ARRAY['fs-mathstat','fs-m6','fs-dynamic']::text[],true,'approved','[{"type":"handbook","label":"Spherical trigonometry"}]'::jsonb,true,'fa29f000-0000-0000-0000-000000000003',0.05),
('fa29b000-0000-0000-0000-000000000004','(dynamic — feet-inches to decimal feet)','numeric_input','[]'::jsonb,'0','Convert inches (with fraction) to feet and add.','easy','f5000001-0000-0000-0000-000000000001','FS',ARRAY['fs-mathstat','fs-m1','fs-dynamic']::text[],true,'approved','[{"type":"handbook","label":"Unit conversion"}]'::jsonb,true,'fa29f000-0000-0000-0000-000000000004',0.005),
('fa29b000-0000-0000-0000-000000000005','(dynamic — order of operations)','numeric_input','[]'::jsonb,'0','Exponent → mult/div → add.','medium','f5000009-0000-0000-0000-000000000009','FS',ARRAY['fs-mathstat','fs-m9','fs-dynamic']::text[],true,'approved','[{"type":"handbook","label":"Computer applications"}]'::jsonb,true,'fa29f000-0000-0000-0000-000000000005',0.5);

-- static Q47 mirror — standard deviation of the mean from a data set
INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty, module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
('fa290000-0000-0000-0000-000000000001',
 'An angle is measured 12 times with a 1" total station: 47°10''12", 47°10''08", 47°10''14", 47°10''15", 47°10''09", 47°10''11", 47°10''18", 47°10''16", 47°10''14", 47°10''15", 47°10''11", 47°10''10". The standard deviation of the mean is most nearly:',
 'multiple_choice',
 '["± 0.9\"","± 1.5\"","± 2.8\"","± 3.3\""]'::jsonb,
 '± 0.9"',
 'Work in seconds about the mean (12.75"). Σv² = 102.25, so the single-observation σ = √(102.25/11) = 3.04". The standard deviation of the mean = σ/√n = 3.04/√12 = 0.88 ≈ ±0.9". (The distractors use σ itself instead of σ/√n.)',
 'hard','f5000001-0000-0000-0000-000000000001','FS',
 ARRAY['fs-mathstat','fs-m1','fs-exam-mirror','genre:measurement-error']::text[],true,'approved','[{"type":"handbook","label":"Statistics — standard error of the mean"}]'::jsonb,false,0.01);
