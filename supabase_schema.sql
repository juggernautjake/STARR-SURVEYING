-- ============================================================================
-- STARR SURVEYING — Enhanced Learning Platform Schema v2
-- Run this in Supabase SQL Editor
-- If you already ran Phase 1 schema, this DROPS and recreates those tables.
-- ============================================================================

DROP TABLE IF EXISTS user_bookmarks CASCADE;
DROP TABLE IF EXISTS user_progress CASCADE;
DROP TABLE IF EXISTS quiz_attempt_answers CASCADE;
DROP TABLE IF EXISTS quiz_attempts CASCADE;
DROP TABLE IF EXISTS question_bank CASCADE;
DROP TABLE IF EXISTS user_flashcards CASCADE;
DROP TABLE IF EXISTS flashcards CASCADE;
DROP TABLE IF EXISTS fieldbook_notes CASCADE;
DROP TABLE IF EXISTS exam_prep_categories CASCADE;
DROP TABLE IF EXISTS learning_topics CASCADE;
DROP TABLE IF EXISTS kb_articles CASCADE;
DROP TABLE IF EXISTS learning_lessons CASCADE;
DROP TABLE IF EXISTS learning_modules CASCADE;

-- ============================================================================
-- 1. LEARNING MODULES
-- ============================================================================
CREATE TABLE learning_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  difficulty TEXT CHECK (difficulty IN ('beginner','intermediate','advanced')) DEFAULT 'beginner',
  estimated_hours NUMERIC(4,1) DEFAULT 1.0,
  order_index INTEGER NOT NULL DEFAULT 0,
  status TEXT CHECK (status IN ('draft','published')) DEFAULT 'draft',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 2. LEARNING LESSONS
-- ============================================================================
CREATE TABLE learning_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES learning_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  key_takeaways TEXT[] DEFAULT '{}',
  order_index INTEGER NOT NULL DEFAULT 0,
  estimated_minutes INTEGER DEFAULT 15,
  resources JSONB DEFAULT '[]',
  videos JSONB DEFAULT '[]',
  tags TEXT[] DEFAULT '{}',
  status TEXT CHECK (status IN ('draft','published')) DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 3. LEARNING TOPICS (searchable subtopics within lessons)
-- ============================================================================
CREATE TABLE learning_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES learning_lessons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  keywords TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 4. KB ARTICLES
-- ============================================================================
CREATE TABLE kb_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',
  content TEXT NOT NULL,
  excerpt TEXT,
  status TEXT CHECK (status IN ('draft','published')) DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 5. QUESTION BANK
-- ============================================================================
CREATE TABLE question_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text TEXT NOT NULL,
  question_type TEXT CHECK (question_type IN ('multiple_choice','true_false','short_answer')) DEFAULT 'multiple_choice',
  options JSONB DEFAULT '[]',
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  difficulty TEXT CHECK (difficulty IN ('easy','medium','hard')) DEFAULT 'medium',
  module_id UUID REFERENCES learning_modules(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES learning_lessons(id) ON DELETE SET NULL,
  topic_id UUID REFERENCES learning_topics(id) ON DELETE SET NULL,
  exam_category TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 6. QUIZ/TEST ATTEMPTS
-- ============================================================================
CREATE TABLE quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  attempt_type TEXT CHECK (attempt_type IN ('lesson_quiz','module_test','exam_prep')) NOT NULL,
  module_id UUID REFERENCES learning_modules(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES learning_lessons(id) ON DELETE SET NULL,
  exam_category TEXT,
  total_questions INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  score_percent NUMERIC(5,2) DEFAULT 0,
  time_spent_seconds INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 7. QUIZ ATTEMPT ANSWERS
-- ============================================================================
CREATE TABLE quiz_attempt_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
  user_answer TEXT,
  is_correct BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 8. FLASHCARDS (admin/built-in)
-- ============================================================================
CREATE TABLE flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  hint_1 TEXT,
  hint_2 TEXT,
  hint_3 TEXT,
  module_id UUID REFERENCES learning_modules(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES learning_lessons(id) ON DELETE SET NULL,
  keywords TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  category TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 9. USER FLASHCARDS
-- ============================================================================
CREATE TABLE user_flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  hint_1 TEXT,
  hint_2 TEXT,
  hint_3 TEXT,
  keywords TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  module_id UUID REFERENCES learning_modules(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES learning_lessons(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 10. FIELDBOOK NOTES
-- ============================================================================
CREATE TABLE fieldbook_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  title TEXT DEFAULT 'Untitled Note',
  content TEXT NOT NULL,
  page_context TEXT,
  page_url TEXT,
  module_id UUID REFERENCES learning_modules(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES learning_lessons(id) ON DELETE SET NULL,
  topic_id UUID REFERENCES learning_topics(id) ON DELETE SET NULL,
  article_id UUID REFERENCES kb_articles(id) ON DELETE SET NULL,
  context_type TEXT,
  context_label TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 11. USER PROGRESS
-- ============================================================================
CREATE TABLE user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  module_id UUID REFERENCES learning_modules(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES learning_lessons(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, lesson_id)
);

-- ============================================================================
-- 12. USER BOOKMARKS
-- ============================================================================
CREATE TABLE user_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  article_id UUID REFERENCES kb_articles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, article_id)
);

-- ============================================================================
-- 13. EXAM PREP CATEGORIES
-- ============================================================================
CREATE TABLE exam_prep_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_type TEXT NOT NULL CHECK (exam_type IN ('SIT','RPLS')),
  category_name TEXT NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_modules_upd BEFORE UPDATE ON learning_modules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_lessons_upd BEFORE UPDATE ON learning_lessons FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_topics_upd BEFORE UPDATE ON learning_topics FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_articles_upd BEFORE UPDATE ON kb_articles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_questions_upd BEFORE UPDATE ON question_bank FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_flashcards_upd BEFORE UPDATE ON flashcards FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_uflashcards_upd BEFORE UPDATE ON user_flashcards FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_fieldbook_upd BEFORE UPDATE ON fieldbook_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE learning_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempt_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE fieldbook_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_prep_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_modules" ON learning_modules FOR SELECT USING (status='published');
CREATE POLICY "read_lessons" ON learning_lessons FOR SELECT USING (status='published');
CREATE POLICY "read_topics" ON learning_topics FOR SELECT USING (true);
CREATE POLICY "read_articles" ON kb_articles FOR SELECT USING (status='published');
CREATE POLICY "read_questions" ON question_bank FOR SELECT USING (true);
CREATE POLICY "read_flashcards" ON flashcards FOR SELECT USING (true);
CREATE POLICY "read_exam_prep" ON exam_prep_categories FOR SELECT USING (true);
CREATE POLICY "rw_progress" ON user_progress FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rw_bookmarks" ON user_bookmarks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rw_user_flashcards" ON user_flashcards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rw_fieldbook" ON fieldbook_notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rw_quiz_attempts" ON quiz_attempts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rw_quiz_answers" ON quiz_attempt_answers FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_lessons_module ON learning_lessons(module_id);
CREATE INDEX idx_topics_lesson ON learning_topics(lesson_id);
CREATE INDEX idx_topics_kw ON learning_topics USING GIN(keywords);
CREATE INDEX idx_articles_slug ON kb_articles(slug);
CREATE INDEX idx_articles_cat ON kb_articles(category);
CREATE INDEX idx_articles_tags ON kb_articles USING GIN(tags);
CREATE INDEX idx_q_module ON question_bank(module_id);
CREATE INDEX idx_q_lesson ON question_bank(lesson_id);
CREATE INDEX idx_q_exam ON question_bank(exam_category);
CREATE INDEX idx_q_tags ON question_bank USING GIN(tags);
CREATE INDEX idx_fc_kw ON flashcards USING GIN(keywords);
CREATE INDEX idx_fc_tags ON flashcards USING GIN(tags);
CREATE INDEX idx_ufc_email ON user_flashcards(user_email);
CREATE INDEX idx_fn_email ON fieldbook_notes(user_email);
CREATE INDEX idx_up_email ON user_progress(user_email);
CREATE INDEX idx_qa_email ON quiz_attempts(user_email);

-- Full-text search
CREATE INDEX idx_fts_modules ON learning_modules USING GIN(to_tsvector('english', coalesce(title,'')||' '||coalesce(description,'')));
CREATE INDEX idx_fts_lessons ON learning_lessons USING GIN(to_tsvector('english', coalesce(title,'')||' '||coalesce(content,'')));
CREATE INDEX idx_fts_topics ON learning_topics USING GIN(to_tsvector('english', coalesce(title,'')||' '||coalesce(content,'')));
CREATE INDEX idx_fts_articles ON kb_articles USING GIN(to_tsvector('english', coalesce(title,'')||' '||coalesce(content,'')));
CREATE INDEX idx_fts_fc ON flashcards USING GIN(to_tsvector('english', coalesce(term,'')||' '||coalesce(definition,'')));

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

-- Module 1
INSERT INTO learning_modules (id,title,description,difficulty,estimated_hours,order_index,status,tags) VALUES
('11111111-1111-1111-1111-111111111111','Introduction to Land Surveying','Learn the fundamentals of land surveying — history, basic concepts, types of surveys, and the tools of the trade.','beginner',4.0,1,'published',ARRAY['fundamentals','basics','history','introduction']);

-- Lesson 1.1
INSERT INTO learning_lessons (id,module_id,title,content,key_takeaways,order_index,estimated_minutes,status,tags,resources,videos) VALUES
('22222222-2222-2222-2222-222222222221','11111111-1111-1111-1111-111111111111','What is Land Surveying?',
'<h2>What is Land Surveying?</h2>
<p>Land surveying is the science, art, and profession of determining the terrestrial or three-dimensional positions of points and the distances and angles between them.</p>
<h3>A Brief History</h3>
<p>Surveying has been practiced since humans first began building permanent structures. The ancient Egyptians used surveying to re-establish farm boundaries after the annual Nile floods. In Texas, land surveying dates back to Spanish and Mexican land grants. The Texas General Land Office, established in 1836, is the oldest state agency in the state.</p>
<h3>Types of Surveys</h3>
<ul>
<li><strong>Boundary Surveys</strong> — Determine property lines and corners</li>
<li><strong>Topographic Surveys</strong> — Map the shape and features of the land</li>
<li><strong>ALTA/NSPS Surveys</strong> — Comprehensive surveys for commercial real estate</li>
<li><strong>Construction Surveys</strong> — Guide building projects with precise measurements</li>
<li><strong>Subdivision Surveys</strong> — Divide larger parcels into smaller lots</li>
<li><strong>Elevation Certificates</strong> — Determine flood risk for insurance</li>
</ul>',
ARRAY['Land surveying determines positions, distances, and angles','Texas surveying dates to Spanish land grants','Multiple survey types serve different purposes'],
1,20,'published',ARRAY['fundamentals','history','types'],
'[{"title":"Texas General Land Office","url":"https://www.glo.texas.gov/","type":"website"},{"title":"NSPS - What is Surveying?","url":"https://www.nsps.us.com/page/AboutSurveying","type":"website"}]','[]');

-- Lesson 1.2
INSERT INTO learning_lessons (id,module_id,title,content,key_takeaways,order_index,estimated_minutes,status,tags,resources,videos) VALUES
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','Surveying Equipment & Tools',
'<h2>Surveying Equipment & Tools</h2>
<p>Modern surveyors use a combination of traditional and high-tech equipment.</p>
<h3>Traditional Tools</h3>
<p><strong>Transit/Theodolite:</strong> Measures horizontal and vertical angles. <strong>Level:</strong> Establishes horizontal planes. <strong>Steel Tape:</strong> Precise distance measurement. <strong>Plumb Bob:</strong> Establishes vertical lines. <strong>Range Pole:</strong> For sighting and marking.</p>
<h3>Modern Electronic Tools</h3>
<p><strong>Total Station:</strong> Combines electronic theodolite with EDM. <strong>GPS/GNSS:</strong> RTK provides centimeter-level accuracy. <strong>Robotic Total Station:</strong> Allows one-person crews. <strong>3D Laser Scanner:</strong> Creates detailed 3D models. <strong>Drone/UAV:</strong> Aerial photogrammetry for large areas.</p>',
ARRAY['Theodolites measure angles; levels establish horizontal planes','Total stations combine angle and distance measurement','GPS/GNSS with RTK provides centimeter-level positioning'],
2,25,'published',ARRAY['equipment','tools','total station','GPS','GNSS'],
'[{"title":"Trimble Surveying","url":"https://www.trimble.com/en/solutions/surveying","type":"website"}]','[]');

-- Topics
INSERT INTO learning_topics (lesson_id,title,content,order_index,keywords) VALUES
('22222222-2222-2222-2222-222222222221','Definition of Land Surveying','Land surveying is the science, art, and profession of determining the terrestrial or three-dimensional positions of points and the distances and angles between them.',1,ARRAY['definition','surveying','measurement']),
('22222222-2222-2222-2222-222222222221','History of Surveying in Texas','Texas surveying history dates to Spanish and Mexican land grants. The Texas General Land Office, established in 1836, manages public lands. The vara (approximately 33.33 inches) was the standard measurement unit.',2,ARRAY['history','texas','vara','land grants']),
('22222222-2222-2222-2222-222222222221','Types of Land Surveys','Key types: boundary surveys, topographic surveys, ALTA/NSPS surveys, construction surveys, subdivision surveys, and elevation certificates.',3,ARRAY['boundary','topographic','ALTA','NSPS','construction','subdivision','elevation']),
('22222222-2222-2222-2222-222222222222','Traditional Surveying Tools','Traditional tools include the transit/theodolite, levels, steel tapes, plumb bobs, and range poles.',1,ARRAY['transit','theodolite','level','steel tape','plumb bob']),
('22222222-2222-2222-2222-222222222222','Total Stations & EDM','A total station combines an electronic theodolite with EDM. Robotic total stations track a prism automatically for one-person operation.',2,ARRAY['total station','EDM','electronic','robotic']),
('22222222-2222-2222-2222-222222222222','GPS/GNSS Technology','GNSS encompasses GPS, GLONASS, Galileo, and BeiDou. RTK provides centimeter-level accuracy using base station and rover.',3,ARRAY['GPS','GNSS','RTK','satellite','GLONASS','Galileo']);

-- Questions for Lesson 1.1
INSERT INTO question_bank (question_text,question_type,options,correct_answer,explanation,difficulty,module_id,lesson_id,tags) VALUES
('What is the primary purpose of a boundary survey?','multiple_choice','["Determine property lines and corners","Map terrain shape","Guide construction","Calculate flood risk"]','Determine property lines and corners','A boundary survey determines the legal boundaries of a property.','easy','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222221',ARRAY['boundary','survey types']),
('When was the Texas General Land Office established?','multiple_choice','["1776","1836","1845","1900"]','1836','The Texas GLO was established in 1836, the oldest state agency in Texas.','easy','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222221',ARRAY['texas','history']),
('An ALTA/NSPS survey is primarily used for what?','multiple_choice','["Residential disputes","Commercial real estate transactions","Road construction","Flood zones"]','Commercial real estate transactions','ALTA/NSPS surveys are required for commercial real estate transactions.','medium','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222221',ARRAY['ALTA','NSPS','commercial']),
('True or False: Surveying only became necessary after GPS was invented.','true_false','["True","False"]','False','Surveying has been practiced since ancient times, thousands of years before GPS.','easy','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222221',ARRAY['history']),
('Which survey type determines flood risk for insurance?','multiple_choice','["Topographic","Boundary","Elevation Certificate","Construction"]','Elevation Certificate','Elevation Certificates determine structure elevation relative to flood levels.','medium','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222221',ARRAY['elevation','flood']);

-- Questions for Lesson 1.2
INSERT INTO question_bank (question_text,question_type,options,correct_answer,explanation,difficulty,module_id,lesson_id,tags) VALUES
('What does a total station combine?','multiple_choice','["GPS and level","Electronic theodolite and EDM","Laser scanner and drone","Transit and tape"]','Electronic theodolite and EDM','A total station combines an electronic theodolite with Electronic Distance Measurement.','easy','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',ARRAY['total station','EDM']),
('What does RTK stand for?','multiple_choice','["Rapid Transit Kinematic","Real-Time Kinematic","Radio Tracking Kernel","Range Tracking Kit"]','Real-Time Kinematic','RTK provides centimeter-level GPS accuracy in real-time.','medium','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',ARRAY['RTK','GPS']),
('What is a plumb bob used for?','multiple_choice','["Measuring distances","Measuring angles","Establishing a vertical line","Mapping terrain"]','Establishing a vertical line','A plumb bob uses gravity to establish a true vertical line.','easy','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',ARRAY['plumb bob','tools']),
('True or False: A robotic total station requires two people.','true_false','["True","False"]','False','Robotic total stations track prisms automatically for one-person operation.','medium','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',ARRAY['robotic','total station']),
('Which systems are included in GNSS?','multiple_choice','["GPS only","GPS and GLONASS only","GPS, GLONASS, Galileo, and BeiDou","GPS and Galileo only"]','GPS, GLONASS, Galileo, and BeiDou','GNSS includes GPS (US), GLONASS (Russia), Galileo (EU), and BeiDou (China).','medium','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',ARRAY['GNSS','GPS','satellite']);

-- Module test questions (no lesson_id, harder)
INSERT INTO question_bank (question_text,question_type,options,correct_answer,explanation,difficulty,module_id,tags) VALUES
('A client needs a survey for purchasing a commercial building. Which type?','multiple_choice','["Topographic","ALTA/NSPS","Construction","Boundary"]','ALTA/NSPS','ALTA/NSPS is standard for commercial real estate transactions.','hard','11111111-1111-1111-1111-111111111111',ARRAY['ALTA','commercial']),
('What advantage does GNSS/RTK have over a total station for large areas?','short_answer','[]','No line-of-sight requirement and covers larger areas efficiently','GNSS/RTK does not require line-of-sight between instruments.','hard','11111111-1111-1111-1111-111111111111',ARRAY['GNSS','RTK','comparison']);

-- SIT Exam Prep
INSERT INTO question_bank (question_text,question_type,options,correct_answer,explanation,difficulty,exam_category,tags) VALUES
('In Texas, a vara equals approximately how many inches?','multiple_choice','["30","33.33","36","39.37"]','33.33','A Texas vara is approximately 33.33 inches.','medium','SIT',ARRAY['vara','texas','units']),
('A bearing of N 45° E equals what azimuth?','multiple_choice','["45°","135°","225°","315°"]','45°','N 45° E = 45 degrees clockwise from north.','medium','SIT',ARRAY['bearing','azimuth','math']),
('What is the interior angle sum of a 5-sided polygon?','multiple_choice','["360°","540°","720°","900°"]','540°','Interior angles = (n-2) × 180° = (5-2) × 180° = 540°.','medium','SIT',ARRAY['geometry','angles','math']);

-- RPLS Exam Prep
INSERT INTO question_bank (question_text,question_type,options,correct_answer,explanation,difficulty,exam_category,tags) VALUES
('Who can certify a boundary survey in Texas?','multiple_choice','["Any engineer","An RPLS","A surveyor intern","A contractor"]','An RPLS','Only a Registered Professional Land Surveyor can certify boundary surveys in Texas.','easy','RPLS',ARRAY['RPLS','texas law','certification']),
('Texas land surveying is governed by which code?','multiple_choice','["Title 2 NRC","Property Code Ch 21","Occupations Code Ch 1071","Civil Practice Code"]','Occupations Code Ch 1071','The Occupations Code Chapter 1071 governs land surveying practice in Texas.','hard','RPLS',ARRAY['texas law','regulations']);

-- Exam Prep Categories
INSERT INTO exam_prep_categories (exam_type,category_name,description,order_index) VALUES
('SIT','Mathematics & Calculations','Trigonometry, coordinate geometry, area calculations',1),
('SIT','Surveying Principles','Fundamental concepts, measurement theory, error correction',2),
('SIT','Legal Principles','Property law basics, boundary law, Texas regulations',3),
('SIT','Equipment & Technology','Total stations, GPS/GNSS, levels, modern technology',4),
('RPLS','Texas Property Law','Texas property law, deeds, boundary disputes',1),
('RPLS','Professional Practice','Ethics, standards of practice, professional responsibility',2),
('RPLS','Advanced Calculations','Complex coordinate geometry, geodesy, map projections',3),
('RPLS','Boundary Evidence','Rules of evidence, boundary determination, conflict resolution',4);

-- Flashcards
INSERT INTO flashcards (term,definition,hint_1,hint_2,hint_3,module_id,keywords,tags,category) VALUES
('Vara','A Spanish unit of measurement approximately equal to 33.33 inches, historically used in Texas land surveys.','A unit of length from colonial times','Rhymes with "tiara" without the "ti"','V _ _ _ (4 letters, about 33 inches)','11111111-1111-1111-1111-111111111111',ARRAY['vara','measurement','texas'],ARRAY['units','texas history'],'measurement'),
('Azimuth','A horizontal angle measured clockwise from north (0°) to the line of interest, ranging from 0° to 360°.','Describes a direction from a reference point','Compass direction, starting at North going clockwise','A _ _ _ _ _ _ (7 letters, measured in degrees)','11111111-1111-1111-1111-111111111111',ARRAY['azimuth','angle','direction'],ARRAY['angles','navigation'],'angles'),
('Benchmark','A permanent reference point of known elevation used for leveling operations.','A fixed reference point on the ground','A mark on a bench — a reference to come back to','B _ _ _ _ _ _ _ _ (9 letters, relates to elevation)','11111111-1111-1111-1111-111111111111',ARRAY['benchmark','elevation','reference'],ARRAY['elevation'],'elevation'),
('Metes and Bounds','A system describing land by compass directions and distances of boundaries.','Describes land using directions and distances','Metes = measurements, Bounds = boundaries','M _ _ _ _ and B _ _ _ _ _ (directions + distances)','11111111-1111-1111-1111-111111111111',ARRAY['metes','bounds','boundary','legal description'],ARRAY['legal descriptions'],'legal'),
('Right of Way','A legal right to pass through property owned by another, or the strip of land for a road/utility.','Legal permission related to crossing land','Roads and highways exist within one of these','R _ _ _ _ of W _ _ (a legal easement)','11111111-1111-1111-1111-111111111111',ARRAY['right of way','easement','road'],ARRAY['legal','easements'],'legal'),
('Plat','A map drawn to scale showing divisions of land including lots, streets, and easements.','A type of map showing land divisions','Filed at the county courthouse','P _ _ _ (4 letters, a recorded map of lots)','11111111-1111-1111-1111-111111111111',ARRAY['plat','map','subdivision'],ARRAY['maps','legal documents'],'legal'),
('Total Station','An electronic instrument combining a theodolite with EDM for measuring angles and distances.','The most commonly used field surveying instrument','Combines angle and distance measurement','T _ _ _ _ S _ _ _ _ _ _ (electronic instrument)','11111111-1111-1111-1111-111111111111',ARRAY['total station','EDM','theodolite'],ARRAY['equipment'],'equipment'),
('GNSS','Global Navigation Satellite System — includes GPS, GLONASS, Galileo, and BeiDou.','How surveyors get precise positions from space','GPS is one part of this larger system','G _ _ _ (4 letters, satellites for navigation)','11111111-1111-1111-1111-111111111111',ARRAY['GNSS','GPS','satellite'],ARRAY['technology'],'technology');

-- KB Article
INSERT INTO kb_articles (title,slug,category,tags,content,excerpt,status) VALUES
('What is a Texas Vara?','what-is-a-texas-vara','Measurement & Units',ARRAY['vara','texas','measurement','history'],
'<h2>The Texas Vara</h2>
<p>The <strong>vara</strong> equals approximately <strong>33.33 inches</strong>. It originates from Spanish colonial measurement systems and remains relevant because many older property descriptions use varas.</p>
<h3>Conversions</h3>
<ul><li>1 vara = 33.333 inches</li><li>1 vara = 2.7778 feet</li><li>1 vara = 0.8467 meters</li><li>1 league = 5,000 varas</li></ul>',
'The vara is a historical Texas measurement unit equal to approximately 33.33 inches.','published');

SELECT 'Schema v2 created successfully with 13 tables and sample data!' AS result;
