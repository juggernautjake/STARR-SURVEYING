-- seeds/381_fs_prep_dynamic_templates_v3.sql
-- SIT / FS exam-prep — third batch of dynamic problem_templates, extending
-- generator coverage to leveling, error stats, GNSS heights, and slope→horizontal.
-- All verified through lib/problemEngine.generateFromTemplate (200 generations
-- each: valid, always-finite; leveling template renders a matched diagram).

BEGIN;

INSERT INTO problem_templates
  (id, name, description, category, subcategory, question_type, difficulty,
   question_template, answer_formula, answer_format, parameters, computed_vars,
   solution_steps_template, options_generator, explanation_template,
   module_id, exam_category, tags, diagram, is_active)
VALUES
('a5000003-0000-0000-0000-000000000001',
 'Point elevation (differential leveling)', 'Elevation of a point from BM, BS and FS.',
 'Leveling', 'Differential leveling', 'numeric_input', 'easy',
 'Benchmark BM-A has elevation {{elevBM:f2}} ft. A backsight of {{bs:f2}} ft is read on BM-A, then a foresight of {{fs:f2}} ft on point P. Compute the elevation of point P, in ft.',
 'elevBM + bs - fs',
 '{"decimals":2,"unit":"ft","tolerance":0.02}'::jsonb,
 '[{"name":"elevBM","type":"float","min":100,"max":2000,"decimals":2},{"name":"bs","type":"float","min":0.5,"max":11.5,"decimals":2},{"name":"fs","type":"float","min":0.5,"max":11.5,"decimals":2}]'::jsonb,
 '[{"name":"hi","formula":"elevBM+bs"}]'::jsonb,
 '[{"step_number":1,"title":"HI = Elev_BM + BS","calculation_template":"HI = {{elevBM:f2}} + {{bs:f2}} = {{hi:f2}} ft"},{"step_number":2,"title":"Elev_P = HI − FS","calculation_template":"Elev_P = {{hi:f2}} − {{fs:f2}}"},{"step_number":3,"title":"Result","result_template":"{{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'HI = Elev_BM + BS; Elev_P = HI − FS.',
 'f5000002-0000-0000-0000-000000000002', 'FS',
 ARRAY['fs-buildout-v6','genre:leveling','fs-m2','dynamic']::text[],
 '{"type":"leveling","bsVar":"bs","fsVar":"fs","title":"Differential leveling"}'::jsonb, true),

('a5000003-0000-0000-0000-000000000002',
 'Standard error of the mean', 'σ_m from σ and n.',
 'Fundamentals of Surveying', 'Error analysis', 'numeric_input', 'easy',
 'A set of observations has a standard deviation of {{sigma:f3}} ft based on n = {{n:f0}} observations. Compute the standard error of the mean, in ft.',
 'sigma / sqrt(n)',
 '{"decimals":3,"unit":"ft","tolerance":0.002}'::jsonb,
 '[{"name":"sigma","type":"float","min":0.02,"max":0.20,"decimals":3},{"name":"n","type":"integer","min":4,"max":25}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Formula","calculation_template":"σ_m = σ/√n = {{sigma:f3}}/√{{n:f0}}"},{"step_number":2,"title":"Result","result_template":"{{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'The standard error of the mean σ_m = σ/√n; more observations reduce it.',
 'f5000001-0000-0000-0000-000000000001', 'FS',
 ARRAY['fs-buildout-v6','genre:measurement-error','fs-m1','dynamic']::text[],
 NULL, true),

('a5000003-0000-0000-0000-000000000003',
 'Orthometric height from GNSS', 'H = h − N.',
 'GNSS/GPS and Geodesy', 'Heights', 'numeric_input', 'easy',
 'At a station the ellipsoidal height is h = {{h:f2}} ft and the geoid separation is N = {{N:f2}} ft. Compute the orthometric height H, in ft.',
 'h - N',
 '{"decimals":2,"unit":"ft","tolerance":0.02}'::jsonb,
 '[{"name":"h","type":"float","min":50,"max":600,"decimals":2},{"name":"N","type":"float","min":-40,"max":5,"decimals":2}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Formula","calculation_template":"H = h − N = {{h:f2}} − ({{N:f2}})"},{"step_number":2,"title":"Result","result_template":"{{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Orthometric height H = h − N (ellipsoidal height minus geoid separation).',
 'f5000006-0000-0000-0000-000000000006', 'FS',
 ARRAY['fs-buildout-v6','genre:gnss-geodesy','fs-m6','dynamic']::text[],
 NULL, true),

('a5000003-0000-0000-0000-000000000004',
 'Curvature and refraction correction', 'Combined C_R from sight distance.',
 'Leveling', 'Curvature & refraction', 'numeric_input', 'medium',
 'Compute the combined curvature-and-refraction correction for a sight distance of {{F:f1}} thousand feet. Use C_R = 0.0206·F². Answer in ft.',
 '0.0206 * F * F',
 '{"decimals":3,"unit":"ft","tolerance":0.005}'::jsonb,
 '[{"name":"F","type":"float","min":1.0,"max":6.0,"decimals":1}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Formula","calculation_template":"C_R = 0.0206·F² = 0.0206·{{F:f1}}²"},{"step_number":2,"title":"Result","result_template":"{{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'C_R = 0.0206·F² with F in thousands of feet; the earth''s curvature dominates and refraction partially offsets it.',
 'f5000002-0000-0000-0000-000000000002', 'FS',
 ARRAY['fs-buildout-v6','genre:leveling','fs-m2','dynamic']::text[],
 NULL, true),

('a5000003-0000-0000-0000-000000000005',
 'Slope distance to horizontal', 'Horizontal distance from slope distance and vertical angle.',
 'Distance and Angle Measurement', 'Slope reduction', 'numeric_input', 'easy',
 'A slope distance of {{S:f2}} ft is measured along a line with a vertical angle of {{va:f0}}°. Compute the horizontal distance, in ft.',
 'S * cos(toRad(va))',
 '{"decimals":2,"unit":"ft","tolerance":0.02}'::jsonb,
 '[{"name":"S","type":"float","min":100,"max":1000,"decimals":2},{"name":"va","type":"integer","min":0,"max":15}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Formula","calculation_template":"H = S·cos(θ) = {{S:f2}}·cos({{va:f0}}°)"},{"step_number":2,"title":"Result","result_template":"{{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Horizontal distance H = S·cos(vertical angle).',
 'f5000003-0000-0000-0000-000000000003', 'FS',
 ARRAY['fs-buildout-v6','genre:distance-edm','fs-m3','dynamic']::text[],
 NULL, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, template_id, tolerance)
VALUES
('fbd77000-0000-0000-0000-000000000001','(dynamic — point elevation)','numeric_input','[]'::jsonb,'0','Fresh each attempt.','easy','f5000002-0000-0000-0000-000000000002','FS',ARRAY['fs-buildout-v6','genre:leveling','fs-m2','dynamic']::text[],true,'approved','[]'::jsonb,true,'a5000003-0000-0000-0000-000000000001',0.02),
('fbd77000-0000-0000-0000-000000000002','(dynamic — standard error of the mean)','numeric_input','[]'::jsonb,'0','Fresh each attempt.','easy','f5000001-0000-0000-0000-000000000001','FS',ARRAY['fs-buildout-v6','genre:measurement-error','fs-m1','dynamic']::text[],true,'approved','[]'::jsonb,true,'a5000003-0000-0000-0000-000000000002',0.002),
('fbd77000-0000-0000-0000-000000000003','(dynamic — orthometric height)','numeric_input','[]'::jsonb,'0','Fresh each attempt.','easy','f5000006-0000-0000-0000-000000000006','FS',ARRAY['fs-buildout-v6','genre:gnss-geodesy','fs-m6','dynamic']::text[],true,'approved','[]'::jsonb,true,'a5000003-0000-0000-0000-000000000003',0.02),
('fbd77000-0000-0000-0000-000000000004','(dynamic — curvature & refraction)','numeric_input','[]'::jsonb,'0','Fresh each attempt.','medium','f5000002-0000-0000-0000-000000000002','FS',ARRAY['fs-buildout-v6','genre:leveling','fs-m2','dynamic']::text[],true,'approved','[]'::jsonb,true,'a5000003-0000-0000-0000-000000000004',0.005),
('fbd77000-0000-0000-0000-000000000005','(dynamic — slope to horizontal)','numeric_input','[]'::jsonb,'0','Fresh each attempt.','easy','f5000003-0000-0000-0000-000000000003','FS',ARRAY['fs-buildout-v6','genre:distance-edm','fs-m3','dynamic']::text[],true,'approved','[]'::jsonb,true,'a5000003-0000-0000-0000-000000000005',0.02)
ON CONFLICT (id) DO NOTHING;

COMMIT;
