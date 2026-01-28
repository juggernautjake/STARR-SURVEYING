import {
  SurveyTypeConfig,
  PROPERTY_ADDRESS_FIELD, PROPERTY_COUNTY_FIELD,
  PROPERTY_SIZE, PROPERTY_CORNERS, VEGETATION, TERRAIN,
  WATER_FEATURES, EXISTING_SURVEY, EXISTING_MONUMENTS,
  ACCESS_CONDITIONS, TRAVEL_DISTANCE, ADJOINING
} from './surveyCalculatorTypes';

// Helper to find option and get value
const getAdditionalHours = (opts: { value: string; additionalHours?: number }[] | undefined, val: unknown): number => {
  const opt = opts?.find(o => o.value === val);
  return opt?.additionalHours || 0;
};

const getMultiplier = (opts: { value: string; hoursMultiplier?: number }[] | undefined, val: unknown): number => {
  const opt = opts?.find(o => o.value === val);
  return opt?.hoursMultiplier || 1;
};

// =============================================================================
// BOUNDARY SURVEY
// Base: 3 hours (find corners, shoot points, basic office work)
// Typical range: $400 - $1,500 for most residential
// =============================================================================
const boundarySurvey: SurveyTypeConfig = {
  id: 'boundary',
  name: 'Boundary Survey',
  description: 'Establishes and marks property boundaries. For fences, disputes, permits, or property purchases.',
  baseHours: 3,
  minPrice: 400,
  fields: [
    PROPERTY_ADDRESS_FIELD,
    PROPERTY_COUNTY_FIELD,
    { id: 'propertyType', label: 'Property Type', type: 'select', required: true, options: [
      { value: 'residential_urban', label: 'Residential - City/Subdivision', additionalHours: 0 },
      { value: 'residential_rural', label: 'Residential - Rural/Country', additionalHours: 0.5 },
      { value: 'commercial', label: 'Commercial', additionalHours: 1 },
      { value: 'agricultural', label: 'Agricultural/Farm/Ranch', additionalHours: 0.5 },
      { value: 'vacant', label: 'Vacant/Undeveloped', additionalHours: 0 },
    ]},
    { id: 'acreage', label: 'Property Size', type: 'select', required: true, options: PROPERTY_SIZE },
    { id: 'corners', label: 'Number of Corners', type: 'select', required: true, options: PROPERTY_CORNERS, helpText: 'Count all direction changes' },
    { id: 'vegetation', label: 'Vegetation', type: 'select', required: true, options: VEGETATION },
    { id: 'terrain', label: 'Terrain', type: 'select', required: true, options: TERRAIN },
    { id: 'waterFeatures', label: 'Water Features', type: 'select', required: false, options: WATER_FEATURES },
    { id: 'existingSurvey', label: 'Previous Survey', type: 'select', required: true, options: EXISTING_SURVEY },
    { id: 'existingMonuments', label: 'Corner Markers', type: 'select', required: true, options: EXISTING_MONUMENTS },
    { id: 'access', label: 'Property Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    { id: 'adjoining', label: 'Adjoining Properties', type: 'select', required: false, options: ADJOINING },
    { id: 'travelDistance', label: 'Distance from Belton', type: 'select', required: true, options: TRAVEL_DISTANCE },
    { id: 'fenceIssues', label: 'Fence Issues', type: 'select', required: false, options: [
      { value: 'none', label: 'No fence or no issues', additionalHours: 0 },
      { value: 'minor', label: 'Minor discrepancy', additionalHours: 0.5 },
      { value: 'major', label: 'Significant dispute', additionalHours: 1.5 },
    ]},
    { id: 'monumentsNeeded', label: 'New Markers Needed', type: 'select', required: false, options: [
      { value: 'none', label: 'Just locate existing', additionalHours: 0 },
      { value: 'replace', label: 'Replace missing (1-2)', additionalHours: 0.5 },
      { value: 'all', label: 'Set all new pins', additionalHours: 1 },
    ]},
    { id: 'purpose', label: 'Purpose', type: 'select', required: true, options: [
      { value: 'fence', label: 'Fence Installation', additionalHours: 0 },
      { value: 'building', label: 'Building Permit', additionalHours: 0.5 },
      { value: 'sale', label: 'Property Sale', additionalHours: 0 },
      { value: 'dispute', label: 'Boundary Dispute', additionalHours: 1 },
      { value: 'personal', label: 'Personal Records', additionalHours: 0 },
    ]},
  ],
  calculateHours: (v) => {
    // Start with base hours
    let h = 3;
    
    // Add hours for property type
    const propTypeOpts = boundarySurvey.fields[2].options;
    h += getAdditionalHours(propTypeOpts, v.propertyType);
    
    // Add hours for size
    h += getAdditionalHours(PROPERTY_SIZE, v.acreage);
    
    // Add hours for corners
    h += getAdditionalHours(PROPERTY_CORNERS, v.corners);
    
    // Add hours for complications
    h += getAdditionalHours(WATER_FEATURES, v.waterFeatures);
    h += getAdditionalHours(EXISTING_SURVEY, v.existingSurvey);
    h += getAdditionalHours(EXISTING_MONUMENTS, v.existingMonuments);
    h += getAdditionalHours(ADJOINING, v.adjoining);
    
    // Add hours for fence/monument/purpose
    h += getAdditionalHours(boundarySurvey.fields[13].options, v.fenceIssues);
    h += getAdditionalHours(boundarySurvey.fields[14].options, v.monumentsNeeded);
    h += getAdditionalHours(boundarySurvey.fields[15].options, v.purpose);
    
    // Apply difficulty multipliers (vegetation, terrain, access)
    h *= getMultiplier(VEGETATION, v.vegetation);
    h *= getMultiplier(TERRAIN, v.terrain);
    h *= getMultiplier(ACCESS_CONDITIONS, v.access);
    
    return h;
  },
};

// =============================================================================
// ALTA/NSPS SURVEY
// Base: 10 hours (comprehensive commercial survey)
// Typical range: $2,000 - $8,000+
// =============================================================================
const altaSurvey: SurveyTypeConfig = {
  id: 'alta',
  name: 'ALTA/NSPS Land Title Survey',
  description: 'Comprehensive commercial survey meeting national standards. Required by lenders for commercial transactions.',
  baseHours: 10,
  minPrice: 2000,
  fields: [
    PROPERTY_ADDRESS_FIELD,
    PROPERTY_COUNTY_FIELD,
    { id: 'propertyType', label: 'Property Type', type: 'select', required: true, options: [
      { value: 'office', label: 'Office Building', additionalHours: 0 },
      { value: 'retail', label: 'Retail/Shopping', additionalHours: 1 },
      { value: 'industrial', label: 'Industrial/Warehouse', additionalHours: 0.5 },
      { value: 'multifamily', label: 'Multi-Family', additionalHours: 2 },
      { value: 'mixed_use', label: 'Mixed-Use', additionalHours: 3 },
      { value: 'vacant', label: 'Vacant Commercial', additionalHours: -2 },
      { value: 'hospitality', label: 'Hotel/Hospitality', additionalHours: 2 },
      { value: 'healthcare', label: 'Healthcare', additionalHours: 3 },
    ]},
    { id: 'acreage', label: 'Property Size', type: 'select', required: true, options: [
      { value: '0.5', label: 'Under 0.5 acres', additionalHours: 0 },
      { value: '1', label: '0.5 - 1 acre', additionalHours: 2 },
      { value: '2', label: '1 - 2 acres', additionalHours: 4 },
      { value: '5', label: '2 - 5 acres', additionalHours: 6 },
      { value: '10', label: '5 - 10 acres', additionalHours: 10 },
      { value: '25', label: '10 - 25 acres', additionalHours: 16 },
      { value: '50', label: '25+ acres', additionalHours: 24 },
    ]},
    { id: 'buildings', label: 'Number of Buildings', type: 'select', required: true, options: [
      { value: '0', label: 'No buildings', additionalHours: 0 },
      { value: '1', label: '1 building', additionalHours: 2 },
      { value: '2', label: '2 buildings', additionalHours: 3.5 },
      { value: '3', label: '3-4 buildings', additionalHours: 5 },
      { value: '5', label: '5+ buildings', additionalHours: 8 },
    ]},
    { id: 'tableA', label: 'Table A Items', type: 'select', required: true, helpText: 'Specified by lender/title company', options: [
      { value: 'minimal', label: 'Minimal (1-4)', additionalHours: 0 },
      { value: 'standard', label: 'Standard (1-11)', additionalHours: 3 },
      { value: 'comprehensive', label: 'Comprehensive (1-16)', additionalHours: 5 },
      { value: 'full', label: 'Full (All 19)', additionalHours: 8 },
      { value: 'unknown', label: 'Unknown', additionalHours: 4 },
    ]},
    { id: 'utilities', label: 'Utility Location', type: 'select', required: true, options: [
      { value: 'none', label: 'Surface only', additionalHours: 0 },
      { value: 'basic', label: '811 locate', additionalHours: 1 },
      { value: 'detailed', label: 'Detailed mapping', additionalHours: 3 },
      { value: 'sue', label: 'SUE required', additionalHours: 8 },
    ]},
    { id: 'floodCert', label: 'Flood Determination', type: 'select', required: true, options: [
      { value: 'none', label: 'Not required', additionalHours: 0 },
      { value: 'determination', label: 'Zone determination', additionalHours: 0.5 },
      { value: 'certification', label: 'With elevation', additionalHours: 2 },
    ]},
    { id: 'access', label: 'Site Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    { id: 'travelDistance', label: 'Distance from Belton', type: 'select', required: true, options: TRAVEL_DISTANCE },
  ],
  calculateHours: (v) => {
    let h = 10;
    const f = altaSurvey.fields;
    h += getAdditionalHours(f[2].options, v.propertyType);
    h += getAdditionalHours(f[3].options, v.acreage);
    h += getAdditionalHours(f[4].options, v.buildings);
    h += getAdditionalHours(f[5].options, v.tableA);
    h += getAdditionalHours(f[6].options, v.utilities);
    h += getAdditionalHours(f[7].options, v.floodCert);
    h *= getMultiplier(ACCESS_CONDITIONS, v.access);
    return Math.max(h, 10); // Minimum 10 hours for ALTA
  },
};

// =============================================================================
// TOPOGRAPHIC SURVEY
// Base: 4 hours
// Typical range: $500 - $3,000+
// =============================================================================
const topoSurvey: SurveyTypeConfig = {
  id: 'topographic',
  name: 'Topographic Survey',
  description: 'Maps contours, elevations, and features. Essential for site planning, drainage, and construction.',
  baseHours: 4,
  minPrice: 500,
  fields: [
    PROPERTY_ADDRESS_FIELD,
    PROPERTY_COUNTY_FIELD,
    { id: 'purpose', label: 'Purpose', type: 'select', required: true, options: [
      { value: 'site_plan', label: 'Site Planning', additionalHours: 0 },
      { value: 'drainage', label: 'Drainage Design', additionalHours: 0.5 },
      { value: 'grading', label: 'Grading Plan', additionalHours: 0.5 },
      { value: 'construction', label: 'Pre-Construction', additionalHours: 0.5 },
      { value: 'flood', label: 'Floodplain Study', additionalHours: 1 },
    ]},
    { id: 'acreage', label: 'Area to Survey', type: 'select', required: true, options: [
      { value: '0.25', label: 'Under 0.25 acres', additionalHours: 0 },
      { value: '0.5', label: '0.25 - 0.5 acres', additionalHours: 1 },
      { value: '1', label: '0.5 - 1 acre', additionalHours: 2 },
      { value: '2', label: '1 - 2 acres', additionalHours: 4 },
      { value: '5', label: '2 - 5 acres', additionalHours: 7 },
      { value: '10', label: '5 - 10 acres', additionalHours: 12 },
      { value: '20', label: '10+ acres', additionalHours: 20 },
    ]},
    { id: 'contourInterval', label: 'Contour Interval', type: 'select', required: true, helpText: 'Smaller = more detail', options: [
      { value: '5', label: '5-foot (general)', hoursMultiplier: 1.0 },
      { value: '2', label: '2-foot (standard)', hoursMultiplier: 1.15 },
      { value: '1', label: '1-foot (high detail)', hoursMultiplier: 1.35 },
      { value: '0.5', label: '6-inch (precision)', hoursMultiplier: 1.6 },
    ]},
    { id: 'features', label: 'Features to Map', type: 'select', required: true, options: [
      { value: 'basic', label: 'Contours only', additionalHours: 0 },
      { value: 'standard', label: 'Contours + buildings + trees', additionalHours: 1.5 },
      { value: 'detailed', label: 'All improvements', additionalHours: 3 },
      { value: 'comprehensive', label: 'With utilities', additionalHours: 5 },
    ]},
    { id: 'vegetation', label: 'Vegetation', type: 'select', required: true, options: VEGETATION },
    { id: 'terrain', label: 'Terrain', type: 'select', required: true, options: TERRAIN },
    { id: 'waterFeatures', label: 'Water Features', type: 'select', required: false, options: WATER_FEATURES },
    { id: 'benchmark', label: 'Vertical Datum', type: 'select', required: true, options: [
      { value: 'assumed', label: 'Assumed (relative)', additionalHours: 0 },
      { value: 'local', label: 'Local benchmark', additionalHours: 0.5 },
      { value: 'navd88', label: 'NAVD88', additionalHours: 1 },
    ]},
    { id: 'boundary', label: 'Include Boundary', type: 'select', required: false, options: [
      { value: 'no', label: 'No - have current', additionalHours: 0 },
      { value: 'yes', label: 'Yes - include', additionalHours: 3 },
    ]},
    { id: 'access', label: 'Site Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    { id: 'travelDistance', label: 'Distance from Belton', type: 'select', required: true, options: TRAVEL_DISTANCE },
  ],
  calculateHours: (v) => {
    let h = 4;
    const f = topoSurvey.fields;
    h += getAdditionalHours(f[2].options, v.purpose);
    h += getAdditionalHours(f[3].options, v.acreage);
    h += getAdditionalHours(f[5].options, v.features);
    h += getAdditionalHours(WATER_FEATURES, v.waterFeatures);
    h += getAdditionalHours(f[9].options, v.benchmark);
    h += getAdditionalHours(f[10].options, v.boundary);
    
    // Apply multipliers
    h *= getMultiplier(f[4].options, v.contourInterval);
    h *= getMultiplier(VEGETATION, v.vegetation);
    h *= getMultiplier(TERRAIN, v.terrain);
    h *= getMultiplier(ACCESS_CONDITIONS, v.access);
    
    return h;
  },
};

// =============================================================================
// ELEVATION CERTIFICATE
// Base: 2.5 hours
// Typical range: $350 - $500
// =============================================================================
const elevationCert: SurveyTypeConfig = {
  id: 'elevation',
  name: 'Elevation Certificate (FEMA)',
  description: 'Official FEMA form for flood insurance, LOMA applications, or proving structure is above flood level.',
  baseHours: 2.5,
  minPrice: 350,
  fields: [
    PROPERTY_ADDRESS_FIELD,
    PROPERTY_COUNTY_FIELD,
    { id: 'buildingType', label: 'Building Type', type: 'select', required: true, options: [
      { value: 'single_family', label: 'Single-Family Home', additionalHours: 0 },
      { value: 'duplex', label: 'Duplex', additionalHours: 0.5 },
      { value: 'townhouse', label: 'Townhouse', additionalHours: 0.25 },
      { value: 'mobile', label: 'Mobile Home', additionalHours: -0.25 },
      { value: 'multi_family', label: 'Multi-Family', additionalHours: 1 },
      { value: 'commercial', label: 'Commercial', additionalHours: 0.75 },
    ]},
    { id: 'floodZone', label: 'Flood Zone', type: 'select', required: true, helpText: 'Check policy or FEMA map', options: [
      { value: 'x', label: 'Zone X (minimal risk)', additionalHours: -0.25 },
      { value: 'x500', label: 'Zone X shaded (500-year)', additionalHours: 0 },
      { value: 'a', label: 'Zone A (no BFE)', additionalHours: 0.5 },
      { value: 'ae', label: 'Zone AE (with BFE)', additionalHours: 0 },
      { value: 'ao', label: 'Zone AO (sheet flow)', additionalHours: 0.5 },
      { value: 'unknown', label: 'Unknown', additionalHours: 0.25 },
    ]},
    { id: 'purpose', label: 'Purpose', type: 'select', required: true, options: [
      { value: 'insurance', label: 'Flood Insurance', additionalHours: 0 },
      { value: 'loma', label: 'LOMA Application', additionalHours: 1 },
      { value: 'lomr_f', label: 'LOMR-F Application', additionalHours: 1.5 },
      { value: 'construction', label: 'New Construction', additionalHours: 0.25 },
      { value: 'sale', label: 'Property Sale', additionalHours: 0 },
    ]},
    { id: 'basement', label: 'Basement/Below Area', type: 'select', required: true, options: [
      { value: 'none', label: 'None', additionalHours: 0 },
      { value: 'crawl', label: 'Crawl space', additionalHours: 0.25 },
      { value: 'basement', label: 'Full basement', additionalHours: 0.5 },
      { value: 'walkout', label: 'Walkout basement', additionalHours: 0.75 },
    ]},
    { id: 'additions', label: 'Building Additions', type: 'select', required: false, options: [
      { value: 'none', label: 'Original only', additionalHours: 0 },
      { value: 'one', label: 'One addition', additionalHours: 0.25 },
      { value: 'multiple', label: 'Multiple additions', additionalHours: 0.75 },
    ]},
    { id: 'access', label: 'Property Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    { id: 'travelDistance', label: 'Distance from Belton', type: 'select', required: true, options: TRAVEL_DISTANCE },
  ],
  calculateHours: (v) => {
    let h = 2.5;
    const f = elevationCert.fields;
    h += getAdditionalHours(f[2].options, v.buildingType);
    h += getAdditionalHours(f[3].options, v.floodZone);
    h += getAdditionalHours(f[4].options, v.purpose);
    h += getAdditionalHours(f[5].options, v.basement);
    h += getAdditionalHours(f[6].options, v.additions);
    h *= getMultiplier(ACCESS_CONDITIONS, v.access);
    return Math.max(h, 2); // Minimum 2 hours
  },
};

// =============================================================================
// CONSTRUCTION STAKING
// Base: 2 hours
// Typical range: $300 - $1,000+
// =============================================================================
const constructionStaking: SurveyTypeConfig = {
  id: 'construction',
  name: 'Construction Staking / Layout',
  description: 'Precise positioning of stakes for construction. Ensures correct building locations per approved plans.',
  baseHours: 2,
  minPrice: 300,
  fields: [
    PROPERTY_ADDRESS_FIELD,
    PROPERTY_COUNTY_FIELD,
    { id: 'projectType', label: 'Project Type', type: 'select', required: true, options: [
      { value: 'residential', label: 'New Home', additionalHours: 0 },
      { value: 'addition', label: 'Home Addition', additionalHours: -0.5 },
      { value: 'commercial', label: 'Commercial Building', additionalHours: 2 },
      { value: 'road', label: 'Road/Driveway', additionalHours: 1 },
      { value: 'fence', label: 'Fence Line', additionalHours: -0.5 },
      { value: 'septic', label: 'Septic System', additionalHours: 0 },
      { value: 'pool', label: 'Swimming Pool', additionalHours: -0.25 },
    ]},
    { id: 'stakingType', label: 'Staking Type', type: 'select', required: true, options: [
      { value: 'corners', label: 'Corners only', additionalHours: 0 },
      { value: 'offset', label: 'Offset stakes', additionalHours: 0.5 },
      { value: 'grades', label: 'Grade stakes', additionalHours: 1.5 },
      { value: 'full', label: 'Complete layout', additionalHours: 2.5 },
    ]},
    { id: 'points', label: 'Number of Points', type: 'select', required: true, options: [
      { value: '10', label: '4-10 points', additionalHours: 0 },
      { value: '25', label: '11-25 points', additionalHours: 1 },
      { value: '50', label: '26-50 points', additionalHours: 2.5 },
      { value: '100', label: '50+ points', additionalHours: 5 },
    ]},
    { id: 'plans', label: 'Plans Available', type: 'select', required: true, options: [
      { value: 'digital', label: 'Digital CAD', additionalHours: 0 },
      { value: 'pdf', label: 'PDF plans', additionalHours: 0.25 },
      { value: 'paper', label: 'Paper only', additionalHours: 0.5 },
      { value: 'none', label: 'No plans', additionalHours: 1.5 },
    ]},
    { id: 'visits', label: 'Site Visits', type: 'select', required: true, options: [
      { value: 'single', label: 'Single visit', hoursMultiplier: 1.0 },
      { value: 'two', label: 'Two visits', hoursMultiplier: 1.75 },
      { value: 'multiple', label: 'Multiple visits', hoursMultiplier: 2.5 },
    ]},
    { id: 'terrain', label: 'Terrain', type: 'select', required: true, options: TERRAIN },
    { id: 'access', label: 'Site Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    { id: 'travelDistance', label: 'Distance from Belton', type: 'select', required: true, options: TRAVEL_DISTANCE },
  ],
  calculateHours: (v) => {
    let h = 2;
    const f = constructionStaking.fields;
    h += getAdditionalHours(f[2].options, v.projectType);
    h += getAdditionalHours(f[3].options, v.stakingType);
    h += getAdditionalHours(f[4].options, v.points);
    h += getAdditionalHours(f[5].options, v.plans);
    
    h *= getMultiplier(f[6].options, v.visits);
    h *= getMultiplier(TERRAIN, v.terrain);
    h *= getMultiplier(ACCESS_CONDITIONS, v.access);
    
    return Math.max(h, 1.5);
  },
};

// =============================================================================
// SUBDIVISION PLATTING
// Base: 12 hours
// Typical range: $2,500 - $10,000+
// =============================================================================
const subdivisionPlat: SurveyTypeConfig = {
  id: 'subdivision',
  name: 'Subdivision Platting',
  description: 'Divides land into multiple lots with streets and easements. Creates recorded plat for individual lot sales.',
  baseHours: 12,
  minPrice: 2500,
  fields: [
    PROPERTY_ADDRESS_FIELD,
    PROPERTY_COUNTY_FIELD,
    { id: 'acreage', label: 'Total Tract Size', type: 'select', required: true, options: [
      { value: '5', label: 'Under 5 acres', additionalHours: 0 },
      { value: '10', label: '5 - 10 acres', additionalHours: 3 },
      { value: '25', label: '10 - 25 acres', additionalHours: 6 },
      { value: '50', label: '25 - 50 acres', additionalHours: 10 },
      { value: '100', label: '50 - 100 acres', additionalHours: 16 },
      { value: '200', label: '100+ acres', additionalHours: 25 },
    ]},
    { id: 'lots', label: 'Number of Lots', type: 'select', required: true, options: [
      { value: '2', label: '2 lots (simple split)', additionalHours: -4 },
      { value: '3', label: '3 lots', additionalHours: -2 },
      { value: '5', label: '4 - 6 lots', additionalHours: 0 },
      { value: '10', label: '7 - 12 lots', additionalHours: 4 },
      { value: '25', label: '13 - 25 lots', additionalHours: 10 },
      { value: '50', label: '26+ lots', additionalHours: 20 },
    ]},
    { id: 'roads', label: 'Road Layout', type: 'select', required: true, options: [
      { value: 'none', label: 'No new roads', additionalHours: 0 },
      { value: 'simple', label: 'One simple road', additionalHours: 4 },
      { value: 'moderate', label: '2-3 roads', additionalHours: 8 },
      { value: 'complex', label: 'Complex with cul-de-sacs', additionalHours: 12 },
    ]},
    { id: 'drainage', label: 'Drainage', type: 'select', required: true, options: [
      { value: 'simple', label: 'Natural drainage', additionalHours: 0 },
      { value: 'easements', label: 'Drainage easements', additionalHours: 3 },
      { value: 'detention', label: 'Detention required', additionalHours: 6 },
    ]},
    { id: 'jurisdiction', label: 'Jurisdiction', type: 'select', required: true, options: [
      { value: 'county', label: 'County only', additionalHours: 0 },
      { value: 'etj', label: 'City ETJ', additionalHours: 2 },
      { value: 'city', label: 'City limits', additionalHours: 5 },
    ]},
    { id: 'vegetation', label: 'Vegetation', type: 'select', required: true, options: VEGETATION },
    { id: 'terrain', label: 'Terrain', type: 'select', required: true, options: TERRAIN },
    { id: 'floodplain', label: 'Floodplain', type: 'select', required: true, options: [
      { value: 'none', label: 'No floodplain', additionalHours: 0 },
      { value: 'minor', label: 'Minor (edge)', additionalHours: 3 },
      { value: 'significant', label: 'Significant', additionalHours: 6 },
      { value: 'major', label: 'Major impact', additionalHours: 10 },
    ]},
    { id: 'existingSurvey', label: 'Parent Tract Survey', type: 'select', required: true, options: EXISTING_SURVEY },
    { id: 'travelDistance', label: 'Distance from Belton', type: 'select', required: true, options: TRAVEL_DISTANCE },
  ],
  calculateHours: (v) => {
    let h = 12;
    const f = subdivisionPlat.fields;
    h += getAdditionalHours(f[2].options, v.acreage);
    h += getAdditionalHours(f[3].options, v.lots);
    h += getAdditionalHours(f[4].options, v.roads);
    h += getAdditionalHours(f[5].options, v.drainage);
    h += getAdditionalHours(f[6].options, v.jurisdiction);
    h += getAdditionalHours(f[9].options, v.floodplain);
    h += getAdditionalHours(EXISTING_SURVEY, v.existingSurvey);
    
    h *= getMultiplier(VEGETATION, v.vegetation);
    h *= getMultiplier(TERRAIN, v.terrain);
    
    return Math.max(h, 8);
  },
};

// =============================================================================
// AS-BUILT SURVEY
// Base: 3 hours
// Typical range: $400 - $1,000+
// =============================================================================
const asBuiltSurvey: SurveyTypeConfig = {
  id: 'asbuilt',
  name: 'As-Built Survey',
  description: 'Documents completed construction location. Verifies structures meet approved plans and setbacks.',
  baseHours: 3,
  minPrice: 400,
  fields: [
    PROPERTY_ADDRESS_FIELD,
    PROPERTY_COUNTY_FIELD,
    { id: 'structureType', label: 'Structure Type', type: 'select', required: true, options: [
      { value: 'residential', label: 'New Home', additionalHours: 0 },
      { value: 'addition', label: 'Addition', additionalHours: -0.5 },
      { value: 'commercial', label: 'Commercial', additionalHours: 2 },
      { value: 'accessory', label: 'Garage/Barn/Shop', additionalHours: -0.75 },
      { value: 'pool', label: 'Pool', additionalHours: -1 },
      { value: 'foundation', label: 'Foundation Only', additionalHours: -0.5 },
    ]},
    { id: 'complexity', label: 'Complexity', type: 'select', required: true, options: [
      { value: 'simple', label: 'Simple rectangular', additionalHours: 0 },
      { value: 'moderate', label: 'L-shape or offsets', additionalHours: 0.5 },
      { value: 'complex', label: 'Complex footprint', additionalHours: 1 },
      { value: 'very_complex', label: 'Multiple buildings', additionalHours: 2 },
    ]},
    { id: 'features', label: 'Features to Document', type: 'select', required: true, options: [
      { value: 'building', label: 'Building + setbacks only', additionalHours: 0 },
      { value: 'improvements', label: '+ drives + walks', additionalHours: 0.75 },
      { value: 'full', label: 'All improvements', additionalHours: 1.5 },
      { value: 'comprehensive', label: 'With elevations', additionalHours: 2.5 },
    ]},
    { id: 'permit', label: 'For Permit/CO', type: 'select', required: true, options: [
      { value: 'yes', label: 'Yes - permit required', additionalHours: 0.25 },
      { value: 'no', label: 'No - personal records', additionalHours: 0 },
    ]},
    { id: 'access', label: 'Site Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    { id: 'travelDistance', label: 'Distance from Belton', type: 'select', required: true, options: TRAVEL_DISTANCE },
  ],
  calculateHours: (v) => {
    let h = 3;
    const f = asBuiltSurvey.fields;
    h += getAdditionalHours(f[2].options, v.structureType);
    h += getAdditionalHours(f[3].options, v.complexity);
    h += getAdditionalHours(f[4].options, v.features);
    h += getAdditionalHours(f[5].options, v.permit);
    h *= getMultiplier(ACCESS_CONDITIONS, v.access);
    return Math.max(h, 2);
  },
};

// =============================================================================
// MORTGAGE SURVEY
// Base: 3 hours
// Typical range: $350 - $700
// =============================================================================
const mortgageSurvey: SurveyTypeConfig = {
  id: 'mortgage',
  name: 'Mortgage / Loan Survey',
  description: 'Required by lenders for property purchase or refinance. Shows boundaries, improvements, and easements.',
  baseHours: 3,
  minPrice: 350,
  fields: [
    PROPERTY_ADDRESS_FIELD,
    PROPERTY_COUNTY_FIELD,
    { id: 'propertyType', label: 'Property Type', type: 'select', required: true, options: [
      { value: 'residential', label: 'Single-Family', additionalHours: 0 },
      { value: 'condo', label: 'Condo', additionalHours: -0.75 },
      { value: 'townhouse', label: 'Townhouse', additionalHours: -0.5 },
      { value: 'multi_family', label: 'Multi-Family', additionalHours: 1 },
      { value: 'vacant', label: 'Vacant Lot', additionalHours: -0.5 },
      { value: 'rural', label: 'Rural/Acreage', additionalHours: 1.5 },
    ]},
    { id: 'acreage', label: 'Property Size', type: 'select', required: true, options: PROPERTY_SIZE },
    { id: 'corners', label: 'Property Corners', type: 'select', required: true, options: PROPERTY_CORNERS },
    { id: 'existingMonuments', label: 'Corner Markers', type: 'select', required: true, options: EXISTING_MONUMENTS },
    { id: 'existingSurvey', label: 'Previous Survey', type: 'select', required: true, options: EXISTING_SURVEY },
    { id: 'closingDate', label: 'Closing Timeline', type: 'select', required: true, options: [
      { value: 'flexible', label: '2+ weeks', additionalHours: 0 },
      { value: 'standard', label: '7-14 days', additionalHours: 0 },
      { value: 'soon', label: 'Within 7 days', additionalHours: 0 },
      { value: 'urgent', label: 'Under 5 days', additionalHours: 0 },
    ]},
    { id: 'access', label: 'Property Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    { id: 'travelDistance', label: 'Distance from Belton', type: 'select', required: true, options: TRAVEL_DISTANCE },
  ],
  calculateHours: (v) => {
    let h = 3;
    const f = mortgageSurvey.fields;
    h += getAdditionalHours(f[2].options, v.propertyType);
    h += getAdditionalHours(PROPERTY_SIZE, v.acreage);
    h += getAdditionalHours(PROPERTY_CORNERS, v.corners);
    h += getAdditionalHours(EXISTING_MONUMENTS, v.existingMonuments);
    h += getAdditionalHours(EXISTING_SURVEY, v.existingSurvey);
    h *= getMultiplier(ACCESS_CONDITIONS, v.access);
    return Math.max(h, 2.5);
  },
};

// =============================================================================
// EASEMENT SURVEY
// Base: 4 hours
// Typical range: $500 - $3,000+
// =============================================================================
const easementSurvey: SurveyTypeConfig = {
  id: 'easement',
  name: 'Route / Easement Survey',
  description: 'Surveys linear corridors for utilities, pipelines, or access. Creates legal descriptions across properties.',
  baseHours: 4,
  minPrice: 500,
  fields: [
    { id: 'startLocation', label: 'Starting Point', type: 'text', required: true, placeholder: 'Address or description' },
    { id: 'endLocation', label: 'Ending Point', type: 'text', required: true, placeholder: 'Address or description' },
    PROPERTY_COUNTY_FIELD,
    { id: 'easementType', label: 'Easement Type', type: 'select', required: true, options: [
      { value: 'access', label: 'Access/Driveway', additionalHours: 0 },
      { value: 'utility_overhead', label: 'Overhead Utility', additionalHours: -0.5 },
      { value: 'utility_underground', label: 'Underground Utility', additionalHours: 0.5 },
      { value: 'pipeline', label: 'Pipeline', additionalHours: 1 },
      { value: 'drainage', label: 'Drainage', additionalHours: 0.5 },
      { value: 'road', label: 'Road ROW', additionalHours: 1 },
    ]},
    { id: 'length', label: 'Route Length', type: 'select', required: true, options: [
      { value: '250', label: 'Under 250 feet', additionalHours: 0 },
      { value: '500', label: '250 - 500 feet', additionalHours: 1 },
      { value: '1000', label: '500 - 1,000 feet', additionalHours: 2 },
      { value: '2500', label: '1,000 - 2,500 feet', additionalHours: 4 },
      { value: '5000', label: '2,500 - 5,000 feet', additionalHours: 7 },
      { value: '10000', label: '1 - 2 miles', additionalHours: 12 },
    ]},
    { id: 'parcels', label: 'Properties Crossed', type: 'select', required: true, options: [
      { value: '1', label: '1 property', additionalHours: 0 },
      { value: '2', label: '2 properties', additionalHours: 1.5 },
      { value: '3', label: '3 properties', additionalHours: 2.5 },
      { value: '5', label: '4-5 properties', additionalHours: 4 },
      { value: '10', label: '6+ properties', additionalHours: 7 },
    ]},
    { id: 'vegetation', label: 'Vegetation', type: 'select', required: true, options: VEGETATION },
    { id: 'terrain', label: 'Terrain', type: 'select', required: true, options: TERRAIN },
    { id: 'waterCrossings', label: 'Water Crossings', type: 'select', required: false, options: [
      { value: 'none', label: 'None', additionalHours: 0 },
      { value: 'one', label: '1 crossing', additionalHours: 1 },
      { value: 'multiple', label: 'Multiple', additionalHours: 2.5 },
    ]},
    { id: 'legalDesc', label: 'Legal Description', type: 'select', required: true, options: [
      { value: 'no', label: 'Not needed', additionalHours: 0 },
      { value: 'simple', label: 'Single description', additionalHours: 0.75 },
      { value: 'multiple', label: 'Per parcel', additionalHours: 2 },
    ]},
    { id: 'access', label: 'Route Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    { id: 'travelDistance', label: 'Distance from Belton', type: 'select', required: true, options: TRAVEL_DISTANCE },
  ],
  calculateHours: (v) => {
    let h = 4;
    const f = easementSurvey.fields;
    h += getAdditionalHours(f[3].options, v.easementType);
    h += getAdditionalHours(f[4].options, v.length);
    h += getAdditionalHours(f[5].options, v.parcels);
    h += getAdditionalHours(f[8].options, v.waterCrossings);
    h += getAdditionalHours(f[9].options, v.legalDesc);
    
    h *= getMultiplier(VEGETATION, v.vegetation);
    h *= getMultiplier(TERRAIN, v.terrain);
    h *= getMultiplier(ACCESS_CONDITIONS, v.access);
    
    return h;
  },
};

// =============================================================================
// LEGAL DESCRIPTION
// Base: 2 hours
// Typical range: $250 - $600
// =============================================================================
const legalDescription: SurveyTypeConfig = {
  id: 'legal_description',
  name: 'Legal Description',
  description: 'Creates or verifies written legal descriptions for deeds, title documents, or easements.',
  baseHours: 2,
  minPrice: 250,
  fields: [
    PROPERTY_ADDRESS_FIELD,
    PROPERTY_COUNTY_FIELD,
    { id: 'type', label: 'Description Type', type: 'select', required: true, options: [
      { value: 'lot_block', label: 'Lot and Block', additionalHours: -0.75 },
      { value: 'metes_bounds', label: 'Metes and Bounds', additionalHours: 0 },
      { value: 'easement', label: 'Easement Description', additionalHours: 0.5 },
      { value: 'partial', label: 'Part of Larger Tract', additionalHours: 1 },
      { value: 'correction', label: 'Correction', additionalHours: -0.25 },
    ]},
    { id: 'fieldWork', label: 'Field Work Needed', type: 'select', required: true, options: [
      { value: 'none', label: 'From existing survey', additionalHours: 0 },
      { value: 'verification', label: 'Field verification', additionalHours: 1.5 },
      { value: 'full', label: 'Full field survey', additionalHours: 4 },
    ]},
    { id: 'acreage', label: 'Property Size', type: 'select', required: true, options: PROPERTY_SIZE },
    { id: 'corners', label: 'Number of Corners', type: 'select', required: true, options: PROPERTY_CORNERS },
    { id: 'existingSurvey', label: 'Existing Survey', type: 'select', required: true, options: EXISTING_SURVEY },
    { id: 'travelDistance', label: 'Distance from Belton', type: 'select', required: true, options: TRAVEL_DISTANCE },
  ],
  calculateHours: (v) => {
    let h = 2;
    const f = legalDescription.fields;
    h += getAdditionalHours(f[2].options, v.type);
    h += getAdditionalHours(f[3].options, v.fieldWork);
    
    // Only add size/corners if field work is needed
    if (v.fieldWork !== 'none') {
      h += getAdditionalHours(PROPERTY_SIZE, v.acreage) * 0.5;
      h += getAdditionalHours(PROPERTY_CORNERS, v.corners) * 0.5;
    }
    
    h += getAdditionalHours(EXISTING_SURVEY, v.existingSurvey) * 0.5;
    
    return Math.max(h, 1.25);
  },
};

// =============================================================================
// EXPORT ALL SURVEY TYPES
// =============================================================================
export const SURVEY_TYPES: SurveyTypeConfig[] = [
  boundarySurvey,
  altaSurvey,
  topoSurvey,
  elevationCert,
  constructionStaking,
  subdivisionPlat,
  asBuiltSurvey,
  mortgageSurvey,
  easementSurvey,
  legalDescription,
];