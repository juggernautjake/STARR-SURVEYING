// app/components/surveyConfigs.ts
import {
  SurveyTypeConfig,
  PROPERTY_ADDRESS_FIELD, PROPERTY_COUNTY_FIELD, CUSTOM_COUNTY_FIELD,
  PROPERTY_SIZE, PROPERTY_TYPE, PROPERTY_CORNERS, VEGETATION, TERRAIN,
  WATERWAY_BOUNDARY, EXISTING_SURVEY, EXISTING_MONUMENTS,
  ACCESS_CONDITIONS, ADJOINING,
  FENCE_ISSUES, SURVEY_PURPOSE, LOT_COUNT,
  HAS_RESIDENCE, RESIDENCE_CORNERS, RESIDENCE_SIZE, GARAGE,
  NUM_IMPROVEMENTS, IMPROVEMENT_TYPE,
  ADDITIONAL_RESIDENCE_CORNERS, ADDITIONAL_RESIDENCE_SIZE,
  getBaseCost, getMultiplier, getHoursAdded, getPremium, isAdditionalResidence,
  HOURLY_RATE,
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
      // Add base cost for the improvement type
      total += getBaseCost(IMPROVEMENT_TYPE, improvementType);
      
      // If it's an additional residence, add corners and size costs
      if (isAdditionalResidence(improvementType)) {
        total += getBaseCost(ADDITIONAL_RESIDENCE_CORNERS, values[`improvement${i}Corners`]);
        total += getBaseCost(ADDITIONAL_RESIDENCE_SIZE, values[`improvement${i}Size`]);
      }
    }
  }
  
  return total;
}

// =============================================================================
// TRAVEL MILES FIELD (NEW)
// =============================================================================
const TRAVEL_MILES_FIELD: FormField = {
  id: 'travelDistance',
  label: 'Approximate Miles from Belton',
  type: 'number',
  required: true,
  min: 0,
  placeholder: 'Enter miles',
  helpText: 'Used for travel cost calculation ($1.50 per mile)',
};

// =============================================================================
// BOUNDARY SURVEY (RESTRUCTURED TO HOURLY)
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
    CUSTOM_COUNTY_FIELD,
    
    // Property characteristics
    { id: 'propertyType', label: 'Property Type', type: 'select', required: true, options: PROPERTY_TYPE },
    { id: 'acreage', label: 'Property Size', type: 'select', required: true, options: PROPERTY_SIZE },
    { id: 'corners', label: 'Number of Property Corners', type: 'select', required: true, options: PROPERTY_CORNERS,
      helpText: 'Count all direction changes in the property boundary line' },
    
    // === RESIDENTIAL STRUCTURE SECTION (conditional) ===
    { id: 'hasResidence', label: 'Does the property have a residence?', type: 'select', required: true, options: HAS_RESIDENCE,
      showWhen: { field: 'propertyType', value: ['residential_urban', 'residential_rural'] } },
    
    // Residence details (shown only if hasResidence = 'yes')
    { id: 'residenceCorners', label: 'House Outside Corners', type: 'select', required: true, options: RESIDENCE_CORNERS,
      helpText: 'Count where exterior walls change direction (looking from above)',
      showWhen: { field: 'hasResidence', value: 'yes' } },
    { id: 'residenceSize', label: 'House Approximate Size', type: 'select', required: true, options: RESIDENCE_SIZE,
      showWhen: { field: 'hasResidence', value: 'yes' } },
    { id: 'garage', label: 'Garage', type: 'select', required: false, options: GARAGE,
      showWhen: { field: 'hasResidence', value: 'yes' } },
    
    // Number of other improvements (dynamic)
    { id: 'numImprovements', label: 'Number of Other Improvements', type: 'select', required: false, options: NUM_IMPROVEMENTS,
      helpText: 'Sheds, barns, pools, guest houses, workshops, etc.',
      showWhen: { field: 'propertyType', value: ['residential_urban', 'residential_rural', 'agricultural'] } },
    
    // Site conditions (SCALING FACTORS - affect property size cost)
    { id: 'vegetation', label: 'Vegetation', type: 'select', required: true, options: VEGETATION },
    { id: 'terrain', label: 'Terrain', type: 'select', required: true, options: TERRAIN },
    
    // Waterway boundary - 20% multiplier if yes
    { id: 'waterwayBoundary', label: 'Does the property have a waterway boundary (river or creek)?', type: 'select', required: true, options: WATERWAY_BOUNDARY,
      helpText: 'If any boundary line follows a river, creek, or stream' },
    
    // Additional factors
    { id: 'existingSurvey', label: 'Previous Survey', type: 'select', required: true, options: EXISTING_SURVEY },
    { id: 'existingMonuments', label: 'Existing Corner Markers', type: 'select', required: true, options: EXISTING_MONUMENTS },
    { id: 'access', label: 'Property Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    { id: 'adjoining', label: 'Adjoining Properties', type: 'select', required: false, options: ADJOINING },
    { id: 'fenceIssues', label: 'Fence Issues', type: 'select', required: false, options: FENCE_ISSUES },
    // New markers scalable
    { id: 'setAllNewPins', label: 'Set all new pins', type: 'select', required: false, options: [
      { value: 'no', label: 'No' },
      { value: 'yes', label: 'Yes (+2 hrs base)' },
    ] },
    { id: 'additionalMarkers', label: 'Number of additional markers to set', type: 'number', required: false, min: 0 },
    { id: 'purpose', label: 'Purpose', type: 'select', required: true, options: SURVEY_PURPOSE },
    { id: 'lotCount', label: 'Lot Count', type: 'select', required: false, options: LOT_COUNT,
      showWhen: { field: 'purpose', value: 'city_subdivision' } },
    TRAVEL_MILES_FIELD,
  ],
  calculatePrice: (v) => {
    // 1. Base hours from acreage
    let baseHours = getHoursAdded(PROPERTY_SIZE, v.acreage);
    
    // 2. Add hours from corners, previous survey, fence, new markers
    let additionalHours = getHoursAdded(PROPERTY_CORNERS, v.corners) +
                          getHoursAdded(EXISTING_SURVEY, v.existingSurvey);
    if (v.fenceIssues === 'minor') additionalHours += 1;
    
    // New markers
    const setAll = v.setAllNewPins === 'yes' ? 2 : 0;
    const extraMarkers = parseFloat(v.additionalMarkers as string) || 0;
    additionalHours += setAll + extraMarkers * 0.5;
    
    // 3. Add hours from property type
    additionalHours += getHoursAdded(PROPERTY_TYPE, v.propertyType);
    
    // 4. Multiply by hourly rate to get base dollar cost
    let total = (baseHours + additionalHours) * HOURLY_RATE;
    
    // 5. Apply property type percentage premium
    total *= 1 + getPremium(PROPERTY_TYPE, v.propertyType);
    
    // 6. Apply vegetation/terrain multipliers (on property-size portion only)
    const vegMult = getMultiplier(VEGETATION, v.vegetation);
    const terrainMult = getMultiplier(TERRAIN, v.terrain);
    const scaledSizeCost = baseHours * HOURLY_RATE * vegMult * terrainMult;
    total = scaledSizeCost + (total - baseHours * HOURLY_RATE);
    
    // 7. Add flat costs for travel, city subdivision lots, and other flat add-ons
    let flatAddOns = 0;
    
    // Residential structures
    if (v.hasResidence === 'yes') {
      flatAddOns += getBaseCost(RESIDENCE_CORNERS, v.residenceCorners);
      flatAddOns += getBaseCost(RESIDENCE_SIZE, v.residenceSize);
      flatAddOns += getBaseCost(GARAGE, v.garage);
    }
    
    // Dynamic improvements
    flatAddOns += calculateImprovementsCost(v);
    
    // Other flats
    flatAddOns += getBaseCost(EXISTING_MONUMENTS, v.existingMonuments);
    flatAddOns += getBaseCost(ADJOINING, v.adjoining);
    if (v.fenceIssues === 'significant') flatAddOns += getBaseCost(FENCE_ISSUES, v.fenceIssues);
    flatAddOns += getBaseCost(SURVEY_PURPOSE, v.purpose);
    if (v.lotCount !== '12+') flatAddOns += getBaseCost(LOT_COUNT, v.lotCount);
    
    // Travel
    const miles = parseFloat(v.travelDistance as string) || 0;
    flatAddOns += miles * 1.5;
    
    // Access flat if any
    flatAddOns += getBaseCost(ACCESS_CONDITIONS, v.access);
    
    total += flatAddOns;
    
    // 8. Apply access multiplier
    const accessMult = getMultiplier(ACCESS_CONDITIONS, v.access);
    total *= accessMult;
    
    // 9. Apply waterway multiplier
    if (v.waterwayBoundary === 'yes') total *= 1.20;
    
    // 10. Apply rush multiplier (assume component provides v.rush)
    if (v.rush === 'yes') total *= 1.25;
    
    // 11. Range applied in UI
    
    return Math.max(total, boundarySurvey.minPrice);
  },
};

// =============================================================================
// ALTA/NSPS SURVEY
// =============================================================================
const altaSurvey: SurveyTypeConfig = {
  id: 'alta',
  name: 'ALTA/NSPS Land Title Survey',
  description: 'Comprehensive commercial survey meeting national standards. Required by lenders for commercial transactions.',
  basePrice: 2000,
  minPrice: 2000,
  fields: [
    PROPERTY_ADDRESS_FIELD,
    PROPERTY_COUNTY_FIELD,
    CUSTOM_COUNTY_FIELD,
    { id: 'propertyType', label: 'Property Type', type: 'select', required: true, options: [
      { value: 'office', label: 'Office Building', baseCost: 0 },
      { value: 'retail', label: 'Retail/Shopping', baseCost: 200 },
      { value: 'industrial', label: 'Industrial/Warehouse', baseCost: 100 },
      { value: 'multifamily', label: 'Multi-Family', baseCost: 400 },
      { value: 'mixed_use', label: 'Mixed-Use', baseCost: 600 },
      { value: 'vacant', label: 'Vacant Commercial', baseCost: -400 },
      { value: 'hospitality', label: 'Hotel/Hospitality', baseCost: 400 },
      { value: 'healthcare', label: 'Healthcare', baseCost: 600 },
    ]},
    { id: 'acreage', label: 'Property Size', type: 'select', required: true, options: [
      { value: '0.5', label: 'Under 0.5 acres', baseCost: 0 },
      { value: '1', label: '0.5 - 1 acre', baseCost: 300 },
      { value: '2', label: '1 - 2 acres', baseCost: 600 },
      { value: '5', label: '2 - 5 acres', baseCost: 1000 },
      { value: '10', label: '5 - 10 acres', baseCost: 1600 },
      { value: '25', label: '10 - 25 acres', baseCost: 2500 },
      { value: '50', label: '25+ acres', baseCost: 4000 },
    ]},
    { id: 'buildings', label: 'Number of Buildings', type: 'select', required: true, options: [
      { value: '0', label: 'No buildings', baseCost: 0 },
      { value: '1', label: '1 building', baseCost: 300 },
      { value: '2', label: '2 buildings', baseCost: 500 },
      { value: '3', label: '3-4 buildings', baseCost: 750 },
      { value: '5', label: '5+ buildings', baseCost: 1200 },
    ]},
    { id: 'tableA', label: 'Table A Items', type: 'select', required: true, helpText: 'Specified by lender/title company', options: [
      { value: 'minimal', label: 'Minimal (1-4)', baseCost: 0 },
      { value: 'standard', label: 'Standard (1-11)', baseCost: 500 },
      { value: 'comprehensive', label: 'Comprehensive (1-16)', baseCost: 800 },
      { value: 'full', label: 'Full (All 19)', baseCost: 1200 },
      { value: 'unknown', label: 'Unknown', baseCost: 600 },
    ]},
    { id: 'utilities', label: 'Utility Location', type: 'select', required: true, options: [
      { value: 'none', label: 'Surface only', baseCost: 0 },
      { value: 'basic', label: '811 locate', baseCost: 150 },
      { value: 'detailed', label: 'Detailed mapping', baseCost: 500 },
      { value: 'sue', label: 'SUE required', baseCost: 1500 },
    ]},
    { id: 'floodCert', label: 'Flood Determination', type: 'select', required: true, options: [
      { value: 'none', label: 'Not required', baseCost: 0 },
      { value: 'determination', label: 'Zone determination', baseCost: 75 },
      { value: 'certification', label: 'With elevation', baseCost: 300 },
    ]},
    { id: 'access', label: 'Site Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    TRAVEL_MILES_FIELD,
  ],
  calculatePrice: (v) => {
    let total = 2000; // Base ALTA price
    const f = altaSurvey.fields;
    total += getBaseCost(f[3].options, v.propertyType);
    total += getBaseCost(f[4].options, v.acreage);
    total += getBaseCost(f[5].options, v.buildings);
    total += getBaseCost(f[6].options, v.tableA);
    total += getBaseCost(f[7].options, v.utilities);
    total += getBaseCost(f[8].options, v.floodCert);
    total += getBaseCost(ACCESS_CONDITIONS, v.access);
    const miles = parseFloat(v.travelDistance as string) || 0;
    total += miles * 1.5;
    total *= getMultiplier(ACCESS_CONDITIONS, v.access);
    if (v.rush === 'yes') total *= 1.25;
    return Math.max(total, 2000);
  },
};

// =============================================================================
// TOPOGRAPHIC SURVEY
// =============================================================================
const topoSurvey: SurveyTypeConfig = {
  id: 'topographic',
  name: 'Topographic Survey',
  description: 'Maps contours, elevations, and features. Essential for site planning, drainage, and construction.',
  basePrice: 500,
  minPrice: 500,
  fields: [
    PROPERTY_ADDRESS_FIELD,
    PROPERTY_COUNTY_FIELD,
    CUSTOM_COUNTY_FIELD,
    { id: 'purpose', label: 'Purpose', type: 'select', required: true, options: [
      { value: 'site_plan', label: 'Site Planning', baseCost: 0 },
      { value: 'drainage', label: 'Drainage Design', baseCost: 100 },
      { value: 'grading', label: 'Grading Plan', baseCost: 100 },
      { value: 'construction', label: 'Pre-Construction', baseCost: 100 },
      { value: 'flood', label: 'Floodplain Study', baseCost: 200 },
    ]},
    { id: 'acreage', label: 'Area to Survey', type: 'select', required: true, options: [
      { value: '0.25', label: 'Under 0.25 acres', baseCost: 0 },
      { value: '0.5', label: '0.25 - 0.5 acres', baseCost: 150 },
      { value: '1', label: '0.5 - 1 acre', baseCost: 350 },
      { value: '2', label: '1 - 2 acres', baseCost: 650 },
      { value: '5', label: '2 - 5 acres', baseCost: 1200 },
      { value: '10', label: '5 - 10 acres', baseCost: 2000 },
      { value: '20', label: '10+ acres', baseCost: 3500 },
    ]},
    { id: 'contourInterval', label: 'Contour Interval', type: 'select', required: true, helpText: 'Smaller = more detail', options: [
      { value: '5', label: '5-foot (general)', hoursMultiplier: 1.0 },
      { value: '2', label: '2-foot (standard)', hoursMultiplier: 1.15 },
      { value: '1', label: '1-foot (high detail)', hoursMultiplier: 1.35 },
      { value: '0.5', label: '6-inch (precision)', hoursMultiplier: 1.6 },
    ]},
    { id: 'features', label: 'Features to Map', type: 'select', required: true, options: [
      { value: 'basic', label: 'Contours only', baseCost: 0 },
      { value: 'standard', label: 'Contours + buildings + trees', baseCost: 250 },
      { value: 'detailed', label: 'All improvements', baseCost: 500 },
      { value: 'comprehensive', label: 'With utilities', baseCost: 800 },
    ]},
    { id: 'vegetation', label: 'Vegetation', type: 'select', required: true, options: VEGETATION },
    { id: 'terrain', label: 'Terrain', type: 'select', required: true, options: TERRAIN },
    { id: 'benchmark', label: 'Vertical Datum', type: 'select', required: true, options: [
      { value: 'assumed', label: 'Assumed (relative)', baseCost: 0 },
      { value: 'local', label: 'Local benchmark', baseCost: 75 },
      { value: 'navd88', label: 'NAVD88', baseCost: 150 },
    ]},
    { id: 'boundary', label: 'Include Boundary', type: 'select', required: false, options: [
      { value: 'no', label: 'No - have current', baseCost: 0 },
      { value: 'yes', label: 'Yes - include', baseCost: 400 },
    ]},
    { id: 'access', label: 'Site Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    TRAVEL_MILES_FIELD,
  ],
  calculatePrice: (v) => {
    const f = topoSurvey.fields;
    
    // Base from acreage (scaled by contour interval, vegetation, terrain)
    let sizeBase = 500 + getBaseCost(f[3].options, v.acreage);
    const contourMultiplier = getMultiplier(f[4].options, v.contourInterval);
    const vegMultiplier = getMultiplier(VEGETATION, v.vegetation);
    const terrainMultiplier = getMultiplier(TERRAIN, v.terrain);
    sizeBase = sizeBase * contourMultiplier * vegMultiplier * terrainMultiplier;
    
    // Flat add-ons
    let addOns = 0;
    addOns += getBaseCost(f[2].options, v.purpose);
    addOns += getBaseCost(f[5].options, v.features);
    addOns += getBaseCost(f[8].options, v.benchmark);
    addOns += getBaseCost(f[9].options, v.boundary);
    addOns += getBaseCost(ACCESS_CONDITIONS, v.access);
    const miles = parseFloat(v.travelDistance as string) || 0;
    addOns += miles * 1.5;
    
    let total = sizeBase + addOns;
    total *= getMultiplier(ACCESS_CONDITIONS, v.access);
    if (v.rush === 'yes') total *= 1.25;
    
    return Math.max(total, topoSurvey.minPrice);
  },
};

// =============================================================================
// ELEVATION CERTIFICATE
// =============================================================================
const elevationCert: SurveyTypeConfig = {
  id: 'elevation',
  name: 'Elevation Certificate (FEMA)',
  description: 'Official FEMA form for flood insurance, LOMA applications, or proving structure is above flood level.',
  basePrice: 350,
  minPrice: 350,
  fields: [
    PROPERTY_ADDRESS_FIELD,
    PROPERTY_COUNTY_FIELD,
    CUSTOM_COUNTY_FIELD,
    { id: 'buildingType', label: 'Building Type', type: 'select', required: true, options: [
      { value: 'single_family', label: 'Single-Family Home', baseCost: 0 },
      { value: 'duplex', label: 'Duplex', baseCost: 75 },
      { value: 'townhouse', label: 'Townhouse', baseCost: 50 },
      { value: 'mobile', label: 'Mobile Home', baseCost: -50 },
      { value: 'multi_family', label: 'Multi-Family', baseCost: 150 },
      { value: 'commercial', label: 'Commercial', baseCost: 125 },
    ]},
    { id: 'floodZone', label: 'Flood Zone', type: 'select', required: true, helpText: 'Check policy or FEMA map', options: [
      { value: 'x', label: 'Zone X (minimal risk)', baseCost: -50 },
      { value: 'x500', label: 'Zone X shaded (500-year)', baseCost: 0 },
      { value: 'a', label: 'Zone A (no BFE)', baseCost: 75 },
      { value: 'ae', label: 'Zone AE (with BFE)', baseCost: 0 },
      { value: 'ao', label: 'Zone AO (sheet flow)', baseCost: 75 },
      { value: 'unknown', label: 'Unknown', baseCost: 50 },
    ]},
    { id: 'purpose', label: 'Purpose', type: 'select', required: true, options: [
      { value: 'insurance', label: 'Flood Insurance', baseCost: 0 },
      { value: 'loma', label: 'LOMA Application', baseCost: 150 },
      { value: 'lomr_f', label: 'LOMR-F Application', baseCost: 225 },
      { value: 'construction', label: 'New Construction', baseCost: 50 },
      { value: 'sale', label: 'Property Sale', baseCost: 0 },
    ]},
    { id: 'basement', label: 'Basement/Below Area', type: 'select', required: true, options: [
      { value: 'none', label: 'None', baseCost: 0 },
      { value: 'crawl', label: 'Crawl space', baseCost: 50 },
      { value: 'basement', label: 'Full basement', baseCost: 75 },
      { value: 'walkout', label: 'Walkout basement', baseCost: 100 },
    ]},
    { id: 'additions', label: 'Building Additions', type: 'select', required: false, options: [
      { value: 'none', label: 'Original only', baseCost: 0 },
      { value: 'one', label: 'One addition', baseCost: 50 },
      { value: 'multiple', label: 'Multiple additions', baseCost: 100 },
    ]},
    { id: 'access', label: 'Property Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    TRAVEL_MILES_FIELD,
  ],
  calculatePrice: (v) => {
    let total = 350;
    const f = elevationCert.fields;
    total += getBaseCost(f[3].options, v.buildingType);
    total += getBaseCost(f[4].options, v.floodZone);
    total += getBaseCost(f[5].options, v.purpose);
    total += getBaseCost(f[6].options, v.basement);
    total += getBaseCost(f[7].options, v.additions);
    total += getBaseCost(ACCESS_CONDITIONS, v.access);
    const miles = parseFloat(v.travelDistance as string) || 0;
    total += miles * 1.5;
    total *= getMultiplier(ACCESS_CONDITIONS, v.access);
    if (v.rush === 'yes') total *= 1.25;
    return Math.max(total, 350);
  },
};

// =============================================================================
// CONSTRUCTION STAKING
// =============================================================================
const constructionStaking: SurveyTypeConfig = {
  id: 'construction',
  name: 'Construction Staking / Layout',
  description: 'Precise positioning of stakes for construction. Ensures correct building locations per approved plans.',
  basePrice: 300,
  minPrice: 300,
  fields: [
    PROPERTY_ADDRESS_FIELD,
    PROPERTY_COUNTY_FIELD,
    CUSTOM_COUNTY_FIELD,
    { id: 'projectType', label: 'Project Type', type: 'select', required: true, options: [
      { value: 'residential', label: 'New Home', baseCost: 0 },
      { value: 'addition', label: 'Home Addition', baseCost: -75 },
      { value: 'commercial', label: 'Commercial Building', baseCost: 300 },
      { value: 'road', label: 'Road/Driveway', baseCost: 150 },
      { value: 'fence', label: 'Fence Line', baseCost: -75 },
      { value: 'septic', label: 'Septic System', baseCost: 0 },
      { value: 'pool', label: 'Swimming Pool', baseCost: -50 },
    ]},
    { id: 'stakingType', label: 'Staking Type', type: 'select', required: true, options: [
      { value: 'corners', label: 'Corners only', baseCost: 0 },
      { value: 'offset', label: 'Offset stakes', baseCost: 75 },
      { value: 'grades', label: 'Grade stakes', baseCost: 200 },
      { value: 'full', label: 'Complete layout', baseCost: 350 },
    ]},
    { id: 'points', label: 'Number of Points', type: 'select', required: true, options: [
      { value: '10', label: '4-10 points', baseCost: 0 },
      { value: '25', label: '11-25 points', baseCost: 150 },
      { value: '50', label: '26-50 points', baseCost: 350 },
      { value: '100', label: '50+ points', baseCost: 700 },
    ]},
    { id: 'plans', label: 'Plans Available', type: 'select', required: true, options: [
      { value: 'digital', label: 'Digital CAD', baseCost: 0 },
      { value: 'pdf', label: 'PDF plans', baseCost: 50 },
      { value: 'paper', label: 'Paper only', baseCost: 75 },
      { value: 'none', label: 'No plans', baseCost: 200 },
    ]},
    { id: 'visits', label: 'Site Visits', type: 'select', required: true, options: [
      { value: 'single', label: 'Single visit', hoursMultiplier: 1.0 },
      { value: 'two', label: 'Two visits', hoursMultiplier: 1.75 },
      { value: 'multiple', label: 'Multiple visits', hoursMultiplier: 2.5 },
    ]},
    { id: 'terrain', label: 'Terrain', type: 'select', required: true, options: TERRAIN },
    { id: 'access', label: 'Site Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    TRAVEL_MILES_FIELD,
  ],
  calculatePrice: (v) => {
    const f = constructionStaking.fields;
    
    // Base price + options (scaled by visits and terrain)
    let base = 300;
    base += getBaseCost(f[2].options, v.projectType);
    base += getBaseCost(f[3].options, v.stakingType);
    base += getBaseCost(f[4].options, v.points);
    base += getBaseCost(f[5].options, v.plans);
    
    // Apply multipliers
    const visitsMultiplier = getMultiplier(f[6].options, v.visits);
    const terrainMultiplier = getMultiplier(TERRAIN, v.terrain);
    base = base * visitsMultiplier * terrainMultiplier;
    
    // Flat add-ons
    base += getBaseCost(ACCESS_CONDITIONS, v.access);
    const miles = parseFloat(v.travelDistance as string) || 0;
    base += miles * 1.5;
    
    let total = base;
    total *= getMultiplier(ACCESS_CONDITIONS, v.access);
    if (v.rush === 'yes') total *= 1.25;
    
    return Math.max(total, 300);
  },
};

// =============================================================================
// SUBDIVISION PLATTING
// =============================================================================
const subdivisionPlat: SurveyTypeConfig = {
  id: 'subdivision',
  name: 'Subdivision Platting',
  description: 'Divides land into multiple lots with streets and easements. Creates recorded plat for individual lot sales.',
  basePrice: 2500,
  minPrice: 2500,
  fields: [
    PROPERTY_ADDRESS_FIELD,
    PROPERTY_COUNTY_FIELD,
    CUSTOM_COUNTY_FIELD,
    { id: 'acreage', label: 'Total Tract Size', type: 'select', required: true, options: [
      { value: '5', label: 'Under 5 acres', baseCost: 0 },
      { value: '10', label: '5 - 10 acres', baseCost: 500 },
      { value: '25', label: '10 - 25 acres', baseCost: 1000 },
      { value: '50', label: '25 - 50 acres', baseCost: 1750 },
      { value: '100', label: '50 - 100 acres', baseCost: 2750 },
      { value: '200', label: '100+ acres', baseCost: 4500 },
    ]},
    { id: 'lots', label: 'Number of Lots', type: 'select', required: true, options: [
      { value: '2', label: '2 lots (simple split)', baseCost: -750 },
      { value: '3', label: '3 lots', baseCost: -400 },
      { value: '5', label: '4 - 6 lots', baseCost: 0 },
      { value: '10', label: '7 - 12 lots', baseCost: 700 },
      { value: '25', label: '13 - 25 lots', baseCost: 1750 },
      { value: '50', label: '26+ lots', baseCost: 3500 },
    ]},
    { id: 'roads', label: 'Road Layout', type: 'select', required: true, options: [
      { value: 'none', label: 'No new roads', baseCost: 0 },
      { value: 'simple', label: 'One simple road', baseCost: 700 },
      { value: 'moderate', label: '2-3 roads', baseCost: 1400 },
      { value: 'complex', label: 'Complex with cul-de-sacs', baseCost: 2100 },
    ]},
    { id: 'drainage', label: 'Drainage', type: 'select', required: true, options: [
      { value: 'simple', label: 'Natural drainage', baseCost: 0 },
      { value: 'easements', label: 'Drainage easements', baseCost: 500 },
      { value: 'detention', label: 'Detention required', baseCost: 1000 },
    ]},
    { id: 'jurisdiction', label: 'Jurisdiction', type: 'select', required: true, options: [
      { value: 'county', label: 'County only', baseCost: 0 },
      { value: 'etj', label: 'City ETJ', baseCost: 350 },
      { value: 'city', label: 'City limits', baseCost: 850 },
    ]},
    { id: 'vegetation', label: 'Vegetation', type: 'select', required: true, options: VEGETATION },
    { id: 'terrain', label: 'Terrain', type: 'select', required: true, options: TERRAIN },
    { id: 'floodplain', label: 'Floodplain', type: 'select', required: true, options: [
      { value: 'none', label: 'No floodplain', baseCost: 0 },
      { value: 'minor', label: 'Minor (edge)', baseCost: 500 },
      { value: 'significant', label: 'Significant', baseCost: 1000 },
      { value: 'major', label: 'Major impact', baseCost: 1750 },
    ]},
    { id: 'existingSurvey', label: 'Parent Tract Survey', type: 'select', required: true, options: EXISTING_SURVEY },
    TRAVEL_MILES_FIELD,
  ],
  calculatePrice: (v) => {
    const f = subdivisionPlat.fields;
    
    // Base affected by vegetation and terrain
    let sizeBase = 2500 + getBaseCost(f[3].options, v.acreage);
    const vegMultiplier = getMultiplier(VEGETATION, v.vegetation);
    const terrainMultiplier = getMultiplier(TERRAIN, v.terrain);
    sizeBase = sizeBase * vegMultiplier * terrainMultiplier;
    
    // Flat add-ons
    let addOns = 0;
    addOns += getBaseCost(f[4].options, v.lots);
    addOns += getBaseCost(f[5].options, v.roads);
    addOns += getBaseCost(f[6].options, v.drainage);
    addOns += getBaseCost(f[7].options, v.jurisdiction);
    addOns += getBaseCost(f[11].options, v.floodplain);
    addOns += getBaseCost(EXISTING_SURVEY, v.existingSurvey);
    const miles = parseFloat(v.travelDistance as string) || 0;
    addOns += miles * 1.5;
    
    let total = sizeBase + addOns;
    if (v.rush === 'yes') total *= 1.25;
    
    return Math.max(total, 2500);
  },
};

// =============================================================================
// AS-BUILT SURVEY
// =============================================================================
const asBuiltSurvey: SurveyTypeConfig = {
  id: 'asbuilt',
  name: 'As-Built Survey',
  description: 'Documents completed construction location. Verifies structures meet approved plans and setbacks.',
  basePrice: 400,
  minPrice: 400,
  fields: [
    PROPERTY_ADDRESS_FIELD,
    PROPERTY_COUNTY_FIELD,
    CUSTOM_COUNTY_FIELD,
    { id: 'structureType', label: 'Structure Type', type: 'select', required: true, options: [
      { value: 'residential', label: 'New Home', baseCost: 0 },
      { value: 'addition', label: 'Addition', baseCost: -75 },
      { value: 'commercial', label: 'Commercial', baseCost: 300 },
      { value: 'accessory', label: 'Garage/Barn/Shop', baseCost: -100 },
      { value: 'pool', label: 'Pool', baseCost: -125 },
      { value: 'foundation', label: 'Foundation Only', baseCost: -75 },
    ]},
    { id: 'complexity', label: 'Complexity', type: 'select', required: true, options: [
      { value: 'simple', label: 'Simple rectangular', baseCost: 0 },
      { value: 'moderate', label: 'L-shape or offsets', baseCost: 75 },
      { value: 'complex', label: 'Complex footprint', baseCost: 150 },
      { value: 'very_complex', label: 'Multiple buildings', baseCost: 300 },
    ]},
    { id: 'features', label: 'Features to Document', type: 'select', required: true, options: [
      { value: 'building', label: 'Building + setbacks only', baseCost: 0 },
      { value: 'improvements', label: '+ drives + walks', baseCost: 100 },
      { value: 'full', label: 'All improvements', baseCost: 225 },
      { value: 'comprehensive', label: 'With elevations', baseCost: 375 },
    ]},
    { id: 'permit', label: 'For Permit/CO', type: 'select', required: true, options: [
      { value: 'yes', label: 'Yes - permit required', baseCost: 50 },
      { value: 'no', label: 'No - personal records', baseCost: 0 },
    ]},
    { id: 'access', label: 'Site Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    TRAVEL_MILES_FIELD,
  ],
  calculatePrice: (v) => {
    let total = 400;
    const f = asBuiltSurvey.fields;
    total += getBaseCost(f[3].options, v.structureType);
    total += getBaseCost(f[4].options, v.complexity);
    total += getBaseCost(f[5].options, v.features);
    total += getBaseCost(f[6].options, v.permit);
    total += getBaseCost(ACCESS_CONDITIONS, v.access);
    const miles = parseFloat(v.travelDistance as string) || 0;
    total += miles * 1.5;
    total *= getMultiplier(ACCESS_CONDITIONS, v.access);
    if (v.rush === 'yes') total *= 1.25;
    return Math.max(total, 400);
  },
};

// =============================================================================
// MORTGAGE SURVEY
// =============================================================================
const mortgageSurvey: SurveyTypeConfig = {
  id: 'mortgage',
  name: 'Mortgage / Loan Survey',
  description: 'Required by lenders for property purchase or refinance. Shows boundaries, improvements, and easements.',
  basePrice: 350,
  minPrice: 350,
  fields: [
    PROPERTY_ADDRESS_FIELD,
    PROPERTY_COUNTY_FIELD,
    CUSTOM_COUNTY_FIELD,
    { id: 'propertyType', label: 'Property Type', type: 'select', required: true, options: PROPERTY_TYPE },
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
    TRAVEL_MILES_FIELD,
  ],
  calculatePrice: (v) => {
    let total = 350;
    total += getBaseCost(PROPERTY_TYPE, v.propertyType);
    total += getBaseCost(PROPERTY_SIZE, v.acreage);
    total += getBaseCost(PROPERTY_CORNERS, v.corners);
    total += getBaseCost(EXISTING_MONUMENTS, v.existingMonuments);
    total += getBaseCost(EXISTING_SURVEY, v.existingSurvey);
    total += getBaseCost(ACCESS_CONDITIONS, v.access);
    const miles = parseFloat(v.travelDistance as string) || 0;
    total += miles * 1.5;
    total *= getMultiplier(ACCESS_CONDITIONS, v.access);
    if (v.rush === 'yes') total *= 1.25;
    return Math.max(total, 350);
  },
};

// =============================================================================
// EASEMENT SURVEY
// =============================================================================
const easementSurvey: SurveyTypeConfig = {
  id: 'easement',
  name: 'Route / Easement Survey',
  description: 'Surveys linear corridors for utilities, pipelines, or access. Creates legal descriptions across properties.',
  basePrice: 500,
  minPrice: 500,
  fields: [
    { id: 'startLocation', label: 'Starting Point', type: 'text', required: true, placeholder: 'Address or description' },
    { id: 'endLocation', label: 'Ending Point', type: 'text', required: true, placeholder: 'Address or description' },
    PROPERTY_COUNTY_FIELD,
    CUSTOM_COUNTY_FIELD,
    { id: 'easementType', label: 'Easement Type', type: 'select', required: true, options: [
      { value: 'access', label: 'Access/Driveway', baseCost: 0 },
      { value: 'utility_overhead', label: 'Overhead Utility', baseCost: -75 },
      { value: 'utility_underground', label: 'Underground Utility', baseCost: 75 },
      { value: 'pipeline', label: 'Pipeline', baseCost: 150 },
      { value: 'drainage', label: 'Drainage', baseCost: 75 },
      { value: 'road', label: 'Road ROW', baseCost: 150 },
    ]},
    { id: 'length', label: 'Route Length', type: 'select', required: true, options: [
      { value: '250', label: 'Under 250 feet', baseCost: 0 },
      { value: '500', label: '250 - 500 feet', baseCost: 150 },
      { value: '1000', label: '500 - 1,000 feet', baseCost: 300 },
      { value: '2500', label: '1,000 - 2,500 feet', baseCost: 600 },
      { value: '5000', label: '2,500 - 5,000 feet', baseCost: 1100 },
      { value: '10000', label: '1 - 2 miles', baseCost: 1900 },
    ]},
    { id: 'parcels', label: 'Properties Crossed', type: 'select', required: true, options: [
      { value: '1', label: '1 property', baseCost: 0 },
      { value: '2', label: '2 properties', baseCost: 225 },
      { value: '3', label: '3 properties', baseCost: 400 },
      { value: '5', label: '4-5 properties', baseCost: 625 },
      { value: '10', label: '6+ properties', baseCost: 1100 },
    ]},
    { id: 'vegetation', label: 'Vegetation', type: 'select', required: true, options: VEGETATION },
    { id: 'terrain', label: 'Terrain', type: 'select', required: true, options: TERRAIN },
    { id: 'waterCrossings', label: 'Water Crossings', type: 'select', required: false, options: [
      { value: 'none', label: 'None', baseCost: 0 },
      { value: 'one', label: '1 crossing', baseCost: 150 },
      { value: 'multiple', label: 'Multiple', baseCost: 375 },
    ]},
    { id: 'legalDesc', label: 'Legal Description', type: 'select', required: true, options: [
      { value: 'no', label: 'Not needed', baseCost: 0 },
      { value: 'simple', label: 'Single description', baseCost: 125 },
      { value: 'multiple', label: 'Per parcel', baseCost: 300 },
    ]},
    { id: 'access', label: 'Route Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    TRAVEL_MILES_FIELD,
  ],
  calculatePrice: (v) => {
    const f = easementSurvey.fields;
    
    // Base from length (scaled by vegetation, terrain)
    let lengthBase = 500 + getBaseCost(f[4].options, v.length);
    const vegMultiplier = getMultiplier(VEGETATION, v.vegetation);
    const terrainMultiplier = getMultiplier(TERRAIN, v.terrain);
    lengthBase = lengthBase * vegMultiplier * terrainMultiplier;
    
    // Flat add-ons
    let addOns = 0;
    addOns += getBaseCost(f[4].options, v.easementType);
    addOns += getBaseCost(f[6].options, v.parcels);
    addOns += getBaseCost(f[9].options, v.waterCrossings);
    addOns += getBaseCost(f[10].options, v.legalDesc);
    addOns += getBaseCost(ACCESS_CONDITIONS, v.access);
    const miles = parseFloat(v.travelDistance as string) || 0;
    addOns += miles * 1.5;
    
    let total = lengthBase + addOns;
    total *= getMultiplier(ACCESS_CONDITIONS, v.access);
    if (v.rush === 'yes') total *= 1.25;
    
    return total;
  },
};

// =============================================================================
// LEGAL DESCRIPTION
// =============================================================================
const legalDescription: SurveyTypeConfig = {
  id: 'legal_description',
  name: 'Legal Description',
  description: 'Creates or verifies written legal descriptions for deeds, title documents, or easements.',
  basePrice: 250,
  minPrice: 250,
  fields: [
    PROPERTY_ADDRESS_FIELD,
    PROPERTY_COUNTY_FIELD,
    CUSTOM_COUNTY_FIELD,
    { id: 'type', label: 'Description Type', type: 'select', required: true, options: [
      { value: 'lot_block', label: 'Lot and Block', baseCost: -100 },
      { value: 'metes_bounds', label: 'Metes and Bounds', baseCost: 0 },
      { value: 'easement', label: 'Easement Description', baseCost: 75 },
      { value: 'partial', label: 'Part of Larger Tract', baseCost: 150 },
      { value: 'correction', label: 'Correction', baseCost: -50 },
    ]},
    { id: 'fieldWork', label: 'Field Work Needed', type: 'select', required: true, options: [
      { value: 'none', label: 'From existing survey', baseCost: 0 },
      { value: 'verification', label: 'Field verification', baseCost: 225 },
      { value: 'full', label: 'Full field survey', baseCost: 600 },
    ]},
    { id: 'acreage', label: 'Property Size', type: 'select', required: true, options: PROPERTY_SIZE,
      showWhen: { field: 'fieldWork', value: ['verification', 'full'] } },
    { id: 'corners', label: 'Number of Corners', type: 'select', required: true, options: PROPERTY_CORNERS,
      showWhen: { field: 'fieldWork', value: ['verification', 'full'] } },
    { id: 'existingSurvey', label: 'Existing Survey', type: 'select', required: true, options: EXISTING_SURVEY },
    TRAVEL_MILES_FIELD,
  ],
  calculatePrice: (v) => {
    let total = 250;
    const f = legalDescription.fields;
    total += getBaseCost(f[3].options, v.type);
    total += getBaseCost(f[4].options, v.fieldWork);
    
    // Only add size/corners if field work is needed
    if (v.fieldWork === 'verification' || v.fieldWork === 'full') {
      total += getBaseCost(PROPERTY_SIZE, v.acreage) * 0.5;
      total += getBaseCost(PROPERTY_CORNERS, v.corners) * 0.5;
    }
    
    total += getBaseCost(EXISTING_SURVEY, v.existingSurvey) * 0.5;
    const miles = parseFloat(v.travelDistance as string) || 0;
    total += miles * 1.5;
    if (v.rush === 'yes') total *= 1.25;
    
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