-- ============================================================================
-- STARR Surveying — ACC SRVY 2341: Advanced Surveying
-- ============================================================================
-- Austin Community College Geospatial Engineering course:
--   SRVY 2341 - Advanced Surveying (3 SCH)
--
-- Advanced topics in surveying including horizontal curves, vertical
-- curves, route surveying, construction staking, topographic surveying,
-- state plane coordinates, photogrammetry fundamentals, and project
-- management. Builds on SRVY 1341 and SRVY 1335.
--
-- Textbook: "Elementary Surveying" by Ghilani (16th ed.) or
--   "Surveying with Construction Applications" by Kavanagh
--
-- Prerequisites: SRVY 1341 and SRVY 1335
--
-- ACC semesters are 16 weeks. Each module has:
--   - 14 weekly lessons (weeks without exams)
--   - 1 midterm exam (Week 8)
--   - 1 final exam (Week 16)
--   - Weekly quizzes (5 questions each, non-exam weeks)
--   - Weekly homework sets (3 questions each, non-exam weeks)
--
-- Run AFTER supabase_schema.sql and supabase_seed_curriculum.sql
-- Safe to re-run (uses upserts and delete-then-insert patterns).
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: MODULE DEFINITION (order_index 34)
-- ============================================================================

INSERT INTO learning_modules (id, title, description, difficulty, estimated_hours, order_index, status, tags, xp_reward, created_at, updated_at)
VALUES
  ('acc00006-0000-0000-0000-000000000006',
   'ACC SRVY 2341 — Advanced Surveying',
   'Austin Community College SRVY 2341 (3 SCH). Advanced topics in surveying building on the foundational skills from SRVY 1301, 1335, and 1341. Topics include horizontal curve design and computation (simple, compound, and reverse curves), vertical curve design and computation (crest and sag curves), route surveying and alignment design, earthwork volume computation (average end area, prismoidal formula), construction staking procedures (slope staking, blue tops, offset stakes), topographic surveying methods and contour mapping, state plane coordinate systems and ground-to-grid conversions, introduction to photogrammetry and remote sensing, and survey project management. This course prepares students for professional field practice in construction and route surveying. Prerequisites: SRVY 1341 and SRVY 1335. Textbook: Elementary Surveying by Ghilani or Surveying with Construction Applications by Kavanagh.',
   'advanced', 48.0, 34, 'published',
   ARRAY['acc','srvy-2341','advanced','curves','construction','route-surveying','college-course','semester'],
   500, now(), now())

ON CONFLICT (id) DO UPDATE SET
  title           = EXCLUDED.title,
  description     = EXCLUDED.description,
  difficulty      = EXCLUDED.difficulty,
  estimated_hours = EXCLUDED.estimated_hours,
  order_index     = EXCLUDED.order_index,
  status          = EXCLUDED.status,
  tags            = EXCLUDED.tags,
  xp_reward       = EXCLUDED.xp_reward,
  updated_at      = now();


-- ============================================================================
-- SECTION 2: LESSONS (16 weeks)
-- ============================================================================

DELETE FROM learning_lessons WHERE module_id = 'acc00006-0000-0000-0000-000000000006';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  -- Week 1
  ('acc06b01-0000-0000-0000-000000000001', 'acc00006-0000-0000-0000-000000000006',
   'Week 1: Course Overview and Review of Coordinate Geometry',
   'Review of prerequisite concepts: traverse computations, coordinate geometry (COGO), inversing, and intersections. Introduction to advanced surveying applications: route design, construction layout, topographic mapping, and geodetic positioning. Overview of the course structure: horizontal curves, vertical curves, earthwork, construction staking, topographic surveys, and state plane coordinates. Review of trigonometric relationships and their application to surveying problems. Calculator and spreadsheet techniques for advanced computations.',
   ARRAY['Review COGO fundamentals: inversing and intersection','Understand the scope of advanced surveying applications','Apply trigonometric relationships to surveying problems','Set up spreadsheets for repetitive survey computations','Preview major course topics and their professional applications'],
   1, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-2341','week-1','review','COGO','introduction'], 'published'),

  -- Week 2
  ('acc06b02-0000-0000-0000-000000000001', 'acc00006-0000-0000-0000-000000000006',
   'Week 2: Simple Horizontal Curves — Terminology and Geometry',
   'Introduction to horizontal curves in route surveying. Why curves are needed: connecting tangent sections of roadways and railroads. Simple circular curve terminology: Point of Curvature (PC), Point of Tangency (PT), Point of Intersection (PI), radius (R), degree of curve (D) — arc definition vs chord definition, central angle/delta (Δ), tangent distance (T), curve length (L), long chord (LC), external distance (E), middle ordinate (M). The fundamental relationships: D = 5729.578/R (arc definition), T = R × tan(Δ/2), L = R × Δ (in radians) = 100 × Δ/D, LC = 2R × sin(Δ/2), E = R × (sec(Δ/2) - 1), M = R × (1 - cos(Δ/2)). Texas uses the arc definition of degree of curve.',
   ARRAY['Define all simple curve elements (PC, PT, PI, R, D, Δ, T, L, LC, E, M)','Compute all curve elements given R and Δ','Distinguish between arc and chord definitions of degree of curve','Apply the fundamental curve formulas','Sketch a simple curve and label all elements'],
   2, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-2341','week-2','horizontal-curves','terminology','simple-curve'], 'published'),

  -- Week 3
  ('acc06b03-0000-0000-0000-000000000001', 'acc00006-0000-0000-0000-000000000006',
   'Week 3: Simple Horizontal Curves — Stakeout and Layout',
   'Laying out horizontal curves in the field. Stationing along an alignment: how stations work (e.g., 10+00 = 1,000 feet). Computing the station of the PC and PT from the PI station and tangent distance. Deflection angle method for curve layout: deflection from the tangent at the PC to any point on the curve = (arc length from PC / total curve length) × (Δ/2). Setting up at the PC, turning deflection angles, and measuring chord distances to set curve points. Chord lengths for full and subchords. Moving the instrument on the curve when the full curve cannot be seen from the PC. Field notes for curve layout.',
   ARRAY['Compute PC and PT stations from PI station and tangent distance','Calculate deflection angles for curve stakeout','Compute chord distances for full and sub-stations','Lay out a curve using the deflection angle method','Prepare field notes for curve layout'],
   3, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-2341','week-3','curve-layout','deflection-angles','stakeout','stationing'], 'published'),

  -- Week 4
  ('acc06b04-0000-0000-0000-000000000001', 'acc00006-0000-0000-0000-000000000006',
   'Week 4: Compound and Reverse Curves',
   'Compound curves: two or more simple curves joined end-to-end, curving in the same direction but with different radii. The point of compound curvature (PCC). Computing compound curve elements: each segment is computed as a simple curve, with the PCC being the PT of the first curve and the PC of the second. Why compound curves are used: transitioning between different design speeds or fitting terrain. Reverse curves: two simple curves joined end-to-end, curving in opposite directions. The point of reverse curvature (PRC). Computing reverse curve elements. Safety concerns with reverse curves on highways — S-curves. Spiral (transition) curves: concept and purpose — providing a gradual change in curvature from a tangent to a circular arc. Euler spiral (clothoid) basics.',
   ARRAY['Compute compound curve elements including PCC station','Compute reverse curve elements including PRC station','Explain when compound and reverse curves are appropriate','Describe the purpose of spiral transition curves','Identify safety concerns with reverse curves in highway design'],
   4, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-2341','week-4','compound-curves','reverse-curves','spiral-curves','PCC','PRC'], 'published'),

  -- Week 5
  ('acc06b05-0000-0000-0000-000000000001', 'acc00006-0000-0000-0000-000000000006',
   'Week 5: Vertical Curves — Theory and Computation',
   'Vertical alignment design: grades and grade changes. Why vertical curves are needed: providing a smooth transition between different grades for rider comfort and sight distance. Vertical curve types: crest (convex — grade goes from positive to negative or less positive) and sag (concave — grade goes from negative to positive or less negative). Vertical curve elements: PVC (Point of Vertical Curvature = BVC, beginning), PVI (Point of Vertical Intersection), PVT (Point of Vertical Tangency = EVC, ending), grades in percent (g1, g2), algebraic difference A = g2 - g1, curve length L. The parabolic equation: y = (A / 200L) × x² (offset from tangent). Computing elevations at any station on the curve. The high/low point location: x = -g1 × L / A. Minimum curve length for sight distance.',
   ARRAY['Distinguish between crest and sag vertical curves','Compute the algebraic difference of grades','Calculate elevations at any point on a vertical curve using the parabolic formula','Find the station and elevation of the high or low point','Determine minimum curve length for sight distance requirements'],
   5, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-2341','week-5','vertical-curves','crest','sag','parabolic','grades'], 'published'),

  -- Week 6
  ('acc06b06-0000-0000-0000-000000000001', 'acc00006-0000-0000-0000-000000000006',
   'Week 6: Vertical Curves — Design and Stakeout',
   'Vertical curve design criteria: stopping sight distance, passing sight distance, headlight sight distance (sag curves), drainage, appearance, and rider comfort. AASHTO design standards. K-value: the ratio of curve length to algebraic difference (K = L/A). Using K-values for design: L = K × A. Vertical curve stakeout procedures: computing elevations at each station, marking grade stakes, blue-top stakes for finish grade. Unsymmetrical (unequal tangent) vertical curves: when the PVI is not at the midpoint. Computing elevations for unsymmetrical curves. Combining horizontal and vertical alignments: the 3D alignment.',
   ARRAY['Apply AASHTO design criteria for vertical curves','Use K-values to determine minimum curve lengths','Compute vertical curve stakeout data','Handle unsymmetrical vertical curves','Understand the relationship between horizontal and vertical alignments'],
   6, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-2341','week-6','vertical-curve-design','K-value','AASHTO','stakeout'], 'published'),

  -- Week 7
  ('acc06b07-0000-0000-0000-000000000001', 'acc00006-0000-0000-0000-000000000006',
   'Week 7: Route Surveying and Alignment Design',
   'Route surveying for highways, railroads, pipelines, and utilities. The complete route survey process: reconnaissance, preliminary survey, alignment design, final location survey, and construction survey. Horizontal alignment design: tangent lengths, curve selection, sight distance around curves, superelevation. Vertical alignment design: grade selection, vertical curve fitting, drainage considerations. Cross-section design: typical roadway sections, lane width, shoulders, ditches, cut and fill slopes. Right-of-way determination and easement requirements. TxDOT standards for route surveys. Plan and profile drawings: what they show and how to read them.',
   ARRAY['Describe the complete route survey process from recon to construction','Design a simple horizontal alignment with tangents and curves','Read and interpret plan and profile drawings','Understand cross-section design elements','Apply TxDOT standards to route survey design'],
   7, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-2341','week-7','route-surveying','alignment','plan-profile','TxDOT'], 'published'),

  -- Week 8: MIDTERM EXAM
  ('acc06b08-0000-0000-0000-000000000001', 'acc00006-0000-0000-0000-000000000006',
   'Week 8: Midterm Exam',
   'Midterm examination covering Weeks 1–7: COGO review, simple horizontal curve computation and layout, compound and reverse curves, vertical curve theory and computation, vertical curve design, and route surveying concepts. Heavy emphasis on curve computation problems — expect to compute all elements of simple curves, deflection angles, vertical curve elevations, and high/low points.',
   ARRAY['Review all horizontal curve formulas and computations','Practice vertical curve elevation calculations','Review deflection angle stakeout procedures','Study compound and reverse curve concepts','Review route surveying process and design standards'],
   8, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-2341','week-8','midterm','exam'], 'published'),

  -- Week 9
  ('acc06b09-0000-0000-0000-000000000001', 'acc00006-0000-0000-0000-000000000006',
   'Week 9: Earthwork Volumes — Cross Sections and Computation',
   'Earthwork: computing volumes of cut and fill for construction projects. Cross-section surveys: taking cross-section data at regular station intervals perpendicular to the centerline. Cross-section plotting and area computation. End areas: computing the area of cut and fill in each cross section using coordinate method, planimeter, or CAD software. The average end area method: Volume = L × (A1 + A2) / 2. The prismoidal formula: Volume = L × (A1 + 4Am + A2) / 6. When to use each method (prismoidal correction). Mass diagrams: plotting cumulative earthwork volumes, free haul, overhaul, borrow, and waste. Balancing cut and fill to minimize project cost. Shrinkage and swell factors for different soil types.',
   ARRAY['Compute cross-section areas for cut and fill','Calculate earthwork volumes using average end area method','Apply the prismoidal formula for more accurate volumes','Construct and interpret a mass diagram','Account for shrinkage and swell factors in volume calculations'],
   9, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-2341','week-9','earthwork','volumes','cross-sections','mass-diagram'], 'published'),

  -- Week 10
  ('acc06b10-0000-0000-0000-000000000001', 'acc00006-0000-0000-0000-000000000006',
   'Week 10: Construction Staking Procedures',
   'Construction surveying: the process of laying out designed structures in the field for builders. Types of construction stakes: offset stakes, slope stakes, grade stakes, blue tops, hub and tack, guard stakes. Reference points and control for construction sites. Slope staking: determining the catch points where cut/fill slopes intersect natural ground. Cut and fill computations from design grade to existing ground. Offset staking: placing stakes at a known offset from the design position with cut/fill information written on the stake. Grade staking for utilities: pipe invert elevations, trench depth computations. Building layout: batter boards, baseline offsets, corner staking. Communication between surveyor and contractor: what information goes on each stake.',
   ARRAY['Describe the types of construction stakes and their purposes','Compute cut and fill values for construction staking','Set slope stakes and determine catch points','Lay out building corners using baseline offsets and batter boards','Communicate construction staking information to contractors'],
   10, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-2341','week-10','construction-staking','slope-stakes','grade-stakes','layout'], 'published'),

  -- Week 11
  ('acc06b11-0000-0000-0000-000000000001', 'acc00006-0000-0000-0000-000000000006',
   'Week 11: Topographic Surveying Methods',
   'Topographic surveys: mapping the shape of the ground and the location of features. Planning a topographic survey: horizontal and vertical control, feature identification, contour interval selection, survey limits. Field methods: radial (total station or GPS from a single setup), grid method (regular grid of elevation shots), cross-section method (profiles at regular intervals), and controlling point method (shots at significant terrain changes). Feature coding for automated mapping. Contour interpolation from spot elevations. Contour line properties: contour lines never cross, they close on themselves, spacing indicates slope steepness, and they are perpendicular to the direction of maximum slope. Digital Terrain Models (DTM) and Triangulated Irregular Networks (TIN). Using total stations and RTK GPS for topographic data collection.',
   ARRAY['Plan a topographic survey with appropriate control and contour interval','Collect topographic data using radial, grid, and cross-section methods','Apply feature coding for automated mapping','Interpolate contour lines from spot elevations','Understand DTM/TIN concepts for digital terrain representation'],
   11, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-2341','week-11','topographic','contours','DTM','TIN','field-methods'], 'published'),

  -- Week 12
  ('acc06b12-0000-0000-0000-000000000001', 'acc00006-0000-0000-0000-000000000006',
   'Week 12: State Plane Coordinate Systems and Map Projections',
   'Map projections: the problem of representing the curved earth on a flat surface. Types of projections: conformal (preserve angles), equal area, equidistant. The Lambert Conformal Conic (LCC) projection: how it works, standard parallels, central meridian. The Transverse Mercator (TM) projection: central meridian, scale factor. State Plane Coordinate Systems (SPCS): designed for each state to minimize projection distortion. Texas SPCS: five zones (North, North Central, Central, South Central, South), all using Lambert Conformal Conic. Grid vs ground distances: the grid scale factor varies across the zone. Elevation factor: correcting for height above the ellipsoid. Combined scale factor = grid factor × elevation factor. Converting between ground distances and grid distances. Convergence angle: the difference between grid north and geodetic north.',
   ARRAY['Explain why map projections are necessary and types of distortion','Describe the Lambert Conformal Conic projection used in Texas','Identify the five Texas state plane zones and their parameters','Compute combined scale factors for ground-to-grid conversions','Apply convergence angle corrections to azimuths'],
   12, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-2341','week-12','state-plane','projections','Lambert','scale-factor','convergence'], 'published'),

  -- Week 13
  ('acc06b13-0000-0000-0000-000000000001', 'acc00006-0000-0000-0000-000000000006',
   'Week 13: Introduction to Photogrammetry and Remote Sensing',
   'Photogrammetry: the science of making measurements from photographs. Aerial photography: vertical and oblique photos, flight planning, overlap and sidelap requirements. Photo scale computation: focal length / flying height above ground. Relief displacement in aerial photos. Stereoscopic viewing and parallax measurement. Ground control points for photogrammetric projects. Orthophotos: geometrically corrected aerial images. Introduction to LiDAR (Light Detection and Ranging): how it works, point cloud data, DEM generation. UAV (drone) photogrammetry: regulatory overview (FAA Part 107), flight planning, ground control, and deliverables. Remote sensing basics: electromagnetic spectrum, spectral signatures, satellite imagery (Landsat, Sentinel). Integration of photogrammetry with conventional surveying.',
   ARRAY['Explain the principles of aerial photogrammetry','Calculate photo scale from focal length and flying height','Describe the role of ground control points in photogrammetry','Understand LiDAR technology and point cloud data','Describe UAV/drone surveying workflows and FAA regulations'],
   13, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-2341','week-13','photogrammetry','LiDAR','UAV','remote-sensing','aerial'], 'published'),

  -- Week 14
  ('acc06b14-0000-0000-0000-000000000001', 'acc00006-0000-0000-0000-000000000006',
   'Week 14: Survey Project Management and Professional Practice',
   'Managing a survey project from proposal to deliverables. Proposal writing: scope of work, schedule, budget, and qualifications. Project planning: research phase (deed research, existing surveys, control data), field phase (crew assignments, equipment, scheduling), and office phase (computations, drafting, QA/QC). Quality assurance and quality control: independent checks, redundant measurements, closure checks, peer review. Survey deliverables: boundary plats, topographic maps, ALTA/NSPS surveys, descriptions, and staking reports. Record keeping and archiving. Client communication. Professional liability and insurance. Career paths in surveying: party chief, project manager, RPLS, business owner. Continuing education requirements in Texas.',
   ARRAY['Develop a survey project proposal with scope, budget, and schedule','Plan field and office phases of a survey project','Implement QA/QC procedures throughout a project','Prepare professional survey deliverables','Understand career paths and professional development in surveying'],
   14, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-2341','week-14','project-management','professional-practice','QA-QC','deliverables'], 'published'),

  -- Week 15
  ('acc06b15-0000-0000-0000-000000000001', 'acc00006-0000-0000-0000-000000000006',
   'Week 15: Comprehensive Review and SIT/RPLS Exam Preparation',
   'Comprehensive review of all course topics: horizontal curves (simple, compound, reverse), vertical curves (crest, sag), route surveying, earthwork volumes, construction staking, topographic surveying, state plane coordinates, and photogrammetry. Integration of advanced surveying concepts with foundational skills. Practice problems covering the full range of computation types. SIT and RPLS exam preparation: format, content areas, study strategies. Review of key formulas and their applications. Common exam mistakes and how to avoid them. Professional development resources and continuing education.',
   ARRAY['Review all major computation types from the course','Practice integrated problems combining multiple topics','Prepare for SIT/RPLS exam advanced surveying sections','Identify and address weak areas before the final','Review key formulas and their correct application'],
   15, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-2341','week-15','review','exam-prep','SIT','RPLS','comprehensive'], 'published'),

  -- Week 16: FINAL EXAM
  ('acc06b16-0000-0000-0000-000000000001', 'acc00006-0000-0000-0000-000000000006',
   'Week 16: Final Exam',
   'Comprehensive final examination covering all course material from Weeks 1–15. Heavy emphasis on computation problems: horizontal curve elements and deflection angles, vertical curve elevations and high/low points, earthwork volumes, construction staking cut/fill values, state plane scale factors, and photo scale computations. Conceptual questions on route surveying, topographic methods, and photogrammetry.',
   ARRAY['Review all computation procedures thoroughly','Practice full curve and volume problems end-to-end','Review construction staking procedures','Study state plane and photogrammetry concepts','Focus on weak areas identified during the semester'],
   16, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-2341','week-16','final','exam'], 'published');


-- ============================================================================
-- SECTION 3: QUESTION BANK — Weeks 1-7 (Quiz + Homework)
-- ============================================================================

DELETE FROM question_bank WHERE tags @> ARRAY['acc-srvy-2341'];

-- Week 1 Quiz & Homework
INSERT INTO question_bank (question_text, question_type, options, correct_answer, explanation, difficulty, module_id, lesson_id, exam_category, tags) VALUES
('The inverse computation determines the _____ and _____ between two coordinate pairs.', 'multiple_choice', '["Latitude and departure","Distance and direction","Area and perimeter","Elevation and slope"]'::jsonb, 'Distance and direction', 'An inverse computation calculates the distance and direction (azimuth or bearing) between two points given their coordinates. Distance = sqrt(ΔN² + ΔE²), Azimuth = arctan(ΔE/ΔN) adjusted for quadrant.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b01-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-1','quiz','inverse']),
('Given Point A (N=1000, E=2000) and Point B (N=1300, E=2400), what is the distance A to B?', 'numeric_input', '[]'::jsonb, '500', 'ΔN = 300, ΔE = 400. Distance = sqrt(300² + 400²) = sqrt(90000 + 160000) = sqrt(250000) = 500.00 ft.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b01-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-1','quiz','inverse-distance']),
('The azimuth from A to B in the previous problem is:', 'multiple_choice', '["N 53°08'' E","S 53°08'' W","53°08''","36°52''"]'::jsonb, '53°08''', 'ΔN = +300 (north), ΔE = +400 (east) → NE quadrant. Azimuth = arctan(400/300) = arctan(1.333) = 53°08''. Since both ΔN and ΔE are positive, the azimuth is in the first quadrant.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b01-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-1','quiz','inverse-azimuth']),
('A direction-direction intersection uses two directions from known points to find an unknown point.', 'true_false', '["True","False"]'::jsonb, 'True', 'A direction-direction intersection computes the coordinates of an unknown point by intersecting two lines of known direction from two known points. It requires two known points and a direction (azimuth) from each to the unknown point.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b01-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-1','quiz','intersection']),
('COGO stands for Coordinate Geometry.', 'true_false', '["True","False"]'::jsonb, 'True', 'COGO (Coordinate Geometry) is the mathematical foundation for survey computations using coordinates: inversing, intersections, traverse computations, area calculations, and curve solutions.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b01-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-1','quiz','COGO']),
('Compute the inverse from Point P (N=5280.00, E=3150.00) to Point Q (N=4920.00, E=3630.00). Give both the distance and azimuth.', 'short_answer', '[]'::jsonb, 'Distance = 600.00 ft, Azimuth = 128°40'' (S 51°20'' E)', 'ΔN = 4920-5280 = -360, ΔE = 3630-3150 = +480. Distance = sqrt(360² + 480²) = sqrt(129600+230400) = sqrt(360000) = 600.00. Bearing angle = arctan(480/360) = 53°08''. Since ΔN is negative and ΔE is positive (SE quadrant), Azimuth = 180° - 53°08'' = 126°52''. Note: may vary slightly by rounding method.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b01-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-1','homework','inverse-computation']),
('List three types of intersection problems and describe when each is used.', 'short_answer', '[]'::jsonb, 'Direction-direction (two azimuths), distance-distance (two distances), direction-distance (one of each)', 'Three intersection types: (1) Direction-direction: two azimuths from known points; used when angles can be measured but distances cannot (e.g., inaccessible point). (2) Distance-distance: two distances from known points; used when distances can be measured but angles are difficult. (3) Direction-distance: one azimuth and one distance from different known points; hybrid solution.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b01-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-1','homework','intersection-types']),
('Explain why spreadsheets and programming are valuable tools for advanced surveying computations.', 'short_answer', '[]'::jsonb, 'They automate repetitive calculations, reduce human error, allow easy recalculation when inputs change, and handle large datasets efficiently.', 'Spreadsheets automate tedious repetitive computations (like curve tables with dozens of deflection angles), reduce arithmetic errors, allow instant recalculation when design parameters change, and can handle large datasets (thousands of cross-section points). Programming skills extend these capabilities further. Professional surveyors use software daily.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b01-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-1','homework','computation-tools']),

-- Week 2 Quiz & Homework
('In horizontal curve terminology, the degree of curve (D) using the arc definition is:', 'multiple_choice', '["The angle subtended by a 100-ft arc","The angle subtended by a 100-ft chord","The total central angle","The deflection angle to the PT"]'::jsonb, 'The angle subtended by a 100-ft arc', 'The arc definition (used in highway design and in Texas): D is the central angle subtended by a 100-ft arc. D = 5729.578/R. The chord definition (used in railroad design) uses a 100-ft chord instead.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b02-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-2','quiz','degree-of-curve']),
('For a simple curve with R = 1000 ft, the degree of curve D (arc definition) is:', 'numeric_input', '[]'::jsonb, '5.73', 'D = 5729.578 / R = 5729.578 / 1000 = 5.73° (or 5°43''45").', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b02-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-2','quiz','D-computation']),
('The tangent distance (T) of a simple curve is computed as:', 'multiple_choice', '["R × sin(Δ)","R × tan(Δ/2)","R × cos(Δ/2)","R × Δ"]'::jsonb, 'R × tan(Δ/2)', 'T = R × tan(Δ/2) is the distance from the PC (or PT) to the PI along the tangent. It is one of the most fundamental curve formulas.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b02-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-2','quiz','tangent-distance']),
('The external distance (E) is measured from the PI to the midpoint of the curve.', 'true_false', '["True","False"]'::jsonb, 'True', 'E = R × (sec(Δ/2) - 1) is the distance from the PI (outside the curve) to the midpoint of the curve arc. It is the maximum distance between the tangent lines and the curve.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b02-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-2','quiz','external-distance']),
('The long chord (LC) of a simple curve is:', 'multiple_choice', '["The arc length","The straight-line distance from PC to PT","The tangent distance","The radius"]'::jsonb, 'The straight-line distance from PC to PT', 'LC = 2R × sin(Δ/2) is the straight-line (chord) distance from the PC to the PT. It is always shorter than the arc length L.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b02-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-2','quiz','long-chord']),
('Given: R = 800 ft, Δ = 40°00''. Compute T, L, LC, E, and M.', 'essay', '[]'::jsonb, 'T = 291.31 ft, L = 558.51 ft, LC = 546.45 ft, E = 51.33 ft, M = 48.56 ft', 'T = 800 × tan(20°) = 800 × 0.36397 = 291.18 ft. L = 800 × 40° × π/180 = 800 × 0.6981 = 558.51 ft. LC = 2 × 800 × sin(20°) = 1600 × 0.34202 = 547.23 ft. E = 800 × (sec(20°) - 1) = 800 × (1.06418 - 1) = 51.34 ft. M = 800 × (1 - cos(20°)) = 800 × (1 - 0.93969) = 48.25 ft. Note: minor variations due to rounding of trig functions.', 'hard', 'acc00006-0000-0000-0000-000000000006', 'acc06b02-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-2','homework','full-curve-computation']),
('What is the degree of curve for a radius of 2000 ft (arc definition)?', 'numeric_input', '[]'::jsonb, '2.86', 'D = 5729.578 / 2000 = 2.865° ≈ 2.86° (or 2°51''53").', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b02-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-2','homework','degree-of-curve-comp']),
('Explain the difference between the arc definition and the chord definition of degree of curve. Which does Texas use?', 'short_answer', '[]'::jsonb, 'Arc def: angle subtended by 100-ft arc (highways). Chord def: angle subtended by 100-ft chord (railroads). Texas uses arc definition.', 'Arc definition: D is the central angle subtended by a 100-ft arc on the curve. Formula: D = 5729.578/R. Used for highway design and in Texas. Chord definition: D is the central angle subtended by a 100-ft chord. Formula: D = 2 × arcsin(50/R). Used historically for railroad design. The two definitions give slightly different D values for the same radius.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b02-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-2','homework','arc-vs-chord']),

-- Week 3 Quiz & Homework
('Station 10+00 means a distance of _____ feet from the beginning of the alignment.', 'numeric_input', '[]'::jsonb, '1000', 'Station 10+00 = 10 × 100 = 1,000 feet from the origin (station 0+00). The number before the + represents hundreds of feet.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b03-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-3','quiz','stationing']),
('If the PI is at station 25+50 and T = 300 ft, the PC station is:', 'multiple_choice', '["22+50","28+50","25+50","22+00"]'::jsonb, '22+50', 'PC station = PI station - T = 25+50 - 3+00 = 22+50. You subtract the tangent distance from the PI station.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b03-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-3','quiz','PC-station']),
('The deflection angle from the PC tangent to any point on the curve equals:', 'multiple_choice', '["The full central angle Δ","Half the arc angle from PC to that point","The degree of curve","The tangent distance divided by radius"]'::jsonb, 'Half the arc angle from PC to that point', 'Deflection angle = (arc length from PC to point / total curve length) × (Δ/2). Equivalently, deflection = (arc/200) × D for full stations. The deflection is always half the corresponding central angle.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b03-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-3','quiz','deflection-angle']),
('The total deflection angle from the PC to the PT equals Δ/2.', 'true_false', '["True","False"]'::jsonb, 'True', 'The total deflection from the PC tangent to the PT equals exactly Δ/2. This is a key check: if your computed deflections don''t sum to Δ/2, there is an error.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b03-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-3','quiz','total-deflection']),
('A subchord is used when a curve point does not fall on a full station.', 'true_false', '["True","False"]'::jsonb, 'True', 'The PC and PT rarely fall on full stations. The distance from the PC to the first full station (or from the last full station to the PT) is a subchord, which is shorter than the full-station chord.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b03-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-3','quiz','subchord']),

-- Week 4 Quiz & Homework
('A compound curve consists of two or more simple curves that:', 'multiple_choice', '["Curve in opposite directions","Curve in the same direction with different radii","Have the same radius","Are separated by a tangent section"]'::jsonb, 'Curve in the same direction with different radii', 'A compound curve has two or more arcs curving in the same direction but with different radii. The point where they meet is the PCC (Point of Compound Curvature). They share a common tangent at the PCC.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b04-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-4','quiz','compound-curve']),
('A reverse curve has curves that turn in opposite directions.', 'true_false', '["True","False"]'::jsonb, 'True', 'A reverse curve consists of two arcs curving in opposite directions joined at the PRC (Point of Reverse Curvature). They create an S-shape. Reverse curves are generally avoided on highways due to safety concerns.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b04-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-4','quiz','reverse-curve']),
('The purpose of a spiral (transition) curve is to:', 'multiple_choice', '["Increase the speed limit","Gradually change curvature from zero (tangent) to the design radius","Add length to the road","Replace horizontal curves"]'::jsonb, 'Gradually change curvature from zero (tangent) to the design radius', 'A spiral provides a gradual transition in curvature and superelevation from the tangent (zero curvature) to the circular arc (full curvature). This prevents the sudden change in centripetal force that would occur at an abrupt tangent-to-curve transition.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b04-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-4','quiz','spiral-purpose']),

-- Week 5 Quiz & Homework
('A crest vertical curve is shaped like:', 'multiple_choice', '["A valley (concave up)","A hill (convex up)","A straight line","A circle"]'::jsonb, 'A hill (convex up)', 'A crest curve is convex (hill-shaped). The grade goes from a steeper uphill to a less steep uphill, to downhill, or from uphill to downhill. Crest curves control stopping sight distance because the hill blocks the driver''s view.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b05-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-5','quiz','crest-curve']),
('The algebraic difference A for grades g1 = +3% and g2 = -2% is:', 'numeric_input', '[]'::jsonb, '-5', 'A = g2 - g1 = (-2) - (+3) = -5%. The negative value indicates a crest curve (grade goes from up to down).', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b05-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-5','quiz','algebraic-difference']),
('The high point of a crest vertical curve is located at x = -g1 × L / A from the PVC.', 'true_false', '["True","False"]'::jsonb, 'True', 'The high point (or low point for sag curves) occurs where the tangent to the parabola is horizontal (slope = 0). The distance from PVC: x = (-g1 / A) × L, where g1 and A are in percent and L is the curve length.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b05-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-5','quiz','high-point']),
('Vertical curves are based on what geometric shape?', 'multiple_choice', '["Circular arc","Ellipse","Parabola","Hyperbola"]'::jsonb, 'Parabola', 'Vertical curves use a parabolic shape because parabolas provide a constant rate of change in grade, which is comfortable for vehicles and mathematically convenient. The equation y = (A/200L)x² gives the offset from the tangent.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b05-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-5','quiz','parabola']),
('A sag curve requires longer minimum length than a crest curve for the same design speed.', 'true_false', '["True","False"]'::jsonb, 'False', 'Crest curves generally require longer minimum lengths than sag curves for the same speed because the crest blocks the driver''s line of sight. Sag curves are controlled by headlight sight distance (at night), which is usually a less demanding criterion.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b05-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-5','quiz','crest-vs-sag']),
('Given: PVC at station 20+00, elevation 450.00 ft, g1 = +4%, g2 = -2%, L = 600 ft. Find the elevation at station 23+00.', 'numeric_input', '[]'::jsonb, '457.50', 'x = 2300 - 2000 = 300 ft from PVC. Tangent elevation = 450.00 + (0.04 × 300) = 462.00. A = -2 - 4 = -6. Offset = (A/(200×L)) × x² = (-6/(200×600)) × 300² = (-0.00005) × 90000 = -4.50. Curve elevation = 462.00 - 4.50 = 457.50 ft.', 'hard', 'acc00006-0000-0000-0000-000000000006', 'acc06b05-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-5','homework','vertical-curve-elevation']),
('Find the station and elevation of the high point for the curve in the previous problem.', 'short_answer', '[]'::jsonb, 'Station 24+00, elevation 458.00 ft', 'High point at x = (-g1/A) × L = (-4/(-6)) × 600 = 400 ft from PVC. Station = 20+00 + 4+00 = 24+00. Tangent elev at x=400: 450 + 0.04×400 = 466.00. Offset = (-6/120000) × 160000 = -8.00. Curve elev = 466.00 - 8.00 = 458.00 ft.', 'hard', 'acc00006-0000-0000-0000-000000000006', 'acc06b05-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-5','homework','high-point-computation']),

-- Week 6 Quiz & Homework
('The K-value for vertical curves is defined as:', 'multiple_choice', '["K = A / L","K = L / A","K = L × A","K = A × g1"]'::jsonb, 'K = L / A', 'K = L / A where L = curve length and A = algebraic difference of grades (in %). K represents the horizontal distance needed for a 1% change in grade. Higher K means a flatter, longer curve.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b06-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-6','quiz','K-value']),
('For a design speed of 60 mph, the minimum K-value for a crest curve is 151. If A = 4%, what is the minimum curve length?', 'numeric_input', '[]'::jsonb, '604', 'L = K × A = 151 × 4 = 604 ft. This is the minimum curve length to provide adequate stopping sight distance.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b06-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-6','quiz','min-curve-length']),
('Blue-top stakes indicate:', 'multiple_choice', '["Property corners","The finish grade elevation","Temporary benchmarks","Hazardous areas"]'::jsonb, 'The finish grade elevation', 'Blue tops are grade stakes driven so that the top of the stake is at the exact finish grade elevation. The blue paint on top serves as the visual reference for equipment operators.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b06-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-6','quiz','blue-tops']),

-- Week 7 Quiz & Homework
('A plan and profile drawing shows:', 'multiple_choice', '["Only the horizontal alignment","Only the vertical alignment","Both horizontal alignment (plan view) and vertical alignment (profile view)","The cross-section design"]'::jsonb, 'Both horizontal alignment (plan view) and vertical alignment (profile view)', 'Plan and profile (P&P) drawings show the horizontal alignment in plan view (top) and the vertical alignment in profile view (bottom). They are the primary design documents for route projects.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b07-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-7','quiz','plan-and-profile']),
('Superelevation on a highway curve serves to:', 'multiple_choice', '["Improve drainage","Counteract centripetal force on vehicles","Make the road look better","Reduce construction costs"]'::jsonb, 'Counteract centripetal force on vehicles', 'Superelevation (banking) tilts the roadway cross-section on curves so that a component of the vehicle''s weight helps counteract the centripetal force. This keeps vehicles from sliding outward and allows higher design speeds on curves.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b07-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-7','quiz','superelevation']),
('The preliminary survey in route surveying establishes the proposed alignment.', 'true_false', '["True","False"]'::jsonb, 'True', 'The preliminary survey gathers topographic and control data along the proposed route corridor. This data is used to design the horizontal and vertical alignments. The final location survey refines the alignment for construction.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b07-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-7','quiz','preliminary-survey']);


-- ============================================================================
-- SECTION 4: MIDTERM EXAM (15 questions)
-- ============================================================================

INSERT INTO question_bank (question_text, question_type, options, correct_answer, explanation, difficulty, module_id, lesson_id, exam_category, tags) VALUES
('D = 5729.578 / R applies to the _____ definition of degree of curve.', 'multiple_choice', '["Chord","Arc","Tangent","Central"]'::jsonb, 'Arc', 'D = 5729.578/R is the arc definition, where D is the central angle subtended by a 100-ft arc.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b08-0000-0000-0000-000000000001', 'ACC-2341-MIDTERM', ARRAY['acc-srvy-2341','midterm','degree-of-curve']),
('T = R × tan(Δ/2) computes the:', 'multiple_choice', '["Curve length","Long chord","Tangent distance","External distance"]'::jsonb, 'Tangent distance', 'T = R × tan(Δ/2) is the tangent distance from the PC (or PT) to the PI.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b08-0000-0000-0000-000000000001', 'ACC-2341-MIDTERM', ARRAY['acc-srvy-2341','midterm','tangent']),
('For R = 500 ft and Δ = 60°, compute T.', 'numeric_input', '[]'::jsonb, '288.68', 'T = 500 × tan(30°) = 500 × 0.57735 = 288.68 ft.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b08-0000-0000-0000-000000000001', 'ACC-2341-MIDTERM', ARRAY['acc-srvy-2341','midterm','T-computation']),
('For the same curve (R=500, Δ=60°), compute the curve length L.', 'numeric_input', '[]'::jsonb, '523.60', 'L = R × Δ(radians) = 500 × (60 × π/180) = 500 × 1.04720 = 523.60 ft.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b08-0000-0000-0000-000000000001', 'ACC-2341-MIDTERM', ARRAY['acc-srvy-2341','midterm','L-computation']),
('The total deflection from PC to PT equals:', 'multiple_choice', '["Δ","Δ/2","Δ/4","2Δ"]'::jsonb, 'Δ/2', 'The total deflection angle from the PC tangent to the PT always equals Δ/2.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b08-0000-0000-0000-000000000001', 'ACC-2341-MIDTERM', ARRAY['acc-srvy-2341','midterm','deflection']),
('PI at station 30+00, T = 250 ft. PC station = ?', 'multiple_choice', '["27+50","32+50","30+00","25+00"]'::jsonb, '27+50', 'PC = PI - T = 30+00 - 2+50 = 27+50.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b08-0000-0000-0000-000000000001', 'ACC-2341-MIDTERM', ARRAY['acc-srvy-2341','midterm','PC-station']),
('A compound curve has arcs curving in the same direction with different radii.', 'true_false', '["True","False"]'::jsonb, 'True', 'Compound = same direction, different radii. Reverse = opposite directions.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b08-0000-0000-0000-000000000001', 'ACC-2341-MIDTERM', ARRAY['acc-srvy-2341','midterm','compound']),
('Vertical curves use a _____ shape.', 'multiple_choice', '["Circular","Parabolic","Elliptical","Hyperbolic"]'::jsonb, 'Parabolic', 'Vertical curves are parabolas, providing a constant rate of grade change.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b08-0000-0000-0000-000000000001', 'ACC-2341-MIDTERM', ARRAY['acc-srvy-2341','midterm','parabola']),
('For g1 = +5% and g2 = -3%, A = ?', 'numeric_input', '[]'::jsonb, '-8', 'A = g2 - g1 = -3 - 5 = -8%.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b08-0000-0000-0000-000000000001', 'ACC-2341-MIDTERM', ARRAY['acc-srvy-2341','midterm','A-computation']),
('The high/low point distance from PVC is x = -g1 × L / A.', 'true_false', '["True","False"]'::jsonb, 'True', 'The high or low point occurs where the slope of the parabola is zero: x = (-g1/A) × L.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b08-0000-0000-0000-000000000001', 'ACC-2341-MIDTERM', ARRAY['acc-srvy-2341','midterm','high-low-point']),
('K = L / A represents:', 'multiple_choice', '["The curve radius","Horizontal distance for 1% grade change","The tangent distance","The external distance"]'::jsonb, 'Horizontal distance for 1% grade change', 'K = L/A gives the horizontal distance needed for each 1% change in grade.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b08-0000-0000-0000-000000000001', 'ACC-2341-MIDTERM', ARRAY['acc-srvy-2341','midterm','K-value']),
('Superelevation counteracts centripetal force on highway curves.', 'true_false', '["True","False"]'::jsonb, 'True', 'Banking the road surface helps counteract the centripetal force pushing vehicles outward.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b08-0000-0000-0000-000000000001', 'ACC-2341-MIDTERM', ARRAY['acc-srvy-2341','midterm','superelevation']),
('The inverse of Point A(1000,2000) to B(1400,2300) gives a distance of:', 'numeric_input', '[]'::jsonb, '500', 'sqrt(400² + 300²) = sqrt(160000+90000) = sqrt(250000) = 500.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b08-0000-0000-0000-000000000001', 'ACC-2341-MIDTERM', ARRAY['acc-srvy-2341','midterm','inverse']),
('A spiral curve provides a gradual transition from tangent to circular arc.', 'true_false', '["True","False"]'::jsonb, 'True', 'Spirals gradually change curvature from zero (tangent) to the design radius (circular arc).', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b08-0000-0000-0000-000000000001', 'ACC-2341-MIDTERM', ARRAY['acc-srvy-2341','midterm','spiral']),
('Crest curves generally require longer minimum lengths than sag curves for the same speed.', 'true_false', '["True","False"]'::jsonb, 'True', 'Crest curves control stopping sight distance (driver can''t see over the hill), requiring longer curves than sag curves which are controlled by the less demanding headlight distance criterion.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b08-0000-0000-0000-000000000001', 'ACC-2341-MIDTERM', ARRAY['acc-srvy-2341','midterm','crest-vs-sag']);


-- ============================================================================
-- SECTION 5: QUESTION BANK — Weeks 9-14
-- ============================================================================

INSERT INTO question_bank (question_text, question_type, options, correct_answer, explanation, difficulty, module_id, lesson_id, exam_category, tags) VALUES
-- Week 9
('The average end area formula for earthwork volume is:', 'multiple_choice', '["V = L × (A1 - A2)","V = L × (A1 + A2) / 2","V = L × (A1 × A2)","V = L / (A1 + A2)"]'::jsonb, 'V = L × (A1 + A2) / 2', 'Average end area: Volume = distance between sections × (area of section 1 + area of section 2) / 2. Simple but slightly overestimates volume.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b09-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-9','quiz','average-end-area']),
('Cross sections at stations 10+00 (area = 200 sq ft) and 11+00 (area = 300 sq ft). Volume = ?', 'numeric_input', '[]'::jsonb, '925.93', 'V = 100 × (200+300)/2 = 25,000 cu ft. In cubic yards: 25000/27 = 925.93 CY.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b09-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-9','quiz','volume-computation']),
('The prismoidal formula is more accurate than the average end area method.', 'true_false', '["True","False"]'::jsonb, 'True', 'The prismoidal formula V = L(A1 + 4Am + A2)/6 accounts for the middle area and is theoretically exact for prismoidal shapes. Average end area always overestimates.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b09-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-9','quiz','prismoidal']),
('A mass diagram plots cumulative earthwork volumes along the alignment.', 'true_false', '["True","False"]'::jsonb, 'True', 'The mass diagram shows cumulative cut (+) minus fill (-) volumes along the centerline. It is used to plan earthwork hauling, identify balance points, and minimize haul costs.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b09-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-9','quiz','mass-diagram']),
('A shrinkage factor of 0.90 means that 1 cubic yard of bank material produces 0.90 cubic yards of compacted fill.', 'true_false', '["True","False"]'::jsonb, 'True', 'Shrinkage accounts for compaction. A factor of 0.90 means soil loses 10% volume when compacted. You need more bank material (1/0.90 = 1.11 CY bank) to produce 1 CY of compacted fill.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b09-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-9','quiz','shrinkage']),

-- Week 10
('Slope stakes mark the point where the design slope intersects natural ground.', 'true_false', '["True","False"]'::jsonb, 'True', 'Slope stakes (catch points) mark where the designed cut or fill slope meets the existing ground surface. They define the limits of earthwork construction.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b10-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-10','quiz','slope-stakes']),
('A cut stake marked "C 3.5 / 25 L" means:', 'multiple_choice', '["Cut 3.5 ft, 25 ft left of centerline","Cut 25 ft, 3.5 ft left","Fill 3.5 ft at station 25","Cut 3.5 ft, 25 ft right"]'::jsonb, 'Cut 3.5 ft, 25 ft left of centerline', 'Construction stake notation: C = cut, 3.5 = depth of cut in feet, 25 = distance from centerline, L = left side. The contractor knows to excavate 3.5 feet at this point, which is 25 feet left of the centerline.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b10-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-10','quiz','stake-notation']),
('Batter boards are used in building layout to establish:', 'multiple_choice', '["Property corners","Reference lines and grades for foundation construction","Traverse stations","Aerial photo control"]'::jsonb, 'Reference lines and grades for foundation construction', 'Batter boards are horizontal boards set to a reference elevation at each building corner. Strings stretched between batter boards define the building lines and grades for excavation and foundation construction.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b10-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-10','quiz','batter-boards']),

-- Week 11
('Contour lines that are close together indicate:', 'multiple_choice', '["Flat terrain","Steep terrain","A depression","A ridge"]'::jsonb, 'Steep terrain', 'Close contour spacing indicates steep slopes. Wide spacing indicates gentle slopes. Contour interval is constant, so steeper terrain requires more contour lines in a given horizontal distance.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b11-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-11','quiz','contour-spacing']),
('Contour lines can cross each other.', 'true_false', '["True","False"]'::jsonb, 'False', 'Contour lines never cross (except for overhanging cliffs, which are extremely rare). Each contour represents a single elevation — crossing would mean two elevations at the same point.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b11-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-11','quiz','contour-rules']),
('A TIN is a:', 'multiple_choice', '["Text Information Network","Triangulated Irregular Network","Topographic Index Number","Total Instrument Navigation"]'::jsonb, 'Triangulated Irregular Network', 'A TIN (Triangulated Irregular Network) is a digital terrain model formed by connecting survey points into non-overlapping triangles. Each triangle face represents a plane of constant slope. TINs efficiently represent terrain from irregularly spaced survey points.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b11-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-11','quiz','TIN']),

-- Week 12
('The combined scale factor is the product of:', 'multiple_choice', '["Grid scale factor and convergence angle","Grid scale factor and elevation factor","Elevation factor and convergence angle","Latitude and longitude"]'::jsonb, 'Grid scale factor and elevation factor', 'Combined scale factor = grid scale factor × elevation factor. It converts between ground-level measurements and state plane grid coordinates.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b12-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-12','quiz','combined-scale']),
('If the grid scale factor is 0.999900 and the elevation factor is 0.999950, the combined scale factor is approximately:', 'numeric_input', '[]'::jsonb, '0.99985', '0.999900 × 0.999950 = 0.999850. Ground distance × CSF = grid distance.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b12-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-12','quiz','CSF-computation']),
('Convergence angle is the difference between grid north and geodetic north.', 'true_false', '["True","False"]'::jsonb, 'True', 'The convergence angle (mapping angle) is the angular difference between geodetic north and grid north at a given point. It varies across the projection zone and is zero on the central meridian.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b12-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-12','quiz','convergence']),

-- Week 13
('Photo scale equals focal length divided by:', 'multiple_choice', '["Ground elevation","Flying height above ground","Flying height above sea level","Camera aperture"]'::jsonb, 'Flying height above ground', 'Photo scale = f / H'' where f = focal length and H'' = flying height above ground. For flat terrain: S = f / (H - h) where H = flying height above datum and h = ground elevation.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b13-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-13','quiz','photo-scale']),
('LiDAR stands for Light Detection And Ranging.', 'true_false', '["True","False"]'::jsonb, 'True', 'LiDAR uses laser pulses to measure distances to the ground and features, creating dense 3D point clouds. Combined with GPS and IMU (inertial measurement unit), it produces highly accurate terrain models.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b13-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-13','quiz','LiDAR']),
('FAA Part 107 regulates commercial drone operations in the United States.', 'true_false', '["True","False"]'::jsonb, 'True', 'Part 107 of the Federal Aviation Regulations governs small UAS (under 55 lbs) operations for commercial purposes, including drone surveying. Operators must hold a Remote Pilot Certificate.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b13-0000-0000-0000-000000000001', 'ACC-2341', ARRAY['acc-srvy-2341','week-13','quiz','Part-107']);


-- ============================================================================
-- SECTION 6: FINAL EXAM (20 questions)
-- ============================================================================

INSERT INTO question_bank (question_text, question_type, options, correct_answer, explanation, difficulty, module_id, lesson_id, exam_category, tags) VALUES
('For R = 600 ft and Δ = 50°, T = ?', 'numeric_input', '[]'::jsonb, '279.99', 'T = 600 × tan(25°) = 600 × 0.46631 = 279.79 ft.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b16-0000-0000-0000-000000000001', 'ACC-2341-FINAL', ARRAY['acc-srvy-2341','final','T']),
('For the same curve, compute L.', 'numeric_input', '[]'::jsonb, '523.60', 'L = 600 × (50π/180) = 600 × 0.87267 = 523.60 ft.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b16-0000-0000-0000-000000000001', 'ACC-2341-FINAL', ARRAY['acc-srvy-2341','final','L']),
('Degree of curve for R = 1500 ft (arc def) is:', 'numeric_input', '[]'::jsonb, '3.82', 'D = 5729.578/1500 = 3.82°.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b16-0000-0000-0000-000000000001', 'ACC-2341-FINAL', ARRAY['acc-srvy-2341','final','D']),
('PI at 45+00, T = 350 ft. PC = ?', 'multiple_choice', '["41+50","48+50","45+00","38+50"]'::jsonb, '41+50', 'PC = 45+00 - 3+50 = 41+50.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b16-0000-0000-0000-000000000001', 'ACC-2341-FINAL', ARRAY['acc-srvy-2341','final','PC']),
('A = g2 - g1 for g1 = +2%, g2 = +6% is:', 'numeric_input', '[]'::jsonb, '4', 'A = 6 - 2 = +4%. Positive A indicates a sag curve.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b16-0000-0000-0000-000000000001', 'ACC-2341-FINAL', ARRAY['acc-srvy-2341','final','A']),
('This curve (g1=+2%, g2=+6%) is a:', 'multiple_choice', '["Crest","Sag","Flat","Reverse"]'::jsonb, 'Sag', 'A positive A (grade increasing) means a sag curve. The road goes from gentle uphill to steeper uphill.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b16-0000-0000-0000-000000000001', 'ACC-2341-FINAL', ARRAY['acc-srvy-2341','final','sag']),
('Average end area volume for L=100 ft, A1=150 sq ft, A2=250 sq ft in cubic yards:', 'numeric_input', '[]'::jsonb, '740.74', 'V = 100×(150+250)/2 = 20,000 cu ft / 27 = 740.74 CY.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b16-0000-0000-0000-000000000001', 'ACC-2341-FINAL', ARRAY['acc-srvy-2341','final','volume']),
('Slope stakes mark where design slopes meet existing ground.', 'true_false', '["True","False"]'::jsonb, 'True', 'Slope stakes (catch points) define the lateral limits of cut or fill earthwork.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b16-0000-0000-0000-000000000001', 'ACC-2341-FINAL', ARRAY['acc-srvy-2341','final','slope-stakes']),
('Contour lines that are far apart indicate:', 'multiple_choice', '["Steep terrain","Gentle slopes","A cliff","A depression"]'::jsonb, 'Gentle slopes', 'Wide contour spacing = gentle slope. Close spacing = steep slope.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b16-0000-0000-0000-000000000001', 'ACC-2341-FINAL', ARRAY['acc-srvy-2341','final','contours']),
('Contour lines never cross.', 'true_false', '["True","False"]'::jsonb, 'True', 'Each contour represents one elevation. Crossing would imply two elevations at one point.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b16-0000-0000-0000-000000000001', 'ACC-2341-FINAL', ARRAY['acc-srvy-2341','final','contour-rule']),
('Texas uses _____ state plane zones.', 'numeric_input', '[]'::jsonb, '5', 'Texas has 5 zones: North, North Central, Central, South Central, South.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b16-0000-0000-0000-000000000001', 'ACC-2341-FINAL', ARRAY['acc-srvy-2341','final','zones']),
('The combined scale factor converts between ground and grid distances.', 'true_false', '["True","False"]'::jsonb, 'True', 'CSF = grid factor × elevation factor. Grid distance = ground distance × CSF.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b16-0000-0000-0000-000000000001', 'ACC-2341-FINAL', ARRAY['acc-srvy-2341','final','CSF']),
('Photo scale = focal length / flying height above ground.', 'true_false', '["True","False"]'::jsonb, 'True', 'S = f / H'' where f is focal length and H'' is height above ground.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b16-0000-0000-0000-000000000001', 'ACC-2341-FINAL', ARRAY['acc-srvy-2341','final','photo-scale']),
('A camera with 6-inch focal length at 6,000 ft above ground has photo scale of:', 'multiple_choice', '["1:1,000","1:6,000","1:12,000","1:72,000"]'::jsonb, '1:12,000', 'Scale = f/H'' = 0.5 ft / 6000 ft = 1/12,000.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b16-0000-0000-0000-000000000001', 'ACC-2341-FINAL', ARRAY['acc-srvy-2341','final','scale-computation']),
('FAA Part 107 applies to commercial drone surveying.', 'true_false', '["True","False"]'::jsonb, 'True', 'Part 107 governs commercial small UAS operations including drone surveying.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b16-0000-0000-0000-000000000001', 'ACC-2341-FINAL', ARRAY['acc-srvy-2341','final','Part-107']),
('The prismoidal formula is V = L(A1 + 4Am + A2) / 6.', 'true_false', '["True","False"]'::jsonb, 'True', 'The prismoidal formula uses the areas at both ends and the middle section for a more accurate volume.', 'medium', 'acc00006-0000-0000-0000-000000000006', 'acc06b16-0000-0000-0000-000000000001', 'ACC-2341-FINAL', ARRAY['acc-srvy-2341','final','prismoidal']),
('A TIN is used to represent digital terrain.', 'true_false', '["True","False"]'::jsonb, 'True', 'TIN (Triangulated Irregular Network) connects points into triangles to model terrain.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b16-0000-0000-0000-000000000001', 'ACC-2341-FINAL', ARRAY['acc-srvy-2341','final','TIN']),
('K = L / A. If K = 100 and A = 6%, L = ?', 'numeric_input', '[]'::jsonb, '600', 'L = K × A = 100 × 6 = 600 ft.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b16-0000-0000-0000-000000000001', 'ACC-2341-FINAL', ARRAY['acc-srvy-2341','final','K-L']),
('The total deflection from PC to PT is Δ/2.', 'true_false', '["True","False"]'::jsonb, 'True', 'This is a fundamental curve property and field check.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b16-0000-0000-0000-000000000001', 'ACC-2341-FINAL', ARRAY['acc-srvy-2341','final','deflection']),
('Blue tops indicate finish grade elevation in construction staking.', 'true_false', '["True","False"]'::jsonb, 'True', 'Blue top stakes are driven to the exact design grade elevation.', 'easy', 'acc00006-0000-0000-0000-000000000006', 'acc06b16-0000-0000-0000-000000000001', 'ACC-2341-FINAL', ARRAY['acc-srvy-2341','final','blue-tops']);


COMMIT;
