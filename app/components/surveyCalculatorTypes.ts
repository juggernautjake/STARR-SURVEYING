// =============================================================================
// SURVEY CALCULATOR TYPES AND COMMON OPTIONS
// =============================================================================

export interface FieldOption {
  value: string;
  label: string;
  hoursMultiplier?: number;  // For scaling factors (vegetation, terrain, contour)
  baseCost?: number;         // For flat dollar add-ons
  hours?: number;            // For time-based pricing (boundary survey)
  costMultiplier?: number;   // For percentage-based cost adjustments (non-boundary surveys)
}

export interface FormField {
  id: string;
  label: string;
  type: 'select' | 'number' | 'text' | 'textarea';
  required: boolean;
  options?: FieldOption[];
  placeholder?: string;
  helpText?: string;
  showWhen?: { field: string; value: string | string[] };
  min?: number;
  step?: string;
}

export interface SurveyTypeConfig {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  minPrice: number;
  fields: FormField[];
  calculatePrice: (values: Record<string, unknown>) => number;
  calculateHours?: (values: Record<string, unknown>) => number;
}

export interface ContactInfo {
  name: string;
  email: string;
  phone: string;
  notes: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const FIELD_HOURLY_RATE = 175;         // Field crew rate (acreage, corners, markers, property type)
export const PREP_HOURLY_RATE = 130;          // Prep/research rate (previous survey review)
export const TRAVEL_COST_PER_MILE = 1.90;     // One-way mileage rate from Belton
export const MARKER_HOURS_PER_PIN = 0.33;     // Hours per marker/rod to set

// ATV/4WD access tiered flat fees (boundary survey)
export const ATV_FEE_SMALL = 75;            // Acreage < 60 acres
export const ATV_FEE_LARGE = 150;           // Acreage >= 60 acres
export const ATV_ACREAGE_THRESHOLD = 60;    // Threshold value for tiered fee

export const ESTIMATE_LOW_MULTIPLIER = 0.91;
export const ESTIMATE_HIGH_MULTIPLIER = 1.065;

// =============================================================================
// INFORMATIONAL / SHARED FIELDS
// =============================================================================

export const PROPERTY_ADDRESS_FIELD: FormField = {
  id: 'propertyAddress',
  label: 'Property Address / Location',
  type: 'text',
  required: true,
  placeholder: 'Enter street address, city, or legal description',
  helpText: 'Provide the most specific location information you have',
};

export const PROPERTY_COUNTY_FIELD: FormField = {
  id: 'propertyCounty',
  label: 'County',
  type: 'select',
  required: true,
  options: [
    { value: 'bell', label: 'Bell County' },
    { value: 'brazos', label: 'Brazos County' },
    { value: 'coryell', label: 'Coryell County' },
    { value: 'falls', label: 'Falls County' },
    { value: 'leon', label: 'Leon County' },
    { value: 'madison', label: 'Madison County' },
    { value: 'mclennan', label: 'McLennan County' },
    { value: 'milam', label: 'Milam County' },
    { value: 'robertson', label: 'Robertson County' },
    { value: 'travis', label: 'Travis County' },
    { value: 'williamson', label: 'Williamson County' },
    { value: 'other', label: 'Other (specify below)' },
  ],
};

export const OTHER_COUNTY_FIELD: FormField = {
  id: 'otherCounty',
  label: 'County Name',
  type: 'text',
  required: true,
  placeholder: 'Enter county name',
  showWhen: { field: 'propertyCounty', value: 'other' },
};

export const TRAVEL_DISTANCE_FIELD: FormField = {
  id: 'travelDistance',
  label: 'One-Way Distance from Belton (miles)',
  type: 'number',
  required: true,
  placeholder: 'Enter miles (e.g. 25)',
  helpText: 'Approximate one-way driving distance from Belton, TX',
  min: 0,
  step: '1',
};

// =============================================================================
// PROPERTY SIZE - Non-boundary surveys (baseCost model)
// =============================================================================
export const PROPERTY_SIZE: FieldOption[] = [
  { value: '0.1', label: 'Less than 0.25 acres', baseCost: 475 },
  { value: '0.375', label: '0.25 - 0.5 acres', baseCost: 515 },
  { value: '0.75', label: '0.5 - 1 acre', baseCost: 575 },
  { value: '1.5', label: '1 - 2 acres', baseCost: 675 },
  { value: '3.5', label: '2 - 5 acres', baseCost: 900 },
  { value: '7.5', label: '5 - 10 acres', baseCost: 1175 },
  { value: '15', label: '10 - 20 acres', baseCost: 1550 },
  { value: '30', label: '20 - 40 acres', baseCost: 1850 },
  { value: '60', label: '40 - 80 acres', baseCost: 2200 },
  { value: '120', label: '80 - 160 acres', baseCost: 2900 },
  { value: '200', label: '160+ acres', baseCost: 4750 },
];

// =============================================================================
// BOUNDARY SURVEY - ACREAGE (hours-based)
// =============================================================================
export const BOUNDARY_ACREAGE: FieldOption[] = [
  { value: '0.1', label: 'Less than 0.25 acres', hours: 0 },
  { value: '0.375', label: '0.25 - 0.5 acres', hours: 0.5 },
  { value: '0.75', label: '0.5 - 1 acre', hours: 1.5 },
  { value: '1.5', label: '1 - 2 acres', hours: 1.5 },
  { value: '3.5', label: '2 - 5 acres', hours: 2 },
  { value: '7.5', label: '5 - 10 acres', hours: 3 },
  { value: '15', label: '10 - 20 acres', hours: 4 },
  { value: '30', label: '20 - 40 acres', hours: 5 },
  { value: '60', label: '40 - 80 acres', hours: 6 },
  { value: '120', label: '80 - 160 acres', hours: 10 },
  { value: '200', label: '160+ acres', hours: 12 },
];

// =============================================================================
// SCALING FACTORS
// =============================================================================

export const VEGETATION: FieldOption[] = [
  { value: 'open', label: 'Open/Clear - Lawn, pasture, cleared', hoursMultiplier: 1.0 },
  { value: 'scattered', label: 'Scattered Trees - Clear sight lines', hoursMultiplier: 1.03 },
  { value: 'moderate', label: 'Moderate Woods - Mixed areas', hoursMultiplier: 1.08 },
  { value: 'dense', label: 'Dense Woods - Limited visibility', hoursMultiplier: 1.15 },
  { value: 'thick_brush', label: 'Thick Brush/Cedar - Machete needed', hoursMultiplier: 1.25 },
  { value: 'unknown', label: 'Unknown', hoursMultiplier: 1.05 },
];

export const TERRAIN: FieldOption[] = [
  { value: 'flat', label: 'Flat - Level ground', hoursMultiplier: 1.0 },
  { value: 'gentle', label: 'Gentle Rolling - 0-10% slopes', hoursMultiplier: 1.0 },
  { value: 'moderate', label: 'Moderate Hills - 10-20% slopes', hoursMultiplier: 1.05 },
  { value: 'steep', label: 'Steep - 20-35% slopes', hoursMultiplier: 1.12 },
  { value: 'very_steep', label: 'Very Steep/Bluffs - 35%+ slopes', hoursMultiplier: 1.20 },
  { value: 'unknown', label: 'Unknown', hoursMultiplier: 1.03 },
];

// =============================================================================
// PROPERTY TYPE (Boundary survey)
// =============================================================================
export const PROPERTY_TYPE: FieldOption[] = [
  { value: 'residential_urban', label: 'Residential - City/Subdivision', baseCost: 0, hours: 0 },
  { value: 'residential_rural', label: 'Residential - Rural/Country', baseCost: 25, hours: 0 },
  { value: 'commercial_subdivision', label: 'Commercial — Subdivision', baseCost: 0, hours: 0 },
  { value: 'commercial_rural', label: 'Commercial — Non-Subdivision/Rural', baseCost: 0, hours: 1.5 },
  { value: 'agricultural', label: 'Agricultural', baseCost: 25, hours: 0 },
  { value: 'vacant', label: 'Vacant/Undeveloped', baseCost: 0, hours: 0 },
];

// PROPERTY CORNERS - Non-boundary (baseCost model)
export const PROPERTY_CORNERS: FieldOption[] = [
  { value: '4', label: '4 corners (rectangular or semi-rectangular)', baseCost: 0 },
  { value: '5', label: '5 corners', baseCost: 25 },
  { value: '6', label: '6 corners', baseCost: 50 },
  { value: '7', label: '7-8 corners', baseCost: 75 },
  { value: '10', label: '9-12 corners', baseCost: 125 },
  { value: '15', label: '13+ corners', baseCost: 200 },
  { value: 'unknown', label: 'Unknown', baseCost: 25 },
];

// BOUNDARY CORNERS (hours-based)
export const BOUNDARY_CORNERS: FieldOption[] = [
  { value: '4', label: '4 corners (rectangular or semi-rectangular)', hours: 0 },
  { value: '5', label: '5 corners', hours: 0.3 },
  { value: '6', label: '6 corners', hours: 0.6 },
  { value: '7', label: '7-8 corners', hours: 1.5 },
  { value: '10', label: '9-12 corners', hours: 2.5 },
  { value: '15', label: '13+ corners', hours: 4 },
  { value: 'unknown', label: 'Unknown', hours: 1 },
];

// PREVIOUS SURVEY - Non-boundary (baseCost model)
export const EXISTING_SURVEY: FieldOption[] = [
  { value: 'recent', label: 'Recent (within 5 years) - Have copy', baseCost: 0 },
  { value: 'recent_no_copy', label: 'Recent (within 5 years) - No copy', baseCost: 25 },
  { value: 'older', label: 'Older (5-15 years)', baseCost: 50 },
  { value: 'very_old', label: 'Old (15-30 years)', baseCost: 75 },
  { value: 'ancient', label: 'Very Old (30+ years)', baseCost: 100 },
  { value: 'none', label: 'No Previous Survey', baseCost: 150 },
  { value: 'unknown', label: 'Unknown', baseCost: 50 },
];

// BOUNDARY PREVIOUS SURVEY (hours-based at RESEARCH rate $130/hr)
export const BOUNDARY_PREVIOUS_SURVEY: FieldOption[] = [
  { value: 'recent', label: 'Recent (within 5 years) - Have copy', hours: -0.5 },
  { value: 'recent_no_copy', label: 'Recent (within 5 years) - No copy', hours: 0 },
  { value: 'older', label: 'Older (5-15 years)', hours: 0.5 },
  { value: 'very_old', label: 'Old (15-30 years)', hours: 0.75 },
  { value: 'ancient', label: 'Very Old (30+ years)', hours: 1 },
  { value: 'none', label: 'No Previous Survey', hours: 1.5 },
  { value: 'unknown', label: 'Unknown', hours: 1 },
];

// CORNER MARKERS
export const EXISTING_MONUMENTS: FieldOption[] = [
  { value: 'all_found', label: 'All corner markers present', baseCost: 0 },
  { value: 'most_found', label: 'Most corner markers present', baseCost: 25 },
  { value: 'some_found', label: 'Some corner markers present', baseCost: 50 },
  { value: 'few_found', label: 'Few or none present', baseCost: 100 },
  { value: 'unknown', label: 'Unknown', baseCost: 50 },
];

// ACCESS CONDITIONS
// baseCost: flat dollar add-on (used by boundary else-branch for non-4WD/unknown types)
// costMultiplier: percentage-based surcharge used by non-boundary surveys;
//                 boundary ignores it and uses tiered flat fees instead
export const ACCESS_CONDITIONS: FieldOption[] = [
  { value: 'paved', label: 'Paved Road - Direct access', baseCost: 0, costMultiplier: 1.0 },
  { value: 'gravel', label: 'Gravel/Caliche Road', baseCost: 0, costMultiplier: 1.0 },
  { value: 'dirt', label: 'Dirt Road - Passable by car', baseCost: 0, costMultiplier: 1.0 },
  { value: 'rough', label: 'Rough Road - High clearance needed', baseCost: 25, costMultiplier: 1.0 },
  { value: '4wd', label: '4WD/ATV Required', baseCost: 0, costMultiplier: 1.2 },
  { value: 'gated', label: 'Gated - Coordinate access', baseCost: 0, costMultiplier: 1.0 },
  { value: 'walk_in', label: 'Walk-In Only', baseCost: 75, costMultiplier: 1.0 },
  { value: 'unknown', label: 'Unknown', baseCost: 0, costMultiplier: 1.2 },
];

// WATERWAY BOUNDARY
export const WATERWAY_BOUNDARY: FieldOption[] = [
  { value: 'no', label: 'No', baseCost: 0 },
  { value: 'yes', label: 'Yes', baseCost: 0 },
];

// ADJOINING PROPERTIES
export const ADJOINING: FieldOption[] = [
  { value: '1', label: '1-2 adjoining tracts', baseCost: 0 },
  { value: '3', label: '3-4 adjoining tracts', baseCost: 25 },
  { value: '5', label: '5-6 adjoining tracts', baseCost: 50 },
  { value: '7', label: '7-10 adjoining tracts', baseCost: 75 },
  { value: '10', label: '10+ adjoining tracts', baseCost: 100 },
  { value: 'unknown', label: 'Unknown', baseCost: 15 },
];

// BOUNDARY FENCE ISSUES — Minor is now flat $130; Major remains flat $150
export const BOUNDARY_FENCE_ISSUES: FieldOption[] = [
  { value: 'none', label: 'No fence or no issues', baseCost: 0 },
  { value: 'minor', label: 'Minor discrepancy', baseCost: 130 },
  { value: 'major', label: 'Significant dispute', baseCost: 150 },
];

// BOUNDARY MARKERS NEEDED (0.33 hrs per pin at $175/hr ≈ $58 each)
export const BOUNDARY_MARKERS_NEEDED: FieldOption[] = [
  { value: 'none', label: 'Just locate existing', hours: 0 },
  { value: 'few', label: 'Replace 1-2 markers', hours: 0.66 },
  { value: 'several', label: 'Replace 3-4 markers', hours: 1.32 },
  { value: 'many', label: 'Replace 5-6 markers', hours: 1.98 },
  { value: 'all', label: 'Set all new pins', hours: 0 },
];

export const getCornerCount = (cornerValue: unknown): number => {
  const map: Record<string, number> = {
    '4': 4, '5': 5, '6': 6, '7': 8, '10': 10, '15': 15, 'unknown': 6,
  };
  return map[cornerValue as string] || 4;
};

// SURVEY PURPOSE (Boundary) — Building Permit removed, City Subdivision added
export const SURVEY_PURPOSE: FieldOption[] = [
  { value: 'fence', label: 'Fence Installation', baseCost: 0 },
  { value: 'sale', label: 'Property Sale', baseCost: 0 },
  { value: 'dispute', label: 'Boundary Dispute', baseCost: 75 },
  { value: 'personal', label: 'Personal Records', baseCost: 0 },
  { value: 'city_subdivision', label: 'City Subdivision', baseCost: 0 },
];

export const CITY_SUBDIVISION_LOTS: FieldOption[] = [
  { value: '2-3', label: '2-3 lots', baseCost: 1500 },
  { value: '4-5', label: '4-5 lots', baseCost: 1700 },
  { value: '6-8', label: '6-8 lots', baseCost: 2200 },
  { value: '8-12', label: '8-12 lots', baseCost: 3200 },
  { value: '12+', label: 'More than 12 lots', baseCost: 0 },
];

// =============================================================================
// RESIDENTIAL STRUCTURE FIELDS
// =============================================================================

export const HAS_RESIDENCE: FieldOption[] = [
  { value: 'no', label: 'No - Vacant lot', baseCost: 0 },
  { value: 'yes', label: 'Yes - Has residence', baseCost: 0 },
];

export const RESIDENCE_CORNERS: FieldOption[] = [
  { value: '4', label: '4 corners (simple rectangle)', baseCost: 75 },
  { value: '6', label: '5-6 corners (L-shape or simple)', baseCost: 100 },
  { value: '8', label: '7-8 corners (typical home)', baseCost: 150 },
  { value: '10', label: '9-10 corners (larger home)', baseCost: 200 },
  { value: '12', label: '11-14 corners (complex)', baseCost: 275 },
  { value: '15', label: '15+ corners (very complex)', baseCost: 375 },
  { value: 'unknown', label: 'Unknown', baseCost: 150 },
];

export const RESIDENCE_SIZE: FieldOption[] = [
  { value: 'small', label: 'Under 1,500 sq ft', baseCost: 0 },
  { value: 'medium', label: '1,500 - 2,500 sq ft', baseCost: 25 },
  { value: 'large', label: '2,500 - 4,000 sq ft', baseCost: 50 },
  { value: 'very_large', label: '4,000 - 6,000 sq ft', baseCost: 100 },
  { value: 'estate', label: '6,000+ sq ft', baseCost: 175 },
  { value: 'unknown', label: 'Unknown', baseCost: 25 },
];

export const GARAGE: FieldOption[] = [
  { value: 'none', label: 'No garage', baseCost: 0 },
  { value: 'attached', label: 'Attached garage (included in house corners)', baseCost: 0 },
  { value: 'detached', label: 'Detached garage', baseCost: 50 },
  { value: 'detached_large', label: 'Large detached garage/workshop', baseCost: 75 },
];

// =============================================================================
// IMPROVEMENT TYPES
// =============================================================================

export const IMPROVEMENT_TYPE: FieldOption[] = [
  { value: 'none', label: '-- Select type --', baseCost: 0 },
  { value: 'shed_small', label: 'Small Shed (under 120 sq ft)', baseCost: 25 },
  { value: 'shed_medium', label: 'Medium Shed/Outbuilding (120-400 sq ft)', baseCost: 40 },
  { value: 'shed_large', label: 'Large Shed/Workshop (400+ sq ft)', baseCost: 60 },
  { value: 'barn_small', label: 'Small Barn (under 1,000 sq ft)', baseCost: 65 },
  { value: 'barn_large', label: 'Large Barn (1,000+ sq ft)', baseCost: 90 },
  { value: 'shop', label: 'Shop/Metal Building', baseCost: 75 },
  { value: 'carport', label: 'Carport', baseCost: 30 },
  { value: 'gazebo', label: 'Gazebo/Pavilion', baseCost: 35 },
  { value: 'pool', label: 'Swimming Pool', baseCost: 50 },
  { value: 'pool_house', label: 'Pool House', baseCost: 60 },
  { value: 'guest_house', label: 'Guest House/ADU (Additional Residence)', baseCost: 100 },
  { value: 'mobile_home', label: 'Mobile Home/Manufactured Home', baseCost: 75 },
  { value: 'rv_cover', label: 'RV Cover/Boat Storage', baseCost: 40 },
  { value: 'greenhouse', label: 'Greenhouse', baseCost: 35 },
  { value: 'other_small', label: 'Other Small Structure', baseCost: 35 },
  { value: 'other_large', label: 'Other Large Structure', baseCost: 75 },
];

export const NUM_IMPROVEMENTS: FieldOption[] = [
  { value: '0', label: 'None', baseCost: 0 },
  { value: '1', label: '1 improvement', baseCost: 0 },
  { value: '2', label: '2 improvements', baseCost: 0 },
  { value: '3', label: '3 improvements', baseCost: 0 },
  { value: '4', label: '4 improvements', baseCost: 0 },
  { value: '5', label: '5 improvements', baseCost: 0 },
  { value: '6', label: '6 improvements', baseCost: 0 },
  { value: '7', label: '7 improvements', baseCost: 0 },
  { value: '8', label: '8 improvements', baseCost: 0 },
];

export const ADDITIONAL_RESIDENCE_CORNERS: FieldOption[] = [
  { value: '4', label: '4 corners (simple rectangle)', baseCost: 50 },
  { value: '6', label: '5-6 corners', baseCost: 75 },
  { value: '8', label: '7-8 corners', baseCost: 100 },
  { value: '10', label: '9+ corners', baseCost: 150 },
  { value: 'unknown', label: 'Unknown', baseCost: 75 },
];

export const ADDITIONAL_RESIDENCE_SIZE: FieldOption[] = [
  { value: 'small', label: 'Under 800 sq ft', baseCost: 0 },
  { value: 'medium', label: '800 - 1,500 sq ft', baseCost: 25 },
  { value: 'large', label: '1,500+ sq ft', baseCost: 50 },
  { value: 'unknown', label: 'Unknown', baseCost: 15 },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export const getBaseCost = (opts: FieldOption[] | undefined, val: unknown): number => {
  if (!opts || val === undefined || val === '') return 0;
  const opt = opts.find(o => o.value === val);
  return opt?.baseCost || 0;
};

export const getMultiplier = (opts: FieldOption[] | undefined, val: unknown): number => {
  if (!opts || val === undefined || val === '') return 1;
  const opt = opts.find(o => o.value === val);
  return opt?.hoursMultiplier || 1;
};

export const getHours = (opts: FieldOption[] | undefined, val: unknown): number => {
  if (!opts || val === undefined || val === '') return 0;
  const opt = opts.find(o => o.value === val);
  return opt?.hours ?? 0;
};

// costMultiplier: used by non-boundary surveys for percentage-based access surcharges
export const getCostMultiplier = (opts: FieldOption[] | undefined, val: unknown): number => {
  if (!opts || val === undefined || val === '') return 1;
  const opt = opts.find(o => o.value === val);
  return opt?.costMultiplier || 1;
};

export const isAdditionalResidence = (improvementType: string): boolean => {
  return improvementType === 'guest_house' || improvementType === 'mobile_home';
};