-- 432_fs_prep_boundary_questions.sql
-- FS Exam Alignment Buildout — Slice S16.
-- Boundary Law & Real Property (NCEES Cat 3, Module 7). Q20 remainder-lot
-- frontage as a regenerable template WITH a plat figure; Q19 simultaneous
-- conveyance with a static plat figure; Q16/Q18/Q22/Q23/Q24/Q25 + siblings as
-- concept questions. (Q17 priority-of-calls and Q21 metes-and-bounds ordering
-- shipped in S2.) Idempotent: delete-by-tag then insert.

DELETE FROM question_bank WHERE 'fs-boundary' = ANY(tags);
DELETE FROM problem_templates WHERE 'fs-boundary' = ANY(tags);

-- Q20 — remainder-lot frontage (excess/deficiency) with plat figure
INSERT INTO problem_templates
  (id, name, description, category, subcategory, question_type, difficulty, question_template, answer_formula, answer_format, parameters, computed_vars, solution_steps_template, options_generator, explanation_template, module_id, exam_category, tags, diagram, is_active, created_by)
VALUES
('fa32f000-0000-0000-0000-000000000001',
 'Remainder-lot frontage (excess/deficiency)',
 'Frontage of the remainder lot when four lots hold record and monuments bound the block.',
 'FS — Boundary Law','Excess and deficiency','numeric_input','hard',
 'A recorded plat shows four lots each with a {{w}}.00-ft record frontage plus a remainder lot along the street. Original monuments A and B at the ends of the block are found {{M:f2}} ft apart, with no interior corners recovered. The frontage (ft) of the remainder lot is most nearly:',
 'M - 4*w','{"decimals":2,"unit":"ft","tolerance":0.05}',
 '[{"name":"w","type":"choice","choices":[40,50,60]},{"name":"rem","type":"float","min":28,"max":36,"decimals":2}]'::jsonb,
 '[{"name":"M","formula":"4*w+rem"}]'::jsonb,
 '[{"step_number":1,"title":"The four lots hold record; the remainder lot absorbs the rest","calculation_template":"{{M:f2}} − 4×{{w}}.00"},{"step_number":2,"title":"Remainder frontage","result_template":"{{_answer}} ft"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'The four full lots hold their record frontage (4 × {{w}} = {{w4}} ft); the remainder lot takes what is left: {{M:f2}} − {{w4}} = {{_answer}} ft. (This is the remainder rule, not proportional distribution.)',
 'f5000007-0000-0000-0000-000000000007','FS',
 ARRAY['fs-boundary','fs-m7','fs-dynamic','fs-exam-mirror','genre:boundary-legal']::text[],
 '{"type":"plat","platLots":[{"widthVar":"w","label":"1"},{"widthVar":"w","label":"2"},{"widthVar":"w","label":"3"},{"widthVar":"w","label":"4"},{"widthVar":"rem","label":"5","dim":"?"}],"monA":"A","monB":"B","streetName":"First Street"}'::jsonb,
 true,'fs:m7');

-- add a computed convenience var for the explanation
UPDATE problem_templates SET computed_vars = '[{"name":"M","formula":"4*w+rem"},{"name":"w4","formula":"4*w"}]'::jsonb
 WHERE id = 'fa32f000-0000-0000-0000-000000000001';

INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty, module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, template_id, tolerance)
VALUES
('fa32b000-0000-0000-0000-000000000001','(dynamic — remainder lot frontage)','numeric_input','[]'::jsonb,'0','Remainder = measured − record held by the full lots.','hard','f5000007-0000-0000-0000-000000000007','FS',ARRAY['fs-boundary','fs-m7','fs-dynamic']::text[],true,'approved','[{"type":"handbook","label":"Excess and deficiency"}]'::jsonb,true,'fa32f000-0000-0000-0000-000000000001',0.05);

-- static concept questions
INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty, module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, diagram, tolerance)
VALUES
-- Q19 mirror — simultaneous conveyance (with static plat figure)
('fa320000-0000-0000-0000-000000000001',
 'The figure shows part of a recorded subdivision plat. Lot 22 was conveyed by the subdivider to Smith on June 7, 1979, and Lot 23 was sold to the same person on June 8, 1979. It can be said that:',
 'multiple_choice','["Lots 22 and 23 have equal rights because the grantee is the same person","Lot 22 has senior rights to Lot 23 because it was platted first","Lot 22 has senior rights to Lot 23 because it was sold first","Lots 22 and 23 have equal rights within a recorded subdivision"]'::jsonb,
 'Lots 22 and 23 have equal rights within a recorded subdivision',
 'Simultaneous conveyances: all lots in a recorded subdivision are created at the same instant when the plat is recorded, so no lot is senior to another regardless of sale dates. The controlling reason is the recorded subdivision, not the shared grantee.',
 'medium','f5000007-0000-0000-0000-000000000007','FS',ARRAY['fs-boundary','fs-m7','fs-exam-mirror','genre:boundary-legal']::text[],true,'approved','[{"type":"handbook","label":"Senior rights / simultaneous conveyances"}]'::jsonb,false,
 '{"type":"plat","platLots":[{"width":50,"label":"19"},{"width":52,"label":"20"},{"width":48,"label":"21"},{"width":55,"label":"22"},{"width":50,"label":"23"}],"monA":"A","monB":"B","streetName":"Easy Street"}'::jsonb,0.01),
-- Q16 mirror — warranty deed
('fa320000-0000-0000-0000-000000000002',
 'A warranty deed is an example of:',
 'multiple_choice','["possession insurance","a Torrens title","a title guarantee","an agreement between owners to fix a disputed boundary line"]'::jsonb,'a title guarantee',
 'In a warranty deed the grantor guarantees clear title to the grantee (free of liens/claims) — it is a title guarantee, the highest level of protection.',
 'easy','f5000007-0000-0000-0000-000000000007','FS',ARRAY['fs-boundary','fs-m7','fs-exam-mirror','genre:boundary-legal']::text[],true,'approved','[]'::jsonb,false,NULL,0.01),
-- Q18 mirror — easement extinguished by merger
('fa320000-0000-0000-0000-000000000003',
 'Under which of the following circumstances would a road easement be extinguished?',
 'multiple_choice','["The servient tenement is sold to another","The dominant and servient tenements come under one ownership","The easement is not actively in use","A fence is constructed across the easement"]'::jsonb,'The dominant and servient tenements come under one ownership',
 'Merger of title — when the dominant and servient tenements come under one ownership — extinguishes the easement (it merges into fee ownership). Non-use, a fence, or sale of the servient tenement do not by themselves extinguish it.',
 'medium','f5000007-0000-0000-0000-000000000007','FS',ARRAY['fs-boundary','fs-m7','fs-exam-mirror','genre:boundary-legal']::text[],true,'approved','[]'::jsonb,false,NULL,0.01),
-- Q22 mirror — obliterated corner
('fa320000-0000-0000-0000-000000000004',
 'In a dependent resurvey of the PLSS, an OBLITERATED corner is one whose position can be determined by:',
 'multiple_choice','["double proportion","single proportion","reliable testimony and acceptable evidence","secondary methods"]'::jsonb,'reliable testimony and acceptable evidence',
 'An obliterated corner has no remaining monument traces but its location is recoverable from reliable testimony and acceptable evidence. Proportionate measurement (double/single proportion) is used only for LOST corners.',
 'medium','f5000007-0000-0000-0000-000000000007','FS',ARRAY['fs-boundary','fs-m7','fs-exam-mirror','genre:boundary-legal']::text[],true,'approved','[]'::jsonb,false,NULL,0.01),
-- Q24 mirror — tax maps
('fa320000-0000-0000-0000-000000000005',
 'Which statement best describes the importance of parcel maps produced by county tax offices (tax maps)?',
 'multiple_choice','["They are official records of land ownership","They have no official use; they are only advisory","They are an authoritative form of parcel-location evidence for a surveyor to follow","They exist to support parcel identification for tax purposes and are not dimensionally authoritative"]'::jsonb,'They exist to support parcel identification for tax purposes and are not dimensionally authoritative',
 'Tax maps are kept by the county for taxation; each parcel has a tax ID. They are not dimensionally accurate and are not authoritative for boundaries or ownership — deeds and recorded surveys are.',
 'medium','f5000007-0000-0000-0000-000000000007','FS',ARRAY['fs-boundary','fs-m7','fs-exam-mirror','genre:boundary-legal']::text[],true,'approved','[]'::jsonb,false,NULL,0.01),
-- Q25 mirror — recording dates → order of conveyance
('fa320000-0000-0000-0000-000000000006',
 'Reviewing the historical recording dates of all deeds for the subject property and its adjoiners during project research is done to determine the:',
 'multiple_choice','["order of conveyance","transcription errors","parties'' intent","basis for declination"]'::jsonb,'order of conveyance',
 'Creation and recording dates establish the order of conveyance — which determines senior rights and whether conveyances were sequential or simultaneous.',
 'easy','f5000007-0000-0000-0000-000000000007','FS',ARRAY['fs-boundary','fs-m7','fs-exam-mirror','genre:boundary-legal']::text[],true,'approved','[]'::jsonb,false,NULL,0.01),
-- sibling — senior rights (sequential)
('fa320000-0000-0000-0000-000000000007',
 'When a grantor sells two adjoining parcels by sequential (not simultaneous) conveyances, the parcel conveyed FIRST generally holds:',
 'multiple_choice','["junior rights","senior rights","no rights","equal rights"]'::jsonb,'senior rights',
 'The first parcel conveyed is the senior parcel; the grantor could only convey what remained to the later (junior) parcel, so the senior parcel is given its full deeded dimensions and any excess/deficiency falls on the junior parcel.',
 'medium','f5000007-0000-0000-0000-000000000007','FS',ARRAY['fs-boundary','fs-m7','genre:boundary-legal']::text[],true,'approved','[]'::jsonb,false,NULL,0.01),
-- sibling — priority of calls: monument vs distance
('fa320000-0000-0000-0000-000000000008',
 'When a deed''s call for an undisturbed original monument conflicts with a call for a distance, which generally controls?',
 'multiple_choice','["The distance","The called-for monument","The area","The coordinates"]'::jsonb,'The called-for monument',
 'In the priority of calls, called-for monuments outrank calls for direction, distance, and area, because monuments best reflect the parties'' intent and where the line was actually marked.',
 'medium','f5000007-0000-0000-0000-000000000007','FS',ARRAY['fs-boundary','fs-m7','genre:boundary-legal']::text[],true,'approved','[]'::jsonb,false,NULL,0.01),
-- sibling — riparian vs littoral
('fa320000-0000-0000-0000-000000000009',
 'Land bordering a flowing river or stream carries ______ rights, while land bordering a lake, sea, or ocean carries ______ rights.',
 'multiple_choice','["littoral; riparian","riparian; littoral","fee; leasehold","dominant; servient"]'::jsonb,'riparian; littoral',
 'Riparian rights attach to land along flowing watercourses (rivers/streams); littoral rights attach to land along static bodies of water (lakes, seas, oceans).',
 'medium','f5000007-0000-0000-0000-000000000007','FS',ARRAY['fs-boundary','fs-m7','genre:boundary-legal']::text[],true,'approved','[]'::jsonb,false,NULL,0.01),
-- sibling — adverse possession
('fa320000-0000-0000-0000-00000000000a',
 'Which of the following is NOT one of the traditional elements of adverse possession?',
 'multiple_choice','["Open and notorious use","Continuous use for the statutory period","Hostile (adverse) and exclusive possession","Holding a recorded warranty deed to the land"]'::jsonb,'Holding a recorded warranty deed to the land',
 'Adverse possession requires actual, open and notorious, continuous, hostile (adverse), and exclusive possession for the statutory period. Holding record title is not required — that is the opposite of adverse possession (though "color of title" can shorten the period in some states).',
 'medium','f5000007-0000-0000-0000-000000000007','FS',ARRAY['fs-boundary','fs-m7','genre:boundary-legal']::text[],true,'approved','[]'::jsonb,false,NULL,0.01);

-- Q23 mirror — tidal datum epoch (numeric)
INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty, module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
('fa320000-0000-0000-0000-00000000000b',
 'The principal tidal datums (e.g., mean high water) in the United States are determined from the average of tidal observations over a period of how many full years (the National Tidal Datum Epoch)?',
 'numeric_input','[]'::jsonb,'19',
 'The National Tidal Datum Epoch is a 19-year period, chosen to average out the ~18.6-year lunar nodal cycle.',
 'medium','f5000007-0000-0000-0000-000000000007','FS',ARRAY['fs-boundary','fs-m7','fs-exam-mirror','genre:boundary-legal']::text[],true,'approved','[{"type":"handbook","label":"Tidal datums"}]'::jsonb,false,0.5);
