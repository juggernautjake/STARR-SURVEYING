-- 433_fs_prep_mapping_templates.sql
-- FS Exam Alignment Buildout — Slice S17.
-- Mapping Processes & Methods (NCEES Cat 2, Module 8): Q6 sewer grade/cut
-- (+profile figure), Q7 slope-stake offset (+cross-section figure), Q9 highest
-- contour (+contour figure), Q10 photo scale (map cross-ref), Q14 photo scale
-- (flight height) as regenerable templates; Q8 FEMA cert, Q11 GIS topology, Q12
-- NSSDA, Q15 LiDAR + siblings as concepts. (Q13 nadir drag-label shipped S3/S8.)
-- Idempotent: delete-by-tag then insert.

DELETE FROM question_bank WHERE 'fs-mapping' = ANY(tags);
DELETE FROM problem_templates WHERE 'fs-mapping' = ANY(tags);

INSERT INTO problem_templates
  (id, name, description, category, subcategory, question_type, difficulty, question_template, answer_formula, answer_format, parameters, computed_vars, solution_steps_template, options_generator, explanation_template, module_id, exam_category, tags, diagram, is_active, created_by)
VALUES
-- Q6 — sewer grade / cut to flow line (+profile figure)
('fa33f000-0000-0000-0000-000000000001',
 'Sewer grade — cut to the flow line','Cut from a grade stake to the revised sewer flow line at a station.',
 'FS — Mapping/Construction','Construction staking','numeric_input','hard',
 'A sewer runs on a uniform grade from MH 1 (flow line elev {{fl1:f2}} ft) to MH 2, which is {{L}} ft downstream at flow line elev {{fl2:f2}} ft. At a point {{x}} ft downstream of MH 1 the grade stake elevation is {{gradeStake:f2}} ft. The cut (ft) from the grade stake to the flow line at this point is most nearly:',
 'gradeStake - (fl1 + (fl2-fl1)*x/L)','{"decimals":2,"unit":"ft","tolerance":0.05}',
 '[{"name":"fl1","type":"float","min":1225,"max":1230,"decimals":2},{"name":"rise","type":"float","min":0.40,"max":0.90,"decimals":2},{"name":"L","type":"choice","choices":[240,250,260]},{"name":"x","type":"choice","choices":[100,120,125,140]},{"name":"cutNom","type":"float","min":5.5,"max":6.5,"decimals":2}]'::jsonb,
 '[{"name":"fl2","formula":"fl1+rise"},{"name":"flAtX","formula":"fl1+rise*x/L"},{"name":"gradeStake","formula":"flAtX+cutNom"}]'::jsonb,
 '[{"step_number":1,"title":"Flow line at the station (interpolate the grade)","calculation_template":"{{fl1:f2}} + ({{fl2:f2}}−{{fl1:f2}})·{{x}}/{{L}}"},{"step_number":2,"title":"Cut = grade stake − flow line","result_template":"{{gradeStake:f2}} − flowline = {{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Interpolate the flow line at the station, then subtract from the grade-stake elevation: cut = {{gradeStake:f2}} − [{{fl1:f2}} + ({{fl2:f2}}−{{fl1:f2}})·{{x}}/{{L}}] = {{_answer}} ft.',
 'f5000008-0000-0000-0000-000000000008','FS',
 ARRAY['fs-mapping','fs-m8','fs-dynamic','fs-exam-mirror','genre:photogrammetry']::text[],
 '{"type":"profile","profilePoints":[{"sta":0,"elevVar":"fl1","label":"MH1"},{"staVar":"L","elevVar":"fl2","label":"MH2"}],"cutStaVar":"x","cutLabel":"cut = ?"}'::jsonb,true,'fs:m8'),

-- Q7 — slope-stake catch-point offset (+cross-section figure)
('fa33f000-0000-0000-0000-000000000002',
 'Slope-stake catch-point offset','Offset from centerline to the fill catch point (slope stake).',
 'FS — Mapping/Construction','Slope staking','numeric_input','hard',
 'A road fill section has a {{slope}}:1 side slope, with the edge of road {{hw}} ft from centerline. The finish grade at the edge of road is {{fgElev:f2}} ft and the existing ground at the catch point is {{groundElev:f2}} ft. The offset (ft) from centerline to the fill catch point (slope stake) is most nearly:',
 'hw + slope*(fgElev-groundElev)','{"decimals":2,"unit":"ft","tolerance":0.05}',
 '[{"name":"hw","type":"choice","choices":[10,12,15]},{"name":"slope","type":"choice","choices":[3,4]},{"name":"fgElev","type":"float","min":108,"max":112,"decimals":2},{"name":"dropNom","type":"float","min":2.0,"max":3.0,"decimals":2}]'::jsonb,
 '[{"name":"groundElev","formula":"fgElev-dropNom"}]'::jsonb,
 '[{"step_number":1,"title":"Fill drop = finish grade − ground","calculation_template":"{{fgElev:f2}} − {{groundElev:f2}}"},{"step_number":2,"title":"Offset = half-width + slope·drop","result_template":"{{hw}} + {{slope}}·drop = {{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'For a fill section, the catch point is offset = (CL to edge) + slope·(finish grade − ground) = {{hw}} + {{slope}}·({{fgElev:f2}} − {{groundElev:f2}}) = {{_answer}} ft from centerline.',
 'f5000008-0000-0000-0000-000000000008','FS',
 ARRAY['fs-mapping','fs-m8','fs-dynamic','fs-exam-mirror','genre:photogrammetry']::text[],
 '{"type":"crossSection","halfWidthVar":"hw","slopeVar":"slope","cutFill":"fill"}'::jsonb,true,'fs:m8'),

-- Q9 — highest contour elevation (+contour figure)
('fa33f000-0000-0000-0000-000000000003',
 'Highest contour elevation','Read the highest contour on a contour map given the index contours.',
 'FS — Mapping/Methods','Topographic mapping','numeric_input','medium',
 'On the contour map shown, two index contours are labeled and the hill has a series of closed contours. Determine the contour interval from the labeled index contours, then give the elevation (ft) of the highest contour line, which is most nearly:',
 'baseElev + kHigh*interval','{"decimals":0,"unit":"ft","tolerance":1}',
 '[{"name":"baseElev","type":"choice","choices":[800,1000,1200]},{"name":"interval","type":"choice","choices":[50,100]},{"name":"kHigh","type":"integer","min":6,"max":9}]'::jsonb,
 '[{"name":"peakElev","formula":"baseElev + (kHigh+0.7)*interval"}]'::jsonb,
 '[{"step_number":1,"title":"Interval = (spacing between labeled index contours) / 5","calculation_template":"interval = {{interval}} ft"},{"step_number":2,"title":"Highest contour","result_template":"{{baseElev}} + {{kHigh}}×{{interval}} = {{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'The two labeled index contours are five intervals apart, giving a {{interval}}-ft interval. Counting the closed contours up the hill, the highest is {{baseElev}} + {{kHigh}}×{{interval}} = {{_answer}} ft.',
 'f5000008-0000-0000-0000-000000000008','FS',
 ARRAY['fs-mapping','fs-m8','fs-dynamic','fs-exam-mirror','genre:photogrammetry']::text[],
 '{"type":"contour","baseElevVar":"baseElev","intervalVar":"interval","peakElevVar":"peakElev"}'::jsonb,true,'fs:m8'),

-- Q10 — aerial photo scale from a map cross-reference
('fa33f000-0000-0000-0000-000000000004',
 'Aerial photo scale from a map cross-reference','Photo scale from a feature measured on both the photo and a known-scale map.',
 'FS — Mapping/Methods','Photogrammetry','numeric_input','medium',
 'On a vertical aerial photograph a feature measures {{p:f2}} in. On a map at scale 1:{{MS}} the same feature measures {{m:f2}} in. The photograph scale at the feature is most nearly 1 : ____ .',
 'm*MS/p','{"decimals":0,"unit":"","tolerance":50}',
 '[{"name":"p","type":"float","min":5,"max":9,"decimals":2},{"name":"m","type":"float","min":6,"max":11,"decimals":2},{"name":"MS","type":"choice","choices":[10000,12000,24000]}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Ground distance = map distance × map scale","calculation_template":"{{m:f2}} × {{MS}}"},{"step_number":2,"title":"Photo scale = photo distance / ground distance","result_template":"1 : {{_answer}}"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Ground distance = {{m:f2}}×{{MS}}. Photo scale = photo/ground = {{p:f2}} / ({{m:f2}}×{{MS}}) = 1:{{_answer}}.',
 'f5000008-0000-0000-0000-000000000008','FS',
 ARRAY['fs-mapping','fs-m8','fs-dynamic','fs-exam-mirror','genre:photogrammetry']::text[],NULL,true,'fs:m8'),

-- Q14 — aerial photo scale from flight height
('fa33f000-0000-0000-0000-000000000005',
 'Aerial photo scale from flying height','Average photo scale from focal length, flying height and terrain elevation.',
 'FS — Mapping/Methods','Photogrammetry','numeric_input','medium',
 'An aerial camera with a {{f}}-in focal length flies at {{H}} ft above mean sea level over terrain averaging {{h}} ft above mean sea level. The average photograph scale is most nearly 1 : ____ .',
 '(H-h)*12/f','{"decimals":0,"unit":"","tolerance":50}',
 '[{"name":"f","type":"choice","choices":[6,8.25,3.5]},{"name":"H","type":"choice","choices":[8000,10000,12000]},{"name":"h","type":"choice","choices":[500,1000,1500]}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Scale = focal length / height above mean terrain","calculation_template":"{{f}} in / [({{H}}−{{h}}) ft × 12]"},{"step_number":2,"title":"Photo scale","result_template":"1 : {{_answer}}"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Scale = f / (H−h) = {{f}} in / [({{H}}−{{h}})×12 in] = 1:{{_answer}}.',
 'f5000008-0000-0000-0000-000000000008','FS',
 ARRAY['fs-mapping','fs-m8','fs-dynamic','fs-exam-mirror','genre:photogrammetry']::text[],NULL,true,'fs:m8');

-- linked question_bank rows
INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty, module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, template_id, tolerance)
VALUES
('fa33b000-0000-0000-0000-000000000001','(dynamic — sewer cut to flow line)','numeric_input','[]'::jsonb,'0','Cut = grade stake − interpolated flow line.','hard','f5000008-0000-0000-0000-000000000008','FS',ARRAY['fs-mapping','fs-m8','fs-dynamic']::text[],true,'approved','[{"type":"handbook","label":"Construction staking"}]'::jsonb,true,'fa33f000-0000-0000-0000-000000000001',0.05),
('fa33b000-0000-0000-0000-000000000002','(dynamic — slope-stake offset)','numeric_input','[]'::jsonb,'0','Offset = half-width + slope·(finish grade − ground).','hard','f5000008-0000-0000-0000-000000000008','FS',ARRAY['fs-mapping','fs-m8','fs-dynamic']::text[],true,'approved','[{"type":"handbook","label":"Slope staking"}]'::jsonb,true,'fa33f000-0000-0000-0000-000000000002',0.05),
('fa33b000-0000-0000-0000-000000000003','(dynamic — highest contour)','numeric_input','[]'::jsonb,'0','Highest contour = base + k·interval.','medium','f5000008-0000-0000-0000-000000000008','FS',ARRAY['fs-mapping','fs-m8','fs-dynamic']::text[],true,'approved','[{"type":"handbook","label":"Topographic mapping"}]'::jsonb,true,'fa33f000-0000-0000-0000-000000000003',1),
('fa33b000-0000-0000-0000-000000000004','(dynamic — photo scale from map)','numeric_input','[]'::jsonb,'0','Photo scale = photo dist / (map dist × map scale).','medium','f5000008-0000-0000-0000-000000000008','FS',ARRAY['fs-mapping','fs-m8','fs-dynamic']::text[],true,'approved','[{"type":"handbook","label":"Photogrammetry"}]'::jsonb,true,'fa33f000-0000-0000-0000-000000000004',50),
('fa33b000-0000-0000-0000-000000000005','(dynamic — photo scale from flight height)','numeric_input','[]'::jsonb,'0','Scale = f/(H−h).','medium','f5000008-0000-0000-0000-000000000008','FS',ARRAY['fs-mapping','fs-m8','fs-dynamic']::text[],true,'approved','[{"type":"handbook","label":"Photogrammetry"}]'::jsonb,true,'fa33f000-0000-0000-0000-000000000005',50);

-- static concept questions
INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty, module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
-- Q8 mirror — FEMA elevation certificate
('fa330000-0000-0000-0000-000000000001',
 'Which document is typically used to rate structures located in or near a floodplain for the purpose of flood insurance?',
 'multiple_choice','["Elevation Form","Wetlands Evaluation","Floodproofing Certificate","Elevation Certificate"]'::jsonb,'Elevation Certificate',
 'The FEMA Elevation Certificate is an administrative tool of the National Flood Insurance Program (NFIP); it provides the elevation information used to determine flood-insurance rates and support map amendments/revisions.',
 'easy','f5000008-0000-0000-0000-000000000008','FS',ARRAY['fs-mapping','fs-m8','fs-exam-mirror','genre:photogrammetry']::text[],true,'approved','[]'::jsonb,false,0.01),
-- Q11 mirror — GIS topology
('fa330000-0000-0000-0000-000000000002',
 'Which of the following is NOT related to topology in a GIS?',
 'multiple_choice','["Connectivity","Adjacency","Containment (polygon relationships)","Color"]'::jsonb,'Color',
 'Topology describes the geometric relationships between spatial objects — connectivity, adjacency, and containment. Color is a display/symbology attribute, not a topological relationship.',
 'easy','f5000008-0000-0000-0000-000000000008','FS',ARRAY['fs-mapping','fs-m8','fs-exam-mirror','genre:photogrammetry']::text[],true,'approved','[]'::jsonb,false,0.01),
-- Q15 mirror — LiDAR LAS
('fa330000-0000-0000-0000-000000000003',
 'A binary public file format used to interchange three-dimensional light detection and ranging (LiDAR) data is called:',
 'multiple_choice','["ASCII","LAS","USGS DEM","TIFF"]'::jsonb,'LAS',
 'LAS is the binary public interchange format for LiDAR point clouds. ASCII is text (not binary); USGS DEM stores raster elevation grids; TIFF is a tagged image format.',
 'easy','f5000008-0000-0000-0000-000000000008','FS',ARRAY['fs-mapping','fs-m8','fs-exam-mirror','genre:photogrammetry']::text[],true,'approved','[]'::jsonb,false,0.01),
-- GIS raster vs vector sibling
('fa330000-0000-0000-0000-000000000004',
 'In a GIS, which statement best distinguishes raster data from vector data?',
 'multiple_choice','["Raster represents features as points/lines/polygons; vector uses a grid of cells","Raster represents the world as a grid of cells (pixels); vector represents features as points, lines, and polygons","They are identical","Raster cannot store elevation"]'::jsonb,'Raster represents the world as a grid of cells (pixels); vector represents features as points, lines, and polygons',
 'Raster data models the world as a regular grid of cells (each with a value) — good for continuous surfaces/imagery. Vector data models discrete features as points, lines, and polygons with coordinates.',
 'medium','f5000008-0000-0000-0000-000000000008','FS',ARRAY['fs-mapping','fs-m8','genre:photogrammetry']::text[],true,'approved','[]'::jsonb,false,0.01),
-- relief displacement sibling
('fa330000-0000-0000-0000-000000000005',
 'On a vertical aerial photograph, the apparent radial shift of the top of a tall object away from the principal point is called:',
 'multiple_choice','["parallax","relief displacement","crab","tilt displacement"]'::jsonb,'relief displacement',
 'Relief displacement is the radial shift of an object''s image caused by its height above the datum; it increases with the object''s height and its radial distance from the principal point (and can be used to compute object heights).',
 'medium','f5000008-0000-0000-0000-000000000008','FS',ARRAY['fs-mapping','fs-m8','genre:photogrammetry']::text[],true,'approved','[]'::jsonb,false,0.01),
-- NSSDA horizontal multiplier sibling
('fa330000-0000-0000-0000-000000000006',
 'Under the National Standard for Spatial Data Accuracy (NSSDA), the HORIZONTAL accuracy at the 95% confidence level is the RMSE multiplied by:',
 'multiple_choice','["1.9600","1.7308","2.0000","0.6745"]'::jsonb,'1.7308',
 'NSSDA multiplies RMSE by the 95%-confidence factor: 1.7308 for horizontal accuracy and 1.9600 for vertical accuracy.',
 'medium','f5000008-0000-0000-0000-000000000008','FS',ARRAY['fs-mapping','fs-m8','genre:photogrammetry']::text[],true,'approved','[]'::jsonb,false,0.01);

-- Q12 mirror — NSSDA vertical multiplier (numeric)
INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty, module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
('fa330000-0000-0000-0000-000000000007',
 'To compute the VERTICAL accuracy of an elevation data set using the National Standard for Spatial Data Accuracy (NSSDA), the RMSE is multiplied by what factor (95% confidence)?',
 'numeric_input','[]'::jsonb,'1.9600',
 'The NSSDA statistic multiplies RMSE by the standard error of the mean at the 95% confidence level: 1.7308 for horizontal accuracy and 1.9600 for vertical accuracy.',
 'medium','f5000008-0000-0000-0000-000000000008','FS',ARRAY['fs-mapping','fs-m8','fs-exam-mirror','genre:photogrammetry']::text[],true,'approved','[{"type":"handbook","label":"NSSDA (NSPS Model Standards §F)"}]'::jsonb,false,0.001);
