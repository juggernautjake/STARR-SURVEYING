-- ============================================================================
-- 040_drone.sql
-- Drone/UAS surveying module: FAA Part 107, flight operations, photogrammetry,
-- LiDAR, and data processing. Lessons, flashcards, and quiz questions.
-- Depends on: 001_config.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: DRONE SURVEYING MODULE
-- ============================================================================

INSERT INTO learning_modules (id, title, description, difficulty, estimated_hours, order_index, status, tags, xp_reward, created_at, updated_at)
VALUES
  ('da5e0001-0000-0000-0000-000000000001',
   'Drone Surveying — UAS for Land Surveying',
   'A comprehensive introduction to unmanned aircraft systems (UAS) for surveying and mapping. Covers FAA Part 107 regulations, drone hardware and sensors, flight planning, ground control, photogrammetry, LiDAR, data processing, mapping products, volumetric analysis, construction applications, and accuracy assessment. No prerequisites — designed for surveyors looking to add drone capabilities to their toolkit.',
   'intermediate', 24.0, 32, 'published',
   ARRAY['drone','UAS','surveying','photogrammetry','LiDAR','mapping'],
   400, now(), now())
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- SECTION 2: LESSONS (12 instructional + 1 final exam)
-- ============================================================================

INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  -- Lesson 1
  ('da5e0b01-0000-0000-0000-000000000001', 'da5e0001-0000-0000-0000-000000000001',
   'Lesson 1: Introduction to Drone Surveying',
   'This lesson introduces unmanned aircraft systems (UAS) as a tool for land surveying and mapping. Topics covered include: the history and evolution of drone surveying from military origins to commercial use, key advantages of drones over traditional surveying methods (speed, safety, access to difficult terrain), common applications in boundary surveys, topographic mapping, construction monitoring, agriculture, and environmental assessment. Students will learn the basic workflow of a drone survey: mission planning, data acquisition, processing, and deliverables. The lesson also covers career opportunities in the rapidly growing UAS surveying industry and how drone surveying fits within the broader surveying profession.',
   ARRAY['Define UAS and explain its role in modern surveying','List five common applications of drone surveying','Describe the basic drone survey workflow','Identify advantages and limitations compared to traditional methods'],
   1, 60, '[]'::jsonb, '[]'::jsonb,
   ARRAY['drone-surveying','lesson-1','introduction','UAS'], 'published'),

  -- Lesson 2
  ('da5e0b02-0000-0000-0000-000000000001', 'da5e0001-0000-0000-0000-000000000001',
   'Lesson 2: FAA Part 107 Regulations and Airspace',
   'This lesson covers the Federal Aviation Administration (FAA) regulations governing commercial drone operations in the United States. Topics include: the Part 107 Remote Pilot Certificate requirements (minimum age 16, knowledge test, TSA vetting), operational limitations (400 ft AGL maximum altitude, visual line of sight, daylight or civil twilight with anti-collision lights, 100 mph maximum speed), airspace classifications (Class B, C, D, E, G) and where drone flight is permitted, the LAANC (Low Altitude Authorization and Notification Capability) system for real-time airspace authorization, temporary flight restrictions (TFRs), the waiver process for beyond-standard operations, and record-keeping requirements.',
   ARRAY['Explain Part 107 certification requirements and process','List the standard operational limitations for drone flight','Identify airspace classes and their implications for UAS operations','Describe the LAANC authorization process','Understand when a waiver is required'],
   2, 60, '[]'::jsonb, '[]'::jsonb,
   ARRAY['drone-surveying','lesson-2','FAA','Part-107','regulations','airspace'], 'published'),

  -- Lesson 3
  ('da5e0b03-0000-0000-0000-000000000001', 'da5e0001-0000-0000-0000-000000000001',
   'Lesson 3: Drone Hardware and Sensor Technology',
   'This lesson examines the hardware platforms and sensors used in drone surveying. Topics include: multirotor vs fixed-wing drones and when to use each, popular surveying drones (DJI Matrice series, senseFly eBee, WingtraOne), RGB cameras and resolution specifications, mechanical vs electronic shutters and rolling shutter effects, multispectral and thermal imaging sensors, LiDAR payloads (RIEGL, DJI Zenmuse L series), RTK and PPK GNSS modules for direct georeferencing, battery technology and flight time considerations, payload capacity, and pre-flight inspection checklists.',
   ARRAY['Compare multirotor and fixed-wing drone platforms','Identify key camera specifications that affect survey quality','Explain RTK and PPK GNSS capabilities on drones','Describe different sensor types and their applications','Perform a pre-flight hardware inspection'],
   3, 60, '[]'::jsonb, '[]'::jsonb,
   ARRAY['drone-surveying','lesson-3','hardware','sensors','cameras','LiDAR'], 'published'),

  -- Lesson 4
  ('da5e0b04-0000-0000-0000-000000000001', 'da5e0001-0000-0000-0000-000000000001',
   'Lesson 4: Flight Planning and Mission Design',
   'This lesson covers the critical planning stage of a drone survey. Topics include: ground sample distance (GSD) and its relationship to flight altitude, sensor pixel size, and focal length (GSD = pixel_size x altitude / focal_length), overlap requirements (typically 75% frontal and 65% side for photogrammetry), flight patterns (grid, double grid or crosshatch, circular for 3D modeling), mission planning software (DJI Pilot, Pix4Dcapture, DroneDeploy, Litchi), terrain following for consistent GSD over variable terrain, weather considerations (wind speed, cloud cover, sun angle), time-of-day planning for optimal lighting, and estimating battery and flight time requirements.',
   ARRAY['Calculate ground sample distance from camera and flight parameters','Determine appropriate overlap settings for different project types','Design an efficient flight plan using mission planning software','Account for terrain, weather, and lighting in mission design','Estimate flight time and battery requirements'],
   4, 60, '[]'::jsonb, '[]'::jsonb,
   ARRAY['drone-surveying','lesson-4','flight-planning','GSD','overlap','mission-design'], 'published'),

  -- Lesson 5
  ('da5e0b05-0000-0000-0000-000000000001', 'da5e0001-0000-0000-0000-000000000001',
   'Lesson 5: Ground Control Points and GNSS Integration',
   'This lesson covers the critical ground truth component of drone surveying. Topics include: what ground control points (GCPs) are and why they are essential for georeferencing accuracy, GCP target design (size, color, contrast), optimal GCP placement strategies (distribute around edges and across interior, avoid clustering, minimum 5 recommended), survey-grade GNSS receivers for GCP measurement, RTK base station setup and NTRIP corrections, post-processed kinematic (PPK) workflows, coordinate systems and datum considerations (NAD83, WGS84, state plane), the difference between GCPs (used in processing) and checkpoints (used for accuracy verification), and direct georeferencing with onboard RTK/PPK vs GCP-based georeferencing.',
   ARRAY['Explain the purpose and importance of ground control points','Design an effective GCP placement strategy','Set up and use a survey-grade GNSS receiver for GCP measurement','Distinguish between GCPs and checkpoints','Compare direct georeferencing with GCP-based approaches'],
   5, 60, '[]'::jsonb, '[]'::jsonb,
   ARRAY['drone-surveying','lesson-5','GCP','GNSS','RTK','PPK','ground-control'], 'published'),

  -- Lesson 6
  ('da5e0b06-0000-0000-0000-000000000001', 'da5e0001-0000-0000-0000-000000000001',
   'Lesson 6: Photogrammetry Fundamentals',
   'This lesson explains the science behind converting aerial photographs into 3D survey data. Topics include: the principles of photogrammetry and stereo vision, Structure from Motion (SfM) technology and how it differs from traditional aerial photogrammetry, the processing pipeline (feature detection, feature matching, sparse point cloud, bundle adjustment, dense point cloud, mesh generation, texture mapping), camera calibration and interior orientation parameters (focal length, principal point, lens distortion), exterior orientation (camera position and angle for each photo), the role of tie points in connecting overlapping images, georeferencing, quality metrics (reprojection error, GCP residuals), and common processing issues.',
   ARRAY['Explain the Structure from Motion (SfM) process','Describe the photogrammetric processing pipeline','Define interior and exterior orientation parameters','Understand the role of tie points and bundle adjustment','Interpret processing quality reports'],
   6, 60, '[]'::jsonb, '[]'::jsonb,
   ARRAY['drone-surveying','lesson-6','photogrammetry','SfM','bundle-adjustment'], 'published'),

  -- Lesson 7
  ('da5e0b07-0000-0000-0000-000000000001', 'da5e0001-0000-0000-0000-000000000001',
   'Lesson 7: LiDAR Drone Surveying',
   'This lesson covers light detection and ranging (LiDAR) technology for drone-based surveying. Topics include: how LiDAR works (laser pulse emission, time-of-flight measurement, georeferencing via GNSS/INS), differences between time-of-flight and phase-based LiDAR, single return vs multiple return LiDAR and vegetation penetration, point density and its impact on data quality, LiDAR system components (laser scanner, GNSS, inertial measurement unit, controller), point cloud classification (ground, vegetation, buildings, power lines), generating bare-earth DEMs from classified point clouds, LiDAR vs photogrammetry — when to use each, fusion of LiDAR and photogrammetric data, and current limitations and cost considerations.',
   ARRAY['Explain how LiDAR measures distances using laser pulses','Describe the advantage of multiple returns for vegetation penetration','Compare LiDAR and photogrammetry for different applications','Understand point cloud classification categories','Identify when LiDAR is preferred over photogrammetry'],
   7, 60, '[]'::jsonb, '[]'::jsonb,
   ARRAY['drone-surveying','lesson-7','LiDAR','point-cloud','vegetation-penetration'], 'published'),

  -- Lesson 8
  ('da5e0b08-0000-0000-0000-000000000001', 'da5e0001-0000-0000-0000-000000000001',
   'Lesson 8: Data Processing Workflows',
   'This lesson covers the software tools and step-by-step workflows for processing drone survey data. Topics include: overview of major processing platforms (Pix4Dmapper, Agisoft Metashape, DroneDeploy, WebODM, Trimble Business Center), the standard photogrammetric processing workflow (import images, align photos, set GCPs, optimize alignment, build dense cloud, generate mesh, create orthomosaic and DSM), LiDAR processing workflows (import raw data, apply trajectory solution, classify points, generate products), processing hardware requirements (RAM, GPU, storage), cloud-based vs local processing, quality report interpretation, common processing errors (poor alignment, doming effect, ghosting), and batch processing for large projects.',
   ARRAY['Navigate the standard photogrammetric processing workflow','Import and process drone imagery in common software platforms','Set ground control points in processing software','Interpret quality reports and identify processing issues','Troubleshoot common processing errors'],
   8, 60, '[]'::jsonb, '[]'::jsonb,
   ARRAY['drone-surveying','lesson-8','processing','Pix4D','Metashape','software'], 'published'),

  -- Lesson 9
  ('da5e0b09-0000-0000-0000-000000000001', 'da5e0001-0000-0000-0000-000000000001',
   'Lesson 9: Mapping Products — Orthomosaics, DSMs, and DTMs',
   'This lesson examines the primary deliverable products generated from drone survey data. Topics include: orthomosaics (geometrically corrected aerial images stitched together, suitable for direct measurement), digital surface models (DSM — elevation including buildings, trees, and other features), digital terrain models (DTM — bare earth elevation with features removed), the difference between DSM and DTM and when each is appropriate, contour line generation from elevation models, point cloud export and formats (LAS, LAZ, PLY), 3D mesh models and textured surfaces, reflectance maps and index maps from multispectral data, thermal maps, export formats and coordinate systems, and integration with CAD and GIS software.',
   ARRAY['Distinguish between orthomosaics, DSMs, and DTMs','Explain how an orthomosaic differs from a regular photograph','Generate contour lines from digital elevation models','Identify appropriate products for different client needs','Export drone survey products in standard formats'],
   9, 60, '[]'::jsonb, '[]'::jsonb,
   ARRAY['drone-surveying','lesson-9','orthomosaic','DSM','DTM','products','contours'], 'published'),

  -- Lesson 10
  ('da5e0b0a-0000-0000-0000-000000000001', 'da5e0001-0000-0000-0000-000000000001',
   'Lesson 10: Topographic and Volumetric Surveys',
   'This lesson covers how drone data is used for topographic mapping and volume calculations. Topics include: creating topographic maps from drone-derived elevation models, contour generation and contour interval selection, cut/fill analysis for earthwork projects, stockpile volume measurement (method, accuracy, comparison surfaces), volumetric computation methods (triangulated surface vs grid-based), monitoring volume changes over time with repeat flights, comparison of drone volumetrics with traditional methods (GPS survey, total station cross-sections), earthwork quantity estimates for construction, landfill monitoring, and reporting volume results with confidence levels.',
   ARRAY['Generate topographic maps from drone survey data','Calculate stockpile volumes using drone-derived surfaces','Perform cut/fill analysis for earthwork projects','Compare drone volumetric accuracy with traditional methods','Monitor volume changes using repeat drone flights'],
   10, 60, '[]'::jsonb, '[]'::jsonb,
   ARRAY['drone-surveying','lesson-10','topographic','volumetric','cut-fill','stockpile'], 'published'),

  -- Lesson 11
  ('da5e0b0b-0000-0000-0000-000000000001', 'da5e0001-0000-0000-0000-000000000001',
   'Lesson 11: Construction and Infrastructure Applications',
   'This lesson explores specialized applications of drone surveying in construction and infrastructure. Topics include: construction progress monitoring with repeat flights, as-built documentation and comparison to design surfaces, building and structural inspection, bridge inspection and assessment, corridor mapping for roads, pipelines, and transmission lines, solar farm site assessment and panel inspection, mining operations (pit mapping, stockpile inventory, blast planning), environmental monitoring (erosion, wetland delineation), real estate and property marketing, precision agriculture applications, and emerging applications in the surveying profession.',
   ARRAY['Plan drone missions for construction progress monitoring','Compare as-built conditions to design models','Describe corridor mapping techniques for linear projects','Identify inspection applications for drones','Explain how repeat flights enable change detection'],
   11, 60, '[]'::jsonb, '[]'::jsonb,
   ARRAY['drone-surveying','lesson-11','construction','infrastructure','inspection','monitoring'], 'published'),

  -- Lesson 12
  ('da5e0b0c-0000-0000-0000-000000000001', 'da5e0001-0000-0000-0000-000000000001',
   'Lesson 12: Accuracy Assessment, Quality Control, and Deliverables',
   'This lesson covers how to verify, document, and deliver drone survey results. Topics include: accuracy standards for drone surveys (ASPRS Positional Accuracy Standards), root mean square error (RMSE) calculation for horizontal and vertical accuracy, checkpoint analysis methodology (independent points not used in processing), accuracy vs precision in drone survey context, quality control checklists for field operations and data processing, the importance of redundant GCPs and checkpoints, documentation and metadata requirements, preparing professional survey reports and deliverables, data archiving and project documentation, liability considerations and professional responsibility, and continuing education requirements.',
   ARRAY['Calculate RMSE from checkpoint residuals','Apply ASPRS accuracy standards to drone survey products','Design a QC plan with appropriate checkpoints','Prepare professional survey reports and deliverables','Understand liability and professional responsibility'],
   12, 60, '[]'::jsonb, '[]'::jsonb,
   ARRAY['drone-surveying','lesson-12','accuracy','QC','RMSE','deliverables','standards'], 'published'),

  -- Final Exam
  ('da5e0b0d-0000-0000-0000-000000000001', 'da5e0001-0000-0000-0000-000000000001',
   'Final Exam: Drone Surveying Comprehensive Assessment',
   'Comprehensive final examination covering all 12 lessons of the Drone Surveying module. Topics span FAA regulations, drone hardware, flight planning, ground control, photogrammetry, LiDAR, data processing, mapping products, volumetric analysis, construction applications, and accuracy assessment. Both conceptual and computational questions are included.',
   ARRAY['Review all module concepts','Focus on practical application of drone surveying principles','Practice GSD and RMSE computations','Review FAA regulations and operational limitations'],
   13, 60, '[]'::jsonb, '[]'::jsonb,
   ARRAY['drone-surveying','final-exam','comprehensive'], 'published')
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- SECTION 3: QUESTION BANK — LESSON QUIZZES (5 per lesson x 12 = 60)
-- ============================================================================

-- -------------------------------------------------------
-- Lesson 1 Quiz: Introduction to Drone Surveying
-- -------------------------------------------------------
INSERT INTO question_bank (question_text, question_type, options, correct_answer, explanation, difficulty, module_id, lesson_id, exam_category, tags) VALUES
('Which term is the FAA''s official designation for commercially operated drones?', 'multiple_choice',
 '["UAV (Unmanned Aerial Vehicle)","UAS (Unmanned Aircraft System)","RPAS (Remotely Piloted Aircraft System)","Drone"]'::jsonb,
 'UAS (Unmanned Aircraft System)',
 'The FAA uses "Unmanned Aircraft System" (UAS) as the official term. It encompasses the drone itself, the ground control station, and the communication links. UAV refers only to the aircraft, while "drone" is the common informal term.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b01-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-1','quiz','terminology']),

('What is one key advantage of drone surveying over traditional ground-based surveying?', 'multiple_choice',
 '["Drones never need ground control points","Drones can cover large areas quickly with fewer field personnel","Drone surveys are always more accurate than total station surveys","Drones can operate in any weather conditions"]'::jsonb,
 'Drones can cover large areas quickly with fewer field personnel',
 'Drone surveys dramatically reduce field time for large areas. A drone can map 100+ acres in a single flight that would take days with a total station. However, GCPs are still needed for accuracy, drone accuracy depends on methods used, and weather conditions limit flight operations.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b01-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-1','quiz','advantages']),

('Drone surveying has completely replaced the need for traditional ground-based survey methods.', 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'Drone surveying complements but does not replace traditional methods. Ground surveys are still needed for boundary monument recovery, underground utilities, areas with heavy overhead obstruction, dense urban environments, and tasks requiring sub-centimeter accuracy. Most projects benefit from a combination of drone and ground methods.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b01-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-1','quiz','limitations']),

('Which of the following is NOT a common application of drone surveying?', 'multiple_choice',
 '["Topographic mapping","Construction progress monitoring","Locating underground utilities","Stockpile volume measurement"]'::jsonb,
 'Locating underground utilities',
 'Drones collect data from above-ground surfaces. They cannot detect underground utilities, which require ground-penetrating radar (GPR), electromagnetic locators, or other subsurface detection methods. Topographic mapping, construction monitoring, and stockpile volumes are all standard drone applications.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b01-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-1','quiz','applications']),

('Describe the four main phases of a typical drone survey workflow.', 'short_answer',
 '[]'::jsonb,
 'Mission planning, data acquisition (flying and collecting imagery), data processing, and deliverables',
 'A drone survey workflow consists of: (1) Mission Planning — site assessment, flight plan design, GCP layout; (2) Data Acquisition — placing GCPs, flying the mission, collecting imagery or LiDAR data; (3) Data Processing — importing data into processing software, aligning photos, generating point clouds and surfaces; (4) Deliverables — producing orthomosaics, elevation models, contour maps, volumes, and reports for the client.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b01-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-1','quiz','workflow']),

-- -------------------------------------------------------
-- Lesson 2 Quiz: FAA Part 107 Regulations and Airspace
-- -------------------------------------------------------
('The maximum allowable altitude for standard Part 107 drone operations is:', 'multiple_choice',
 '["200 feet AGL","400 feet AGL","500 feet AGL","1,000 feet AGL"]'::jsonb,
 '400 feet AGL',
 'Under Part 107, the maximum altitude is 400 feet above ground level (AGL). Exception: if within 400 ft of a structure, you may fly up to 400 ft above the top of that structure. Higher altitudes require an FAA waiver.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b02-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-2','quiz','altitude','Part-107']),

('The minimum age to obtain a Part 107 Remote Pilot Certificate is 18 years old.', 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'The minimum age for a Part 107 Remote Pilot Certificate is 16 years old, not 18. Applicants must also be able to read, speak, write, and understand English, pass the aeronautical knowledge test, and undergo TSA security vetting.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b02-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-2','quiz','certification']),

('LAANC stands for:', 'multiple_choice',
 '["Low Altitude Authorization and Notification Capability","Licensed Aerial Access and Navigation Certification","Local Airport Authorization Notification Center","Limited Airspace Automatic Navigation Control"]'::jsonb,
 'Low Altitude Authorization and Notification Capability',
 'LAANC (Low Altitude Authorization and Notification Capability) is an FAA system that provides drone pilots with near-real-time authorization to fly in controlled airspace. It processes airspace requests through approved UAS service suppliers.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b02-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-2','quiz','LAANC']),

('Under current Part 107 rules, drone flight at night is permitted provided the drone has:', 'multiple_choice',
 '["No additional requirements — night flight is unrestricted","Anti-collision lights visible for 3 statute miles","A special night operations waiver","Infrared cameras for obstacle avoidance"]'::jsonb,
 'Anti-collision lights visible for 3 statute miles',
 'The 2021 Part 107 rule update allows night operations without a waiver, provided the drone is equipped with anti-collision lights visible for at least 3 statute miles. The remote pilot must also complete updated training that covers night operations.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b02-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-2','quiz','night-operations']),

('Which airspace class generally allows Part 107 drone operations without prior authorization?', 'multiple_choice',
 '["Class B","Class C","Class D","Class G"]'::jsonb,
 'Class G',
 'Class G (uncontrolled) airspace generally does not require prior authorization for drone operations. Classes B, C, D, and surface-level E are controlled airspace and require authorization (often via LAANC) before operating a drone.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b02-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-2','quiz','airspace']),

-- -------------------------------------------------------
-- Lesson 3 Quiz: Drone Hardware and Sensor Technology
-- -------------------------------------------------------
('For surveying a large linear corridor such as a pipeline route, which drone type is most efficient?', 'multiple_choice',
 '["Multirotor","Fixed-wing","Helicopter","Tethered drone"]'::jsonb,
 'Fixed-wing',
 'Fixed-wing drones are most efficient for large linear corridors because they cover much more area per flight (longer flight times, higher speeds) than multirotors. Multirotors are better for smaller sites or areas requiring hovering and tight maneuvering.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b03-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-3','quiz','fixed-wing','platforms']),

('A mechanical shutter eliminates rolling shutter distortion in aerial imagery.', 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'A mechanical (global) shutter exposes the entire sensor simultaneously, eliminating the geometric distortion caused by electronic rolling shutters that read lines sequentially. For survey-grade photogrammetry, mechanical shutters are strongly preferred.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b03-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-3','quiz','shutter','camera']),

('RTK capability on a survey drone provides:', 'multiple_choice',
 '["Longer battery life","Real-time centimeter-level positioning using correction signals","Automated obstacle avoidance","Higher resolution imagery"]'::jsonb,
 'Real-time centimeter-level positioning using correction signals',
 'RTK (Real-Time Kinematic) uses a base station or NTRIP network to send correction signals to the drone''s GNSS receiver in real time, achieving centimeter-level positioning. This enables direct georeferencing and can reduce or eliminate the need for GCPs.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b03-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-3','quiz','RTK','GNSS']),

('Which sensor type can measure ground elevation through dense tree canopy?', 'multiple_choice',
 '["RGB camera","Thermal camera","LiDAR","Multispectral sensor"]'::jsonb,
 'LiDAR',
 'LiDAR laser pulses can penetrate gaps in tree canopy and record multiple returns — from the canopy top, understory, and bare ground. RGB, thermal, and multispectral sensors only capture the visible surface.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b03-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-3','quiz','LiDAR','sensors']),

('Multispectral sensors on drones are primarily used for:', 'multiple_choice',
 '["3D terrain modeling","Agricultural crop health monitoring and vegetation analysis","Underground utility detection","Night operations"]'::jsonb,
 'Agricultural crop health monitoring and vegetation analysis',
 'Multispectral sensors capture imagery in specific wavelength bands (red, green, red-edge, near-infrared) to calculate vegetation indices like NDVI. This enables assessment of crop health, stress detection, and precision agriculture applications.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b03-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-3','quiz','multispectral','agriculture']),

-- -------------------------------------------------------
-- Lesson 4 Quiz: Flight Planning and Mission Design
-- -------------------------------------------------------
('A camera has a pixel size of 4.4 micrometers and a focal length of 8.8 mm. Flying at 100 m AGL, the ground sample distance (GSD) in centimeters is approximately:', 'numeric_input',
 '[]'::jsonb,
 '5.0',
 'GSD = (pixel_size x altitude) / focal_length = (0.0044 mm x 100,000 mm) / 8.8 mm = 440 / 8.8 = 50 mm = 5.0 cm. Each pixel in the image represents approximately 5 cm on the ground.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b04-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-4','quiz','GSD','computation']),

('The recommended minimum frontal (forward) overlap for photogrammetric drone surveys is:', 'multiple_choice',
 '["50%","60%","75%","90%"]'::jsonb,
 '75%',
 'Standard practice recommends a minimum of 75% frontal (forward) overlap and 65% side (lateral) overlap for photogrammetric processing. Higher overlap provides more image redundancy, better feature matching, and improved accuracy, especially over featureless terrain.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b04-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-4','quiz','overlap']),

('Flying at a higher altitude increases the ground sample distance, resulting in lower image resolution.', 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'GSD is directly proportional to altitude: GSD = (pixel_size x altitude) / focal_length. Flying higher means each pixel covers a larger area on the ground, reducing the level of detail captured. Lower altitude = smaller GSD = higher resolution.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b04-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-4','quiz','altitude-resolution']),

('A double-grid (crosshatch) flight pattern is recommended when:', 'multiple_choice',
 '["Surveying flat agricultural fields","Creating 3D models of structures or terrain with vertical features","Battery life is limited","Only an orthomosaic is needed"]'::jsonb,
 'Creating 3D models of structures or terrain with vertical features',
 'A double-grid or crosshatch pattern flies two perpendicular grids over the same area. This captures vertical surfaces from multiple angles, which is essential for accurate 3D modeling of structures, steep terrain, and areas with significant vertical features.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b04-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-4','quiz','flight-pattern']),

('Terrain following mode adjusts the drone''s flight altitude to maintain:', 'multiple_choice',
 '["A constant speed","A constant altitude above sea level","A consistent ground sample distance over varying terrain","Maximum battery efficiency"]'::jsonb,
 'A consistent ground sample distance over varying terrain',
 'Terrain following adjusts the drone''s altitude above ground level (AGL) based on a digital elevation model, keeping the AGL constant even as ground elevation changes. This ensures consistent GSD across hilly or variable terrain.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b04-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-4','quiz','terrain-following']),

-- -------------------------------------------------------
-- Lesson 5 Quiz: Ground Control Points and GNSS Integration
-- -------------------------------------------------------
('The minimum recommended number of GCPs for a typical drone survey project is:', 'multiple_choice',
 '["1","3","5","20"]'::jsonb,
 '5',
 'A minimum of 5 GCPs is recommended for a typical project, distributed around the perimeter and across the interior of the survey area. More GCPs are recommended for larger areas or higher accuracy requirements. Some standards recommend 1 GCP per 100 m of project length.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b05-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-5','quiz','GCP-count']),

('Checkpoints are independent points used to verify accuracy that are NOT included in the photogrammetric processing solution.', 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'Checkpoints are surveyed ground points whose coordinates are known but NOT used as GCPs in the photogrammetric solution. After processing, the computed coordinates at checkpoint locations are compared to the surveyed coordinates to independently assess accuracy (RMSE).',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b05-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-5','quiz','checkpoints']),

('GCPs should be placed:', 'multiple_choice',
 '["In a single cluster at the center of the project","Along one edge of the project only","Distributed around the edges and across the interior of the project area","Only on paved surfaces"]'::jsonb,
 'Distributed around the edges and across the interior of the project area',
 'GCPs must be well-distributed throughout the project area for optimal accuracy. Clustered GCPs leave parts of the project without ground control, leading to systematic errors (especially elevation drift) in those unsupported areas.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b05-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-5','quiz','GCP-placement']),

('PPK (Post-Processed Kinematic) differs from RTK because PPK:', 'multiple_choice',
 '["Does not require a base station","Applies GNSS corrections after the flight using recorded data","Is less accurate than RTK","Only works with fixed-wing drones"]'::jsonb,
 'Applies GNSS corrections after the flight using recorded data',
 'PPK records raw GNSS observations during flight and applies corrections in post-processing using base station data. RTK applies corrections in real time via a radio or cellular link. PPK can be equally accurate and is more robust — it works even if the correction link drops during flight.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b05-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-5','quiz','PPK','RTK']),

('Explain the difference between GCPs and checkpoints in drone survey processing.', 'short_answer',
 '[]'::jsonb,
 'GCPs are used in processing to georeference the model; checkpoints are independent points used only to verify accuracy',
 'Ground Control Points (GCPs) are surveyed points whose coordinates are entered into the photogrammetric software to constrain and georeference the solution. Checkpoints are also surveyed points, but they are intentionally withheld from processing. After the model is built, checkpoint locations are compared to their known coordinates to provide an independent measure of accuracy (typically reported as RMSE).',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b05-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-5','quiz','GCP-vs-checkpoint']),

-- -------------------------------------------------------
-- Lesson 6 Quiz: Photogrammetry Fundamentals
-- -------------------------------------------------------
('Structure from Motion (SfM) determines camera positions by:', 'multiple_choice',
 '["Using GPS alone","Matching common features across multiple overlapping photographs","Measuring distances with a laser","Reading the camera''s internal compass"]'::jsonb,
 'Matching common features across multiple overlapping photographs',
 'SfM algorithms detect distinctive features (keypoints) in each photo, match identical features across overlapping images, and use the geometric relationships between these matched features to compute camera positions (exterior orientation) and 3D point locations simultaneously.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b06-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-6','quiz','SfM']),

('Bundle adjustment in photogrammetry simultaneously optimizes:', 'multiple_choice',
 '["Only camera positions","Only 3D point positions","Camera positions, camera calibration parameters, and 3D point positions","Only image brightness and contrast"]'::jsonb,
 'Camera positions, camera calibration parameters, and 3D point positions',
 'Bundle adjustment is a global optimization that refines camera exterior orientation (position and angle), interior orientation (calibration parameters), and 3D tie point coordinates all at once, minimizing reprojection error across the entire image set.',
 'hard', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b06-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-6','quiz','bundle-adjustment']),

('A single aerial photograph is sufficient for Structure from Motion 3D reconstruction.', 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'SfM requires multiple overlapping photographs of the same scene from different viewpoints. The 3D structure is computed from the parallax (apparent shift) of features between images. A minimum of 2 photos is needed for any 3D point, but many more are used in practice for robust results.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b06-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-6','quiz','SfM-requirements']),

('Interior orientation parameters include:', 'multiple_choice',
 '["Camera GPS position and altitude","Focal length, principal point, and lens distortion coefficients","Flight speed and heading","GCP coordinates"]'::jsonb,
 'Focal length, principal point, and lens distortion coefficients',
 'Interior orientation describes the camera''s internal geometry: focal length (distance from lens to sensor), principal point (where the optical axis meets the sensor), and lens distortion coefficients (radial and tangential distortion). These are determined through camera calibration.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b06-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-6','quiz','interior-orientation']),

('Reprojection error is a measure of:', 'multiple_choice',
 '["The distance between GCPs and checkpoints","How accurately the 3D model projects back onto the original images","The difference between the DSM and DTM","The overlap percentage between photos"]'::jsonb,
 'How accurately the 3D model projects back onto the original images',
 'Reprojection error measures the pixel distance between where a 3D point projects onto an image and where the corresponding feature was originally detected. Lower reprojection error indicates better alignment. Typical values are 0.5–1.5 pixels for a well-processed dataset.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b06-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-6','quiz','reprojection-error']),

-- -------------------------------------------------------
-- Lesson 7 Quiz: LiDAR Drone Surveying
-- -------------------------------------------------------
('LiDAR measures distance by:', 'multiple_choice',
 '["Analyzing the color of reflected light","Timing the round-trip travel of a laser pulse","Measuring the phase shift of radio waves","Comparing overlapping photographs"]'::jsonb,
 'Timing the round-trip travel of a laser pulse',
 'LiDAR (Light Detection and Ranging) emits a laser pulse and measures the time for it to travel to a surface and return. Distance = (speed of light x round-trip time) / 2. The laser scanner rapidly fires thousands of pulses per second to build a dense 3D point cloud.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b07-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-7','quiz','LiDAR-principle']),

('Standard topographic drone LiDAR can penetrate dense vegetation to measure bare-earth elevations.', 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'LiDAR pulses can pass through gaps in vegetation canopy. A multiple-return LiDAR records reflections from the canopy, understory layers, and the ground. After classification, ground returns are used to generate a bare-earth DEM — a major advantage over photogrammetry in vegetated areas.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b07-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-7','quiz','vegetation-penetration']),

('Multiple-return LiDAR is valuable because it can:', 'multiple_choice',
 '["Fly faster than single-return LiDAR","Record reflections from different layers such as canopy, understory, and ground","Measure distances more accurately","Eliminate the need for GNSS"]'::jsonb,
 'Record reflections from different layers such as canopy, understory, and ground',
 'A single laser pulse may reflect off multiple surfaces as it passes through vegetation. Multiple-return LiDAR records each of these reflections separately, enabling classification into layers — first return (canopy), intermediate returns (understory), and last return (ground).',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b07-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-7','quiz','multiple-return']),

('When should LiDAR be preferred over photogrammetry for a drone survey?', 'multiple_choice',
 '["When surveying a flat parking lot","When mapping heavily vegetated terrain where bare-earth data is needed","When only an orthomosaic is required","When the project budget is very limited"]'::jsonb,
 'When mapping heavily vegetated terrain where bare-earth data is needed',
 'LiDAR excels in vegetated environments because it can penetrate canopy to measure ground elevation. Photogrammetry can only model visible surfaces. For flat open areas or orthomosaic production, photogrammetry is often more cost-effective. LiDAR systems are typically more expensive than cameras.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b07-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-7','quiz','LiDAR-vs-photogrammetry']),

('Point cloud classification assigns each point a category such as:', 'multiple_choice',
 '["Red, green, blue, and alpha","Latitude, longitude, and elevation","Ground, vegetation, buildings, or power lines","First return, second return, and third return"]'::jsonb,
 'Ground, vegetation, buildings, or power lines',
 'Classification labels each point by surface type (following ASPRS standard: ground, low/medium/high vegetation, buildings, water, power lines, bridges, etc.). Classification enables filtering — for example, isolating only ground points to generate a bare-earth DTM.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b07-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-7','quiz','point-classification']),

-- -------------------------------------------------------
-- Lesson 8 Quiz: Data Processing Workflows
-- -------------------------------------------------------
('Which of the following is NOT a photogrammetric processing software?', 'multiple_choice',
 '["Pix4Dmapper","Agisoft Metashape","AutoCAD","DroneDeploy"]'::jsonb,
 'AutoCAD',
 'AutoCAD is a CAD drafting software, not a photogrammetric processor. Pix4Dmapper, Agisoft Metashape, and DroneDeploy are all photogrammetric processing platforms that convert drone imagery into orthomosaics, point clouds, and elevation models.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b08-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-8','quiz','software']),

('The first major step in photogrammetric processing after importing images is:', 'multiple_choice',
 '["Generating contour lines","Photo alignment and feature matching","Exporting the orthomosaic","Setting the coordinate system"]'::jsonb,
 'Photo alignment and feature matching',
 'The first processing step is photo alignment (also called initial processing or aerotriangulation). The software detects features in each image, matches them across overlapping photos, and computes camera positions and a sparse 3D point cloud. GCPs are then assigned to refine the solution.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b08-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-8','quiz','processing-steps']),

('Cloud-based photogrammetric processing requires uploading raw drone imagery to a remote server.', 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'Cloud-based processing platforms (like DroneDeploy or Pix4Dcloud) run on remote servers. Raw images must be uploaded over the internet. This eliminates the need for powerful local hardware but requires adequate internet bandwidth and may raise data security considerations for sensitive projects.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b08-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-8','quiz','cloud-processing']),

('The "doming effect" in drone photogrammetry is primarily caused by:', 'multiple_choice',
 '["Flying too fast","Systematic errors in camera calibration from parallel flight lines without cross-strips","Using too many GCPs","Flying in cloudy weather"]'::jsonb,
 'Systematic errors in camera calibration from parallel flight lines without cross-strips',
 'The doming effect produces a systematic bowl or dome shape in elevation data. It results from correlations between camera interior orientation parameters and camera positions in parallel flight lines. Adding perpendicular cross-strips and well-distributed GCPs mitigates this issue.',
 'hard', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b08-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-8','quiz','doming-effect']),

('A quality report showing high GCP residuals most likely indicates:', 'multiple_choice',
 '["The flight was successful","There may be errors in GCP coordinates or their identification in the software","Too many photos were captured","The drone was flying too slowly"]'::jsonb,
 'There may be errors in GCP coordinates or their identification in the software',
 'High GCP residuals (large differences between surveyed and computed GCP positions) typically indicate: wrong GCP coordinates, GCPs marked on the wrong pixel in photos, incorrect coordinate system, or a poor photogrammetric solution. The source of error should be investigated before accepting results.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b08-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-8','quiz','quality-report']),

-- -------------------------------------------------------
-- Lesson 9 Quiz: Mapping Products
-- -------------------------------------------------------
('An orthomosaic differs from a regular aerial photograph because it:', 'multiple_choice',
 '["Is captured from a higher altitude","Has been geometrically corrected so measurements can be taken directly from it","Is always in black and white","Only shows ground features"]'::jsonb,
 'Has been geometrically corrected so measurements can be taken directly from it',
 'An orthomosaic is orthorectified — it has been corrected for camera tilt, lens distortion, and terrain relief displacement. This makes it geometrically accurate: distances, areas, and coordinates can be measured directly from the image, unlike a raw aerial photo which has perspective distortion.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b09-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-9','quiz','orthomosaic']),

('A DSM (Digital Surface Model) includes elevations of:', 'multiple_choice',
 '["Only bare ground","All surfaces including buildings, trees, and terrain","Only man-made structures","Only vegetation"]'::jsonb,
 'All surfaces including buildings, trees, and terrain',
 'A DSM represents the elevation of the highest surface at each location — including building rooftops, tree canopies, vehicles, and bare ground where no features exist. It captures everything visible from above.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b09-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-9','quiz','DSM']),

('A DTM (Digital Terrain Model) shows only bare-earth elevations with buildings and vegetation removed.', 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'A DTM represents the bare-earth surface with above-ground features (buildings, vegetation) removed. DTMs are essential for accurate contour generation, hydrological modeling, and earthwork calculations. They are typically derived from LiDAR ground-classified points or by filtering a DSM.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b09-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-9','quiz','DTM']),

('Contour lines generated from drone elevation data represent:', 'multiple_choice',
 '["Property boundaries","Lines of equal elevation","Flight paths of the drone","Points where GCPs were placed"]'::jsonb,
 'Lines of equal elevation',
 'Contour lines connect points of equal elevation. They are generated from DSM or DTM data at specified intervals (e.g., 1-ft or 0.5-m contours). The contour interval is chosen based on terrain steepness and the required map accuracy.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b09-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-9','quiz','contours']),

('The LAS file format is a standard for storing:', 'multiple_choice',
 '["Orthomosaic images","LiDAR point cloud data","Flight plan coordinates","GCP measurements"]'::jsonb,
 'LiDAR point cloud data',
 'LAS (and its compressed variant LAZ) is the industry-standard binary format for storing 3D point cloud data. Each point includes XYZ coordinates, intensity, return number, classification, and other attributes. LAS is defined by the ASPRS.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b09-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-9','quiz','LAS','file-format']),

-- -------------------------------------------------------
-- Lesson 10 Quiz: Topographic and Volumetric Surveys
-- -------------------------------------------------------
('A stockpile volume is typically calculated by comparing:', 'multiple_choice',
 '["Two orthomosaics","The stockpile surface to a reference base surface","The DSM to the DTM","Two flight plans"]'::jsonb,
 'The stockpile surface to a reference base surface',
 'Stockpile volume is computed as the difference between the stockpile surface (from a drone survey) and a base reference surface (either a pre-existing ground survey, a flat plane, or a triangulated base around the stockpile perimeter). The volume equals the integral of the height difference over the stockpile area.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0a-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-10','quiz','stockpile-volume']),

('Drone-based volume calculations can achieve accuracy comparable to traditional total station cross-section methods.', 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'Studies consistently show that drone-based volumetric surveys agree within 1–3% of traditional total station cross-section measurements when proper GCPs and processing are used. Drones often provide better results because they capture many more surface points than sparse cross-sections.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0a-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-10','quiz','volume-accuracy']),

('Cut/fill analysis compares:', 'multiple_choice',
 '["Two different drone models","An existing ground surface to a proposed design surface","A DSM to an orthomosaic","GCPs to checkpoints"]'::jsonb,
 'An existing ground surface to a proposed design surface',
 'Cut/fill analysis computes the volume of material that must be removed (cut) or added (fill) to transform the existing terrain into the proposed design surface. The drone survey provides the existing surface; the design surface comes from engineering plans.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0a-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-10','quiz','cut-fill']),

('For monitoring volume changes at a mining site, the best approach is:', 'multiple_choice',
 '["A single flight at project completion","Repeat drone flights at regular intervals with consistent GCPs","Flying without ground control to save time","Using only LiDAR, never photogrammetry"]'::jsonb,
 'Repeat drone flights at regular intervals with consistent GCPs',
 'Regular repeat flights with consistent GCPs enable accurate change detection and volume tracking over time. Using the same GCP network ensures all surveys share a common coordinate reference, so volume differences reflect actual earthwork rather than survey discrepancies.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0a-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-10','quiz','monitoring']),

('Which factor primarily determines the appropriate contour interval for a topographic map?', 'multiple_choice',
 '["The type of drone used","The required map accuracy and the terrain slope","The number of photos captured","The file export format"]'::jsonb,
 'The required map accuracy and the terrain slope',
 'Contour interval depends on map accuracy requirements and terrain characteristics. Flat terrain uses small intervals (0.5–1 ft) for useful detail, while steep terrain may use larger intervals (2–5 ft) to avoid overcrowding. ASPRS standards link contour interval to required vertical accuracy.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0a-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-10','quiz','contour-interval']),

-- -------------------------------------------------------
-- Lesson 11 Quiz: Construction and Infrastructure Applications
-- -------------------------------------------------------
('Construction progress monitoring with drones typically involves:', 'multiple_choice',
 '["A single flight at project completion","Repeat flights at regular intervals compared to the design model","Flying only during concrete pours","Replacing all site inspectors with drones"]'::jsonb,
 'Repeat flights at regular intervals compared to the design model',
 'Drone progress monitoring uses regular flights (weekly or monthly) to capture site conditions. Each survey is compared to the design model and previous surveys to track earthwork, building progress, and identify deviations from plans.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0b-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-11','quiz','progress-monitoring']),

('Drones can be used for bridge inspection, reducing the need for lane closures and specialized access equipment.', 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'Drones can capture detailed imagery of bridge structures (decks, piers, abutments, bearings) without requiring bucket trucks, lane closures, or rope access. This improves safety, reduces traffic disruption, and can significantly lower inspection costs.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0b-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-11','quiz','bridge-inspection']),

('Corridor mapping for a highway project typically uses:', 'multiple_choice',
 '["A circular flight pattern","A long, narrow flight pattern following the road alignment","A single hovering position","Random waypoints across the region"]'::jsonb,
 'A long, narrow flight pattern following the road alignment',
 'Corridor mapping follows the linear route (road, pipeline, transmission line) with flight lines running parallel to the alignment. The flight plan is elongated and narrow, covering the corridor plus a buffer on each side. Cross-strips at intervals help with calibration.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0b-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-11','quiz','corridor-mapping']),

('An as-built survey using drones compares:', 'multiple_choice',
 '["Two different drone models","Actual constructed conditions to the original design plans","Before and after photos only","Equipment costs to labor costs"]'::jsonb,
 'Actual constructed conditions to the original design plans',
 'As-built drone surveys capture the completed or in-progress construction and compare it to the engineering design. Differences identify construction deviations, verify grades and elevations, and document the final built condition for project records.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0b-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-11','quiz','as-built']),

('Accurate change detection between two drone surveys requires:', 'multiple_choice',
 '["Using different drones each time","Consistent ground control and coordinate systems between flights","Flying at different altitudes each time","Processing with different software each time"]'::jsonb,
 'Consistent ground control and coordinate systems between flights',
 'For reliable change detection, all surveys must be referenced to the same coordinate system using consistent GCPs. If different control is used, apparent changes may be due to survey discrepancies rather than actual site changes.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0b-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-11','quiz','change-detection']),

-- -------------------------------------------------------
-- Lesson 12 Quiz: Accuracy Assessment, QC, and Deliverables
-- -------------------------------------------------------
('RMSE stands for:', 'multiple_choice',
 '["Remote Mapping Survey Equipment","Root Mean Square Error","Registered Map Surveying Evaluation","Relative Measurement Standard Error"]'::jsonb,
 'Root Mean Square Error',
 'RMSE (Root Mean Square Error) is the standard statistical measure of accuracy for drone surveys. It is computed as the square root of the average of the squared differences between computed and known checkpoint coordinates.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0c-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-12','quiz','RMSE']),

('Three checkpoints show vertical errors of +0.04, -0.06, and +0.03 ft. The vertical RMSE is approximately (in feet):', 'numeric_input',
 '[]'::jsonb,
 '0.045',
 'RMSE = sqrt(mean of squared errors) = sqrt((0.04² + 0.06² + 0.03²) / 3) = sqrt((0.0016 + 0.0036 + 0.0009) / 3) = sqrt(0.0061 / 3) = sqrt(0.002033) = 0.0451 ≈ 0.045 ft.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0c-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-12','quiz','RMSE-computation']),

('Checkpoints used for accuracy assessment should be:', 'multiple_choice',
 '["The same points used as GCPs in processing","Independent points NOT used in the photogrammetric processing","Placed only at the center of the project","Measured with a handheld GPS"]'::jsonb,
 'Independent points NOT used in the photogrammetric processing',
 'Checkpoints must be independent — if a point was used as a GCP to constrain the solution, comparing the solution''s coordinates back to that point inflates the apparent accuracy. True accuracy can only be assessed with independent checkpoints.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0c-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-12','quiz','checkpoint-independence']),

('A higher RMSE value indicates better accuracy.', 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'RMSE measures the magnitude of errors — a higher RMSE means larger errors and therefore WORSE accuracy. Lower RMSE values indicate that computed coordinates are closer to the true (checkpoint) coordinates, meaning better accuracy.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0c-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-12','quiz','RMSE-interpretation']),

('The ASPRS Positional Accuracy Standards define accuracy classes based on:', 'multiple_choice',
 '["The number of photos taken","RMSE values for horizontal and vertical measurements","The brand of drone used","The processing software selected"]'::jsonb,
 'RMSE values for horizontal and vertical measurements',
 'ASPRS Positional Accuracy Standards for Digital Geospatial Data define accuracy classes by specifying maximum allowable RMSE values for horizontal (RMSEx, RMSEy) and vertical (RMSEz) positions. Products are tested against independent checkpoints to determine which accuracy class they meet.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0c-0000-0000-0000-000000000001', 'DRONE', ARRAY['drone-surveying','lesson-12','quiz','ASPRS-standards'])
ON CONFLICT DO NOTHING;


-- ============================================================================
-- SECTION 4: QUESTION BANK — FINAL EXAM (20 comprehensive questions)
-- ============================================================================

INSERT INTO question_bank (question_text, question_type, options, correct_answer, explanation, difficulty, module_id, lesson_id, exam_category, tags) VALUES
-- F1
('Under Part 107, the maximum altitude for standard drone operations is:', 'multiple_choice',
 '["200 feet AGL","400 feet AGL","500 feet MSL","1,000 feet AGL"]'::jsonb,
 '400 feet AGL',
 'Part 107 limits drone operations to 400 feet above ground level (AGL). Higher altitudes require a waiver from the FAA. Note: the limit is AGL, not MSL (mean sea level).',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0d-0000-0000-0000-000000000001', 'DRONE-FINAL', ARRAY['drone-surveying','final-exam','Part-107']),

-- F2
('Ground sample distance (GSD) is affected by all of the following EXCEPT:', 'multiple_choice',
 '["Camera pixel size","Flight altitude","Focal length","The number of GCPs placed"]'::jsonb,
 'The number of GCPs placed',
 'GSD = (pixel_size x altitude) / focal_length. It depends on camera pixel size, flight altitude, and focal length. GCPs affect georeferencing accuracy but have no effect on the pixel resolution (GSD) of the imagery.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0d-0000-0000-0000-000000000001', 'DRONE-FINAL', ARRAY['drone-surveying','final-exam','GSD']),

-- F3
('Fixed-wing drones are generally more efficient than multirotors for covering large survey areas.', 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'Fixed-wing drones have longer flight times (45–90 minutes vs 20–40 minutes for multirotors) and cover much more area per battery. They are preferred for large-area surveys, while multirotors excel at small sites, inspections, and jobs requiring hovering.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0d-0000-0000-0000-000000000001', 'DRONE-FINAL', ARRAY['drone-surveying','final-exam','platforms']),

-- F4
('The recommended minimum frontal overlap for photogrammetric surveys is:', 'multiple_choice',
 '["50%","65%","75%","90%"]'::jsonb,
 '75%',
 '75% frontal overlap is the standard minimum for photogrammetric processing. Side overlap is typically 65% minimum. Higher overlap improves accuracy and redundancy, especially over low-texture surfaces.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0d-0000-0000-0000-000000000001', 'DRONE-FINAL', ARRAY['drone-surveying','final-exam','overlap']),

-- F5
('A GCP is used during photogrammetric processing to:', 'multiple_choice',
 '["Control the drone''s flight path","Georeference and improve the accuracy of the photogrammetric solution","Measure battery voltage","Calculate flight time"]'::jsonb,
 'Georeference and improve the accuracy of the photogrammetric solution',
 'GCPs are surveyed ground points with known coordinates that constrain the photogrammetric solution. They establish the coordinate reference and correct for systematic errors, dramatically improving both horizontal and vertical accuracy.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0d-0000-0000-0000-000000000001', 'DRONE-FINAL', ARRAY['drone-surveying','final-exam','GCP']),

-- F6
('Structure from Motion (SfM) requires:', 'multiple_choice',
 '["A single nadir photograph","LiDAR data","Multiple overlapping photographs of the same area","Thermal imagery"]'::jsonb,
 'Multiple overlapping photographs of the same area',
 'SfM computes 3D structure by analyzing the parallax of features across multiple overlapping images. A minimum of two views is needed for any point, but practical surveys use dozens to hundreds of overlapping images for robust 3D reconstruction.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0d-0000-0000-0000-000000000001', 'DRONE-FINAL', ARRAY['drone-surveying','final-exam','SfM']),

-- F7
('LiDAR can provide bare-earth elevation data under dense vegetation, while photogrammetry cannot.', 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'LiDAR pulses penetrate vegetation gaps and record ground returns even under dense canopy. Photogrammetry only models the visible surface — if vegetation covers the ground, photogrammetry models the canopy, not the terrain.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0d-0000-0000-0000-000000000001', 'DRONE-FINAL', ARRAY['drone-surveying','final-exam','LiDAR-vs-photogrammetry']),

-- F8
('The doming effect in photogrammetry is best mitigated by:', 'multiple_choice',
 '["Flying at maximum altitude","Adding oblique or crosshatch flight lines and well-distributed GCPs","Removing all GCPs from the solution","Using only a single flight line"]'::jsonb,
 'Adding oblique or crosshatch flight lines and well-distributed GCPs',
 'The doming effect results from correlations in camera calibration during parallel-only flight lines. Adding perpendicular cross-strips breaks these correlations, and well-distributed GCPs constrain the solution to prevent systematic elevation warping.',
 'hard', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0d-0000-0000-0000-000000000001', 'DRONE-FINAL', ARRAY['drone-surveying','final-exam','doming-effect']),

-- F9
('An orthomosaic is useful for direct measurement because:', 'multiple_choice',
 '["It is captured from very high altitude","It has been orthorectified, removing tilt and relief displacement","It uses thermal imagery","It includes LiDAR data"]'::jsonb,
 'It has been orthorectified, removing tilt and relief displacement',
 'Orthorectification corrects for camera tilt, lens distortion, and terrain relief displacement, producing a geometrically accurate plan-view image. Distances, areas, and coordinates can be measured directly from an orthomosaic with known accuracy.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0d-0000-0000-0000-000000000001', 'DRONE-FINAL', ARRAY['drone-surveying','final-exam','orthomosaic']),

-- F10
('DTM stands for:', 'multiple_choice',
 '["Drone Terrain Mapping","Digital Terrain Model","Digital Topographic Measurement","Data Transfer Module"]'::jsonb,
 'Digital Terrain Model',
 'DTM = Digital Terrain Model. It represents bare-earth elevations with above-ground features removed. Compare with DSM (Digital Surface Model), which includes all surface features.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0d-0000-0000-0000-000000000001', 'DRONE-FINAL', ARRAY['drone-surveying','final-exam','DTM']),

-- F11
('Stockpile volume is calculated by:', 'multiple_choice',
 '["Multiplying the stockpile area by its maximum height","Comparing the stockpile surface to a base reference surface","Counting the number of LiDAR points on the pile","Measuring the circumference of the pile"]'::jsonb,
 'Comparing the stockpile surface to a base reference surface',
 'Volume is the integral of the height difference between the stockpile surface and a base surface. The base can be a pre-stockpile survey, a flat plane, or a surface triangulated from the stockpile toe. Simply using max height x area would grossly overestimate volume.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0d-0000-0000-0000-000000000001', 'DRONE-FINAL', ARRAY['drone-surveying','final-exam','volume']),

-- F12
('Under current Part 107 rules, drone flight at night is allowed provided the drone has anti-collision lights visible for at least:', 'multiple_choice',
 '["1 statute mile","3 statute miles","5 statute miles","No lights are required"]'::jsonb,
 '3 statute miles',
 'Since the 2021 Part 107 rule update, night operations are permitted without a waiver if the drone is equipped with anti-collision lights visible for at least 3 statute miles and the pilot has completed the updated training/recurrent knowledge requirements.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0d-0000-0000-0000-000000000001', 'DRONE-FINAL', ARRAY['drone-surveying','final-exam','night-flight']),

-- F13
('RMSE is calculated as:', 'multiple_choice',
 '["The average of all errors","The square root of the mean of the squared errors","The maximum error observed","The difference between the largest and smallest errors"]'::jsonb,
 'The square root of the mean of the squared errors',
 'RMSE = sqrt(sum(error²) / n), where error is the difference between computed and known coordinates at each checkpoint, and n is the number of checkpoints. It gives more weight to large errors than a simple average.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0d-0000-0000-0000-000000000001', 'DRONE-FINAL', ARRAY['drone-surveying','final-exam','RMSE-formula']),

-- F14
('When comparing LiDAR and photogrammetry, which statement is correct?', 'multiple_choice',
 '["Photogrammetry can penetrate vegetation; LiDAR cannot","LiDAR requires overlapping photos; photogrammetry does not","LiDAR can penetrate vegetation to measure ground elevation; photogrammetry captures only the visible surface","LiDAR produces orthomosaics; photogrammetry produces point clouds"]'::jsonb,
 'LiDAR can penetrate vegetation to measure ground elevation; photogrammetry captures only the visible surface',
 'LiDAR pulses pass through canopy gaps and record ground returns. Photogrammetry relies on visible features and can only model the top visible surface. Both produce point clouds, but only photogrammetry produces true-color orthomosaics.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0d-0000-0000-0000-000000000001', 'DRONE-FINAL', ARRAY['drone-surveying','final-exam','LiDAR-photogrammetry-comparison']),

-- F15
('PPK drone surveying processes GNSS corrections:', 'multiple_choice',
 '["During flight in real time","After the flight, using recorded satellite observations","Before the flight during planning","PPK does not use GNSS corrections"]'::jsonb,
 'After the flight, using recorded satellite observations',
 'PPK (Post-Processed Kinematic) records raw GNSS observations during flight and combines them with base station data in post-processing. This is more robust than RTK because it does not depend on a real-time communication link, and corrections can be reprocessed for optimal accuracy.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0d-0000-0000-0000-000000000001', 'DRONE-FINAL', ARRAY['drone-surveying','final-exam','PPK']),

-- F16
('A camera with a pixel size of 5 micrometers and a focal length of 10 mm is flown at 120 m AGL. The resulting GSD in centimeters is:', 'numeric_input',
 '[]'::jsonb,
 '6.0',
 'GSD = (pixel_size x altitude) / focal_length = (0.005 mm x 120,000 mm) / 10 mm = 600 / 10 = 60 mm = 6.0 cm.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0d-0000-0000-0000-000000000001', 'DRONE-FINAL', ARRAY['drone-surveying','final-exam','GSD-computation']),

-- F17
('For construction progress monitoring, the most important consideration is:', 'multiple_choice',
 '["Using the most expensive drone available","Using consistent ground control between flights for accurate comparison","Flying at maximum speed","Processing with cloud-based software only"]'::jsonb,
 'Using consistent ground control between flights for accurate comparison',
 'Consistent GCPs ensure all surveys share the same coordinate reference. Without this, apparent changes between surveys may reflect survey discrepancies rather than actual construction progress. The same GCP network should be used for every monitoring flight.',
 'medium', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0d-0000-0000-0000-000000000001', 'DRONE-FINAL', ARRAY['drone-surveying','final-exam','progress-monitoring']),

-- F18
('Checkpoints used for RMSE accuracy assessment should also be used as GCPs in the processing solution.', 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'Checkpoints MUST be independent from GCPs. If a point is used to constrain the solution (GCP), checking the solution against that same point gives an artificially optimistic accuracy result. Independent checkpoints provide a true measure of accuracy.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0d-0000-0000-0000-000000000001', 'DRONE-FINAL', ARRAY['drone-surveying','final-exam','checkpoint-independence']),

-- F19
('Which deliverable product shows bare-earth elevation with above-ground features removed?', 'multiple_choice',
 '["Orthomosaic","DSM","DTM","Point cloud"]'::jsonb,
 'DTM',
 'The DTM (Digital Terrain Model) shows only bare-earth elevations. The DSM includes all surfaces, the orthomosaic is a 2D image product, and a point cloud may include all surface types before classification and filtering.',
 'easy', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0d-0000-0000-0000-000000000001', 'DRONE-FINAL', ARRAY['drone-surveying','final-exam','products']),

-- F20
('Describe the complete workflow for a drone topographic survey from planning through deliverables. Include at least five key steps.', 'essay',
 '[]'::jsonb,
 'Key steps: (1) mission planning with GSD and overlap, (2) GCP placement and measurement, (3) drone flight and data collection, (4) photogrammetric processing, (5) product generation and quality assessment',
 'A complete drone topographic survey workflow includes: (1) Project planning — define scope, calculate required GSD, plan flight altitude, overlap, and pattern; (2) Ground control — design GCP layout, survey GCPs and checkpoints with survey-grade GNSS; (3) Data acquisition — pre-flight inspection, fly the mission, collect imagery; (4) Processing — import images, align photos, assign GCPs, optimize, generate dense point cloud, DSM, DTM, and orthomosaic; (5) Quality control — check GCP residuals and checkpoint RMSE against accuracy requirements; (6) Deliverables — generate contour lines, prepare export files, write accuracy report, deliver to client.',
 'hard', 'da5e0001-0000-0000-0000-000000000001', 'da5e0b0d-0000-0000-0000-000000000001', 'DRONE-FINAL', ARRAY['drone-surveying','final-exam','workflow','essay'])
ON CONFLICT DO NOTHING;


COMMIT;
