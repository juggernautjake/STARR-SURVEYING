-- ============================================================================
-- EDUCATIONAL CONTENT SEED DATA — Additional flashcards, lessons, articles
-- Run after supabase_schema.sql (v2) and supabase_schema_v3.sql
-- ============================================================================

-- ============================================================================
-- INTRODUCTORY LESSON — "Welcome to Starr Surveying"
-- ============================================================================
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, status, tags, resources, videos) VALUES
('22222222-2222-2222-2222-222222222200',
 '11111111-1111-1111-1111-111111111111',
 'Welcome to Starr Surveying',
 '<h2>Welcome to the Starr Surveying Learning Hub</h2>
<p>Welcome to the team! Whether you''re a brand-new surveying intern (SIT) or a seasoned field veteran joining our company, this learning platform is designed to help you grow your skills, prepare for licensing exams, and stay up-to-date with best practices.</p>

<h3>What You''ll Learn Here</h3>
<p>This platform covers everything you need to succeed as a surveyor at Starr Surveying:</p>
<ul>
  <li><strong>Fundamentals of Land Surveying</strong> — History, terminology, types of surveys, and core concepts</li>
  <li><strong>Equipment & Technology</strong> — Total stations, GNSS/GPS, data collectors, and modern tools</li>
  <li><strong>Texas-Specific Knowledge</strong> — Texas property law, the vara, GLO records, and state regulations</li>
  <li><strong>Field Procedures</strong> — How we conduct boundary surveys, topographic surveys, and construction layout</li>
  <li><strong>Exam Preparation</strong> — Practice questions for the SIT and RPLS licensing exams</li>
</ul>

<h3>How This Works</h3>
<p>Each module contains <strong>lessons</strong> you can read through at your own pace. After each lesson, you can:</p>
<ul>
  <li><strong>Take a Quiz</strong> — Test your understanding of the material</li>
  <li><strong>Study Flashcards</strong> — Review key terms with our spaced repetition system that adapts to how well you know each term</li>
  <li><strong>Read Knowledge Base Articles</strong> — Dive deeper into specific topics</li>
  <li><strong>Take Notes</strong> — Use your Field Notebook to jot down observations and reminders</li>
</ul>

<h3>Getting Started</h3>
<p>Start with the next lesson, <strong>"What is Land Surveying?"</strong>, to learn the basics. If you already have surveying experience, feel free to jump ahead to the topics that interest you or go straight to the flashcards and quiz sections.</p>

<h3>About Starr Surveying</h3>
<p>Starr Surveying is committed to providing accurate, professional land surveying services. Our team uses the latest technology — including Trimble instruments, GNSS receivers, and CAD software — to deliver high-quality results. We believe in continuous learning and professional development, which is why we built this platform for our team.</p>

<p><strong>Let''s get started!</strong></p>',
 ARRAY[
   'The Learning Hub covers fundamentals, equipment, Texas law, field procedures, and exam prep',
   'Use flashcards with spaced repetition to master surveying terminology',
   'Quiz yourself after each lesson to test your understanding',
   'Take notes in your Field Notebook as you learn'
 ],
 0, 10, 'published',
 ARRAY['welcome','introduction','getting started'],
 '[]', '[]'
);

-- Topics for Welcome lesson
INSERT INTO learning_topics (lesson_id, title, content, order_index, keywords) VALUES
('22222222-2222-2222-2222-222222222200', 'Learning Hub Overview', 'The Starr Surveying Learning Hub contains modules, lessons, flashcards, quizzes, and a knowledge base. Each module focuses on a topic area and contains multiple lessons.', 1, ARRAY['learning hub','overview','modules']),
('22222222-2222-2222-2222-222222222200', 'Study Tools Available', 'Flashcards use SM-2 spaced repetition to optimize your review schedule. Quizzes test your knowledge. The Field Notebook lets you record observations. The Knowledge Base provides in-depth articles.', 2, ARRAY['flashcards','quizzes','notebook','knowledge base']),
('22222222-2222-2222-2222-222222222200', 'Career Paths in Surveying', 'In Texas, the licensing path goes: Surveyor Intern (SIT) then Registered Professional Land Surveyor (RPLS). The SIT exam tests fundamental knowledge, while the RPLS exam covers Texas law and advanced practice.', 3, ARRAY['SIT','RPLS','licensing','career']);

-- ============================================================================
-- ADDITIONAL FLASHCARDS — Surveying Terms
-- ============================================================================
INSERT INTO flashcards (term, definition, hint_1, hint_2, hint_3, module_id, keywords, tags, category) VALUES

-- Legal & Property Terms
('Deed', 'A legal document that transfers ownership of real property from one party to another. In Texas, deeds are recorded at the county clerk''s office.', 'This document proves who owns a piece of land', 'Rhymes with "need" and "speed"', 'D _ _ _ (4 letters, transfers property)', '11111111-1111-1111-1111-111111111111', ARRAY['deed','property','legal'], ARRAY['legal','property law'], 'legal'),

('Easement', 'A legal right to use another person''s land for a specific purpose, such as utility lines, drainage, or access.', 'Utility companies often need these to run power lines', 'Think of it as permission to "ease" through someone''s property', 'E _ _ _ _ _ _ _ (8 letters, a right to use land)', '11111111-1111-1111-1111-111111111111', ARRAY['easement','legal','access'], ARRAY['legal','easements'], 'legal'),

('Monument', 'A physical marker placed at a survey point, such as an iron rod, concrete marker, or natural feature like a tree or rock.', 'Something permanent placed in the ground at a corner', 'Could be an iron rod, a stone, or even a large tree', 'M _ _ _ _ _ _ _ (8 letters, a physical marker)', '11111111-1111-1111-1111-111111111111', ARRAY['monument','marker','corner'], ARRAY['fieldwork','boundary'], 'fieldwork'),

('Chain of Title', 'The sequence of historical transfers of title (ownership) to a property, from the original grant to the current owner.', 'Like a family tree, but for land ownership', 'Traces who owned a property and when it changed hands', 'C _ _ _ _ of T _ _ _ _ (ownership history)', '11111111-1111-1111-1111-111111111111', ARRAY['chain of title','ownership','deed'], ARRAY['legal','property law'], 'legal'),

('Encroachment', 'When a structure, fence, or improvement extends onto an adjacent property without permission.', 'When something crosses over a property line that shouldn''t', 'A fence built 2 feet into your neighbor''s yard is this', 'E _ _ _ _ _ _ _ _ _ _ _ (12 letters, crossing boundary)', '11111111-1111-1111-1111-111111111111', ARRAY['encroachment','boundary','dispute'], ARRAY['legal','boundary'], 'legal'),

-- Measurement & Math Terms
('Bearing', 'A direction expressed as an angle from North or South, like N 45° E. Always starts with N or S and ends with E or W.', 'A way to describe compass direction with an angle', 'Always measured from North or South toward East or West', 'B _ _ _ _ _ _ (7 letters, N 45° E is an example)', '11111111-1111-1111-1111-111111111111', ARRAY['bearing','direction','angle'], ARRAY['measurement','navigation'], 'measurement'),

('Traverse', 'A series of connected survey lines whose lengths and directions are measured. Used to establish control networks.', 'A path of connected survey points forming a network', 'Think of it as connecting the dots from point to point', 'T _ _ _ _ _ _ _ (8 letters, connected survey lines)', '11111111-1111-1111-1111-111111111111', ARRAY['traverse','control','measurement'], ARRAY['measurement','fieldwork'], 'measurement'),

('Closure', 'The degree to which a traverse returns to its starting point. Good closure means the survey is accurate.', 'How close a survey loop comes back to where it started', 'If you walk in a loop and end up exactly where you began', 'C _ _ _ _ _ _ (7 letters, traverse accuracy check)', '11111111-1111-1111-1111-111111111111', ARRAY['closure','traverse','accuracy'], ARRAY['measurement','quality'], 'measurement'),

('Elevation', 'The vertical height of a point above a reference datum, typically mean sea level (NAVD88 in the US).', 'How high something is above sea level', 'Mountains have high ones, valleys have low ones', 'E _ _ _ _ _ _ _ _ (9 letters, height above datum)', '11111111-1111-1111-1111-111111111111', ARRAY['elevation','height','datum'], ARRAY['measurement','vertical'], 'measurement'),

('Datum', 'A reference system used for measuring positions on the earth. Common datums include NAD83 (horizontal) and NAVD88 (vertical).', 'The baseline reference that all measurements are compared to', 'NAD83 and NAVD88 are common examples in the US', 'D _ _ _ _ (5 letters, a reference system)', '11111111-1111-1111-1111-111111111111', ARRAY['datum','reference','NAD83','NAVD88'], ARRAY['measurement','geodesy'], 'measurement'),

-- Equipment Terms
('Prism', 'A glass reflector used with total stations. It reflects the EDM signal back to the instrument for distance measurement.', 'A glass device that bounces a signal back to the total station', 'Usually mounted on a pole held by the rod person', 'P _ _ _ _ (5 letters, reflects EDM signal)', '11111111-1111-1111-1111-111111111111', ARRAY['prism','EDM','total station','reflector'], ARRAY['equipment'], 'equipment'),

('RTK', 'Real-Time Kinematic — a GPS/GNSS technique that provides centimeter-level accuracy using corrections from a base station.', 'A technique that makes GPS super accurate in real-time', 'Uses a base station to correct the rover''s position', 'R _ _ (3 letters, centimeter GPS accuracy)', '11111111-1111-1111-1111-111111111111', ARRAY['RTK','GPS','GNSS','accuracy'], ARRAY['technology','equipment'], 'technology'),

('EDM', 'Electronic Distance Measurement — technology that measures distance using electromagnetic waves (infrared or laser).', 'Measures distance by sending a signal and timing the return', 'Built into every total station', 'E _ _ (3 letters, electronic distance tool)', '11111111-1111-1111-1111-111111111111', ARRAY['EDM','distance','electronic'], ARRAY['equipment','technology'], 'equipment'),

('Level', 'A surveying instrument used to establish a horizontal line of sight, primarily for determining elevation differences between points.', 'Creates a perfectly horizontal line for measuring height differences', 'Used with a level rod to measure elevations', 'L _ _ _ _ (5 letters, measures elevation differences)', '11111111-1111-1111-1111-111111111111', ARRAY['level','elevation','horizontal'], ARRAY['equipment'], 'equipment'),

('Theodolite', 'A precision instrument for measuring horizontal and vertical angles. Modern electronic versions are part of total stations.', 'Measures angles both horizontally and vertically', 'The angle-measuring part of a total station', 'T _ _ _ _ _ _ _ _ _ (10 letters, measures angles)', '11111111-1111-1111-1111-111111111111', ARRAY['theodolite','angles','instrument'], ARRAY['equipment'], 'equipment'),

-- Texas-Specific Terms
('GLO', 'The Texas General Land Office — the oldest state agency in Texas (est. 1836). Manages public lands and maintains historical survey records.', 'The oldest state agency in Texas, manages land records', 'Their archives have original Spanish and Mexican land grants', 'G _ _ (3 letters, Texas land office)', '11111111-1111-1111-1111-111111111111', ARRAY['GLO','Texas','land office','records'], ARRAY['texas','legal'], 'texas'),

('Abstract', 'In Texas, a numbered land grant parcel originating from the original surveys. Each county has its own abstract numbering.', 'A numbered parcel from the original Texas land grants', 'Each county has its own numbering system for these', 'A _ _ _ _ _ _ _ (8 letters, Texas land grant parcel)', '11111111-1111-1111-1111-111111111111', ARRAY['abstract','Texas','land grant','parcel'], ARRAY['texas','legal'], 'texas'),

('RPLS', 'Registered Professional Land Surveyor — the Texas license required to practice land surveying and certify surveys.', 'The license you need to sign and seal survey documents in Texas', 'Requires passing an exam and getting experience hours', 'R _ _ _ (4 letters, Texas surveyor license)', '11111111-1111-1111-1111-111111111111', ARRAY['RPLS','license','Texas','professional'], ARRAY['licensing','texas'], 'licensing'),

('SIT', 'Surveyor Intern in Texas — the first step toward becoming a Registered Professional Land Surveyor (RPLS).', 'The first surveying license step in Texas, before RPLS', 'You need to pass an exam to get this designation', 'S _ _ (3 letters, surveyor intern title)', '11111111-1111-1111-1111-111111111111', ARRAY['SIT','intern','Texas','licensing'], ARRAY['licensing','texas'], 'licensing'),

-- Fieldwork Terms
('Backsight', 'A survey observation made to a previously established point. Used to orient the instrument before taking new measurements.', 'Looking back at a known point to set up your instrument', 'You do this first to orient the total station', 'B _ _ _ _ _ _ _ _ (9 letters, sighting a known point)', '11111111-1111-1111-1111-111111111111', ARRAY['backsight','orientation','total station'], ARRAY['fieldwork','procedure'], 'fieldwork'),

('Foresight', 'A survey observation made to an unknown point you want to measure. Taken after orienting with a backsight.', 'Looking forward to a new point you want to measure', 'The opposite of a backsight', 'F _ _ _ _ _ _ _ _ (9 letters, measuring a new point)', '11111111-1111-1111-1111-111111111111', ARRAY['foresight','measurement','total station'], ARRAY['fieldwork','procedure'], 'fieldwork'),

('Stakeout', 'The process of marking planned positions in the field, such as building corners, road centerlines, or lot corners.', 'Putting marks in the ground where things should be built', 'Construction crews need this to know where to build', 'S _ _ _ _ _ _ _ (8 letters, marking planned points)', '11111111-1111-1111-1111-111111111111', ARRAY['stakeout','construction','layout'], ARRAY['fieldwork','construction'], 'fieldwork'),

('Control Point', 'A survey point with precisely known coordinates used as a reference for other measurements.', 'A precisely known location that other measurements are based on', 'Often a brass disk set in concrete', 'C _ _ _ _ _ _ P _ _ _ _ (reference location)', '11111111-1111-1111-1111-111111111111', ARRAY['control point','reference','coordinates'], ARRAY['fieldwork','measurement'], 'fieldwork');

-- ============================================================================
-- ADDITIONAL KNOWLEDGE BASE ARTICLES
-- ============================================================================
INSERT INTO kb_articles (title, slug, category, tags, content, excerpt, status) VALUES

('Understanding Bearings and Azimuths', 'bearings-and-azimuths', 'Measurement & Calculations', ARRAY['bearing','azimuth','direction','angles'],
'<h2>Bearings vs. Azimuths</h2>
<p>Both bearings and azimuths describe horizontal directions, but they use different reference systems.</p>
<h3>Azimuths</h3>
<p>An <strong>azimuth</strong> is measured clockwise from north, ranging from 0° to 360°. For example, due East is 90°, due South is 180°, due West is 270°.</p>
<h3>Bearings</h3>
<p>A <strong>bearing</strong> is expressed as an angle from either North or South, toward East or West. The format is: N/S [angle] E/W. For example:</p>
<ul>
<li>N 45° E = Azimuth 45°</li>
<li>S 30° E = Azimuth 150°</li>
<li>S 60° W = Azimuth 240°</li>
<li>N 80° W = Azimuth 280°</li>
</ul>
<h3>Converting Between Them</h3>
<p><strong>NE quadrant:</strong> Azimuth = Bearing angle<br/>
<strong>SE quadrant:</strong> Azimuth = 180° - Bearing angle<br/>
<strong>SW quadrant:</strong> Azimuth = 180° + Bearing angle<br/>
<strong>NW quadrant:</strong> Azimuth = 360° - Bearing angle</p>',
'Learn the difference between bearings and azimuths, two systems for describing horizontal direction.', 'published'),

('What is a Boundary Survey?', 'what-is-a-boundary-survey', 'Survey Types', ARRAY['boundary','survey','property lines','corners'],
'<h2>Boundary Surveys</h2>
<p>A <strong>boundary survey</strong> determines the legal boundary lines and corners of a parcel of land. It is the most common type of survey performed.</p>
<h3>When You Need One</h3>
<ul>
<li>Buying or selling property</li>
<li>Building a fence along property lines</li>
<li>Resolving a boundary dispute with a neighbor</li>
<li>Subdividing a parcel</li>
<li>Building near the property line (setback verification)</li>
</ul>
<h3>What''s Involved</h3>
<p>The surveyor will:</p>
<ol>
<li><strong>Research</strong> — Examine deeds, plats, and prior surveys at the county courthouse</li>
<li><strong>Fieldwork</strong> — Locate existing monuments, measure distances and angles</li>
<li><strong>Analysis</strong> — Compare field evidence with legal descriptions</li>
<li><strong>Set Corners</strong> — Place new iron rods or caps where needed</li>
<li><strong>Prepare Plat</strong> — Draw the survey map showing all findings</li>
</ol>',
'A boundary survey determines legal property lines and corners. Learn when you need one and what''s involved.', 'published'),

('Introduction to GNSS/GPS for Surveyors', 'gnss-gps-for-surveyors', 'Technology', ARRAY['GNSS','GPS','RTK','satellite','technology'],
'<h2>GNSS for Land Surveyors</h2>
<p><strong>GNSS</strong> (Global Navigation Satellite System) encompasses multiple satellite constellations:</p>
<ul>
<li><strong>GPS</strong> (USA) — 31 satellites</li>
<li><strong>GLONASS</strong> (Russia) — 24 satellites</li>
<li><strong>Galileo</strong> (European Union) — 30 satellites</li>
<li><strong>BeiDou</strong> (China) — 35+ satellites</li>
</ul>
<h3>How RTK Works</h3>
<p><strong>RTK</strong> (Real-Time Kinematic) is the primary GNSS technique for surveying because it provides centimeter-level accuracy:</p>
<ol>
<li>A <strong>base station</strong> sits on a known point and calculates correction data</li>
<li>Corrections are sent to the <strong>rover</strong> via radio or cellular network</li>
<li>The rover applies corrections to achieve 1-2 cm accuracy</li>
</ol>
<h3>When to Use GNSS vs Total Station</h3>
<p>Use GNSS when you have open sky and need to cover large areas. Use a total station when working under trees, near buildings, or when you need sub-centimeter accuracy.</p>',
'Learn how GNSS satellite systems work for surveying and when to use RTK vs total stations.', 'published');

SELECT 'Educational content seed data inserted successfully!' AS result;
