-- seeds/376_fs_prep_dynamic_templates_v2.sql
-- SIT / FS exam-prep — second batch of dynamic problem_templates. All verified
-- through lib/problemEngine.generateFromTemplate (200 random generations each:
-- valid=true, always-finite answers; diagram renders where a spec is attached).

BEGIN;

INSERT INTO problem_templates
  (id, name, description, category, subcategory, question_type, difficulty,
   question_template, answer_formula, answer_format, parameters, computed_vars,
   solution_steps_template, options_generator, explanation_template,
   module_id, exam_category, tags, diagram, is_active)
VALUES
('a5000002-0000-0000-0000-000000000001',
 'Leg departure', 'Departure (E–W component) of a traverse leg.',
 'Traversing & COGO', 'Departure', 'numeric_input', 'easy',
 'A traverse leg has azimuth {{az:f0}}° and length {{dist:f2}} ft. Compute its departure (E–W component), in ft.',
 'dist * sin(toRad(az))',
 '{"decimals":2,"unit":"ft","tolerance":0.05}'::jsonb,
 '[{"name":"az","type":"integer","min":0,"max":359},{"name":"dist","type":"float","min":100,"max":800,"decimals":2}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Formula","calculation_template":"Departure = D·sin(Az) = {{dist:f2}}·sin({{az:f0}}°)"},{"step_number":2,"title":"Result","result_template":"{{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Departure = D·sin(Az); positive for easterly, negative for westerly directions.',
 'f5000004-0000-0000-0000-000000000004', 'FS',
 ARRAY['fs-buildout-v6','genre:traverse-cogo','fs-m4','dynamic']::text[],
 '{"type":"compass","azVar":"az","title":"Azimuth"}'::jsonb, true),

('a5000002-0000-0000-0000-000000000002',
 'Curve external distance', 'External distance of a circular curve.',
 'Areas, Volumes & Curves', 'Horizontal curve', 'numeric_input', 'medium',
 'A circular curve has R = {{R:f0}} ft and Δ = {{I:f0}}°. Compute the external distance E, in ft.',
 'R * (1/cos(toRad(I/2)) - 1)',
 '{"decimals":2,"unit":"ft","tolerance":0.05}'::jsonb,
 '[{"name":"R","type":"integer","min":300,"max":1500},{"name":"I","type":"integer","min":10,"max":80}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Formula","calculation_template":"E = R·(sec(Δ/2) − 1)"},{"step_number":2,"title":"Result","result_template":"{{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'External distance E = R·(sec(Δ/2) − 1) is the distance from the PI to the midpoint of the curve.',
 'f5000005-0000-0000-0000-000000000005', 'FS',
 ARRAY['fs-buildout-v6','genre:horizontal-curves','fs-m5','dynamic']::text[],
 '{"type":"curve","rVar":"R","iVar":"I","title":"Circular curve"}'::jsonb, true),

('a5000002-0000-0000-0000-000000000003',
 'Curve middle ordinate', 'Middle ordinate of a circular curve.',
 'Areas, Volumes & Curves', 'Horizontal curve', 'numeric_input', 'easy',
 'A circular curve has R = {{R:f0}} ft and Δ = {{I:f0}}°. Compute the middle ordinate M, in ft.',
 'R * (1 - cos(toRad(I/2)))',
 '{"decimals":2,"unit":"ft","tolerance":0.05}'::jsonb,
 '[{"name":"R","type":"integer","min":300,"max":1500},{"name":"I","type":"integer","min":10,"max":80}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Formula","calculation_template":"M = R·(1 − cos(Δ/2))"},{"step_number":2,"title":"Result","result_template":"{{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Middle ordinate M = R·(1 − cos(Δ/2)) is the distance from the midpoint of the long chord to the curve.',
 'f5000005-0000-0000-0000-000000000005', 'FS',
 ARRAY['fs-buildout-v6','genre:horizontal-curves','fs-m5','dynamic']::text[],
 '{"type":"curve","rVar":"R","iVar":"I","title":"Circular curve"}'::jsonb, true),

('a5000002-0000-0000-0000-000000000004',
 'Steel tape temperature correction', 'Temperature correction for a steel tape.',
 'Distance & Angle Measurement', 'Taping corrections', 'numeric_input', 'medium',
 'A distance of {{L:f2}} ft is taped at {{Temp:f0}}°F (steel tape standardized at 68°F, α = 0.00000645/°F). Compute the temperature correction, in ft (signed).',
 '0.00000645 * L * (Temp - 68)',
 '{"decimals":3,"unit":"ft","tolerance":0.005}'::jsonb,
 '[{"name":"L","type":"float","min":100,"max":1000,"decimals":2},{"name":"Temp","type":"integer","min":20,"max":110}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Formula","calculation_template":"Ct = α·L·(T − 68) = 0.00000645·{{L:f2}}·({{Temp:f0}} − 68)"},{"step_number":2,"title":"Result","result_template":"{{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Ct = α·L·(T − T0). Positive when the field temperature exceeds the 68°F standard (the tape expands).',
 'f5000003-0000-0000-0000-000000000003', 'FS',
 ARRAY['fs-buildout-v6','genre:distance-edm','fs-m3','dynamic']::text[],
 NULL, true),

('a5000002-0000-0000-0000-000000000005',
 'Right-triangle parcel area', 'Area of a right-triangular parcel by its legs.',
 'Areas, Volumes & Curves', 'Area', 'numeric_input', 'medium',
 'A right-triangular parcel has legs of {{base:f0}} ft (E–W) and {{height:f0}} ft (N–S). Compute its area, in square feet.',
 '0.5 * base * height',
 '{"decimals":0,"unit":"sq ft","tolerance":1}'::jsonb,
 '[{"name":"base","type":"integer","min":150,"max":600},{"name":"height","type":"integer","min":150,"max":600}]'::jsonb,
 '[{"name":"zero","formula":"0"}]'::jsonb,
 '[{"step_number":1,"title":"Formula","calculation_template":"A = ½·base·height = ½·{{base:f0}}·{{height:f0}}"},{"step_number":2,"title":"Result","result_template":"{{_answer}} sq ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'For a right triangle, Area = ½·base·height. 1 acre = 43,560 sq ft.',
 'f5000005-0000-0000-0000-000000000005', 'FS',
 ARRAY['fs-buildout-v6','genre:areas-volumes','fs-m5','dynamic']::text[],
 '{"type":"triangle","vertices":[{"n":0,"e":0,"label":"A"},{"nVar":"zero","eVar":"base","label":"B"},{"nVar":"height","eVar":"base","label":"C"}],"title":"Parcel"}'::jsonb, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, exam_category, tags, is_published, review_status, study_references,
   is_dynamic, template_id, tolerance)
VALUES
('fbd76000-0000-0000-0000-000000000001','(dynamic — leg departure)','numeric_input','[]'::jsonb,'0','Fresh each attempt.','easy','f5000004-0000-0000-0000-000000000004','FS',ARRAY['fs-buildout-v6','genre:traverse-cogo','fs-m4','dynamic']::text[],true,'approved','[]'::jsonb,true,'a5000002-0000-0000-0000-000000000001',0.05),
('fbd76000-0000-0000-0000-000000000002','(dynamic — curve external)','numeric_input','[]'::jsonb,'0','Fresh each attempt.','medium','f5000005-0000-0000-0000-000000000005','FS',ARRAY['fs-buildout-v6','genre:horizontal-curves','fs-m5','dynamic']::text[],true,'approved','[]'::jsonb,true,'a5000002-0000-0000-0000-000000000002',0.05),
('fbd76000-0000-0000-0000-000000000003','(dynamic — curve middle ordinate)','numeric_input','[]'::jsonb,'0','Fresh each attempt.','easy','f5000005-0000-0000-0000-000000000005','FS',ARRAY['fs-buildout-v6','genre:horizontal-curves','fs-m5','dynamic']::text[],true,'approved','[]'::jsonb,true,'a5000002-0000-0000-0000-000000000003',0.05),
('fbd76000-0000-0000-0000-000000000004','(dynamic — tape temperature correction)','numeric_input','[]'::jsonb,'0','Fresh each attempt.','medium','f5000003-0000-0000-0000-000000000003','FS',ARRAY['fs-buildout-v6','genre:distance-edm','fs-m3','dynamic']::text[],true,'approved','[]'::jsonb,true,'a5000002-0000-0000-0000-000000000004',0.005),
('fbd76000-0000-0000-0000-000000000005','(dynamic — right-triangle area)','numeric_input','[]'::jsonb,'0','Fresh each attempt.','medium','f5000005-0000-0000-0000-000000000005','FS',ARRAY['fs-buildout-v6','genre:areas-volumes','fs-m5','dynamic']::text[],true,'approved','[]'::jsonb,true,'a5000002-0000-0000-0000-000000000005',1)
ON CONFLICT (id) DO NOTHING;

COMMIT;
