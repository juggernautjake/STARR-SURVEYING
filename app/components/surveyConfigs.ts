import {
  SurveyTypeConfig, FieldOption,
  FIELD_HOURLY_RATE, TRAVEL_COST_PER_MILE, PREP_HOURLY_RATE,
  MARKER_HOURS_PER_PIN, ATV_FEE_SMALL, ATV_FEE_LARGE, ATV_ACREAGE_THRESHOLD,
  PROPERTY_ADDRESS_FIELD, PROPERTY_COUNTY_FIELD, OTHER_COUNTY_FIELD,
  TRAVEL_DISTANCE_FIELD,
  PROPERTY_SIZE, PROPERTY_TYPE, PROPERTY_CORNERS,
  BOUNDARY_ACREAGE, BOUNDARY_CORNERS, BOUNDARY_PREVIOUS_SURVEY,
  BOUNDARY_FENCE_ISSUES, BOUNDARY_MARKERS_NEEDED,
  VEGETATION, TERRAIN,
  WATERWAY_BOUNDARY, EXISTING_SURVEY, EXISTING_MONUMENTS,
  ACCESS_CONDITIONS, ADJOINING,
  SURVEY_PURPOSE, CITY_SUBDIVISION_LOTS,
  HAS_RESIDENCE, RESIDENCE_CORNERS, RESIDENCE_SIZE, GARAGE,
  NUM_IMPROVEMENTS, IMPROVEMENT_TYPE,
  ADDITIONAL_RESIDENCE_CORNERS, ADDITIONAL_RESIDENCE_SIZE,
  getBaseCost, getMultiplier, getHours, getCostMultiplier,
  getCornerCount, isAdditionalResidence
} from './surveyCalculatorTypes';

// =============================================================================
// HELPER: Calculate improvements cost from dynamic improvement fields
// =============================================================================
function calculateImprovementsCost(values: Record<string, unknown>): number {
  let total = 0;
  const numImprovements = parseInt(values.numImprovements as string) || 0;
  for (let i = 1; i <= numImprovements; i++) {
    const improvementType = values[`improvement${i}Type`] as string;
    if (improvementType && improvementType !== 'none') {
      total += getBaseCost(IMPROVEMENT_TYPE, improvementType);
      if (isAdditionalResidence(improvementType)) {
        total += getBaseCost(ADDITIONAL_RESIDENCE_CORNERS, values[`improvement${i}Corners`]);
        total += getBaseCost(ADDITIONAL_RESIDENCE_SIZE, values[`improvement${i}Size`]);
      }
    }
  }
  return total;
}

// =============================================================================
// BOUNDARY SURVEY - Hours-based pricing model
// =============================================================================
//
// CALCULATION ORDER:
//   1. Acreage hours × $175/hr × vegetation × terrain  (scaled)
//   2. Corner hours × $175/hr                           (not scaled)
//   3. Improvements flat costs (residence, garage, other improvements)
//   4. Commercial 10% premium on (acreage + corners + improvements) ONLY
//   5. Base overhead ($475)
//   6. Previous survey hours × $130/hr (prep rate)
//   7. Property type extra hours × $175/hr (commercial rural +1.5 hrs)
//   8. Markers: count × 0.33 hrs × $175/hr
//   9. Flat add-ons: property type baseCost, fence, monuments, adjoining, purpose, lots
//  10. Travel: miles × $1.90
//  11. Access: tiered flat fee for 4WD/unknown ($75 < 60ac, $150 >= 60ac), baseCost for others
//  12. Waterway: ×1.20
// =============================================================================
const boundarySurvey: SurveyTypeConfig = {
  id: 'boundary',
  name: 'Boundary Survey',
  description: 'Establishes and marks property boundaries. For fences, disputes, permits, or property purchases.',
  basePrice: 475,
  minPrice: 400,
  fields: [
    PROPERTY_ADDRESS_FIELD,
    PROPERTY_COUNTY_FIELD,
    OTHER_COUNTY_FIELD,
    { id: 'propertyType', label: 'Property Type', type: 'select', required: true, options: PROPERTY_TYPE },
    { id: 'acreage', label: 'Property Size', type: 'select', required: true, options: BOUNDARY_ACREAGE },
    { id: 'corners', label: 'Number of Property Corners', type: 'select', required: true, options: BOUNDARY_CORNERS,
      helpText: 'Count all direction changes in the property boundary line' },
    { id: 'hasResidence', label: 'Does the property have a residence?', type: 'select', required: true, options: HAS_RESIDENCE,
      showWhen: { field: 'propertyType', value: ['residential_urban', 'residential_rural'] } },
    { id: 'residenceCorners', label: 'House Outside Corners', type: 'select', required: true, options: RESIDENCE_CORNERS,
      helpText: 'Count where exterior walls change direction (looking from above)',
      showWhen: { field: 'hasResidence', value: 'yes' } },
    { id: 'residenceSize', label: 'House Approximate Size', type: 'select', required: true, options: RESIDENCE_SIZE,
      showWhen: { field: 'hasResidence', value: 'yes' } },
    { id: 'garage', label: 'Garage', type: 'select', required: false, options: GARAGE,
      showWhen: { field: 'hasResidence', value: 'yes' } },
    { id: 'numImprovements', label: 'Number of Other Improvements', type: 'select', required: false, options: NUM_IMPROVEMENTS,
      helpText: 'Sheds, barns, pools, guest houses, workshops, etc.',
      showWhen: { field: 'propertyType', value: ['residential_urban', 'residential_rural', 'agricultural'] } },
    { id: 'vegetation', label: 'Vegetation', type: 'select', required: true, options: VEGETATION },
    { id: 'terrain', label: 'Terrain', type: 'select', required: true, options: TERRAIN },
    { id: 'waterwayBoundary', label: 'Does the property have a waterway boundary (river or creek)?', type: 'select', required: true, options: WATERWAY_BOUNDARY,
      helpText: 'If any boundary line follows a river, creek, or stream' },
    { id: 'existingSurvey', label: 'Previous Survey', type: 'select', required: true, options: BOUNDARY_PREVIOUS_SURVEY },
    { id: 'existingMonuments', label: 'Existing Corner Markers', type: 'select', required: true, options: EXISTING_MONUMENTS },
    { id: 'access', label: 'Property Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    { id: 'adjoining', label: 'Adjoining Properties', type: 'select', required: false, options: ADJOINING },
    { id: 'fenceIssues', label: 'Fence Issues', type: 'select', required: false, options: BOUNDARY_FENCE_ISSUES },
    { id: 'markersNeeded', label: 'New Markers Needed', type: 'select', required: false, options: BOUNDARY_MARKERS_NEEDED,
      helpText: '~0.33 hrs per marker; "Set all" scales with corner count' },
    { id: 'purpose', label: 'Purpose', type: 'select', required: true, options: SURVEY_PURPOSE },
    { id: 'subdivisionLots', label: 'Number of Lots', type: 'select', required: true, options: CITY_SUBDIVISION_LOTS,
      showWhen: { field: 'purpose', value: 'city_subdivision' } },
    TRAVEL_DISTANCE_FIELD,
  ],
  calculatePrice: (v) => {
    const RATE = FIELD_HOURLY_RATE;   // $175
    const PREP = PREP_HOURLY_RATE;    // $130

    // --- STEP 1: Acreage hours × field rate × veg × terrain ---
    const acreageHrs = getHours(BOUNDARY_ACREAGE, v.acreage);
    const vegMult = getMultiplier(VEGETATION, v.vegetation);
    const terrMult = getMultiplier(TERRAIN, v.terrain);
    const scaledAcreageCost = acreageHrs * RATE * vegMult * terrMult;

    // --- STEP 2: Corner hours × field rate (NOT scaled by veg/terrain) ---
    const cornerHrs = getHours(BOUNDARY_CORNERS, v.corners);
    const cornerCost = cornerHrs * RATE;

    // --- STEP 3: Improvements flat costs ---
    let improvementsCost = 0;
    if (v.hasResidence === 'yes') {
      improvementsCost += getBaseCost(RESIDENCE_CORNERS, v.residenceCorners);
      improvementsCost += getBaseCost(RESIDENCE_SIZE, v.residenceSize);
      improvementsCost += getBaseCost(GARAGE, v.garage);
    }
    improvementsCost += calculateImprovementsCost(v);

    // --- STEP 4: Commercial 10% premium on acreage + corners + improvements ONLY ---
    let premiumBase = scaledAcreageCost + cornerCost + improvementsCost;
    const isCommercial = v.propertyType === 'commercial_subdivision' || v.propertyType === 'commercial_rural';
    if (isCommercial) {
      premiumBase *= 1.10;
    }

    // --- STEP 5: Base overhead + premium base ---
    let total = 475 + premiumBase;

    // --- STEP 6: Previous survey hours × prep rate ($130/hr) ---
    const surveyHrs = getHours(BOUNDARY_PREVIOUS_SURVEY, v.existingSurvey);
    total += surveyHrs * PREP;

    // --- STEP 7: Property type extra hours × field rate ($175/hr) ---
    total += getHours(PROPERTY_TYPE, v.propertyType) * RATE;

    // --- STEP 8: Markers: 0.33 hrs per pin × field rate ---
    if (v.markersNeeded === 'all') {
      total += getCornerCount(v.corners) * MARKER_HOURS_PER_PIN * RATE;
    } else {
      total += getHours(BOUNDARY_MARKERS_NEEDED, v.markersNeeded) * RATE;
    }

    // --- STEP 9: Flat add-ons ---
    total += getBaseCost(PROPERTY_TYPE, v.propertyType);
    total += getBaseCost(BOUNDARY_FENCE_ISSUES, v.fenceIssues);
    total += getBaseCost(EXISTING_MONUMENTS, v.existingMonuments);
    total += getBaseCost(ADJOINING, v.adjoining);
    total += getBaseCost(SURVEY_PURPOSE, v.purpose);
    if (v.purpose === 'city_subdivision') {
      total += getBaseCost(CITY_SUBDIVISION_LOTS, v.subdivisionLots);
    }

    // --- STEP 10: Travel ---
    const miles = parseFloat(v.travelDistance as string) || 0;
    total += miles * TRAVEL_COST_PER_MILE;

    // --- STEP 11: Access - tiered flat fee for 4WD/unknown ---
    const accessValue = v.access as string;
    if (accessValue === '4wd' || accessValue === 'unknown') {
      const acreageValue = parseFloat(v.acreage as string) || 0;
      total += acreageValue >= ATV_ACREAGE_THRESHOLD ? ATV_FEE_LARGE : ATV_FEE_SMALL;
    } else {
      total += getBaseCost(ACCESS_CONDITIONS, v.access);
    }

    // --- STEP 12: Waterway (+20%) ---
    if (v.waterwayBoundary === 'yes') {
      total *= 1.20;
    }

    return Math.max(total, 400);
  },
  calculateHours: (v) => {
    let hours = 0;
    hours += getHours(BOUNDARY_ACREAGE, v.acreage);
    hours += getHours(BOUNDARY_CORNERS, v.corners);
    hours += getHours(BOUNDARY_PREVIOUS_SURVEY, v.existingSurvey);
    hours += getHours(PROPERTY_TYPE, v.propertyType);
    // Markers at 0.33 hrs per pin
    if (v.markersNeeded === 'all') {
      hours += getCornerCount(v.corners) * MARKER_HOURS_PER_PIN;
    } else {
      hours += getHours(BOUNDARY_MARKERS_NEEDED, v.markersNeeded);
    }
    return hours;
  },
};

// =============================================================================
// ALTA/NSPS SURVEY
// =============================================================================
const ALTA_PROPERTY_TYPE: FieldOption[] = [
  { value: 'office', label: 'Office Building', baseCost: 0 },
  { value: 'retail', label: 'Retail/Shopping', baseCost: 200 },
  { value: 'industrial', label: 'Industrial/Warehouse', baseCost: 100 },
  { value: 'multifamily', label: 'Multi-Family', baseCost: 400 },
  { value: 'mixed_use', label: 'Mixed-Use', baseCost: 600 },
  { value: 'vacant', label: 'Vacant Commercial', baseCost: -400 },
  { value: 'hospitality', label: 'Hotel/Hospitality', baseCost: 400 },
  { value: 'healthcare', label: 'Healthcare', baseCost: 600 },
];
const ALTA_ACREAGE: FieldOption[] = [
  { value: '0.5', label: 'Under 0.5 acres', baseCost: 0 },
  { value: '1', label: '0.5 - 1 acre', baseCost: 300 },
  { value: '2', label: '1 - 2 acres', baseCost: 600 },
  { value: '5', label: '2 - 5 acres', baseCost: 1000 },
  { value: '10', label: '5 - 10 acres', baseCost: 1600 },
  { value: '25', label: '10 - 25 acres', baseCost: 2500 },
  { value: '50', label: '25+ acres', baseCost: 4000 },
];
const ALTA_BUILDINGS: FieldOption[] = [
  { value: '0', label: 'No buildings', baseCost: 0 },
  { value: '1', label: '1 building', baseCost: 300 },
  { value: '2', label: '2 buildings', baseCost: 500 },
  { value: '3', label: '3-4 buildings', baseCost: 750 },
  { value: '5', label: '5+ buildings', baseCost: 1200 },
];
const ALTA_TABLE_A: FieldOption[] = [
  { value: 'minimal', label: 'Minimal (1-4)', baseCost: 0 },
  { value: 'standard', label: 'Standard (1-11)', baseCost: 500 },
  { value: 'comprehensive', label: 'Comprehensive (1-16)', baseCost: 800 },
  { value: 'full', label: 'Full (All 19)', baseCost: 1200 },
  { value: 'unknown', label: 'Unknown', baseCost: 600 },
];
const ALTA_UTILITIES: FieldOption[] = [
  { value: 'none', label: 'Surface only', baseCost: 0 },
  { value: 'basic', label: '811 locate', baseCost: 150 },
  { value: 'detailed', label: 'Detailed mapping', baseCost: 500 },
  { value: 'sue', label: 'SUE required', baseCost: 1500 },
];
const ALTA_FLOOD: FieldOption[] = [
  { value: 'none', label: 'Not required', baseCost: 0 },
  { value: 'determination', label: 'Zone determination', baseCost: 75 },
  { value: 'certification', label: 'With elevation', baseCost: 300 },
];

const altaSurvey: SurveyTypeConfig = {
  id: 'alta',
  name: 'ALTA/NSPS Land Title Survey',
  description: 'Comprehensive commercial survey meeting national standards. Required by lenders for commercial transactions.',
  basePrice: 2000,
  minPrice: 2000,
  fields: [
    PROPERTY_ADDRESS_FIELD, PROPERTY_COUNTY_FIELD, OTHER_COUNTY_FIELD,
    { id: 'propertyType', label: 'Property Type', type: 'select', required: true, options: ALTA_PROPERTY_TYPE },
    { id: 'acreage', label: 'Property Size', type: 'select', required: true, options: ALTA_ACREAGE },
    { id: 'buildings', label: 'Number of Buildings', type: 'select', required: true, options: ALTA_BUILDINGS },
    { id: 'tableA', label: 'Table A Items', type: 'select', required: true, helpText: 'Specified by lender/title company', options: ALTA_TABLE_A },
    { id: 'utilities', label: 'Utility Location', type: 'select', required: true, options: ALTA_UTILITIES },
    { id: 'floodCert', label: 'Flood Determination', type: 'select', required: true, options: ALTA_FLOOD },
    { id: 'access', label: 'Site Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    TRAVEL_DISTANCE_FIELD,
  ],
  calculatePrice: (v) => {
    let total = 2000;
    total += getBaseCost(ALTA_PROPERTY_TYPE, v.propertyType);
    total += getBaseCost(ALTA_ACREAGE, v.acreage);
    total += getBaseCost(ALTA_BUILDINGS, v.buildings);
    total += getBaseCost(ALTA_TABLE_A, v.tableA);
    total += getBaseCost(ALTA_UTILITIES, v.utilities);
    total += getBaseCost(ALTA_FLOOD, v.floodCert);
    total += getBaseCost(ACCESS_CONDITIONS, v.access);
    total += (parseFloat(v.travelDistance as string) || 0) * TRAVEL_COST_PER_MILE;
    total *= getCostMultiplier(ACCESS_CONDITIONS, v.access);
    return Math.max(total, 2000);
  },
};

// =============================================================================
// TOPOGRAPHIC SURVEY
// =============================================================================
const TOPO_PURPOSE: FieldOption[] = [
  { value: 'site_plan', label: 'Site Planning', baseCost: 0 },
  { value: 'drainage', label: 'Drainage Design', baseCost: 100 },
  { value: 'grading', label: 'Grading Plan', baseCost: 100 },
  { value: 'construction', label: 'Pre-Construction', baseCost: 100 },
  { value: 'flood', label: 'Floodplain Study', baseCost: 200 },
];
const TOPO_ACREAGE: FieldOption[] = [
  { value: '0.25', label: 'Under 0.25 acres', baseCost: 0 },
  { value: '0.5', label: '0.25 - 0.5 acres', baseCost: 150 },
  { value: '1', label: '0.5 - 1 acre', baseCost: 350 },
  { value: '2', label: '1 - 2 acres', baseCost: 650 },
  { value: '5', label: '2 - 5 acres', baseCost: 1200 },
  { value: '10', label: '5 - 10 acres', baseCost: 2000 },
  { value: '20', label: '10+ acres', baseCost: 3500 },
];
const TOPO_CONTOUR: FieldOption[] = [
  { value: '5', label: '5-foot (general)', hoursMultiplier: 1.0 },
  { value: '2', label: '2-foot (standard)', hoursMultiplier: 1.15 },
  { value: '1', label: '1-foot (high detail)', hoursMultiplier: 1.35 },
  { value: '0.5', label: '6-inch (precision)', hoursMultiplier: 1.6 },
];
const TOPO_FEATURES: FieldOption[] = [
  { value: 'basic', label: 'Contours only', baseCost: 0 },
  { value: 'standard', label: 'Contours + buildings + trees', baseCost: 250 },
  { value: 'detailed', label: 'All improvements', baseCost: 500 },
  { value: 'comprehensive', label: 'With utilities', baseCost: 800 },
];
const TOPO_BENCHMARK: FieldOption[] = [
  { value: 'assumed', label: 'Assumed (relative)', baseCost: 0 },
  { value: 'local', label: 'Local benchmark', baseCost: 75 },
  { value: 'navd88', label: 'NAVD88', baseCost: 150 },
];
const TOPO_BOUNDARY: FieldOption[] = [
  { value: 'no', label: 'No - have current', baseCost: 0 },
  { value: 'yes', label: 'Yes - include', baseCost: 400 },
];

const topoSurvey: SurveyTypeConfig = {
  id: 'topographic',
  name: 'Topographic Survey',
  description: 'Maps contours, elevations, and features. Essential for site planning, drainage, and construction.',
  basePrice: 500,
  minPrice: 500,
  fields: [
    PROPERTY_ADDRESS_FIELD, PROPERTY_COUNTY_FIELD, OTHER_COUNTY_FIELD,
    { id: 'purpose', label: 'Purpose', type: 'select', required: true, options: TOPO_PURPOSE },
    { id: 'acreage', label: 'Area to Survey', type: 'select', required: true, options: TOPO_ACREAGE },
    { id: 'contourInterval', label: 'Contour Interval', type: 'select', required: true, helpText: 'Smaller = more detail', options: TOPO_CONTOUR },
    { id: 'features', label: 'Features to Map', type: 'select', required: true, options: TOPO_FEATURES },
    { id: 'vegetation', label: 'Vegetation', type: 'select', required: true, options: VEGETATION },
    { id: 'terrain', label: 'Terrain', type: 'select', required: true, options: TERRAIN },
    { id: 'benchmark', label: 'Vertical Datum', type: 'select', required: true, options: TOPO_BENCHMARK },
    { id: 'boundary', label: 'Include Boundary', type: 'select', required: false, options: TOPO_BOUNDARY },
    { id: 'access', label: 'Site Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    TRAVEL_DISTANCE_FIELD,
  ],
  calculatePrice: (v) => {
    let sizeBase = 500 + getBaseCost(TOPO_ACREAGE, v.acreage);
    sizeBase *= getMultiplier(TOPO_CONTOUR, v.contourInterval) * getMultiplier(VEGETATION, v.vegetation) * getMultiplier(TERRAIN, v.terrain);
    let addOns = 0;
    addOns += getBaseCost(TOPO_PURPOSE, v.purpose);
    addOns += getBaseCost(TOPO_FEATURES, v.features);
    addOns += getBaseCost(TOPO_BENCHMARK, v.benchmark);
    addOns += getBaseCost(TOPO_BOUNDARY, v.boundary);
    addOns += getBaseCost(ACCESS_CONDITIONS, v.access);
    addOns += (parseFloat(v.travelDistance as string) || 0) * TRAVEL_COST_PER_MILE;
    let total = sizeBase + addOns;
    total *= getCostMultiplier(ACCESS_CONDITIONS, v.access);
    return Math.max(total, 500);
  },
};

// =============================================================================
// ELEVATION CERTIFICATE
// =============================================================================
const ELEV_BUILDING: FieldOption[] = [
  { value: 'single_family', label: 'Single-Family Home', baseCost: 0 },
  { value: 'duplex', label: 'Duplex', baseCost: 75 },
  { value: 'townhouse', label: 'Townhouse', baseCost: 50 },
  { value: 'mobile', label: 'Mobile Home', baseCost: -50 },
  { value: 'multi_family', label: 'Multi-Family', baseCost: 150 },
  { value: 'commercial', label: 'Commercial', baseCost: 125 },
];
const ELEV_ZONE: FieldOption[] = [
  { value: 'x', label: 'Zone X (minimal risk)', baseCost: -50 },
  { value: 'x500', label: 'Zone X shaded (500-year)', baseCost: 0 },
  { value: 'a', label: 'Zone A (no BFE)', baseCost: 75 },
  { value: 'ae', label: 'Zone AE (with BFE)', baseCost: 0 },
  { value: 'ao', label: 'Zone AO (sheet flow)', baseCost: 75 },
  { value: 'unknown', label: 'Unknown', baseCost: 50 },
];
const ELEV_PURPOSE: FieldOption[] = [
  { value: 'insurance', label: 'Flood Insurance', baseCost: 0 },
  { value: 'loma', label: 'LOMA Application', baseCost: 150 },
  { value: 'lomr_f', label: 'LOMR-F Application', baseCost: 225 },
  { value: 'construction', label: 'New Construction', baseCost: 50 },
  { value: 'sale', label: 'Property Sale', baseCost: 0 },
];
const ELEV_BASEMENT: FieldOption[] = [
  { value: 'none', label: 'None', baseCost: 0 },
  { value: 'crawl', label: 'Crawl space', baseCost: 50 },
  { value: 'basement', label: 'Full basement', baseCost: 75 },
  { value: 'walkout', label: 'Walkout basement', baseCost: 100 },
];
const ELEV_ADDITIONS: FieldOption[] = [
  { value: 'none', label: 'Original only', baseCost: 0 },
  { value: 'one', label: 'One addition', baseCost: 50 },
  { value: 'multiple', label: 'Multiple additions', baseCost: 100 },
];

const elevationCert: SurveyTypeConfig = {
  id: 'elevation',
  name: 'Elevation Certificate (FEMA)',
  description: 'Official FEMA form for flood insurance, LOMA applications, or proving structure is above flood level.',
  basePrice: 350,
  minPrice: 350,
  fields: [
    PROPERTY_ADDRESS_FIELD, PROPERTY_COUNTY_FIELD, OTHER_COUNTY_FIELD,
    { id: 'buildingType', label: 'Building Type', type: 'select', required: true, options: ELEV_BUILDING },
    { id: 'floodZone', label: 'Flood Zone', type: 'select', required: true, helpText: 'Check policy or FEMA map', options: ELEV_ZONE },
    { id: 'purpose', label: 'Purpose', type: 'select', required: true, options: ELEV_PURPOSE },
    { id: 'basement', label: 'Basement/Below Area', type: 'select', required: true, options: ELEV_BASEMENT },
    { id: 'additions', label: 'Building Additions', type: 'select', required: false, options: ELEV_ADDITIONS },
    { id: 'access', label: 'Property Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    TRAVEL_DISTANCE_FIELD,
  ],
  calculatePrice: (v) => {
    let total = 350;
    total += getBaseCost(ELEV_BUILDING, v.buildingType);
    total += getBaseCost(ELEV_ZONE, v.floodZone);
    total += getBaseCost(ELEV_PURPOSE, v.purpose);
    total += getBaseCost(ELEV_BASEMENT, v.basement);
    total += getBaseCost(ELEV_ADDITIONS, v.additions);
    total += getBaseCost(ACCESS_CONDITIONS, v.access);
    total += (parseFloat(v.travelDistance as string) || 0) * TRAVEL_COST_PER_MILE;
    total *= getCostMultiplier(ACCESS_CONDITIONS, v.access);
    return Math.max(total, 350);
  },
};

// =============================================================================
// CONSTRUCTION STAKING
// =============================================================================
const CS_PROJECT: FieldOption[] = [
  { value: 'residential', label: 'New Home', baseCost: 0 },
  { value: 'addition', label: 'Home Addition', baseCost: -75 },
  { value: 'commercial', label: 'Commercial Building', baseCost: 300 },
  { value: 'road', label: 'Road/Driveway', baseCost: 150 },
  { value: 'fence', label: 'Fence Line', baseCost: -75 },
  { value: 'septic', label: 'Septic System', baseCost: 0 },
  { value: 'pool', label: 'Swimming Pool', baseCost: -50 },
];
const CS_STAKING: FieldOption[] = [
  { value: 'corners', label: 'Corners only', baseCost: 0 },
  { value: 'offset', label: 'Offset stakes', baseCost: 75 },
  { value: 'grades', label: 'Grade stakes', baseCost: 200 },
  { value: 'full', label: 'Complete layout', baseCost: 350 },
];
const CS_POINTS: FieldOption[] = [
  { value: '10', label: '4-10 points', baseCost: 0 },
  { value: '25', label: '11-25 points', baseCost: 150 },
  { value: '50', label: '26-50 points', baseCost: 350 },
  { value: '100', label: '50+ points', baseCost: 700 },
];
const CS_PLANS: FieldOption[] = [
  { value: 'digital', label: 'Digital CAD', baseCost: 0 },
  { value: 'pdf', label: 'PDF plans', baseCost: 50 },
  { value: 'paper', label: 'Paper only', baseCost: 75 },
  { value: 'none', label: 'No plans', baseCost: 200 },
];
const CS_VISITS: FieldOption[] = [
  { value: 'single', label: 'Single visit', hoursMultiplier: 1.0 },
  { value: 'two', label: 'Two visits', hoursMultiplier: 1.75 },
  { value: 'multiple', label: 'Multiple visits', hoursMultiplier: 2.5 },
];

const constructionStaking: SurveyTypeConfig = {
  id: 'construction',
  name: 'Construction Staking / Layout',
  description: 'Precise positioning of stakes for construction. Ensures correct building locations per approved plans.',
  basePrice: 300,
  minPrice: 300,
  fields: [
    PROPERTY_ADDRESS_FIELD, PROPERTY_COUNTY_FIELD, OTHER_COUNTY_FIELD,
    { id: 'projectType', label: 'Project Type', type: 'select', required: true, options: CS_PROJECT },
    { id: 'stakingType', label: 'Staking Type', type: 'select', required: true, options: CS_STAKING },
    { id: 'points', label: 'Number of Points', type: 'select', required: true, options: CS_POINTS },
    { id: 'plans', label: 'Plans Available', type: 'select', required: true, options: CS_PLANS },
    { id: 'visits', label: 'Site Visits', type: 'select', required: true, options: CS_VISITS },
    { id: 'terrain', label: 'Terrain', type: 'select', required: true, options: TERRAIN },
    { id: 'access', label: 'Site Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    TRAVEL_DISTANCE_FIELD,
  ],
  calculatePrice: (v) => {
    let base = 300;
    base += getBaseCost(CS_PROJECT, v.projectType);
    base += getBaseCost(CS_STAKING, v.stakingType);
    base += getBaseCost(CS_POINTS, v.points);
    base += getBaseCost(CS_PLANS, v.plans);
    base *= getMultiplier(CS_VISITS, v.visits) * getMultiplier(TERRAIN, v.terrain);
    base += getBaseCost(ACCESS_CONDITIONS, v.access);
    base += (parseFloat(v.travelDistance as string) || 0) * TRAVEL_COST_PER_MILE;
    base *= getCostMultiplier(ACCESS_CONDITIONS, v.access);
    return Math.max(base, 300);
  },
};

// =============================================================================
// SUBDIVISION PLATTING
// =============================================================================
const SUB_ACREAGE: FieldOption[] = [
  { value: '5', label: 'Under 5 acres', baseCost: 0 },
  { value: '10', label: '5 - 10 acres', baseCost: 500 },
  { value: '25', label: '10 - 25 acres', baseCost: 1000 },
  { value: '50', label: '25 - 50 acres', baseCost: 1750 },
  { value: '100', label: '50 - 100 acres', baseCost: 2750 },
  { value: '200', label: '100+ acres', baseCost: 4500 },
];
const SUB_LOTS: FieldOption[] = [
  { value: '2', label: '2 lots (simple split)', baseCost: -750 },
  { value: '3', label: '3 lots', baseCost: -400 },
  { value: '5', label: '4 - 6 lots', baseCost: 0 },
  { value: '10', label: '7 - 12 lots', baseCost: 700 },
  { value: '25', label: '13 - 25 lots', baseCost: 1750 },
  { value: '50', label: '26+ lots', baseCost: 3500 },
];
const SUB_ROADS: FieldOption[] = [
  { value: 'none', label: 'No new roads', baseCost: 0 },
  { value: 'simple', label: 'One simple road', baseCost: 700 },
  { value: 'moderate', label: '2-3 roads', baseCost: 1400 },
  { value: 'complex', label: 'Complex with cul-de-sacs', baseCost: 2100 },
];
const SUB_DRAINAGE: FieldOption[] = [
  { value: 'simple', label: 'Natural drainage', baseCost: 0 },
  { value: 'easements', label: 'Drainage easements', baseCost: 500 },
  { value: 'detention', label: 'Detention required', baseCost: 1000 },
];
const SUB_JURISDICTION: FieldOption[] = [
  { value: 'county', label: 'County only', baseCost: 0 },
  { value: 'etj', label: 'City ETJ', baseCost: 350 },
  { value: 'city', label: 'City limits', baseCost: 850 },
];
const SUB_FLOODPLAIN: FieldOption[] = [
  { value: 'none', label: 'No floodplain', baseCost: 0 },
  { value: 'minor', label: 'Minor (edge)', baseCost: 500 },
  { value: 'significant', label: 'Significant', baseCost: 1000 },
  { value: 'major', label: 'Major impact', baseCost: 1750 },
];

const subdivisionPlat: SurveyTypeConfig = {
  id: 'subdivision',
  name: 'Subdivision Platting',
  description: 'Divides land into multiple lots with streets and easements. Creates recorded plat for individual lot sales.',
  basePrice: 2500,
  minPrice: 2500,
  fields: [
    PROPERTY_ADDRESS_FIELD, PROPERTY_COUNTY_FIELD, OTHER_COUNTY_FIELD,
    { id: 'acreage', label: 'Total Tract Size', type: 'select', required: true, options: SUB_ACREAGE },
    { id: 'lots', label: 'Number of Lots', type: 'select', required: true, options: SUB_LOTS },
    { id: 'roads', label: 'Road Layout', type: 'select', required: true, options: SUB_ROADS },
    { id: 'drainage', label: 'Drainage', type: 'select', required: true, options: SUB_DRAINAGE },
    { id: 'jurisdiction', label: 'Jurisdiction', type: 'select', required: true, options: SUB_JURISDICTION },
    { id: 'vegetation', label: 'Vegetation', type: 'select', required: true, options: VEGETATION },
    { id: 'terrain', label: 'Terrain', type: 'select', required: true, options: TERRAIN },
    { id: 'floodplain', label: 'Floodplain', type: 'select', required: true, options: SUB_FLOODPLAIN },
    { id: 'existingSurvey', label: 'Parent Tract Survey', type: 'select', required: true, options: EXISTING_SURVEY },
    TRAVEL_DISTANCE_FIELD,
  ],
  calculatePrice: (v) => {
    let sizeBase = 2500 + getBaseCost(SUB_ACREAGE, v.acreage);
    sizeBase *= getMultiplier(VEGETATION, v.vegetation) * getMultiplier(TERRAIN, v.terrain);
    let addOns = 0;
    addOns += getBaseCost(SUB_LOTS, v.lots);
    addOns += getBaseCost(SUB_ROADS, v.roads);
    addOns += getBaseCost(SUB_DRAINAGE, v.drainage);
    addOns += getBaseCost(SUB_JURISDICTION, v.jurisdiction);
    addOns += getBaseCost(SUB_FLOODPLAIN, v.floodplain);
    addOns += getBaseCost(EXISTING_SURVEY, v.existingSurvey);
    addOns += (parseFloat(v.travelDistance as string) || 0) * TRAVEL_COST_PER_MILE;
    return Math.max(sizeBase + addOns, 2500);
  },
};

// =============================================================================
// AS-BUILT SURVEY
// =============================================================================
const AB_STRUCTURE: FieldOption[] = [
  { value: 'residential', label: 'New Home', baseCost: 0 },
  { value: 'addition', label: 'Addition', baseCost: -75 },
  { value: 'commercial', label: 'Commercial', baseCost: 300 },
  { value: 'accessory', label: 'Garage/Barn/Shop', baseCost: -100 },
  { value: 'pool', label: 'Pool', baseCost: -125 },
  { value: 'foundation', label: 'Foundation Only', baseCost: -75 },
];
const AB_COMPLEXITY: FieldOption[] = [
  { value: 'simple', label: 'Simple rectangular', baseCost: 0 },
  { value: 'moderate', label: 'L-shape or offsets', baseCost: 75 },
  { value: 'complex', label: 'Complex footprint', baseCost: 150 },
  { value: 'very_complex', label: 'Multiple buildings', baseCost: 300 },
];
const AB_FEATURES: FieldOption[] = [
  { value: 'building', label: 'Building + setbacks only', baseCost: 0 },
  { value: 'improvements', label: '+ drives + walks', baseCost: 100 },
  { value: 'full', label: 'All improvements', baseCost: 225 },
  { value: 'comprehensive', label: 'With elevations', baseCost: 375 },
];
const AB_PERMIT: FieldOption[] = [
  { value: 'yes', label: 'Yes - permit required', baseCost: 50 },
  { value: 'no', label: 'No - personal records', baseCost: 0 },
];

const asBuiltSurvey: SurveyTypeConfig = {
  id: 'asbuilt',
  name: 'As-Built Survey',
  description: 'Documents completed construction location. Verifies structures meet approved plans and setbacks.',
  basePrice: 400,
  minPrice: 400,
  fields: [
    PROPERTY_ADDRESS_FIELD, PROPERTY_COUNTY_FIELD, OTHER_COUNTY_FIELD,
    { id: 'structureType', label: 'Structure Type', type: 'select', required: true, options: AB_STRUCTURE },
    { id: 'complexity', label: 'Complexity', type: 'select', required: true, options: AB_COMPLEXITY },
    { id: 'features', label: 'Features to Document', type: 'select', required: true, options: AB_FEATURES },
    { id: 'permit', label: 'For Permit/CO', type: 'select', required: true, options: AB_PERMIT },
    { id: 'access', label: 'Site Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    TRAVEL_DISTANCE_FIELD,
  ],
  calculatePrice: (v) => {
    let total = 400;
    total += getBaseCost(AB_STRUCTURE, v.structureType);
    total += getBaseCost(AB_COMPLEXITY, v.complexity);
    total += getBaseCost(AB_FEATURES, v.features);
    total += getBaseCost(AB_PERMIT, v.permit);
    total += getBaseCost(ACCESS_CONDITIONS, v.access);
    total += (parseFloat(v.travelDistance as string) || 0) * TRAVEL_COST_PER_MILE;
    total *= getCostMultiplier(ACCESS_CONDITIONS, v.access);
    return Math.max(total, 400);
  },
};

// =============================================================================
// MORTGAGE SURVEY
// =============================================================================
const MORT_TYPE: FieldOption[] = [
  { value: 'residential', label: 'Single-Family', baseCost: 0 },
  { value: 'condo', label: 'Condo', baseCost: -100 },
  { value: 'townhouse', label: 'Townhouse', baseCost: -75 },
  { value: 'multi_family', label: 'Multi-Family', baseCost: 150 },
  { value: 'vacant', label: 'Vacant Lot', baseCost: -75 },
  { value: 'rural', label: 'Rural/Acreage', baseCost: 200 },
];

const mortgageSurvey: SurveyTypeConfig = {
  id: 'mortgage',
  name: 'Mortgage / Loan Survey',
  description: 'Required by lenders for property purchase or refinance. Shows boundaries, improvements, and easements.',
  basePrice: 350,
  minPrice: 350,
  fields: [
    PROPERTY_ADDRESS_FIELD, PROPERTY_COUNTY_FIELD, OTHER_COUNTY_FIELD,
    { id: 'propertyType', label: 'Property Type', type: 'select', required: true, options: MORT_TYPE },
    { id: 'acreage', label: 'Property Size', type: 'select', required: true, options: PROPERTY_SIZE },
    { id: 'corners', label: 'Property Corners', type: 'select', required: true, options: PROPERTY_CORNERS },
    { id: 'existingMonuments', label: 'Corner Markers', type: 'select', required: true, options: EXISTING_MONUMENTS },
    { id: 'existingSurvey', label: 'Previous Survey', type: 'select', required: true, options: EXISTING_SURVEY },
    { id: 'closingDate', label: 'Closing Timeline', type: 'select', required: true, options: [
      { value: 'flexible', label: '2+ weeks', baseCost: 0 },
      { value: 'standard', label: '7-14 days', baseCost: 0 },
      { value: 'soon', label: 'Within 7 days', baseCost: 0 },
      { value: 'urgent', label: 'Under 5 days', baseCost: 0 },
    ]},
    { id: 'access', label: 'Property Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    TRAVEL_DISTANCE_FIELD,
  ],
  calculatePrice: (v) => {
    let total = 350;
    total += getBaseCost(MORT_TYPE, v.propertyType);
    total += getBaseCost(PROPERTY_SIZE, v.acreage);
    total += getBaseCost(PROPERTY_CORNERS, v.corners);
    total += getBaseCost(EXISTING_MONUMENTS, v.existingMonuments);
    total += getBaseCost(EXISTING_SURVEY, v.existingSurvey);
    total += getBaseCost(ACCESS_CONDITIONS, v.access);
    total += (parseFloat(v.travelDistance as string) || 0) * TRAVEL_COST_PER_MILE;
    total *= getCostMultiplier(ACCESS_CONDITIONS, v.access);
    return Math.max(total, 350);
  },
};

// =============================================================================
// EASEMENT SURVEY
// =============================================================================
const EASE_TYPE: FieldOption[] = [
  { value: 'access', label: 'Access/Driveway', baseCost: 0 },
  { value: 'utility_overhead', label: 'Overhead Utility', baseCost: -75 },
  { value: 'utility_underground', label: 'Underground Utility', baseCost: 75 },
  { value: 'pipeline', label: 'Pipeline', baseCost: 150 },
  { value: 'drainage', label: 'Drainage', baseCost: 75 },
  { value: 'road', label: 'Road ROW', baseCost: 150 },
];
const EASE_LENGTH: FieldOption[] = [
  { value: '250', label: 'Under 250 feet', baseCost: 0 },
  { value: '500', label: '250 - 500 feet', baseCost: 150 },
  { value: '1000', label: '500 - 1,000 feet', baseCost: 300 },
  { value: '2500', label: '1,000 - 2,500 feet', baseCost: 600 },
  { value: '5000', label: '2,500 - 5,000 feet', baseCost: 1100 },
  { value: '10000', label: '1 - 2 miles', baseCost: 1900 },
];
const EASE_PARCELS: FieldOption[] = [
  { value: '1', label: '1 property', baseCost: 0 },
  { value: '2', label: '2 properties', baseCost: 225 },
  { value: '3', label: '3 properties', baseCost: 400 },
  { value: '5', label: '4-5 properties', baseCost: 625 },
  { value: '10', label: '6+ properties', baseCost: 1100 },
];
const EASE_WATER: FieldOption[] = [
  { value: 'none', label: 'None', baseCost: 0 },
  { value: 'one', label: '1 crossing', baseCost: 150 },
  { value: 'multiple', label: 'Multiple', baseCost: 375 },
];
const EASE_LEGAL: FieldOption[] = [
  { value: 'no', label: 'Not needed', baseCost: 0 },
  { value: 'simple', label: 'Single description', baseCost: 125 },
  { value: 'multiple', label: 'Per parcel', baseCost: 300 },
];

const easementSurvey: SurveyTypeConfig = {
  id: 'easement',
  name: 'Route / Easement Survey',
  description: 'Surveys linear corridors for utilities, pipelines, or access. Creates legal descriptions across properties.',
  basePrice: 500,
  minPrice: 500,
  fields: [
    { id: 'startLocation', label: 'Starting Point', type: 'text', required: true, placeholder: 'Address or description' },
    { id: 'endLocation', label: 'Ending Point', type: 'text', required: true, placeholder: 'Address or description' },
    PROPERTY_COUNTY_FIELD, OTHER_COUNTY_FIELD,
    { id: 'easementType', label: 'Easement Type', type: 'select', required: true, options: EASE_TYPE },
    { id: 'length', label: 'Route Length', type: 'select', required: true, options: EASE_LENGTH },
    { id: 'parcels', label: 'Properties Crossed', type: 'select', required: true, options: EASE_PARCELS },
    { id: 'vegetation', label: 'Vegetation', type: 'select', required: true, options: VEGETATION },
    { id: 'terrain', label: 'Terrain', type: 'select', required: true, options: TERRAIN },
    { id: 'waterCrossings', label: 'Water Crossings', type: 'select', required: false, options: EASE_WATER },
    { id: 'legalDesc', label: 'Legal Description', type: 'select', required: true, options: EASE_LEGAL },
    { id: 'access', label: 'Route Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    TRAVEL_DISTANCE_FIELD,
  ],
  calculatePrice: (v) => {
    let lengthBase = 500 + getBaseCost(EASE_LENGTH, v.length);
    lengthBase *= getMultiplier(VEGETATION, v.vegetation) * getMultiplier(TERRAIN, v.terrain);
    let addOns = 0;
    addOns += getBaseCost(EASE_TYPE, v.easementType);
    addOns += getBaseCost(EASE_PARCELS, v.parcels);
    addOns += getBaseCost(EASE_WATER, v.waterCrossings);
    addOns += getBaseCost(EASE_LEGAL, v.legalDesc);
    addOns += getBaseCost(ACCESS_CONDITIONS, v.access);
    addOns += (parseFloat(v.travelDistance as string) || 0) * TRAVEL_COST_PER_MILE;
    let total = lengthBase + addOns;
    total *= getCostMultiplier(ACCESS_CONDITIONS, v.access);
    return Math.max(total, 500);
  },
};

// =============================================================================
// LEGAL DESCRIPTION
// =============================================================================
const LD_TYPE: FieldOption[] = [
  { value: 'lot_block', label: 'Lot and Block', baseCost: -100 },
  { value: 'metes_bounds', label: 'Metes and Bounds', baseCost: 0 },
  { value: 'easement', label: 'Easement Description', baseCost: 75 },
  { value: 'partial', label: 'Part of Larger Tract', baseCost: 150 },
  { value: 'correction', label: 'Correction', baseCost: -50 },
];
const LD_FIELDWORK: FieldOption[] = [
  { value: 'none', label: 'From existing survey', baseCost: 0 },
  { value: 'verification', label: 'Field verification', baseCost: 225 },
  { value: 'full', label: 'Full field survey', baseCost: 600 },
];

const legalDescription: SurveyTypeConfig = {
  id: 'legal_description',
  name: 'Legal Description',
  description: 'Creates or verifies written legal descriptions for deeds, title documents, or easements.',
  basePrice: 250,
  minPrice: 250,
  fields: [
    PROPERTY_ADDRESS_FIELD, PROPERTY_COUNTY_FIELD, OTHER_COUNTY_FIELD,
    { id: 'type', label: 'Description Type', type: 'select', required: true, options: LD_TYPE },
    { id: 'fieldWork', label: 'Field Work Needed', type: 'select', required: true, options: LD_FIELDWORK },
    { id: 'acreage', label: 'Property Size', type: 'select', required: true, options: PROPERTY_SIZE,
      showWhen: { field: 'fieldWork', value: ['verification', 'full'] } },
    { id: 'corners', label: 'Number of Corners', type: 'select', required: true, options: PROPERTY_CORNERS,
      showWhen: { field: 'fieldWork', value: ['verification', 'full'] } },
    { id: 'existingSurvey', label: 'Existing Survey', type: 'select', required: true, options: EXISTING_SURVEY },
    TRAVEL_DISTANCE_FIELD,
  ],
  calculatePrice: (v) => {
    let total = 250;
    total += getBaseCost(LD_TYPE, v.type);
    total += getBaseCost(LD_FIELDWORK, v.fieldWork);
    if (v.fieldWork === 'verification' || v.fieldWork === 'full') {
      total += getBaseCost(PROPERTY_SIZE, v.acreage) * 0.5;
      total += getBaseCost(PROPERTY_CORNERS, v.corners) * 0.5;
    }
    total += getBaseCost(EXISTING_SURVEY, v.existingSurvey) * 0.5;
    total += (parseFloat(v.travelDistance as string) || 0) * TRAVEL_COST_PER_MILE;
    return Math.max(total, 250);
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