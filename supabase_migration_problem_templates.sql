-- ============================================================================
-- Migration: Problem Templates & Algorithmic Question Generation
-- ============================================================================
-- Creates the problem_templates table for storing reusable problem patterns
-- that can generate infinite variations algorithmically.
--
-- Also enhances question_bank with template linking for dynamic generation.
--
-- Run AFTER supabase_schema.sql and supabase_migration_study_references.sql
-- Safe to re-run (uses IF NOT EXISTS / DO $$ blocks).
-- ============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLE: problem_templates
-- ══════════════════════════════════════════════════════════════════════════════
-- Stores reusable problem patterns with parametric variables, formulas,
-- and solution step templates. Each template can generate infinite unique
-- problem instances.
--
-- PARAMETER FORMAT (each element in parameters JSONB array):
-- {
--   "name": "distance",           -- Variable name (used in formulas/templates)
--   "label": "Distance",          -- Human-readable label for admin UI
--   "type": "float",              -- integer | float | angle_dms | bearing | choice | computed
--   "min": 100,                   -- Minimum value (for numeric types)
--   "max": 500,                   -- Maximum value
--   "decimals": 2,                -- Decimal places (for float type)
--   "step": 0.01,                 -- Step size (optional)
--   "unit": "ft",                 -- Display unit
--   "choices": ["NE","SE","SW","NW"],  -- For choice type
--   "formula": "a + b"            -- For computed type
-- }
--
-- SOLUTION STEP FORMAT (each element in solution_steps_template):
-- {
--   "step_number": 1,
--   "title": "Identify given values",
--   "description_template": "Distance = {{distance}} ft",
--   "formula": "H = S x cos(alpha)",
--   "calculation_template": "H = {{distance}} x cos({{angle}}deg)",
--   "result_template": "H = {{_answer}} ft"
-- }
--
-- OPTIONS GENERATOR FORMAT (for multiple choice):
-- {
--   "method": "offset",
--   "offsets": [{ "add": 5 }, { "add": -5 }, { "multiply": 1.1 }]
-- }
-- OR
-- {
--   "method": "formula",
--   "wrong_formulas": ["distance * sin(angle * PI / 180)", "distance * tan(angle * PI / 180)"]
-- }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS problem_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity & classification
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  question_type TEXT NOT NULL DEFAULT 'numeric_input'
    CHECK (question_type IN (
      'numeric_input','multiple_choice','short_answer',
      'true_false','fill_blank','multi_select'
    )),
  difficulty TEXT DEFAULT 'medium'
    CHECK (difficulty IN ('easy','medium','hard','very_hard')),

  -- Template content
  question_template TEXT NOT NULL,
  answer_formula TEXT NOT NULL,
  answer_format JSONB NOT NULL DEFAULT '{"decimals": 2, "tolerance": 0.01}',
  -- { decimals: int, tolerance: float, unit: string, prefix: string, suffix: string }

  -- Parameters (array of parameter definitions)
  parameters JSONB NOT NULL DEFAULT '[]',

  -- Computed intermediate variables (for solution steps)
  computed_vars JSONB NOT NULL DEFAULT '[]',
  -- Each: { "name": "_cos_angle", "formula": "round(cos(angle * PI / 180), 6)" }

  -- Solution steps (templates with {{var}} placeholders)
  solution_steps_template JSONB NOT NULL DEFAULT '[]',

  -- For multiple_choice: how to generate wrong options
  options_generator JSONB DEFAULT '{}',

  -- Explanation template
  explanation_template TEXT,

  -- Metadata & linking
  module_id UUID,
  lesson_id UUID REFERENCES learning_lessons(id) ON DELETE SET NULL,
  topic_id UUID REFERENCES learning_topics(id) ON DELETE SET NULL,
  exam_category TEXT,
  tags TEXT[] DEFAULT '{}',
  study_references JSONB DEFAULT '[]',

  -- Link to hardcoded generator (optional — wraps existing PROBLEM_TYPES)
  generator_id TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,

  -- Audit
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- ENHANCE question_bank: Add template linking
-- ══════════════════════════════════════════════════════════════════════════════

-- template_id: Links a question to a problem_template for dynamic generation.
-- When set, the quiz system generates fresh values each time instead of using
-- the static question_text/correct_answer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'question_bank' AND column_name = 'template_id'
  ) THEN
    ALTER TABLE question_bank ADD COLUMN template_id UUID REFERENCES problem_templates(id) ON DELETE SET NULL;
    COMMENT ON COLUMN question_bank.template_id IS 'Links to a problem_template for dynamic generation. When set, quiz delivery generates fresh values each time.';
  END IF;
END $$;

-- is_dynamic: Quick flag to indicate this question should be regenerated each time
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'question_bank' AND column_name = 'is_dynamic'
  ) THEN
    ALTER TABLE question_bank ADD COLUMN is_dynamic BOOLEAN DEFAULT false;
    COMMENT ON COLUMN question_bank.is_dynamic IS 'When true, question values are regenerated each time from its template or math_template config.';
  END IF;
END $$;

-- solution_steps: Store solution steps for static questions (or generated snapshots)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'question_bank' AND column_name = 'solution_steps'
  ) THEN
    ALTER TABLE question_bank ADD COLUMN solution_steps JSONB DEFAULT '[]';
    COMMENT ON COLUMN question_bank.solution_steps IS 'Array of solution steps: [{step_number, title, description, formula, calculation, result}]';
  END IF;
END $$;

-- tolerance: Numeric answer tolerance for grading
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'question_bank' AND column_name = 'tolerance'
  ) THEN
    ALTER TABLE question_bank ADD COLUMN tolerance NUMERIC DEFAULT 0.01;
    COMMENT ON COLUMN question_bank.tolerance IS 'Absolute tolerance for numeric answer grading';
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLE: template_generation_log
-- ══════════════════════════════════════════════════════════════════════════════
-- Tracks problem generation from templates for analytics and debugging.

CREATE TABLE IF NOT EXISTS template_generation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES problem_templates(id) ON DELETE CASCADE,
  generated_for TEXT, -- 'quiz', 'practice', 'preview', 'bulk'
  parameters_used JSONB NOT NULL DEFAULT '{}',
  question_text_generated TEXT,
  correct_answer_generated TEXT,
  user_email TEXT,
  quiz_attempt_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_pt_category ON problem_templates(category);
CREATE INDEX IF NOT EXISTS idx_pt_subcategory ON problem_templates(subcategory);
CREATE INDEX IF NOT EXISTS idx_pt_module ON problem_templates(module_id);
CREATE INDEX IF NOT EXISTS idx_pt_lesson ON problem_templates(lesson_id);
CREATE INDEX IF NOT EXISTS idx_pt_tags ON problem_templates USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_pt_active ON problem_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_pt_generator ON problem_templates(generator_id);
CREATE INDEX IF NOT EXISTS idx_pt_difficulty ON problem_templates(difficulty);
CREATE INDEX IF NOT EXISTS idx_qb_template ON question_bank(template_id);
CREATE INDEX IF NOT EXISTS idx_qb_dynamic ON question_bank(is_dynamic);
CREATE INDEX IF NOT EXISTS idx_tgl_template ON template_generation_log(template_id);
CREATE INDEX IF NOT EXISTS idx_tgl_user ON template_generation_log(user_email);

-- ══════════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_problem_templates_upd ON problem_templates;
CREATE TRIGGER trg_problem_templates_upd
  BEFORE UPDATE ON problem_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- RLS
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE problem_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_generation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all" ON problem_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON template_generation_log FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- SEED: Register existing hardcoded generators as templates
-- ══════════════════════════════════════════════════════════════════════════════
-- This seeds problem_templates with entries that wrap existing generators from
-- lib/problemGenerators.ts. The generator_id links to PROBLEM_TYPES[].id.
-- When generating, the engine uses the hardcoded generator function directly.

INSERT INTO problem_templates (name, description, category, subcategory, question_type, difficulty, question_template, answer_formula, parameters, solution_steps_template, explanation_template, tags, generator_id, is_active) VALUES

-- Module 1: Statistics & Error Analysis
('Standard Deviation', 'Calculate standard deviation from a set of measurements', 'Statistics & Error Analysis', 'Standard Deviation', 'numeric_input', 'medium',
 'Calculate the standard deviation of a set of measurements.',
 'sqrt(sum_v_sq / (n - 1))',
 '[{"name":"n","label":"Number of measurements","type":"integer","min":4,"max":8},{"name":"base_val","label":"Base value","type":"float","min":100,"max":500,"decimals":2}]',
 '[]', 'The standard deviation measures the spread of measurements around the mean.',
 ARRAY['statistics','standard-deviation','fs-module-1'], 'std_deviation', true),

('Standard Error of Mean', 'Calculate the standard error of the mean', 'Statistics & Error Analysis', 'Standard Error of Mean', 'numeric_input', 'easy',
 'Given a standard deviation and number of measurements, calculate the standard error of the mean.',
 'sigma / sqrt(n)',
 '[{"name":"n","label":"Number of measurements","type":"integer","min":4,"max":12},{"name":"sigma","label":"Standard deviation","type":"float","min":0.01,"max":0.10,"decimals":3}]',
 '[]', 'The standard error of the mean tells us how precisely we know the true value.',
 ARRAY['statistics','standard-error','fs-module-1'], 'std_error_mean', true),

('Error Propagation', 'Combine errors using root-sum-squares', 'Statistics & Error Analysis', 'Error Propagation', 'numeric_input', 'medium',
 'Calculate the total propagated error for combined distances.',
 'sqrt(sum_of_squared_errors)',
 '[{"name":"count","label":"Number of distances","type":"integer","min":2,"max":5}]',
 '[]', 'When adding measurements, errors propagate as E = sqrt(e1^2 + e2^2 + ...).',
 ARRAY['statistics','error-propagation','fs-module-1'], 'error_propagation', true),

('Relative Precision', 'Calculate precision ratio 1:X', 'Statistics & Error Analysis', 'Relative Precision', 'numeric_input', 'easy',
 'Express relative precision as 1:X from distance and error.',
 'distance / error',
 '[{"name":"distance","label":"Distance","type":"integer","min":200,"max":5000},{"name":"error","label":"Error","type":"float","min":0.01,"max":0.20,"decimals":2}]',
 '[]', 'Relative precision = distance/error.',
 ARRAY['statistics','precision','fs-module-1'], 'relative_precision', true),

('Significant Figures', 'Count significant figures in a number', 'Statistics & Error Analysis', 'Significant Figures', 'numeric_input', 'easy',
 'How many significant figures are in a given number?',
 'count_sig_figs',
 '[]',
 '[]', 'Apply significant figures rules.',
 ARRAY['significant-figures','fundamentals','fs-module-1'], 'significant_figures', true),

-- Module 2: Leveling
('Differential Leveling', 'Calculate elevation using HI, BS, and FS', 'Leveling', 'Differential Leveling', 'numeric_input', 'easy',
 'A level is set up between a BM and an unknown point. Calculate the unknown elevation.',
 'bm_elev + bs - fs',
 '[{"name":"bm_elev","label":"BM Elevation","type":"float","min":400,"max":600,"decimals":2,"unit":"ft"},{"name":"bs","label":"Backsight","type":"float","min":3,"max":10,"decimals":2,"unit":"ft"},{"name":"fs","label":"Foresight","type":"float","min":2,"max":9,"decimals":2,"unit":"ft"}]',
 '[]', 'HI = Elevation + BS, then Elevation = HI - FS.',
 ARRAY['leveling','differential','elevation','fs-module-2'], 'differential_leveling', true),

('Multi-Turn Leveling', 'Level through multiple turning points', 'Leveling', 'Multi-Turn Leveling', 'numeric_input', 'medium',
 'A level circuit passes through multiple turning points. Calculate the final elevation.',
 'work_through_setups',
 '[{"name":"bm_elev","label":"Starting BM Elevation","type":"float","min":350,"max":550,"decimals":2,"unit":"ft"},{"name":"num_turns","label":"Number of turns","type":"integer","min":2,"max":4}]',
 '[]', 'Work through each setup: HI = Elev + BS, Elev = HI - FS.',
 ARRAY['leveling','differential','turning-points','fs-module-2'], 'multi_turn_leveling', true),

('Curvature & Refraction', 'Calculate C&R correction for distance', 'Leveling', 'Curvature & Refraction', 'numeric_input', 'easy',
 'Calculate the combined curvature and refraction correction.',
 '0.0206 * (distance / 1000)^2',
 '[{"name":"distance","label":"Distance","type":"integer","min":1000,"max":10000,"unit":"ft"}]',
 '[]', 'C&R = 0.0206 x F^2 where F is in thousands of feet.',
 ARRAY['leveling','curvature-refraction','fs-module-2'], 'curvature_refraction', true),

-- Module 3: Distance & Angle Measurement
('Temperature Correction', 'Steel tape temperature correction', 'Distance & Angle Measurement', 'Temperature Correction', 'numeric_input', 'medium',
 'Calculate the temperature correction for a steel tape measurement.',
 'alpha * L * (T - T0)',
 '[{"name":"L","label":"Tape Length","type":"integer","min":100,"max":500,"unit":"ft"},{"name":"T","label":"Field Temperature","type":"integer","min":20,"max":110,"unit":"deg F"},{"name":"T0","label":"Standard Temperature","type":"integer","min":68,"max":68}]',
 '[]', 'Ct = alpha x L x (T - T0) where alpha = 0.00000645/degF.',
 ARRAY['taping','temperature-correction','fs-module-3'], 'temp_correction', true),

('Sag Correction', 'Tape sag correction calculation', 'Distance & Angle Measurement', 'Sag Correction', 'numeric_input', 'medium',
 'Calculate the sag correction for an unsupported tape span.',
 '-(w^2 * L^3) / (24 * P^2)',
 '[{"name":"w","label":"Tape Weight","type":"float","min":0.01,"max":0.04,"decimals":3,"unit":"lbs/ft"},{"name":"L","label":"Span Length","type":"integer","min":50,"max":150,"unit":"ft"},{"name":"P","label":"Applied Tension","type":"integer","min":10,"max":30,"unit":"lbs"}]',
 '[]', 'Sag correction = -(w^2 L^3)/(24P^2). Always negative.',
 ARRAY['taping','sag-correction','fs-module-3'], 'sag_correction', true),

('Bearing to Azimuth', 'Convert bearing to azimuth', 'Distance & Angle Measurement', 'Bearing to Azimuth', 'numeric_input', 'easy',
 'Convert a bearing to an azimuth.',
 'bearing_to_azimuth_formula',
 '[{"name":"quadrant","label":"Quadrant","type":"choice","choices":["NE","SE","SW","NW"]},{"name":"degrees","label":"Degrees","type":"integer","min":1,"max":89},{"name":"minutes","label":"Minutes","type":"integer","min":0,"max":59}]',
 '[]', 'NE: Az = bearing, SE: Az = 180 - bearing, SW: Az = 180 + bearing, NW: Az = 360 - bearing.',
 ARRAY['bearings','azimuths','conversions','fs-module-3'], 'bearing_to_azimuth', true),

('Azimuth to Bearing', 'Convert azimuth to bearing angle', 'Distance & Angle Measurement', 'Azimuth to Bearing', 'short_answer', 'easy',
 'Convert an azimuth to a bearing.',
 'azimuth_to_bearing_formula',
 '[{"name":"azimuth","label":"Azimuth","type":"float","min":0.5,"max":359.5,"decimals":2,"unit":"deg"}]',
 '[]', 'Determine quadrant from azimuth range, then compute bearing angle.',
 ARRAY['bearings','azimuths','conversions','fs-module-3'], 'azimuth_to_bearing', true),

('Slope to Horizontal Distance', 'Convert slope distance using vertical angle', 'Distance & Angle Measurement', 'Slope to Horizontal Distance', 'numeric_input', 'easy',
 'Calculate horizontal distance from slope distance and vertical angle.',
 'slope_dist * cos(vert_angle * PI / 180)',
 '[{"name":"slope_dist","label":"Slope Distance","type":"float","min":200,"max":800,"decimals":2,"unit":"ft"},{"name":"vert_angle","label":"Vertical Angle","type":"float","min":2,"max":25,"decimals":2,"unit":"deg"}]',
 '[]', 'H = S x cos(alpha).',
 ARRAY['slope-distance','horizontal-distance','trigonometry','fs-module-3'], 'slope_to_horizontal', true),

('DMS to Decimal Degrees', 'Convert degrees-minutes-seconds to decimal', 'Distance & Angle Measurement', 'DMS to Decimal Degrees', 'numeric_input', 'easy',
 'Convert a DMS angle to decimal degrees.',
 'd + m/60 + s/3600',
 '[{"name":"d","label":"Degrees","type":"integer","min":0,"max":359},{"name":"m","label":"Minutes","type":"integer","min":0,"max":59},{"name":"s","label":"Seconds","type":"float","min":0,"max":59.9,"decimals":1}]',
 '[]', 'Decimal = D + M/60 + S/3600.',
 ARRAY['conversions','dms','angles','fs-module-3'], 'dms_to_decimal', true),

('Decimal to DMS', 'Convert decimal degrees to DMS', 'Distance & Angle Measurement', 'Decimal to DMS', 'short_answer', 'easy',
 'Convert decimal degrees to degrees-minutes-seconds.',
 'decimal_to_dms_formula',
 '[{"name":"decimal","label":"Decimal Degrees","type":"float","min":0.5,"max":359.5,"decimals":4}]',
 '[]', 'Extract degrees, then minutes, then seconds from the decimal remainder.',
 ARRAY['conversions','dms','angles','fs-module-3'], 'decimal_to_dms', true),

-- Module 4: Traversing & COGO
('Latitude & Departure', 'Calculate lat/dep from distance and azimuth', 'Traversing & COGO', 'Latitude & Departure', 'numeric_input', 'medium',
 'Calculate the latitude for a traverse leg.',
 'distance * cos(azimuth * PI / 180)',
 '[{"name":"distance","label":"Distance","type":"float","min":150,"max":700,"decimals":2,"unit":"ft"},{"name":"azimuth","label":"Azimuth","type":"float","min":0,"max":359.99,"decimals":2,"unit":"deg"}]',
 '[]', 'Lat = D x cos(Az). Dep = D x sin(Az).',
 ARRAY['traverse','latitude','departure','cogo','fs-module-4'], 'lat_dep', true),

('Inverse Computation', 'Distance and azimuth from coordinates', 'Traversing & COGO', 'Inverse Computation', 'numeric_input', 'medium',
 'Calculate the distance between two coordinate points.',
 'sqrt(dN^2 + dE^2)',
 '[{"name":"n1","label":"Point A Northing","type":"float","min":1000,"max":5000,"decimals":2},{"name":"e1","label":"Point A Easting","type":"float","min":1000,"max":5000,"decimals":2},{"name":"n2","label":"Point B Northing","type":"float","min":1000,"max":5000,"decimals":2},{"name":"e2","label":"Point B Easting","type":"float","min":1000,"max":5000,"decimals":2}]',
 '[]', 'Distance = sqrt(dN^2 + dE^2). Azimuth = atan2(dE, dN).',
 ARRAY['traverse','inverse','cogo','coordinates','fs-module-4'], 'inverse_computation', true),

('Traverse Precision Ratio', 'Compute linear closure and precision', 'Traversing & COGO', 'Traverse Precision Ratio', 'numeric_input', 'hard',
 'Calculate the linear closure error for a traverse.',
 'sqrt(sumLat^2 + sumDep^2)',
 '[{"name":"num_legs","label":"Number of legs","type":"integer","min":3,"max":6}]',
 '[]', 'Sum latitudes and departures, compute LC = sqrt(SumLat^2 + SumDep^2).',
 ARRAY['traverse','precision','closure','cogo','fs-module-4'], 'precision_ratio', true),

-- Module 5: Areas, Volumes & Curves
('Coordinate Area (Shoelace)', 'Calculate area from polygon coordinates', 'Areas, Volumes & Curves', 'Coordinate Area', 'numeric_input', 'medium',
 'Calculate the area of a polygon using the coordinate (shoelace) method.',
 'abs(sum1 - sum2) / 2',
 '[{"name":"n","label":"Number of vertices","type":"integer","min":3,"max":5}]',
 '[]', 'Area = |Sum(Xi*Yi+1) - Sum(Xi+1*Yi)| / 2.',
 ARRAY['area','coordinate-method','shoelace','fs-module-5'], 'coordinate_area', true),

('Average End Area Volume', 'Earthwork volume between cross sections', 'Areas, Volumes & Curves', 'Average End Area Volume', 'numeric_input', 'easy',
 'Calculate earthwork volume using the Average End Area method.',
 'L * (A1 + A2) / 2 / 27',
 '[{"name":"A1","label":"Area 1","type":"float","min":50,"max":500,"decimals":1,"unit":"sq ft"},{"name":"A2","label":"Area 2","type":"float","min":50,"max":500,"decimals":1,"unit":"sq ft"},{"name":"L","label":"Distance between sections","type":"integer","min":25,"max":100,"unit":"ft"}]',
 '[]', 'V = L(A1+A2)/2 in cu ft, then divide by 27 for cu yd.',
 ARRAY['volume','average-end-area','earthwork','fs-module-5'], 'avg_end_area', true),

('Horizontal Curve', 'Calculate tangent, curve length, external, middle ordinate', 'Areas, Volumes & Curves', 'Horizontal Curve', 'numeric_input', 'medium',
 'Calculate the tangent length for a horizontal curve.',
 'R * tan(delta / 2 * PI / 180)',
 '[{"name":"R","label":"Radius","type":"integer","min":300,"max":2000,"unit":"ft"},{"name":"delta","label":"Deflection Angle","type":"float","min":15,"max":90,"decimals":2,"unit":"deg"}]',
 '[]', 'T = R x tan(delta/2).',
 ARRAY['curves','horizontal-curve','tangent-length','fs-module-5'], 'horizontal_curve', true),

('Vertical Curve High/Low Point', 'Find high or low point on vertical curve', 'Areas, Volumes & Curves', 'Vertical Curve', 'numeric_input', 'hard',
 'Find the high or low point distance from BVC on a vertical curve.',
 '-g1 / r',
 '[{"name":"g1","label":"Grade In (%)","type":"float","min":-5,"max":5,"decimals":2},{"name":"g2","label":"Grade Out (%)","type":"float","min":-5,"max":5,"decimals":2},{"name":"L","label":"Curve Length","type":"integer","min":200,"max":800,"unit":"ft"},{"name":"bvc_elev","label":"BVC Elevation","type":"float","min":400,"max":600,"decimals":2,"unit":"ft"}]',
 '[]', 'r = (g2-g1)/L. x = -g1/r from BVC.',
 ARRAY['curves','vertical-curve','high-low-point','fs-module-5'], 'vertical_curve', true),

-- Module 6: GNSS/GPS
('Orthometric Height', 'Calculate elevation from GPS height and geoid', 'GNSS/GPS & Geodesy', 'Orthometric Height', 'numeric_input', 'easy',
 'Calculate orthometric height from ellipsoid height and geoid undulation.',
 'h - N',
 '[{"name":"h","label":"Ellipsoid Height","type":"float","min":200,"max":800,"decimals":2,"unit":"m"},{"name":"N","label":"Geoid Undulation","type":"float","min":-30,"max":30,"decimals":2,"unit":"m"}]',
 '[]', 'H = h - N.',
 ARRAY['gps','orthometric-height','geoid','geodesy','fs-module-6'], 'orthometric_height', true),

('Grid to Ground Distance', 'Combined scale/elevation factor conversion', 'GNSS/GPS & Geodesy', 'Grid to Ground Distance', 'numeric_input', 'medium',
 'Calculate grid distance from ground distance using combined factor.',
 'ground_dist * scale_factor * elev_factor',
 '[{"name":"ground_dist","label":"Ground Distance","type":"float","min":500,"max":5000,"decimals":2,"unit":"ft"},{"name":"scale_factor","label":"Grid Scale Factor","type":"float","min":0.9996,"max":1.0004,"decimals":6},{"name":"elev_factor","label":"Elevation Factor","type":"float","min":0.9997,"max":1.0000,"decimals":6}]',
 '[]', 'Grid = Ground x SF x EF.',
 ARRAY['gps','scale-factor','grid-distance','geodesy','fs-module-6'], 'grid_ground_dist', true),

-- Module 7: Boundary Law
('Section Subdivision (Acres)', 'PLSS section/quarter-section areas', 'Boundary Law & Public Lands', 'Section Subdivision', 'numeric_input', 'easy',
 'How many acres are in a described portion of a standard section?',
 'section_area_lookup',
 '[]',
 '[]', 'A full section = 640 acres.',
 ARRAY['boundary-law','plss','section','acres','fs-module-7'], 'section_area', true),

('Unit Conversions', 'Chains, varas, rods, acres, feet, meters', 'Boundary Law & Public Lands', 'Unit Conversions', 'numeric_input', 'easy',
 'Convert between surveying units.',
 'value * factor',
 '[]',
 '[]', 'Apply the appropriate conversion factor.',
 ARRAY['conversions','units','fs-module-7'], 'unit_conversion', true),

-- Module 8: Photogrammetry
('Photo Scale', 'Calculate aerial photo scale from focal length and height', 'Photogrammetry & Construction', 'Photo Scale', 'numeric_input', 'medium',
 'Calculate the aerial photo scale denominator.',
 '1 / (f_ft / H)',
 '[{"name":"f_mm","label":"Focal Length (mm)","type":"float","min":100,"max":300,"decimals":1},{"name":"H","label":"Flying Height AGL","type":"integer","min":2000,"max":15000,"unit":"ft"}]',
 '[]', 'Scale = f/H.',
 ARRAY['photogrammetry','photo-scale','fs-module-8'], 'photo_scale', true),

('Cut/Fill Calculation', 'Design elevation vs ground elevation', 'Photogrammetry & Construction', 'Cut/Fill Calculation', 'numeric_input', 'easy',
 'Calculate the cut or fill amount at a point.',
 'design_elev - ground_elev',
 '[{"name":"design_elev","label":"Design Elevation","type":"float","min":450,"max":550,"decimals":2,"unit":"ft"},{"name":"ground_elev","label":"Ground Elevation","type":"float","min":442,"max":558,"decimals":2,"unit":"ft"}]',
 '[]', 'Cut/Fill = Design Elevation - Ground Elevation. Positive = fill, Negative = cut.',
 ARRAY['construction','cut-fill','grading','fs-module-8'], 'cut_fill', true)

ON CONFLICT DO NOTHING;

SELECT 'Problem templates migration complete. ' || count(*) || ' templates registered.' AS result
FROM problem_templates;
