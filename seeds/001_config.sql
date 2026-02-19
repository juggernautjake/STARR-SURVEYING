-- ============================================================================
-- 001_config.sql
-- System configuration data: badges, XP milestones, rewards catalog,
-- pay rates, credentials, alerts, and global settings.
-- These are platform-level settings, not learning content.
--
-- Depends on: Schema + all migrations applied
-- ============================================================================

BEGIN;

-- ── Schema patches (add columns that may not exist yet) ───────────────────
ALTER TABLE learning_lessons ADD COLUMN IF NOT EXISTS content_migrated BOOLEAN DEFAULT FALSE;

-- ── XP Pay Milestones ─────────────────────────────────────────────────────
INSERT INTO xp_pay_milestones (xp_threshold, bonus_per_hour, label, description) VALUES
(10000, 0.50, 'XP Apprentice', 'First 10,000 XP earned'),
(20000, 0.50, 'XP Journeyman', '20,000 total XP'),
(30000, 0.50, 'XP Craftsman', '30,000 total XP'),
(40000, 0.50, 'XP Expert', '40,000 total XP'),
(50000, 0.50, 'XP Master', '50,000 total XP'),
(60000, 0.50, 'XP Grand Master', '60,000 total XP')
ON CONFLICT (xp_threshold) DO NOTHING;

-- ── Badges ────────────────────────────────────────────────────────────────
INSERT INTO badges (badge_key, name, description, icon, category, xp_reward, sort_order) VALUES
('fs_ready', 'FS Exam Ready', 'Completed all 8 FS prep modules and passed mock exam 70%+', '🎯', 'certification', 3500, 1),
('fs_all_modules', 'FS Scholar', 'Completed all 8 FS study modules', '📚', 'achievement', 1000, 2),
('fs_perfect_mock', 'FS Ace', 'Scored 90%+ on the FS mock exam', '⭐', 'achievement', 2000, 3),
('first_module', 'First Steps', 'Completed your first learning module', '👣', 'milestone', 100, 10),
('five_modules', 'Knowledge Seeker', 'Completed 5 learning modules', '🔍', 'milestone', 250, 11),
('ten_modules', 'Dedicated Learner', 'Completed 10 learning modules', '📖', 'milestone', 500, 12),
('twenty_modules', 'Module Master', 'Completed 20 learning modules', '🏅', 'milestone', 1000, 13),
('first_quiz_pass', 'Quiz Champion', 'Passed your first quiz 70%+', '✅', 'milestone', 50, 20),
('perfect_quiz', 'Perfect Score', 'Scored 100% on any quiz', '💯', 'achievement', 500, 21),
('sit_certified', 'SIT Certified', 'Passed the Surveyor Intern Test', '📋', 'certification', 5000, 30),
('rpls_certified', 'RPLS Licensed', 'RPLS license earned', '⚖️', 'certification', 5000, 31),
('one_year', 'One Year Strong', '1 year with the company', '🗓️', 'milestone', 500, 40),
('three_years', 'Three Year Veteran', '3 years with the company', '🌟', 'milestone', 1000, 41),
('five_years', 'Five Year Legend', '5 years with the company', '🏆', 'milestone', 2000, 42),
('xp_5k', 'XP Apprentice', 'Earned 5,000 total XP', '🔰', 'milestone', 0, 50),
('xp_10k', 'XP Journeyman', 'Earned 10,000 total XP', '⚡', 'milestone', 0, 51),
('xp_25k', 'XP Expert', 'Earned 25,000 total XP', '🌊', 'milestone', 0, 52),
('xp_50k', 'XP Master', 'Earned 50,000 total XP', '🔥', 'milestone', 0, 53)
ON CONFLICT (badge_key) DO NOTHING;

-- ── Rewards Catalog ───────────────────────────────────────────────────────
INSERT INTO rewards_catalog (name, description, category, xp_cost, tier, sort_order) VALUES
('Company Sticker Pack', '5 vinyl stickers', 'accessories', 500, 'bronze', 1),
('Company Decal', 'Window/bumper decal', 'accessories', 750, 'bronze', 2),
('Company Koozie', 'Insulated drink koozie', 'accessories', 500, 'bronze', 3),
('$5 Gift Card', '$5 restaurant gift card', 'gift_cards', 500, 'bronze', 4),
('Company Pen Set', 'Pen and mechanical pencil set', 'accessories', 600, 'bronze', 5),
('Company T-Shirt', 'Crew neck t-shirt', 'apparel', 2000, 'silver', 10),
('Company Hat', 'Snapback cap', 'apparel', 2000, 'silver', 11),
('$10 Gift Card', 'Gift card', 'gift_cards', 1000, 'silver', 12),
('Company Water Bottle', '32oz insulated bottle', 'gear', 1500, 'silver', 13),
('Phone Charger', 'Portable battery pack', 'gear', 2500, 'silver', 14),
('$20 Gift Card', 'Gift card', 'gift_cards', 2000, 'silver', 15),
('$50 Academy Gift Card', 'Academy Sports gift card', 'gift_cards', 5000, 'gold', 20),
('$50 Steakhouse Gift Card', 'Steakhouse gift card', 'gift_cards', 5000, 'gold', 21),
('Company Polo Shirt', 'Premium polo', 'apparel', 4000, 'gold', 22),
('$10 Cash Bonus', 'Added to paycheck', 'cash_bonus', 1000, 'gold', 23),
('Leatherman Multi-Tool', 'Leatherman Wingman', 'gear', 7500, 'gold', 24),
('$25 Cash Bonus', 'Added to paycheck', 'cash_bonus', 2500, 'gold', 25),
('Work Boots', 'Up to $150 value', 'gear', 10000, 'platinum', 30),
('Quality Pocket Knife', 'Benchmade or Kershaw', 'gear', 10000, 'platinum', 31),
('$50 Cash Bonus', 'Added to paycheck', 'cash_bonus', 5000, 'platinum', 32),
('Bluetooth Speaker', 'JBL Flip or equivalent', 'gear', 12000, 'platinum', 33),
('Yeti Tumbler Set', 'Set of 2 Yeti Ramblers', 'gear', 8000, 'platinum', 34),
('Carhartt Jacket', 'Detroit jacket or equivalent', 'apparel', 20000, 'diamond', 40),
('$100 Cash Bonus', 'Added to paycheck', 'cash_bonus', 10000, 'diamond', 41),
('Premium Cooler', 'Yeti Roadie or RTIC 20', 'gear', 25000, 'diamond', 42),
('$200 Academy Gift Card', 'Academy Sports', 'gift_cards', 20000, 'diamond', 43),
('Custom Embroidered Jacket', 'Your name + STARR logo', 'apparel', 15000, 'diamond', 44)
ON CONFLICT DO NOTHING;

-- ── Admin Alert Settings ──────────────────────────────────────────────────
INSERT INTO admin_alert_settings (alert_type, enabled, notify_admins, notify_employee) VALUES
('module_complete', true, true, true),
('milestone_reached', true, true, true),
('store_purchase', true, true, true),
('exam_passed', true, true, true),
('badge_earned', true, true, true),
('credential_added', true, true, false),
('pay_raise_triggered', true, true, true),
('course_complete', true, true, true)
ON CONFLICT (alert_type) DO NOTHING;

-- ── Work Type Rates ───────────────────────────────────────────────────────
INSERT INTO work_type_rates (work_type, label, base_rate, icon, description, sort_order) VALUES
('field_work',     'Field Work',           20.00, '📡', 'Data collection, staking, GPS/total station work in the field', 1),
('drawing',        'Drawing / Drafting',   23.00, '📐', 'CAD drafting, plat drawing, map creation', 2),
('driving',        'Driving',              16.00, '🚗', 'Travel to/from job sites, equipment transport', 3),
('research',       'Research',             18.00, '🔍', 'Deed research, title search, record retrieval', 4),
('equipment_maint','Equipment Maintenance',14.00, '🔧', 'Calibration, cleaning, repair of survey instruments', 5),
('education',      'Education / Training', 15.00, '📚', 'Coursework, study time, exam prep, training sessions', 6),
('office',         'Office / Admin',       16.00, '🏢', 'General office work, data entry, filing, calls', 7),
('supervision',    'Supervision',          22.00, '👔', 'Managing crew, job oversight, quality review', 8),
('legal',          'Legal / Compliance',   20.00, '⚖️', 'Legal descriptions, court prep, regulatory compliance', 9),
('misc',           'Miscellaneous',        15.00, '📋', 'Other tasks not covered by specific categories', 10)
ON CONFLICT (work_type) DO NOTHING;

-- ── Role Tiers ────────────────────────────────────────────────────────────
INSERT INTO role_tiers (role_key, label, base_bonus, description, sort_order) VALUES
('intern',           'Intern',                    0.00, 'Student or entry-level intern, learning the trade',                1),
('field_hand',       'Field Hand',                1.00, 'Entry-level field worker, assists survey crew',                    2),
('rodman',           'Rodman',                    2.00, 'Holds rod/prism, assists instrument operator',                    3),
('instrument_op',    'Instrument Operator',       4.00, 'Operates total station, GPS receiver in field',                   4),
('survey_tech',      'Survey Technician',         6.00, 'Experienced tech, can run field or office tasks',                 5),
('party_chief',      'Party Chief',              10.00, 'Leads field crew, makes field decisions',                         6),
('sit',              'Surveyor in Training (SIT)', 8.00, 'Passed SIT exam, working toward RPLS',                           7),
('survey_drafter',   'Survey Drafter',            7.00, 'Specializes in CAD/drafting work',                                8),
('project_manager',  'Project Manager',          12.00, 'Manages multiple jobs, client relations',                         9),
('rpls',             'RPLS',                     22.00, 'Registered Professional Land Surveyor',                          10),
('senior_rpls',      'Senior RPLS',              28.00, 'Senior RPLS with 10+ years licensed',                            11),
('owner',            'Owner / Principal',        45.00, 'Company owner or principal surveyor',                            12),
('admin_staff',      'Administrative Staff',      2.00, 'Secretary, office manager, receptionist',                        13),
('it_support',       'IT / Tech Support',         5.00, 'Technology, website, software support',                          14)
ON CONFLICT (role_key) DO NOTHING;

-- ── Seniority Brackets ────────────────────────────────────────────────────
INSERT INTO seniority_brackets (min_years, max_years, bonus_per_hour, label) VALUES
(0,  0,  0.00, 'New Hire (< 1 year)'),
(1,  1,  0.50, '1 year'),
(2,  2,  1.00, '2 years'),
(3,  4,  2.00, '3-4 years'),
(5,  6,  3.50, '5-6 years'),
(7,  9,  5.00, '7-9 years'),
(10, 14, 7.00, '10-14 years'),
(15, 19, 9.00, '15-19 years'),
(20, NULL, 12.00, '20+ years')
ON CONFLICT DO NOTHING;

-- ── Credential Bonuses ────────────────────────────────────────────────────
INSERT INTO credential_bonuses (credential_key, label, bonus_per_hour, credential_type, description, sort_order) VALUES
('sit_exam',       'SIT Exam Passed',            2.00, 'exam',     'Surveyor in Training examination',                      1),
('fs_exam',        'FS Exam Passed',             1.50, 'exam',     'Fundamentals of Surveying examination',                 2),
('rpls_license',   'RPLS License',               3.00, 'license',  'Registered Professional Land Surveyor license',         3),
('osha_30',        'OSHA 30-Hour',               0.50, 'safety',   'OSHA 30-hour construction safety certification',        4),
('osha_10',        'OSHA 10-Hour',               0.25, 'safety',   'OSHA 10-hour general safety certification',             5),
('faa_part107',    'FAA Part 107 (Drone)',        1.00, 'license',  'FAA remote pilot certificate for drone operations',     6),
('first_aid_cpr',  'First Aid / CPR',            0.25, 'safety',   'Current first aid and CPR certification',               7),
('hazwoper',       'HAZWOPER 40-Hour',           0.75, 'safety',   'Hazardous waste operations certification',              8),
('cad_cert',       'CAD Certification',          0.50, 'in_house', 'Completed internal CAD proficiency course',             9),
('trimble_cert',   'Trimble Certified',          0.50, 'in_house', 'Completed Trimble equipment proficiency course',       10),
('gis_cert',       'GIS Certification',          0.50, 'in_house', 'Completed GIS proficiency course',                     11),
('field_safety',   'Field Safety Course',        0.25, 'in_house', 'Completed internal field safety training',             12),
('boundary_course','Boundary Law Course',        0.50, 'in_house', 'Completed boundary law & evidence course',             13),
('legal_desc',     'Legal Description Course',   0.25, 'in_house', 'Completed legal description writing course',           14)
ON CONFLICT (credential_key) DO NOTHING;

-- ── Pay System Config ─────────────────────────────────────────────────────
INSERT INTO pay_system_config (key, value, description) VALUES
('max_credential_stack',  8.00,  'Maximum total $/hr from all credential bonuses combined'),
('max_seniority_bonus',   8.00,  'Maximum seniority bonus $/hr (should match 20+ yr bracket)'),
('max_xp_milestone_bonus', 3.00, 'Maximum total $/hr from XP milestones (6 milestones x $0.50 = $3 cap)'),
('max_course_bonus',      3.00,  'Maximum total $/hr from completed college courses (6 courses x $0.50 = $3 cap)'),
('xp_milestone_bonus',    0.50,  'Bonus per hour per XP milestone achieved'),
('xp_milestone_interval', 10000, 'XP required per milestone'),
('course_bonus',          0.50,  'Bonus per hour per surveying course passed'),
('overtime_multiplier',   1.50,  'Overtime rate multiplier'),
('overtime_threshold_weekly', 40, 'Hours per week before overtime kicks in')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = now();

-- ── Default XP Config ─────────────────────────────────────────────────────
INSERT INTO module_xp_config (module_type, module_id, xp_value, expiry_months, difficulty_rating) VALUES
('learning_module', NULL, 500, 18, 3),
('fs_module', NULL, 500, 24, 4)
ON CONFLICT DO NOTHING;

COMMIT;

SELECT 'System config seeded successfully.' AS status;
