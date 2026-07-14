-- 427_fs_prep_business_questions.sql
-- FS Exam Alignment Buildout — Slice S11.
-- Business Concepts (Module 11) questions: the exam-mirror items Q41 (financing
-- interest), Q42 (confined space, multi_select), Q43 (partnership), Q44
-- (consideration), Q45 (ethics), plus siblings, and 3 regenerable engineering-
-- economics dynamic templates. Idempotent: delete-by-tag then insert.

DELETE FROM question_bank WHERE 'fs-business' = ANY(tags);
DELETE FROM problem_templates WHERE 'fs-business' = ANY(tags);

-- ─── Dynamic templates (regenerable engineering economics) ───────────────────
INSERT INTO problem_templates
  (id, name, description, category, subcategory, question_type, difficulty, question_template, answer_formula, answer_format, parameters, computed_vars, solution_steps_template, options_generator, explanation_template, module_id, exam_category, tags, diagram, is_active, created_by)
VALUES
('fa27f000-0000-0000-0000-000000000001',
 'Financing cost — simple interest on a declining balance',
 'Total added interest when a purchase is repaid with equal annual principal plus simple interest on the remaining balance.',
 'FS — Business Concepts','Engineering economics','numeric_input','medium',
 'Your firm finances a survey system for ${{P}} at {{ratePct}}% simple interest, repaying ${{pmt}} of principal plus interest at the end of each year for {{n}} years. The additional cost of financing versus paying cash is most nearly (in $)?',
 'P*i*(n+1)/2','{"decimals":0,"unit":"$","tolerance":1}',
 '[{"name":"pmt","type":"choice","choices":[5000,8000,10000,12000]},{"name":"n","type":"choice","choices":[4,5,6]},{"name":"ratePct","type":"choice","choices":[6,7,8,9,10]}]'::jsonb,
 '[{"name":"P","formula":"pmt*n"},{"name":"i","formula":"ratePct/100"}]'::jsonb,
 '[{"step_number":1,"title":"Balance declines linearly, so total interest = P·i·(n+1)/2","calculation_template":"{{P}} × {{ratePct}}% × ({{n}}+1)/2"},{"step_number":2,"title":"Total interest","result_template":"${{_answer}}"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Repaying equal principal of ${{pmt}} each year, the balance steps down uniformly, so total simple interest = P·i·(n+1)/2 = {{P}} × {{ratePct}}% × ({{n}}+1)/2 = ${{_answer}}.',
 'f500000b-0000-0000-0000-00000000000b','FS',
 ARRAY['fs-business','fs-m11','fs-dynamic','genre:business-econ','fs-exam-mirror']::text[],NULL,true,'fs:m11'),

('fa27f000-0000-0000-0000-000000000002',
 'Compound future worth of a single sum',
 'Future value of a present amount at compound annual interest.',
 'FS — Business Concepts','Engineering economics','numeric_input','medium',
 'You invest ${{P}} at {{ratePct}}% compounded annually for {{n}} years. The future value is most nearly (in $)?',
 'P*pow(1+i,n)','{"decimals":0,"unit":"$","tolerance":10}',
 '[{"name":"P","type":"choice","choices":[5000,10000,15000,20000]},{"name":"ratePct","type":"choice","choices":[4,5,6,7,8]},{"name":"n","type":"choice","choices":[5,8,10,12]}]'::jsonb,
 '[{"name":"i","formula":"ratePct/100"}]'::jsonb,
 '[{"step_number":1,"title":"Apply F = P(1+i)^n","calculation_template":"{{P}} × (1+{{i}})^{{n}}"},{"step_number":2,"title":"Future value","result_template":"${{_answer}}"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Future worth of a single sum: F = P(1+i)^n = {{P}}(1+{{i}})^{{n}} = ${{_answer}}.',
 'f500000b-0000-0000-0000-00000000000b','FS',
 ARRAY['fs-business','fs-m11','fs-dynamic','genre:business-econ']::text[],NULL,true,'fs:m11'),

('fa27f000-0000-0000-0000-000000000003',
 'Straight-line depreciation (annual)',
 'Annual straight-line depreciation from cost, salvage and life.',
 'FS — Business Concepts','Engineering economics','numeric_input','easy',
 'A ${{C}} survey vehicle has a ${{S}} salvage value and a {{n}}-year useful life. Using straight-line depreciation, the annual depreciation is most nearly (in $)?',
 '(C-S)/n','{"decimals":0,"unit":"$","tolerance":1}',
 '[{"name":"C","type":"choice","choices":[40000,50000,60000,72000]},{"name":"S","type":"choice","choices":[8000,10000,12000]},{"name":"n","type":"choice","choices":[5,6,8]}]'::jsonb,
 '[]'::jsonb,
 '[{"step_number":1,"title":"Apply D = (C−S)/n","calculation_template":"({{C}} − {{S}}) / {{n}}"},{"step_number":2,"title":"Annual depreciation","result_template":"${{_answer}}"}]'::jsonb,
 '{"method":"none"}'::jsonb,
 'Straight-line depreciation D = (C − S)/n = ({{C}} − {{S}})/{{n}} = ${{_answer}} per year.',
 'f500000b-0000-0000-0000-00000000000b','FS',
 ARRAY['fs-business','fs-m11','fs-dynamic','genre:business-econ']::text[],NULL,true,'fs:m11');

-- linked question_bank rows that surface the dynamic templates
INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty, module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, template_id, tolerance)
VALUES
('fa27b000-0000-0000-0000-000000000001','(dynamic — financing cost)','numeric_input','[]'::jsonb,'0','Total simple interest on a declining balance = P·i·(n+1)/2.','medium','f500000b-0000-0000-0000-00000000000b','FS',ARRAY['fs-business','fs-m11','fs-dynamic']::text[],true,'approved','[{"type":"handbook","label":"Engineering economics"}]'::jsonb,true,'fa27f000-0000-0000-0000-000000000001',1),
('fa27b000-0000-0000-0000-000000000002','(dynamic — compound future worth)','numeric_input','[]'::jsonb,'0','F = P(1+i)^n.','medium','f500000b-0000-0000-0000-00000000000b','FS',ARRAY['fs-business','fs-m11','fs-dynamic']::text[],true,'approved','[{"type":"handbook","label":"Engineering economics"}]'::jsonb,true,'fa27f000-0000-0000-0000-000000000002',10),
('fa27b000-0000-0000-0000-000000000003','(dynamic — straight-line depreciation)','numeric_input','[]'::jsonb,'0','D = (C−S)/n.','easy','f500000b-0000-0000-0000-00000000000b','FS',ARRAY['fs-business','fs-m11','fs-dynamic']::text[],true,'approved','[{"type":"handbook","label":"Engineering economics"}]'::jsonb,true,'fa27f000-0000-0000-0000-000000000003',1);

-- ─── Static questions (exam-mirror + siblings) ───────────────────────────────
INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty, module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
-- Q42 mirror (multi_select) — confined space characteristics
('fa270000-0000-0000-0000-000000000001',
 'Which of the following characteristics describe a confined space? Select the three that apply.',
 'multi_select',
 '["Large enough for an employee to enter fully and perform assigned work","Designed for continuous occupancy by the employee","Has a limited or restricted means of entry or exit","Contains a recognized serious safety or health hazard","Has concrete floors"]'::jsonb,
 '["Large enough for an employee to enter fully and perform assigned work","Has a limited or restricted means of entry or exit","Contains a recognized serious safety or health hazard"]',
 'A confined space is large enough to enter and work, has limited/restricted entry or exit, and is NOT designed for continuous occupancy. A permit-required confined space additionally contains (or can contain) a recognized serious hazard. "Designed for continuous occupancy" is the opposite of the definition; concrete floors are irrelevant.',
 'medium','f500000b-0000-0000-0000-00000000000b','FS',ARRAY['fs-business','fs-m11','fs-exam-mirror','genre:business-safety']::text[],true,'approved','[{"type":"handbook","label":"Safety — confined spaces (OSHA)"}]'::jsonb,false,0.01),
-- permit-required confined space
('fa270000-0000-0000-0000-000000000002',
 'What additional characteristic makes a confined space a PERMIT-REQUIRED confined space?',
 'multiple_choice',
 '["It has a concrete floor","It contains or has the potential to contain a hazardous atmosphere","It is located outdoors","It is larger than 100 cubic feet"]'::jsonb,
 'It contains or has the potential to contain a hazardous atmosphere',
 'A permit-required confined space has one or more of: a hazardous atmosphere, engulfment potential, an inwardly-converging/entrapment configuration, or another recognized serious hazard — beyond the base confined-space definition.',
 'medium','f500000b-0000-0000-0000-00000000000b','FS',ARRAY['fs-business','fs-m11','genre:business-safety']::text[],true,'approved','[]'::jsonb,false,0.01),
-- Q43 mirror — partnership
('fa270000-0000-0000-0000-000000000003',
 'Which of the following is true of a partnership?',
 'multiple_choice',
 '["It can sell stocks or shares","It exists independently of the people who own and manage it","It is the most common type of business","It is a business owned by two or more people working for a profit"]'::jsonb,
 'It is a business owned by two or more people working for a profit',
 'A partnership is a business owned by two or more people for profit. Selling stock and existing independently of its owners describe a corporation; the most common form is the sole proprietorship.',
 'easy','f500000b-0000-0000-0000-00000000000b','FS',ARRAY['fs-business','fs-m11','fs-exam-mirror','genre:business-entities']::text[],true,'approved','[]'::jsonb,false,0.01),
-- Q43 sibling — corporation
('fa270000-0000-0000-0000-000000000004',
 'Which statement best describes a corporation?',
 'multiple_choice',
 '["It is owned by two or more people working for a profit","It exists independently of its owners and can issue stock","Its owners have unlimited personal liability for its debts","It cannot have more than one owner"]'::jsonb,
 'It exists independently of its owners and can issue stock',
 'A corporation is a legal entity separate from its shareholders; it can issue stock and its owners generally have limited liability. Unlimited liability describes a sole proprietorship or general partnership.',
 'easy','f500000b-0000-0000-0000-00000000000b','FS',ARRAY['fs-business','fs-m11','genre:business-entities']::text[],true,'approved','[]'::jsonb,false,0.01),
-- entity liability
('fa270000-0000-0000-0000-000000000005',
 'Which business form exposes the owner to UNLIMITED personal liability for the business''s debts?',
 'multiple_choice',
 '["Corporation","Limited liability company (LLC)","Sole proprietorship","Professional corporation (PC)"]'::jsonb,
 'Sole proprietorship',
 'A sole proprietorship (and a general partnership) provides no liability shield — the owner is personally liable. Corporations, LLCs, and PCs limit owner liability.',
 'easy','f500000b-0000-0000-0000-00000000000b','FS',ARRAY['fs-business','fs-m11','genre:business-entities']::text[],true,'approved','[]'::jsonb,false,0.01),
-- Q44 mirror — consideration
('fa270000-0000-0000-0000-000000000006',
 'Which of the following is the consideration portion of a valid contract?',
 'multiple_choice',
 '["The ability to sign for an entity","The legal subject matter","The names of the parties","The value exchanged between the parties"]'::jsonb,
 'The value exchanged between the parties',
 'Consideration is something of value exchanged between the parties (money, goods, services, or a promise) that both bargained for. Capacity to sign, legal subject matter, and identifying the parties are separate requirements.',
 'medium','f500000b-0000-0000-0000-00000000000b','FS',ARRAY['fs-business','fs-m11','fs-exam-mirror','genre:business-contracts']::text[],true,'approved','[]'::jsonb,false,0.01),
-- Q44 sibling — contract elements
('fa270000-0000-0000-0000-000000000007',
 'Which of the following is NOT one of the required elements of a valid, enforceable contract?',
 'multiple_choice',
 '["Offer and acceptance","Consideration","A professional seal","Capacity and a lawful purpose"]'::jsonb,
 'A professional seal',
 'A valid contract requires offer, acceptance, consideration, capacity, and legality (lawful purpose). A professional seal is not a contract element.',
 'medium','f500000b-0000-0000-0000-00000000000b','FS',ARRAY['fs-business','fs-m11','genre:business-contracts']::text[],true,'approved','[]'::jsonb,false,0.01),
-- Q45 mirror — ethics foremost responsibility
('fa270000-0000-0000-0000-000000000008',
 'Under the NCEES Model Rules, the first and foremost responsibility of a professional surveyor is to the:',
 'multiple_choice',
 '["client","employer","public welfare","surveying association"]'::jsonb,
 'public welfare',
 'The Model Rules of Professional Conduct state that a licensee''s first and foremost responsibility is to safeguard the health, safety, and welfare of the public when serving clients and employers.',
 'easy','f500000b-0000-0000-0000-00000000000b','FS',ARRAY['fs-business','fs-m11','fs-exam-mirror','genre:business-ethics']::text[],true,'approved','[{"type":"handbook","label":"NCEES Model Rules §240.15"}]'::jsonb,false,0.01),
-- ethics competence
('fa270000-0000-0000-0000-000000000009',
 'A surveyor is asked to perform a geodetic control project well outside their training and experience. Under the Model Rules, the surveyor should:',
 'multiple_choice',
 '["Accept the work and learn on the job","Perform services only in areas of their competence, or associate with a qualified professional","Subcontract without telling the client","Decline all work that is unfamiliar"]'::jsonb,
 'Perform services only in areas of their competence, or associate with a qualified professional',
 'The Model Rules require licensees to undertake assignments only when qualified by education/experience, or to associate a qualified professional for parts outside their competence.',
 'medium','f500000b-0000-0000-0000-00000000000b','FS',ARRAY['fs-business','fs-m11','genre:business-ethics']::text[],true,'approved','[]'::jsonb,false,0.01),
-- ethics conflict of interest
('fa270000-0000-0000-0000-00000000000a',
 'A surveyor discovers a potential conflict of interest on a project. The Model Rules require the surveyor to:',
 'multiple_choice',
 '["Ignore it if the work is unaffected","Promptly and fully disclose it to all affected parties","Resign from the profession","Keep it confidential from the client"]'::jsonb,
 'Promptly and fully disclose it to all affected parties',
 'Licensees must avoid conflicts of interest and, where unavoidable, promptly and fully disclose them to all affected parties.',
 'medium','f500000b-0000-0000-0000-00000000000b','FS',ARRAY['fs-business','fs-m11','genre:business-ethics']::text[],true,'approved','[]'::jsonb,false,0.01),
-- standard of care
('fa270000-0000-0000-0000-00000000000b',
 'A professional surveyor is generally legally responsible for:',
 'multiple_choice',
 '["Guaranteeing perfect, error-free results","Exercising the standard of care of a reasonably prudent surveyor under similar conditions","Any error, regardless of cause","Only errors admitted in writing"]'::jsonb,
 'Exercising the standard of care of a reasonably prudent surveyor under similar conditions',
 'A surveyor owes the standard of care — the skill and diligence a reasonably prudent surveyor would exercise under similar conditions. Falling below it and causing damage is negligence; the surveyor does not guarantee perfection.',
 'medium','f500000b-0000-0000-0000-00000000000b','FS',ARRAY['fs-business','fs-m11','genre:business-practice']::text[],true,'approved','[]'::jsonb,false,0.01),
-- professional practice entity
('fa270000-0000-0000-0000-00000000000c',
 'In most states, a firm offering professional surveying services to the public must be organized as a:',
 'multiple_choice',
 '["Sole proprietorship only","Professional entity such as a PLLC or professional corporation (PC)","General partnership only","Nonprofit corporation"]'::jsonb,
 'Professional entity such as a PLLC or professional corporation (PC)',
 'Most states require professional practice through a professional entity (PLLC or PC) with a licensed professional in responsible charge, so that professional responsibility is maintained.',
 'medium','f500000b-0000-0000-0000-00000000000b','FS',ARRAY['fs-business','fs-m11','genre:business-entities']::text[],true,'approved','[]'::jsonb,false,0.01),
-- OSHA 811
('fa270000-0000-0000-0000-00000000000d',
 'Before any digging or subsurface investigation, a survey crew should first:',
 'multiple_choice',
 '["Call 811 / One-Call to have underground utilities located","Notify the state board","Purchase additional insurance","Set control monuments"]'::jsonb,
 'Call 811 / One-Call to have underground utilities located',
 'Calling 811 (One-Call) to have existing underground utilities marked is required before excavation to prevent utility strikes — a core field-safety practice.',
 'easy','f500000b-0000-0000-0000-00000000000b','FS',ARRAY['fs-business','fs-m11','genre:business-safety']::text[],true,'approved','[]'::jsonb,false,0.01),
-- sole proprietorship most common
('fa270000-0000-0000-0000-00000000000e',
 'Which is the simplest and most common form of business organization, in which the owner and the business are legally the same?',
 'multiple_choice',
 '["Corporation","Partnership","Sole proprietorship","Limited liability company"]'::jsonb,
 'Sole proprietorship',
 'The sole proprietorship is the simplest and most common form; the owner and the business are one and the same, with unlimited personal liability.',
 'easy','f500000b-0000-0000-0000-00000000000b','FS',ARRAY['fs-business','fs-m11','genre:business-entities']::text[],true,'approved','[]'::jsonb,false,0.01),
-- breach remedy
('fa270000-0000-0000-0000-00000000000f',
 'If one party fails to perform its obligations under a valid contract (a breach), the other party may generally seek:',
 'multiple_choice',
 '["Nothing; contracts are unenforceable","Monetary damages, specific performance, or rescission","Immediate license revocation of the breaching party","Only a verbal apology"]'::jsonb,
 'Monetary damages, specific performance, or rescission',
 'On breach, typical legal remedies are damages (compensation), specific performance (compelling performance), or rescission (cancelling the contract).',
 'medium','f500000b-0000-0000-0000-00000000000b','FS',ARRAY['fs-business','fs-m11','genre:business-contracts']::text[],true,'approved','[]'::jsonb,false,0.01);
