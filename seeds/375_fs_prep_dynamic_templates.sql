-- seeds/375_fs_prep_dynamic_templates.sql
-- SIT / FS exam-prep — dynamic problem_templates (parametric generators) each
-- with an attached diagram spec, so the practice generator and module quizzes
-- produce fresh, varied problems whose figure matches the randomized values.
-- All four were verified through lib/problemEngine.generateFromTemplate (200
-- random generations each: valid=true, always-finite answers, diagram renders).

BEGIN;

INSERT INTO problem_templates
  (id, name, description, category, subcategory, question_type, difficulty,
   question_template, answer_formula, answer_format, parameters, computed_vars,
   solution_steps_template, options_generator, explanation_template,
   module_id, exam_category, tags, diagram, is_active)
VALUES
('a5000001-0000-0000-0000-000000000001',
 'Inverse distance from coordinates', 'Distance between two points from their N/E coordinates.',
 'Traversing & COGO', 'Inverse', 'numeric_input', 'medium',
 'Point A is (N {{aN:f2}}, E {{aE:f2}}) and point B is (N {{bN:f2}}, E {{bE:f2}}). Compute the horizontal distance A→B, in ft.',
 'sqrt(dN*dN + dE*dE)',
 '{"decimals":2,"unit":"ft","tolerance":0.05}'::jsonb,
 '[{"name":"aN","type":"float","min":1000,"max":1500,"decimals":2},{"name":"aE","type":"float","min":2000,"max":2500,"decimals":2},{"name":"dN","type":"float","min":100,"max":800,"decimals":2},{"name":"dE","type":"float","min":100,"max":800,"decimals":2}]'::jsonb,
 '[{"name":"bN","formula":"aN+dN"},{"name":"bE","formula":"aE+dE"}]'::jsonb,
 '[{"step_number":1,"title":"Coordinate differences","calculation_template":"ΔN = {{bN:f2}} − {{aN:f2}} = {{dN:f2}};  ΔE = {{bE:f2}} − {{aE:f2}} = {{dE:f2}}"},{"step_number":2,"title":"Distance","calculation_template":"D = √(ΔN² + ΔE²)"},{"step_number":3,"title":"Result","result_template":"{{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'The inverse computes distance (and direction) from coordinates: D = √(ΔN² + ΔE²).',
 'f5000004-0000-0000-0000-000000000004', 'FS',
 ARRAY['fs-buildout-v6','genre:traverse-cogo','fs-m4','dynamic']::text[],
 '{"type":"inverse","aNVar":"aN","aEVar":"aE","bNVar":"bN","bEVar":"bE","aLabel":"A","bLabel":"B","title":"Inverse A→B"}'::jsonb,
 true),

('a5000001-0000-0000-0000-000000000002',
 'Curve tangent distance', 'Tangent distance of a circular curve from R and Δ.',
 'Areas, Volumes & Curves', 'Horizontal curve', 'numeric_input', 'medium',
 'A circular curve has radius R = {{R:f0}} ft and central angle Δ = {{I:f0}}°. Compute the tangent distance T, in ft.',
 'R * tan(toRad(I/2))',
 '{"decimals":2,"unit":"ft","tolerance":0.05}'::jsonb,
 '[{"name":"R","type":"integer","min":300,"max":1500},{"name":"I","type":"integer","min":10,"max":80}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Formula","calculation_template":"T = R·tan(Δ/2) = {{R:f0}}·tan({{I:f0}}/2)"},{"step_number":2,"title":"Result","result_template":"{{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'For a simple circular curve, T = R·tan(Δ/2).',
 'f5000005-0000-0000-0000-000000000005', 'FS',
 ARRAY['fs-buildout-v6','genre:horizontal-curves','fs-m5','dynamic']::text[],
 '{"type":"curve","rVar":"R","iVar":"I","title":"Circular curve"}'::jsonb,
 true),

('a5000001-0000-0000-0000-000000000003',
 'Leg latitude', 'Latitude (N–S component) of a traverse leg from azimuth and distance.',
 'Traversing & COGO', 'Latitude', 'numeric_input', 'easy',
 'A traverse leg has azimuth {{az:f0}}° and length {{dist:f2}} ft. Compute its latitude (N–S component), in ft.',
 'dist * cos(toRad(az))',
 '{"decimals":2,"unit":"ft","tolerance":0.05}'::jsonb,
 '[{"name":"az","type":"integer","min":0,"max":359},{"name":"dist","type":"float","min":100,"max":800,"decimals":2}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Formula","calculation_template":"Latitude = D·cos(Az) = {{dist:f2}}·cos({{az:f0}}°)"},{"step_number":2,"title":"Result","result_template":"{{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Latitude = D·cos(Az); it is positive for northerly and negative for southerly directions.',
 'f5000004-0000-0000-0000-000000000004', 'FS',
 ARRAY['fs-buildout-v6','genre:traverse-cogo','fs-m4','dynamic']::text[],
 '{"type":"compass","azVar":"az","title":"Azimuth"}'::jsonb,
 true),

('a5000001-0000-0000-0000-000000000004',
 'Curve arc length', 'Arc length of a circular curve from R and Δ.',
 'Areas, Volumes & Curves', 'Horizontal curve', 'numeric_input', 'medium',
 'A circular curve has radius R = {{R:f0}} ft and central angle Δ = {{I:f0}}°. Compute the arc length L, in ft.',
 'R * I * PI / 180',
 '{"decimals":2,"unit":"ft","tolerance":0.05}'::jsonb,
 '[{"name":"R","type":"integer","min":300,"max":1500},{"name":"I","type":"integer","min":10,"max":80}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Formula","calculation_template":"L = R·Δ·π/180 = {{R:f0}}·{{I:f0}}·π/180"},{"step_number":2,"title":"Result","result_template":"{{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Arc length L = R·Δ·π/180 with Δ in degrees.',
 'f5000005-0000-0000-0000-000000000005', 'FS',
 ARRAY['fs-buildout-v6','genre:horizontal-curves','fs-m5','dynamic']::text[],
 '{"type":"curve","rVar":"R","iVar":"I","title":"Circular curve"}'::jsonb,
 true)
ON CONFLICT (id) DO NOTHING;

-- Surface each template in module quizzes as a fresh-generated dynamic question.
INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, exam_category, tags, is_published, review_status, study_references,
   is_dynamic, template_id, tolerance)
VALUES
('fbd75000-0000-0000-0000-000000000001','(dynamic — inverse distance)','numeric_input','[]'::jsonb,'0',
 'Computed from randomized coordinates each attempt.','medium','f5000004-0000-0000-0000-000000000004','FS',
 ARRAY['fs-buildout-v6','genre:traverse-cogo','fs-m4','dynamic']::text[],true,'approved','[]'::jsonb,
 true,'a5000001-0000-0000-0000-000000000001',0.05),
('fbd75000-0000-0000-0000-000000000002','(dynamic — curve tangent)','numeric_input','[]'::jsonb,'0',
 'Computed from randomized R and Δ each attempt.','medium','f5000005-0000-0000-0000-000000000005','FS',
 ARRAY['fs-buildout-v6','genre:horizontal-curves','fs-m5','dynamic']::text[],true,'approved','[]'::jsonb,
 true,'a5000001-0000-0000-0000-000000000002',0.05),
('fbd75000-0000-0000-0000-000000000003','(dynamic — leg latitude)','numeric_input','[]'::jsonb,'0',
 'Computed from randomized azimuth and distance each attempt.','easy','f5000004-0000-0000-0000-000000000004','FS',
 ARRAY['fs-buildout-v6','genre:traverse-cogo','fs-m4','dynamic']::text[],true,'approved','[]'::jsonb,
 true,'a5000001-0000-0000-0000-000000000003',0.05),
('fbd75000-0000-0000-0000-000000000004','(dynamic — curve arc length)','numeric_input','[]'::jsonb,'0',
 'Computed from randomized R and Δ each attempt.','medium','f5000005-0000-0000-0000-000000000005','FS',
 ARRAY['fs-buildout-v6','genre:horizontal-curves','fs-m5','dynamic']::text[],true,'approved','[]'::jsonb,
 true,'a5000001-0000-0000-0000-000000000004',0.05)
ON CONFLICT (id) DO NOTHING;

COMMIT;
