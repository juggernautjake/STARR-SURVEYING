// app/components/surveyConfigs.ts
import {
  SurveyTypeConfig,
  FieldOption,
  PROPERTY_ADDRESS_FIELD, PROPERTY_COUNTY_FIELD, CUSTOM_COUNTY_FIELD,
  PROPERTY_SIZE, PROPERTY_TYPE, PROPERTY_CORNERS, VEGETATION, TERRAIN,
  WATERWAY_BOUNDARY, EXISTING_SURVEY, EXISTING_MONUMENTS,
  ACCESS_CONDITIONS, ADJOINING,
  FENCE_ISSUES, SURVEY_PURPOSE, LOT_COUNT,
  HAS_RESIDENCE, RESIDENCE_CORNERS, RESIDENCE_SIZE, GARAGE,
  NUM_IMPROVEMENTS, IMPROVEMENT_TYPE,
  ADDITIONAL_RESIDENCE_CORNERS, ADDITIONAL_RESIDENCE_SIZE,
  getBaseCost, getMultiplier, getHoursAdded, getPremium, getCostMultiplier, isAdditionalResidence,
  HOURLY_RATE, TRAVEL_RATE, TRAVEL_DISTANCE_FIELD
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
// ALTA PROPERTY TYPE (specific to ALTA)
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

// ALTA ACREAGE
const ALTA_ACREAGE: FieldOption[] = [
  { value: '0.5', label: 'Under 0.5 acres', baseCost: 0 },
  { value: '1', label: '0.5 - 1 acre', baseCost: 300 },
  { value: '2', label: '1 - 2 acres', baseCost: 600 },
  { value: '5', label: '2 - 5 acres', baseCost: 1000 },
  { value: '10', label: '5 - 10 acres', baseCost: 1600 },
  { value: '25', label: '10 - 25 acres', baseCost: 2500 },
  { value: '50', label: '25+ acres', baseCost: 4000 },
];

// ALTA BUILDINGS
const ALTA_BUILDINGS: FieldOption[] = [
  { value: '0', label: 'No buildings', baseCost: 0 },
  { value: '1', label: '1 building', baseCost: 300 },
  { value: '2', label: '2 buildings', baseCost: 500 },
  { value: '3', label: '3-4 buildings', baseCost: 750 },
  { value: '5', label: '5+ buildings', baseCost: 1200 },
];

// ALTA TABLE A
const ALTA_TABLE_A: FieldOption[] = [
  { value: 'minimal', label: 'Minimal (1-4)', baseCost: 0 },
  { value: 'standard', label: 'Standard (1-11)', baseCost: 500 },
  { value: 'comprehensive', label: 'Comprehensive (1-16)', baseCost: 800 },
  { value: 'full', label: 'Full (All 19)', baseCost: 1200 },
  { value: 'unknown', label: 'Unknown', baseCost: 600 },
];

// ALTA UTILITIES
const ALTA_UTILITIES: FieldOption[] = [
  { value: 'none', label: 'Surface only', baseCost: 0 },
  { value: 'basic', label: '811 locate', baseCost: 150 },
  { value: 'detailed', label: 'Detailed mapping', baseCost: 500 },
  { value: 'sue', label: 'SUE required', baseCost: 1500 },
];

// ALTA FLOOD CERT
const ALTA_FLOOD_CERT: FieldOption[] = [
  { value: 'none', label: 'Not required', baseCost: 0 },
  { value: 'determination', label: 'Zone determination', baseCost: 75 },
  { value: 'certification', label: 'With elevation', baseCost: 300 },
];

// =============================================================================
// BOUNDARY SURVEY
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
    { id: 'propertyType', label: 'Property Type', type: 'select', required: true, options: PROPERTY_TYPE },
    { id: 'acreage', label: 'Property Size', type: 'select', required: true, options: PROPERTY_SIZE },
    { id: 'corners', label: 'Number of Property Corners', type: 'select', required: true, options: PROPERTY_CORNERS,
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
    { id: 'existingSurvey', label: 'Previous Survey', type: 'select', required: true, options: EXISTING_SURVEY },
    { id: 'existingMonuments', label: 'Existing Corner Markers', type: 'select', required: true, options: EXISTING_MONUMENTS },
    { id: 'access', label: 'Property Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    { id: 'adjoining', label: 'Adjoining Properties', type: 'select', required: false, options: ADJOINING },
    { id: 'fenceIssues', label: 'Fence Issues', type: 'select', required: false, options: FENCE_ISSUES },
    { id: 'setAllNewPins', label: 'Set all new pins', type: 'select', required: false, options: [
      { value: 'no', label: 'No', hoursAdded: 0 },
      { value: 'yes', label: 'Yes (base for 4 corners)', hoursAdded: 2 },
    ] },
    { id: 'additionalMarkers', label: 'Additional markers to set (beyond base)', type: 'number', required: false, min: 0, helpText: 'Each additional marker adds 0.5 hrs' },
    { id: 'purpose', label: 'Purpose', type: 'select', required: true, options: SURVEY_PURPOSE },
    { id: 'lotCount', label: 'Lot Count', type: 'select', required: false, options: LOT_COUNT,
      showWhen: { field: 'purpose', value: 'city_subdivision' } },
    TRAVEL_DISTANCE_FIELD,
  ],
  calculatePrice: (v) => {
    // Check for 12+ lots
    if (v.purpose === 'city_subdivision' && v.lotCount === '12+') {
      return { price: 0, hours: 0 };
    }

    // 1. Base hours from acreage
    const acreageHours = getHoursAdded(PROPERTY_SIZE, v.acreage);

    // 2. Add hours from corners, previous survey, fence, new markers
    const cornersHours = getHoursAdded(PROPERTY_CORNERS, v.corners);
    const surveyHours = getHoursAdded(EXISTING_SURVEY, v.existingSurvey);
    const fenceHours = getHoursAdded(FENCE_ISSUES, v.fenceIssues);
    const setAllPinsHours = v.setAllNewPins === 'yes' ? 2 : 0;
    const additionalMarkers = parseInt(v.additionalMarkers as string) || 0;
    const markersHours = setAllPinsHours + additionalMarkers * 0.5;

    let additionalHours = cornersHours + surveyHours + fenceHours + markersHours;

    // 3. Add hours from property type
    additionalHours += getHoursAdded(PROPERTY_TYPE, v.propertyType);

    // 4. Multiply by hourly rate to get base dollar cost
    const baseHoursCost = acreageHours * HOURLY_RATE;
    const additionalHoursCost = additionalHours * HOURLY_RATE;

    let baseDollarCost = baseHoursCost + additionalHoursCost;

    // 5. Apply property type percentage premium
    baseDollarCost *= 1 + getPremium(PROPERTY_TYPE, v.propertyType);

    // 6. Apply vegetation/terrain multipliers (on property-size portion only)
    const vegMult = getMultiplier(VEGETATION, v.vegetation);
    const terrainMult = getMultiplier(TERRAIN, v.terrain);
    const scaledAcreageCost = baseHoursCost * vegMult * terrainMult;
    baseDollarCost = scaledAcreageCost + (baseDollarCost - baseHoursCost);

    // Base price
    let total = boundarySurvey.basePrice + baseDollarCost;

    // 7. Add flat costs for travel, city subdivision lots, and other flat add-ons
    let flatAddOns = 0;

    // Property type base cost
    flatAddOns += getBaseCost(PROPERTY_TYPE, v.propertyType);

    // Residential structures (if applicable)
    if (v.hasResidence === 'yes') {
      flatAddOns += getBaseCost(RESIDENCE_CORNERS, v.residenceCorners);
      flatAddOns += getBaseCost(RESIDENCE_SIZE, v.residenceSize);
      flatAddOns += getBaseCost(GARAGE, v.garage);
    }

    // Dynamic improvements
    flatAddOns += calculateImprovementsCost(v);

    // Site factors
    flatAddOns += getBaseCost(EXISTING_MONUMENTS, v.existingMonuments);
    flatAddOns += getBaseCost(ADJOINING, v.adjoining);
    flatAddOns += getBaseCost(FENCE_ISSUES, v.fenceIssues);
    flatAddOns += getBaseCost(SURVEY_PURPOSE, v.purpose);

    // City subdivision lots
    if (v.purpose === 'city_subdivision') {
      flatAddOns += getBaseCost(LOT_COUNT, v.lotCount);
    }

    // Travel
    const miles = parseFloat(v.travelDistance as string) || 0;
    const travelCost = miles * TRAVEL_RATE;
    flatAddOns += travelCost;

    total += flatAddOns;

    // 8. Apply access multiplier
    const accessMult = getCostMultiplier(ACCESS_CONDITIONS, v.access);
    total *= accessMult;

    // 9. Apply waterway multiplier
    if (v.waterwayBoundary === 'yes') {
      total *= 1.20;
    }

    // 10. Apply rush multiplier
    if (v.rush === 'yes') {
      total *= 1.25;
    }

    // 11. Range applied in UI

    // Calculate total hours
    const totalHours = acreageHours + additionalHours;

    return { price: Math.max(total, boundarySurvey.minPrice), hours: totalHours };
  },
};

// =============================================================================
// ALTA/NSPS SURVEY
// Commercial survey - different pricing structure
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
    { id: 'propertyType', label: 'Property Type', type: 'select', required: true, options: ALTA_PROPERTY_TYPE },
    { id: 'acreage', label: 'Property Size', type: 'select', required: true, options: ALTA_ACREAGE },
    { id: 'buildings', label: 'Number of Buildings', type: 'select', required: true, options: ALTA_BUILDINGS },
    { id: 'tableA', label: 'Table A Items', type: 'select', required: true, helpText: 'Specified by lender/title company', options: ALTA_TABLE_A },
    { id: 'utilities', label: 'Utility Location', type: 'select', required: true, options: ALTA_UTILITIES },
    { id: 'floodCert', label: 'Flood Determination', type: 'select', required: true, options: ALTA_FLOOD_CERT },
    { id: 'access', label: 'Site Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    TRAVEL_DISTANCE_FIELD,
  ],
  calculatePrice: (v) => {
    let total = altaSurvey.basePrice;
    total += getBaseCost(ALTA_PROPERTY_TYPE, v.propertyType);
    total += getBaseCost(ALTA_ACREAGE, v.acreage);
    total += getBaseCost(ALTA_BUILDINGS, v.buildings);
    total += getBaseCost(ALTA_TABLE_A, v.tableA);
    total += getBaseCost(ALTA_UTILITIES, v.utilities);
    total += getBaseCost(ALTA_FLOOD_CERT, v.floodCert);

    const miles = parseFloat(v.travelDistance as string) || 0;
    const travelCost = miles * TRAVEL_RATE;
    total += travelCost;

    total += getBaseCost(ACCESS_CONDITIONS, v.access);
    total *= getCostMultiplier(ACCESS_CONDITIONS, v.access);

    if (v.rush === 'yes') total *= 1.25;

    return { price: Math.max(total, altaSurvey.minPrice) };
  },
};

// =============================================================================
// TOPO PURPOSE (specific to topo)
// =============================================================================
const TOPO_PURPOSE: FieldOption[] = [
  { value: 'site_plan', label: 'Site Planning', baseCost: 0 },
  { value: 'drainage', label: 'Drainage Design', baseCost: 100 },
  { value: 'grading', label: 'Grading Plan', baseCost: 100 },
  { value: 'construction', label: 'Pre-Construction', baseCost: 100 },
  { value: 'flood', label: 'Floodplain Study', baseCost: 200 },
];

// TOPO ACREAGE
const TOPO_ACREAGE: FieldOption[] = [
  { value: '0.25', label: 'Under 0.25 acres', baseCost: 0 },
  { value: '0.5', label: '0.25 - 0.5 acres', baseCost: 150 },
  { value: '1', label: '0.5 - 1 acre', baseCost: 350 },
  { value: '2', label: '1 - 2 acres', baseCost: 650 },
  { value: '5', label: '2 - 5 acres', baseCost: 1200 },
  { value: '10', label: '5 - 10 acres', baseCost: 2000 },
  { value: '20', label: '10+ acres', baseCost: 3500 },
];

// TOPO CONTOUR INTERVAL
const TOPO_CONTOUR_INTERVAL: FieldOption[] = [
  { value: '5', label: '5-foot (general)', hoursMultiplier: 1.0 },
  { value: '2', label: '2-foot (standard)', hoursMultiplier: 1.15 },
  { value: '1', label: '1-foot (high detail)', hoursMultiplier: 1.35 },
  { value: '0.5', label: '6-inch (precision)', hoursMultiplier: 1.6 },
];

// TOPO FEATURES
const TOPO_FEATURES: FieldOption[] = [
  { value: 'basic', label: 'Contours only', baseCost: 0 },
  { value: 'standard', label: 'Contours + buildings + trees', baseCost: 250 },
  { value: 'detailed', label: 'All improvements', baseCost: 500 },
  { value: 'comprehensive', label: 'With utilities', baseCost: 800 },
];

// TOPO BENCHMARK
const TOPO_BENCHMARK: FieldOption[] = [
  { value: 'assumed', label: 'Assumed (relative)', baseCost: 0 },
  { value: 'local', label: 'Local benchmark', baseCost: 75 },
  { value: 'navd88', label: 'NAVD88', baseCost: 150 },
];

// TOPO BOUNDARY
const TOPO_BOUNDARY: FieldOption[] = [
  { value: 'no', label: 'No - have current', baseCost: 0 },
  { value: 'yes', label: 'Yes - include', baseCost: 400 },
];

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
    { id: 'purpose', label: 'Purpose', type: 'select', required: true, options: TOPO_PURPOSE },
    { id: 'acreage', label: 'Area to Survey', type: 'select', required: true, options: TOPO_ACREAGE },
    { id: 'contourInterval', label: 'Contour Interval', type: 'select', required: true, helpText: 'Smaller = more detail', options: TOPO_CONTOUR_INTERVAL },
    { id: 'features', label: 'Features to Map', type: 'select', required: true, options: TOPO_FEATURES },
    { id: 'vegetation', label: 'Vegetation', type: 'select', required: true, options: VEGETATION },
    { id: 'terrain', label: 'Terrain', type: 'select', required: true, options: TERRAIN },
    { id: 'benchmark', label: 'Vertical Datum', type: 'select', required: true, options: TOPO_BENCHMARK },
    { id: 'boundary', label: 'Include Boundary', type: 'select', required: false, options: TOPO_BOUNDARY },
    { id: 'access', label: 'Site Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    TRAVEL_DISTANCE_FIELD,
  ],
  calculatePrice: (v) => {
    let sizeBase = topoSurvey.basePrice + getBaseCost(TOPO_ACREAGE, v.acreage);
    const contourMult = getMultiplier(TOPO_CONTOUR_INTERVAL, v.contourInterval);
    const vegMult = getMultiplier(VEGETATION, v.vegetation);
    const terrainMult = getMultiplier(TERRAIN, v.terrain);
    sizeBase = sizeBase * contourMult * vegMult * terrainMult;
    
    let addOns = 0;
    addOns += getBaseCost(TOPO_PURPOSE, v.purpose);
    addOns += getBaseCost(TOPO_FEATURES, v.features);
    addOns += getBaseCost(TOPO_BENCHMARK, v.benchmark);
    addOns += getBaseCost(TOPO_BOUNDARY, v.boundary);
    addOns += getBaseCost(ACCESS_CONDITIONS, v.access);
    
    const miles = parseFloat(v.travelDistance as string) || 0;
    const travelCost = miles * TRAVEL_RATE;
    addOns += travelCost;
    
    let total = sizeBase + addOns;
    total *= getCostMultiplier(ACCESS_CONDITIONS, v.access);
    
    if (v.rush === 'yes') total *= 1.25;
    
    return { price: total };
  },
};

// =============================================================================
// ELEVATION BUILDING TYPE (specific to elevation)
// =============================================================================
const ELEVATION_BUILDING_TYPE: FieldOption[] = [
  { value: 'single_family', label: 'Single-Family Home', baseCost: 0 },
  { value: 'duplex', label: 'Duplex', baseCost: 75 },
  { value: 'townhouse', label: 'Townhouse', baseCost: 50 },
  { value: 'mobile', label: 'Mobile Home', baseCost: -50 },
  { value: 'multi_family', label: 'Multi-Family', baseCost: 150 },
  { value: 'commercial', label: 'Commercial', baseCost: 125 },
];

// ELEVATION FLOOD ZONE
const ELEVATION_FLOOD_ZONE: FieldOption[] = [
  { value: 'x', label: 'Zone X (minimal risk)', baseCost: -50 },
  { value: 'x500', label: 'Zone X shaded (500-year)', baseCost: 0 },
  { value: 'a', label: 'Zone A (no BFE)', baseCost: 75 },
  { value: 'ae', label: 'Zone AE (with BFE)', baseCost: 0 },
  { value: 'ao', label: 'Zone AO (sheet flow)', baseCost: 75 },
  { value: 'unknown', label: 'Unknown', baseCost: 50 },
];

// ELEVATION PURPOSE
const ELEVATION_PURPOSE: FieldOption[] = [
  { value: 'insurance', label: 'Flood Insurance', baseCost: 0 },
  { value: 'loma', label: 'LOMA Application', baseCost: 150 },
  { value: 'lomr_f', label: 'LOMR-F Application', baseCost: 225 },
  { value: 'construction', label: 'New Construction', baseCost: 50 },
  { value: 'sale', label: 'Property Sale', baseCost: 0 },
];

// ELEVATION BASEMENT
const ELEVATION_BASEMENT: FieldOption[] = [
  { value: 'none', label: 'None', baseCost: 0 },
  { value: 'crawl', label: 'Crawl space', baseCost: 50 },
  { value: 'basement', label: 'Full basement', baseCost: 75 },
  { value: 'walkout', label: 'Walkout basement', baseCost: 100 },
];

// ELEVATION ADDITIONS
const ELEVATION_ADDITIONS: FieldOption[] = [
  { value: 'none', label: 'Original only', baseCost: 0 },
  { value: 'one', label: 'One addition', baseCost: 50 },
  { value: 'multiple', label: 'Multiple additions', baseCost: 100 },
];

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
    { id: 'buildingType', label: 'Building Type', type: 'select', required: true, options: ELEVATION_BUILDING_TYPE },
    { id: 'floodZone', label: 'Flood Zone', type: 'select', required: true, helpText: 'Check policy or FEMA map', options: ELEVATION_FLOOD_ZONE },
    { id: 'purpose', label: 'Purpose', type: 'select', required: true, options: ELEVATION_PURPOSE },
    { id: 'basement', label: 'Basement/Below Area', type: 'select', required: true, options: ELEVATION_BASEMENT },
    { id: 'additions', label: 'Building Additions', type: 'select', required: false, options: ELEVATION_ADDITIONS },
    { id: 'access', label: 'Property Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    TRAVEL_DISTANCE_FIELD,
  ],
  calculatePrice: (v) => {
    let total = elevationCert.basePrice;
    total += getBaseCost(ELEVATION_BUILDING_TYPE, v.buildingType);
    total += getBaseCost(ELEVATION_FLOOD_ZONE, v.floodZone);
    total += getBaseCost(ELEVATION_PURPOSE, v.purpose);
    total += getBaseCost(ELEVATION_BASEMENT, v.basement);
    total += getBaseCost(ELEVATION_ADDITIONS, v.additions);
    total += getBaseCost(ACCESS_CONDITIONS, v.access);

    const miles = parseFloat(v.travelDistance as string) || 0;
    const travelCost = miles * TRAVEL_RATE;
    total += travelCost;

    total *= getCostMultiplier(ACCESS_CONDITIONS, v.access);

    if (v.rush === 'yes') total *= 1.25;

    return { price: Math.max(total, elevationCert.minPrice) };
  },
};

// =============================================================================
// CONSTRUCTION PROJECT TYPE (specific to construction)
// =============================================================================
const CONSTRUCTION_PROJECT_TYPE: FieldOption[] = [
  { value: 'residential', label: 'New Home', baseCost: 0 },
  { value: 'addition', label: 'Home Addition', baseCost: -75 },
  { value: 'commercial', label: 'Commercial Building', baseCost: 300 },
  { value: 'road', label: 'Road/Driveway', baseCost: 150 },
  { value: 'fence', label: 'Fence Line', baseCost: -75 },
  { value: 'septic', label: 'Septic System', baseCost: 0 },
  { value: 'pool', label: 'Swimming Pool', baseCost: -50 },
];

// CONSTRUCTION STAKING TYPE
const CONSTRUCTION_STAKING_TYPE: FieldOption[] = [
  { value: 'corners', label: 'Corners only', baseCost: 0 },
  { value: 'offset', label: 'Offset stakes', baseCost: 75 },
  { value: 'grades', label: 'Grade stakes', baseCost: 200 },
  { value: 'full', label: 'Complete layout', baseCost: 350 },
];

// CONSTRUCTION POINTS
const CONSTRUCTION_POINTS: FieldOption[] = [
  { value: '10', label: '4-10 points', baseCost: 0 },
  { value: '25', label: '11-25 points', baseCost: 150 },
  { value: '50', label: '26-50 points', baseCost: 350 },
  { value: '100', label: '50+ points', baseCost: 700 },
];

// CONSTRUCTION PLANS
const CONSTRUCTION_PLANS: FieldOption[] = [
  { value: 'digital', label: 'Digital CAD', baseCost: 0 },
  { value: 'pdf', label: 'PDF plans', baseCost: 50 },
  { value: 'paper', label: 'Paper only', baseCost: 75 },
  { value: 'none', label: 'No plans', baseCost: 200 },
];

// CONSTRUCTION VISITS
const CONSTRUCTION_VISITS: FieldOption[] = [
  { value: 'single', label: 'Single visit', hoursMultiplier: 1.0 },
  { value: 'two', label: 'Two visits', hoursMultiplier: 1.75 },
  { value: 'multiple', label: 'Multiple visits', hoursMultiplier: 2.5 },
];

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
    { id: 'projectType', label: 'Project Type', type: 'select', required: true, options: CONSTRUCTION_PROJECT_TYPE },
    { id: 'stakingType', label: 'Staking Type', type: 'select', required: true, options: CONSTRUCTION_STAKING_TYPE },
    { id: 'points', label: 'Number of Points', type: 'select', required: true, options: CONSTRUCTION_POINTS },
    { id: 'plans', label: 'Plans Available', type: 'select', required: true, options: CONSTRUCTION_PLANS },
    { id: 'visits', label: 'Site Visits', type: 'select', required: true, options: CONSTRUCTION_VISITS },
    { id: 'terrain', label: 'Terrain', type: 'select', required: true, options: TERRAIN },
    { id: 'access', label: 'Site Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    TRAVEL_DISTANCE_FIELD,
  ],
  calculatePrice: (v) => {
    let total = constructionStaking.basePrice;
    total += getBaseCost(CONSTRUCTION_PROJECT_TYPE, v.projectType);
    total += getBaseCost(CONSTRUCTION_STAKING_TYPE, v.stakingType);
    total += getBaseCost(CONSTRUCTION_POINTS, v.points);
    total += getBaseCost(CONSTRUCTION_PLANS, v.plans);

    const visitsMult = getMultiplier(CONSTRUCTION_VISITS, v.visits);
    const terrainMult = getMultiplier(TERRAIN, v.terrain);
    total *= visitsMult * terrainMult;

    total += getBaseCost(ACCESS_CONDITIONS, v.access);

    const miles = parseFloat(v.travelDistance as string) || 0;
    const travelCost = miles * TRAVEL_RATE;
    total += travelCost;

    total *= getCostMultiplier(ACCESS_CONDITIONS, v.access);

    if (v.rush === 'yes') total *= 1.25;

    return { price: Math.max(total, constructionStaking.minPrice) };
  },
};

// =============================================================================
// SUBDIVISION ACREAGE (specific to subdivision)
// =============================================================================
const SUBDIVISION_ACREAGE: FieldOption[] = [
  { value: '5', label: 'Under 5 acres', baseCost: 0 },
  { value: '10', label: '5 - 10 acres', baseCost: 500 },
  { value: '25', label: '10 - 25 acres', baseCost: 1000 },
  { value: '50', label: '25 - 50 acres', baseCost: 1750 },
  { value: '100', label: '50 - 100 acres', baseCost: 2750 },
  { value: '200', label: '100+ acres', baseCost: 4500 },
];

// SUBDIVISION LOTS
const SUBDIVISION_LOTS: FieldOption[] = [
  { value: '2', label: '2 lots (simple split)', baseCost: -750 },
  { value: '3', label: '3 lots', baseCost: -400 },
  { value: '5', label: '4 - 6 lots', baseCost: 0 },
  { value: '10', label: '7 - 12 lots', baseCost: 700 },
  { value: '25', label: '13 - 25 lots', baseCost: 1750 },
  { value: '50', label: '26+ lots', baseCost: 3500 },
];

// SUBDIVISION ROADS
const SUBDIVISION_ROADS: FieldOption[] = [
  { value: 'none', label: 'No new roads', baseCost: 0 },
  { value: 'simple', label: 'One simple road', baseCost: 700 },
  { value: 'moderate', label: '2-3 roads', baseCost: 1400 },
  { value: 'complex', label: 'Complex with cul-de-sacs', baseCost: 2100 },
];

// SUBDIVISION DRAINAGE
const SUBDIVISION_DRAINAGE: FieldOption[] = [
  { value: 'simple', label: 'Natural drainage', baseCost: 0 },
  { value: 'easements', label: 'Drainage easements', baseCost: 500 },
  { value: 'detention', label: 'Detention required', baseCost: 1000 },
];

// SUBDIVISION JURISDICTION
const SUBDIVISION_JURISDICTION: FieldOption[] = [
  { value: 'county', label: 'County only', baseCost: 0 },
  { value: 'etj', label: 'City ETJ', baseCost: 350 },
  { value: 'city', label: 'City limits', baseCost: 850 },
];

// SUBDIVISION FLOODPLAIN
const SUBDIVISION_FLOODPLAIN: FieldOption[] = [
  { value: 'none', label: 'No floodplain', baseCost: 0 },
  { value: 'minor', label: 'Minor (edge)', baseCost: 500 },
  { value: 'significant', label: 'Significant', baseCost: 1000 },
  { value: 'major', label: 'Major impact', baseCost: 1750 },
];

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
    { id: 'acreage', label: 'Total Tract Size', type: 'select', required: true, options: SUBDIVISION_ACREAGE },
    { id: 'lots', label: 'Number of Lots', type: 'select', required: true, options: SUBDIVISION_LOTS },
    { id: 'roads', label: 'Road Layout', type: 'select', required: true, options: SUBDIVISION_ROADS },
    { id: 'drainage', label: 'Drainage', type: 'select', required: true, options: SUBDIVISION_DRAINAGE },
    { id: 'jurisdiction', label: 'Jurisdiction', type: 'select', required: true, options: SUBDIVISION_JURISDICTION },
    { id: 'vegetation', label: 'Vegetation', type: 'select', required: true, options: VEGETATION },
    { id: 'terrain', label: 'Terrain', type: 'select', required: true, options: TERRAIN },
    { id: 'floodplain', label: 'Floodplain', type: 'select', required: true, options: SUBDIVISION_FLOODPLAIN },
    { id: 'existingSurvey', label: 'Parent Tract Survey', type: 'select', required: true, options: EXISTING_SURVEY },
    TRAVEL_DISTANCE_FIELD,
  ],
  calculatePrice: (v) => {
    let sizeBase = subdivisionPlat.basePrice + getBaseCost(SUBDIVISION_ACREAGE, v.acreage);
    const vegMult = getMultiplier(VEGETATION, v.vegetation);
    const terrainMult = getMultiplier(TERRAIN, v.terrain);
    sizeBase *= vegMult * terrainMult;

    let addOns = 0;
    addOns += getBaseCost(SUBDIVISION_LOTS, v.lots);
    addOns += getBaseCost(SUBDIVISION_ROADS, v.roads);
    addOns += getBaseCost(SUBDIVISION_DRAINAGE, v.drainage);
    addOns += getBaseCost(SUBDIVISION_JURISDICTION, v.jurisdiction);
    addOns += getBaseCost(SUBDIVISION_FLOODPLAIN, v.floodplain);
    addOns += getBaseCost(EXISTING_SURVEY, v.existingSurvey);

    const miles = parseFloat(v.travelDistance as string) || 0;
    const travelCost = miles * TRAVEL_RATE;
    addOns += travelCost;

    let total = sizeBase + addOns;
    if (v.rush === 'yes') total *= 1.25;

    return { price: Math.max(total, subdivisionPlat.minPrice) };
  },
};

// =============================================================================
// AS BUILT STRUCTURE TYPE (specific to as built)
// =============================================================================
const ASBUILT_STRUCTURE_TYPE: FieldOption[] = [
  { value: 'residential', label: 'New Home', baseCost: 0 },
  { value: 'addition', label: 'Addition', baseCost: -75 },
  { value: 'commercial', label: 'Commercial', baseCost: 300 },
  { value: 'accessory', label: 'Garage/Barn/Shop', baseCost: -100 },
  { value: 'pool', label: 'Pool', baseCost: -125 },
  { value: 'foundation', label: 'Foundation Only', baseCost: -75 },
];

// ASBUILT COMPLEXITY
const ASBUILT_COMPLEXITY: FieldOption[] = [
  { value: 'simple', label: 'Simple rectangular', baseCost: 0 },
  { value: 'moderate', label: 'L-shape or offsets', baseCost: 75 },
  { value: 'complex', label: 'Complex footprint', baseCost: 150 },
  { value: 'very_complex', label: 'Multiple buildings', baseCost: 300 },
];

// ASBUILT FEATURES
const ASBUILT_FEATURES: FieldOption[] = [
  { value: 'building', label: 'Building + setbacks only', baseCost: 0 },
  { value: 'improvements', label: '+ drives + walks', baseCost: 100 },
  { value: 'full', label: 'All improvements', baseCost: 225 },
  { value: 'comprehensive', label: 'With elevations', baseCost: 375 },
];

// ASBUILT PERMIT
const ASBUILT_PERMIT: FieldOption[] = [
  { value: 'yes', label: 'Yes - permit required', baseCost: 50 },
  { value: 'no', label: 'No - personal records', baseCost: 0 },
];

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
    { id: 'structureType', label: 'Structure Type', type: 'select', required: true, options: ASBUILT_STRUCTURE_TYPE },
    { id: 'complexity', label: 'Complexity', type: 'select', required: true, options: ASBUILT_COMPLEXITY },
    { id: 'features', label: 'Features to Document', type: 'select', required: true, options: ASBUILT_FEATURES },
    { id: 'permit', label: 'For Permit/CO', type: 'select', required: true, options: ASBUILT_PERMIT },
    { id: 'access', label: 'Site Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    TRAVEL_DISTANCE_FIELD,
  ],
  calculatePrice: (v) => {
    let total = asBuiltSurvey.basePrice;
    total += getBaseCost(ASBUILT_STRUCTURE_TYPE, v.structureType);
    total += getBaseCost(ASBUILT_COMPLEXITY, v.complexity);
    total += getBaseCost(ASBUILT_FEATURES, v.features);
    total += getBaseCost(ASBUILT_PERMIT, v.permit);
    total += getBaseCost(ACCESS_CONDITIONS, v.access);

    const miles = parseFloat(v.travelDistance as string) || 0;
    const travelCost = miles * TRAVEL_RATE;
    total += travelCost;

    total *= getCostMultiplier(ACCESS_CONDITIONS, v.access);

    if (v.rush === 'yes') total *= 1.25;

    return { price: Math.max(total, asBuiltSurvey.minPrice) };
  },
};

// =============================================================================
// MORTGAGE PROPERTY TYPE (specific to mortgage)
// =============================================================================
const MORTGAGE_PROPERTY_TYPE: FieldOption[] = [
  { value: 'residential', label: 'Single-Family', baseCost: 0 },
  { value: 'condo', label: 'Condo', baseCost: -100 },
  { value: 'townhouse', label: 'Townhouse', baseCost: -75 },
  { value: 'multi_family', label: 'Multi-Family', baseCost: 150 },
  { value: 'vacant', label: 'Vacant Lot', baseCost: -75 },
  { value: 'rural', label: 'Rural/Acreage', baseCost: 200 },
];

// MORTGAGE CLOSING DATE
const MORTGAGE_CLOSING_DATE: FieldOption[] = [
  { value: 'flexible', label: '2+ weeks', baseCost: 0 },
  { value: 'standard', label: '7-14 days', baseCost: 0 },
  { value: 'soon', label: 'Within 7 days', baseCost: 0 },
  { value: 'urgent', label: 'Under 5 days', baseCost: 0 },
];

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
    { id: 'propertyType', label: 'Property Type', type: 'select', required: true, options: MORTGAGE_PROPERTY_TYPE },
    { id: 'acreage', label: 'Property Size', type: 'select', required: true, options: PROPERTY_SIZE },
    { id: 'corners', label: 'Property Corners', type: 'select', required: true, options: PROPERTY_CORNERS },
    { id: 'existingMonuments', label: 'Corner Markers', type: 'select', required: true, options: EXISTING_MONUMENTS },
    { id: 'existingSurvey', label: 'Previous Survey', type: 'select', required: true, options: EXISTING_SURVEY },
    { id: 'closingDate', label: 'Closing Timeline', type: 'select', required: true, options: MORTGAGE_CLOSING_DATE },
    { id: 'access', label: 'Property Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    TRAVEL_DISTANCE_FIELD,
  ],
  calculatePrice: (v) => {
    let total = mortgageSurvey.basePrice;
    total += getBaseCost(MORTGAGE_PROPERTY_TYPE, v.propertyType);
    total += getBaseCost(PROPERTY_SIZE, v.acreage);
    total += getBaseCost(PROPERTY_CORNERS, v.corners);
    total += getBaseCost(EXISTING_MONUMENTS, v.existingMonuments);
    total += getBaseCost(EXISTING_SURVEY, v.existingSurvey);
    total += getBaseCost(MORTGAGE_CLOSING_DATE, v.closingDate);
    total += getBaseCost(ACCESS_CONDITIONS, v.access);

    const miles = parseFloat(v.travelDistance as string) || 0;
    const travelCost = miles * TRAVEL_RATE;
    total += travelCost;

    total *= getCostMultiplier(ACCESS_CONDITIONS, v.access);

    if (v.rush === 'yes') total *= 1.25;

    return { price: Math.max(total, mortgageSurvey.minPrice) };
  },
};

// =============================================================================
// EASEMENT TYPE (specific to easement)
// =============================================================================
const EASEMENT_TYPE: FieldOption[] = [
  { value: 'access', label: 'Access/Driveway', baseCost: 0 },
  { value: 'utility_overhead', label: 'Overhead Utility', baseCost: -75 },
  { value: 'utility_underground', label: 'Underground Utility', baseCost: 75 },
  { value: 'pipeline', label: 'Pipeline', baseCost: 150 },
  { value: 'drainage', label: 'Drainage', baseCost: 75 },
  { value: 'road', label: 'Road ROW', baseCost: 150 },
];

// EASEMENT LENGTH
const EASEMENT_LENGTH: FieldOption[] = [
  { value: '250', label: 'Under 250 feet', baseCost: 0 },
  { value: '500', label: '250 - 500 feet', baseCost: 150 },
  { value: '1000', label: '500 - 1,000 feet', baseCost: 300 },
  { value: '2500', label: '1,000 - 2,500 feet', baseCost: 600 },
  { value: '5000', label: '2,500 - 5,000 feet', baseCost: 1100 },
  { value: '10000', label: '1 - 2 miles', baseCost: 1900 },
];

// EASEMENT PARCELS
const EASEMENT_PARCELS: FieldOption[] = [
  { value: '1', label: '1 property', baseCost: 0 },
  { value: '2', label: '2 properties', baseCost: 225 },
  { value: '3', label: '3 properties', baseCost: 400 },
  { value: '5', label: '4-5 properties', baseCost: 625 },
  { value: '10', label: '6+ properties', baseCost: 1100 },
];

// EASEMENT WATER CROSSINGS
const EASEMENT_WATER_CROSSINGS: FieldOption[] = [
  { value: 'none', label: 'None', baseCost: 0 },
  { value: 'one', label: '1 crossing', baseCost: 150 },
  { value: 'multiple', label: 'Multiple', baseCost: 375 },
];

// EASEMENT LEGAL DESC
const EASEMENT_LEGAL_DESC: FieldOption[] = [
  { value: 'no', label: 'Not needed', baseCost: 0 },
  { value: 'simple', label: 'Single description', baseCost: 125 },
  { value: 'multiple', label: 'Per parcel', baseCost: 300 },
];

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
    { id: 'easementType', label: 'Easement Type', type: 'select', required: true, options: EASEMENT_TYPE },
    { id: 'length', label: 'Route Length', type: 'select', required: true, options: EASEMENT_LENGTH },
    { id: 'parcels', label: 'Properties Crossed', type: 'select', required: true, options: EASEMENT_PARCELS },
    { id: 'vegetation', label: 'Vegetation', type: 'select', required: true, options: VEGETATION },
    { id: 'terrain', label: 'Terrain', type: 'select', required: true, options: TERRAIN },
    { id: 'waterCrossings', label: 'Water Crossings', type: 'select', required: false, options: EASEMENT_WATER_CROSSINGS },
    { id: 'legalDesc', label: 'Legal Description', type: 'select', required: true, options: EASEMENT_LEGAL_DESC },
    { id: 'access', label: 'Route Access', type: 'select', required: true, options: ACCESS_CONDITIONS },
    TRAVEL_DISTANCE_FIELD,
  ],
  calculatePrice: (v) => {
    let lengthBase = easementSurvey.basePrice + getBaseCost(EASEMENT_LENGTH, v.length);
    const vegMult = getMultiplier(VEGETATION, v.vegetation);
    const terrainMult = getMultiplier(TERRAIN, v.terrain);
    lengthBase *= vegMult * terrainMult;

    let addOns = 0;
    addOns += getBaseCost(EASEMENT_TYPE, v.easementType);
    addOns += getBaseCost(EASEMENT_PARCELS, v.parcels);
    addOns += getBaseCost(EASEMENT_WATER_CROSSINGS, v.waterCrossings);
    addOns += getBaseCost(EASEMENT_LEGAL_DESC, v.legalDesc);
    addOns += getBaseCost(ACCESS_CONDITIONS, v.access);

    const miles = parseFloat(v.travelDistance as string) || 0;
    const travelCost = miles * TRAVEL_RATE;
    addOns += travelCost;

    let total = lengthBase + addOns;
    total *= getCostMultiplier(ACCESS_CONDITIONS, v.access);

    if (v.rush === 'yes') total *= 1.25;

    return { price: total };
  },
};

// =============================================================================
// LEGAL DESCRIPTION TYPE (specific to legal)
// =============================================================================
const LEGAL_DESCRIPTION_TYPE: FieldOption[] = [
  { value: 'lot_block', label: 'Lot and Block', baseCost: -100 },
  { value: 'metes_bounds', label: 'Metes and Bounds', baseCost: 0 },
  { value: 'easement', label: 'Easement Description', baseCost: 75 },
  { value: 'partial', label: 'Part of Larger Tract', baseCost: 150 },
  { value: 'correction', label: 'Correction', baseCost: -50 },
];

// LEGAL FIELD WORK
const LEGAL_FIELD_WORK: FieldOption[] = [
  { value: 'none', label: 'From existing survey', baseCost: 0 },
  { value: 'verification', label: 'Field verification', baseCost: 225 },
  { value: 'full', label: 'Full field survey', baseCost: 600 },
];

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
    { id: 'type', label: 'Description Type', type: 'select', required: true, options: LEGAL_DESCRIPTION_TYPE },
    { id: 'fieldWork', label: 'Field Work Needed', type: 'select', required: true, options: LEGAL_FIELD_WORK },
    { id: 'acreage', label: 'Property Size', type: 'select', required: true, options: PROPERTY_SIZE,
      showWhen: { field: 'fieldWork', value: ['verification', 'full'] } },
    { id: 'corners', label: 'Number of Corners', type: 'select', required: true, options: PROPERTY_CORNERS,
      showWhen: { field: 'fieldWork', value: ['verification', 'full'] } },
    { id: 'existingSurvey', label: 'Existing Survey', type: 'select', required: true, options: EXISTING_SURVEY },
    TRAVEL_DISTANCE_FIELD,
  ],
  calculatePrice: (v) => {
    let total = legalDescription.basePrice;
    total += getBaseCost(LEGAL_DESCRIPTION_TYPE, v.type);
    total += getBaseCost(LEGAL_FIELD_WORK, v.fieldWork);
    
    // Only add size/corners if field work is needed
    if (v.fieldWork === 'verification' || v.fieldWork === 'full') {
      total += getBaseCost(PROPERTY_SIZE, v.acreage) * 0.5;
      total += getBaseCost(PROPERTY_CORNERS, v.corners) * 0.5;
    }
    
    total += getBaseCost(EXISTING_SURVEY, v.existingSurvey) * 0.5;

    const miles = parseFloat(v.travelDistance as string) || 0;
    const travelCost = miles * TRAVEL_RATE;
    total += travelCost;

    if (v.rush === 'yes') total *= 1.25;
    
    return { price: Math.max(total, legalDescription.minPrice) };
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