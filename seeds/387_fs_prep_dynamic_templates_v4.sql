-- seeds/387_fs_prep_dynamic_templates_v4.sql
-- SIT / FS exam-prep — fourth batch of dynamic problem_templates, extending
-- generator coverage to photogrammetry (photo scale), angle conversion
-- (DMS→decimal), measurement (relative precision), and EDM error spec. All
-- verified through lib/problemEngine (300 generations each: valid, finite).

BEGIN;

INSERT INTO problem_templates
  (id, name, description, category, subcategory, question_type, difficulty,
   question_template, answer_formula, answer_format, parameters, computed_vars,
   solution_steps_template, options_generator, explanation_template,
   module_id, exam_category, tags, diagram, is_active)
VALUES
('a5000004-0000-0000-0000-000000000001',
 'Photo scale denominator', 'Vertical photo scale from focal length and flying height.',
 'Photogrammetry, GIS and Construction', 'Photo scale', 'numeric_input', 'medium',
 'A vertical photograph is taken with a {{f:f0}}-inch focal-length camera from a flying height of {{H:f0}} ft above the ground. What is the scale denominator (1 : ?)?',
 'H / (f/12)',
 '{"decimals":0,"tolerance":20}'::jsonb,
 '[{"name":"f","type":"integer","min":3,"max":12},{"name":"H","type":"integer","min":2000,"max":12000}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Formula","calculation_template":"S = f/H → denom = H/f = {{H:f0}}/({{f:f0}}/12)"},{"step_number":2,"title":"Result","result_template":"1 : {{_answer}}"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Scale S = f/H (consistent units). Convert the focal length to feet (÷12) before dividing.',
 'f5000008-0000-0000-0000-000000000008', 'FS',
 ARRAY['fs-buildout-v6','genre:photogrammetry','fs-m8','dynamic']::text[], NULL, true),

('a5000004-0000-0000-0000-000000000002',
 'DMS to decimal degrees', 'Convert degrees-minutes-seconds to decimal degrees.',
 'Distance and Angle Measurement', 'Angle conversion', 'numeric_input', 'easy',
 'Convert {{D:f0}}°{{M:f0}}′{{S:f0}}″ to decimal degrees.',
 'D + M/60 + S/3600',
 '{"decimals":4,"unit":"deg","tolerance":0.001}'::jsonb,
 '[{"name":"D","type":"integer","min":0,"max":89},{"name":"M","type":"integer","min":0,"max":59},{"name":"S","type":"integer","min":0,"max":59}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Formula","calculation_template":"dd = D + M/60 + S/3600 = {{D:f0}} + {{M:f0}}/60 + {{S:f0}}/3600"},{"step_number":2,"title":"Result","result_template":"{{_answer}}°"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Decimal degrees = D + M/60 + S/3600.',
 'f5000003-0000-0000-0000-000000000003', 'FS',
 ARRAY['fs-buildout-v6','genre:angles-directions','fs-m3','dynamic']::text[], NULL, true),

('a5000004-0000-0000-0000-000000000003',
 'Relative precision', 'Relative precision as a 1:N ratio.',
 'Fundamentals of Surveying', 'Precision', 'numeric_input', 'easy',
 'A distance of {{dist:f0}} ft is measured with an estimated error of ±{{err:f2}} ft. What is the relative precision, expressed as 1 : ? (whole-number denominator)?',
 'dist / err',
 '{"decimals":0,"tolerance":100}'::jsonb,
 '[{"name":"dist","type":"integer","min":200,"max":2000},{"name":"err","type":"float","min":0.01,"max":0.10,"decimals":2}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Formula","calculation_template":"RP = error/distance = {{err:f2}}/{{dist:f0}} = 1/({{dist:f0}}/{{err:f2}})"},{"step_number":2,"title":"Result","result_template":"1 : {{_answer}}"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Relative precision = error ÷ distance, written as 1 : (distance ÷ error).',
 'f5000001-0000-0000-0000-000000000001', 'FS',
 ARRAY['fs-buildout-v6','genre:measurement-error','fs-m1','dynamic']::text[], NULL, true),

('a5000004-0000-0000-0000-000000000004',
 'EDM total uncertainty', 'Combine the constant + ppm parts of an EDM accuracy spec.',
 'Distance and Angle Measurement', 'EDM', 'numeric_input', 'medium',
 'An EDM is rated ±({{base:f0}} mm + {{ppm:f0}} ppm). For a measured distance of {{dist:f0}} m, what is the total expected uncertainty, in mm?',
 'base + ppm*dist/1000',
 '{"decimals":1,"unit":"mm","tolerance":0.2}'::jsonb,
 '[{"name":"base","type":"integer","min":2,"max":5},{"name":"ppm","type":"integer","min":1,"max":5},{"name":"dist","type":"integer","min":500,"max":3000}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"ppm term","calculation_template":"{{ppm:f0}} ppm × {{dist:f0}} m = {{ppm:f0}}·{{dist:f0}}/1000 mm"},{"step_number":2,"title":"Total","calculation_template":"{{base:f0}} mm + ppm term"},{"step_number":3,"title":"Result","result_template":"{{_answer}} mm"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Total = constant (mm) + ppm × distance. 1 ppm = 1 mm per km, so ppm·(dist in m)/1000 gives mm.',
 'f5000003-0000-0000-0000-000000000003', 'FS',
 ARRAY['fs-buildout-v6','genre:distance-edm','fs-m3','dynamic']::text[], NULL, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, template_id, tolerance)
VALUES
('fbd78000-0000-0000-0000-000000000001','(dynamic — photo scale)','numeric_input','[]'::jsonb,'0','Fresh each attempt.','medium','f5000008-0000-0000-0000-000000000008','FS',ARRAY['fs-buildout-v6','genre:photogrammetry','fs-m8','dynamic']::text[],true,'approved','[]'::jsonb,true,'a5000004-0000-0000-0000-000000000001',20),
('fbd78000-0000-0000-0000-000000000002','(dynamic — DMS to decimal)','numeric_input','[]'::jsonb,'0','Fresh each attempt.','easy','f5000003-0000-0000-0000-000000000003','FS',ARRAY['fs-buildout-v6','genre:angles-directions','fs-m3','dynamic']::text[],true,'approved','[]'::jsonb,true,'a5000004-0000-0000-0000-000000000002',0.001),
('fbd78000-0000-0000-0000-000000000003','(dynamic — relative precision)','numeric_input','[]'::jsonb,'0','Fresh each attempt.','easy','f5000001-0000-0000-0000-000000000001','FS',ARRAY['fs-buildout-v6','genre:measurement-error','fs-m1','dynamic']::text[],true,'approved','[]'::jsonb,true,'a5000004-0000-0000-0000-000000000003',100),
('fbd78000-0000-0000-0000-000000000004','(dynamic — EDM uncertainty)','numeric_input','[]'::jsonb,'0','Fresh each attempt.','medium','f5000003-0000-0000-0000-000000000003','FS',ARRAY['fs-buildout-v6','genre:distance-edm','fs-m3','dynamic']::text[],true,'approved','[]'::jsonb,true,'a5000004-0000-0000-0000-000000000004',0.2)
ON CONFLICT (id) DO NOTHING;

COMMIT;
