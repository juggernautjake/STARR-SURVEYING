// =============================================================================
// SURVEY CALCULATOR TYPES AND COMMON OPTIONS
// =============================================================================

export interface FieldOption {
  value: string;
  label: string;
  hoursMultiplier?: number;  // For scaling factors (vegetation, terrain, access)
  baseCost?: number;         // For flat dollar add-ons
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
}

export interface SurveyTypeConfig {
  id: string;
  name: string;
  description: string;
  basePrice: number;  // Minimum base price for simplest case
  minPrice: number;   // Absolute minimum (floor)
  fields: FormField[];
  calculatePrice: (values: Record<string, unknown>) => number;
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

export const MILEAGE_RATE = 0.67;
export const TRAVEL_SPEED_AVG = 50;
export const TRAVEL_HOURLY_RATE = 65; // Half rate for travel time

// Boundary survey field work hourly rate (for add-on hour calculations)
export const BOUNDARY_FIELD_RATE = 80;

// Travel cost: $1.50 per mile (one-way)
export const TRAVEL_RATE_PER_MILE = 1.50;

// Estimate range: low stays at -9%, high reduced to +6.5% (was +9%)
export const ESTIMATE_LOW_MULTIPLIER = 0.91;
export const ESTIMATE_HIGH_MULTIPLIER = 1.065;

// =============================================================================
// INFORMATIONAL FIELDS (No cost impact)
// =============================================================================

export const PROPERTY_ADDRESS_FIELD: FormField = {
  id: 'propertyAddress',
  label: 'Property Address / Location',
  type: 'text',
  required: true,
  placeholder: 'Enter street address, city, or legal description',
  helpText: 'Provide the most specific location information you have',
};

// County dropdown - UPDATED: removed Lampasas, Burnet, Hamilton, Bosque, Hill,
// Limestone; added Leon, Madison; alphabetized; "Other" shows text field
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
    { value: 'other', label: 'Other' },
  ],
};

// Conditional text field shown when county = "Other"
export const PROPERTY_COUNTY_OTHER_FIELD: FormField = {
  id: 'propertyCountyOther',
  label: 'County Name',
  type: 'text',
  required: true,
  placeholder: 'Enter county name',
  showWhen: { field: 'propertyCounty', value: 'other' },
};

// =============================================================================
// TRAVEL DISTANCE - Numeric input (replaces old dropdown tiers)
// Formula: miles × $1.50/mile
// =============================================================================
export const TRAVEL_DISTANCE_FIELD: FormField = {
  id: 'travelDistance',
  label: 'Distance from Belton (miles)',
  type: 'number',
  required: true,
  placeholder: 'e.g., 25',
  helpText: 'One-way miles from Belton, TX. Cost: $1.50/mile.',
};

// =============================================================================
// PROPERTY SIZE - Primary cost driver (BASE COST)
// This is the main cost that gets multiplied by vegetation/terrain
// UPDATED: New bracket structure matching hour-based model
//   <0.25: +0 hrs | 0.25-0.5: +0.5 | 0.5-1: +1.5 | 1-2: +1.5
//   2-5: +2 | 5-10: +3 | 10-20: +4 | 20-40: +5 | 40-80: +6
//   80-160: +10 | 160+: +12
// =============================================================================
export const PROPERTY_SIZE: FieldOption[] = [
  { value: '0.1', label: 'Less than 0.25 acres', baseCost: 475 },     // +0 hrs (base)
  { value: '0.375', label: '0.25 - 0.5 acres', baseCost: 525 },      // +0.5 hrs
  { value: '0.75', label: '0.5 - 1 acre', baseCost: 600 },           // +1.5 hrs
  { value: '1.5', label: '1 - 2 acres', baseCost: 700 },             // +1.5 hrs
  { value: '3.5', label: '2 - 5 acres', baseCost: 950 },             // +2 hrs
  { value: '7.5', label: '5 - 10 acres', baseCost: 1250 },           // +3 hrs
  { value: '15', label: '10 - 20 acres', baseCost: 1550 },           // +4 hrs
  { value: '30', label: '20 - 40 acres', baseCost: 1850 },           // +5 hrs
  { value: '60', label: '40 - 80 acres', baseCost: 2200 },           // +6 hrs
  { value: '120', label: '80 - 160 acres', baseCost: 3000 },         // +10 hrs
  { value: '200', label: '160+ acres', baseCost: 4500 },             // +12 hrs
];

// =============================================================================
// SCALING FACTORS - Multiply the property size base cost ONLY
// =============================================================================

// VEGETATION - How hard is it to see/traverse?
export const VEGETATION: FieldOption[] = [
  { value: 'open', label: 'Open/Clear - Lawn, pasture, cleared', hoursMultiplier: 1.0 },
  { value: 'scattered', label: 'Scattered Trees - Clear sight lines', hoursMultiplier: 1.03 },
  { value: 'moderate', label: 'Moderate Woods - Mixed areas', hoursMultiplier: 1.08 },
  { value: 'dense', label: 'Dense Woods - Limited visibility', hoursMultiplier: 1.15 },
  { value: 'thick_brush', label: 'Thick Brush/Cedar - Machete needed', hoursMultiplier: 1.25 },
  { value: 'unknown', label: 'Unknown', hoursMultiplier: 1.05 },
];

// TERRAIN - How hard is it to walk/work?
export const TERRAIN: FieldOption[] = [
  { value: 'flat', label: 'Flat - Level ground', hoursMultiplier: 1.0 },
  { value: 'gentle', label: 'Gentle Rolling - 0-10% slopes', hoursMultiplier: 1.0 },
  { value: 'moderate', label: 'Moderate Hills - 10-20% slopes', hoursMultiplier: 1.05 },
  { value: 'steep', label: 'Steep - 20-35% slopes', hoursMultiplier: 1.12 },
  { value: 'very_steep', label: 'Very Steep/Bluffs - 35%+ slopes', hoursMultiplier: 1.20 },
  { value: 'unknown', label: 'Unknown', hoursMultiplier: 1.03 },
];

// =============================================================================
// FLAT ADD-ONS - Added directly to total (not scaled by veg/terrain)
// =============================================================================

// PROPERTY TYPE - UPDATED: Split commercial into two, renamed Agricultural
// Commercial types get 10% multiplier in calculatePrice, not via baseCost.
// Non-Subdivision/Rural commercial adds 1.5 hrs for legal description.
export const PROPERTY_TYPE: FieldOption[] = [
  { value: 'residential_urban', label: 'Residential - City/Subdivision', baseCost: 0 },
  { value: 'residential_rural', label: 'Residential - Rural/Country', baseCost: 25 },
  { value: 'commercial_subdivision', label: 'Commercial - Subdivision', baseCost: 0 },
  { value: 'commercial_rural', label: 'Commercial - Non-Subdivision/Rural', baseCost: 0 },
  { value: 'agricultural', label: 'Agricultural', baseCost: 25 },
  { value: 'vacant', label: 'Vacant/Undeveloped', baseCost: 0 },
];

// PROPERTY CORNERS - UPDATED: new label for 4-corner, hour-based costs
// Hours: 4→+0, 5→+0.3, 6→+0.6, 7-8→+1.5, 9-12→+2.5, 13+→+4, Unknown→+1
export const PROPERTY_CORNERS: FieldOption[] = [
  { value: '4', label: '4 corners (rectangular or semi-rectangular)', baseCost: 0 },   // +0 hrs
  { value: '5', label: '5 corners', baseCost: 24 },                                     // +0.3 hrs
  { value: '6', label: '6 corners', baseCost: 48 },                                     // +0.6 hrs
  { value: '7', label: '7-8 corners', baseCost: 120 },                                  // +1.5 hrs
  { value: '10', label: '9-12 corners', baseCost: 200 },                                // +2.5 hrs
  { value: '15', label: '13+ corners', baseCost: 320 },                                 // +4 hrs
  { value: 'unknown', label: 'Unknown', baseCost: 80 },                                 // +1 hr
];

// PREVIOUS SURVEY - UPDATED: hour-based costs
// Hours: recent w/copy→-0.5, recent no copy→0, older→0.5, old→0.75,
//        very old→1, none→1.5, unknown→1
export const EXISTING_SURVEY: FieldOption[] = [
  { value: 'recent', label: 'Recent (within 5 years) - Have copy', baseCost: -40 },     // -0.5 hrs
  { value: 'recent_no_copy', label: 'Recent (within 5 years) - No copy', baseCost: 0 }, // +0 hrs
  { value: 'older', label: 'Older (5-15 years)', baseCost: 40 },                         // +0.5 hrs
  { value: 'very_old', label: 'Old (15-30 years)', baseCost: 60 },                       // +0.75 hrs
  { value: 'ancient', label: 'Very Old (30+ years)', baseCost: 80 },                     // +1 hr
  { value: 'none', label: 'No Previous Survey', baseCost: 120 },                         // +1.5 hrs
  { value: 'unknown', label: 'Unknown', baseCost: 80 },                                  // +1 hr
];

// CORNER MARKERS - No changes
export const EXISTING_MONUMENTS: FieldOption[] = [
  { value: 'all_found', label: 'All corner markers present', baseCost: 0 },
  { value: 'most_found', label: 'Most corner markers present', baseCost: 25 },
  { value: 'some_found', label: 'Some corner markers present', baseCost: 50 },
  { value: 'few_found', label: 'Few or none present', baseCost: 100 },
  { value: 'unknown', label: 'Unknown', baseCost: 50 },
];

// PROPERTY ACCESS - UPDATED: 4WD and Unknown now use x1.2 multiplier
export const ACCESS_CONDITIONS: FieldOption[] = [
  { value: 'paved', label: 'Paved Road - Direct access', baseCost: 0 },
  { value: 'gravel', label: 'Gravel/Caliche Road', baseCost: 0 },
  { value: 'dirt', label: 'Dirt Road - Passable by car', baseCost: 0 },
  { value: 'rough', label: 'Rough Road - High clearance needed', baseCost: 25 },
  { value: '4wd', label: '4WD/ATV Required', baseCost: 0, hoursMultiplier: 1.2 },
  { value: 'gated', label: 'Gated - Coordinate access', baseCost: 0 },
  { value: 'walk_in', label: 'Walk-In Only', baseCost: 75 },
  { value: 'unknown', label: 'Unknown', baseCost: 0, hoursMultiplier: 1.2 },
];

// WATERWAY BOUNDARY - No changes (applies 20% multiplier if yes)
export const WATERWAY_BOUNDARY: FieldOption[] = [
  { value: 'no', label: 'No', baseCost: 0 },
  { value: 'yes', label: 'Yes', baseCost: 0 },
];

// ADJOINING PROPERTIES - No changes
export const ADJOINING: FieldOption[] = [
  { value: '1', label: '1-2 adjoining tracts', baseCost: 0 },
  { value: '3', label: '3-4 adjoining tracts', baseCost: 25 },
  { value: '5', label: '5-6 adjoining tracts', baseCost: 50 },
  { value: '7', label: '7-10 adjoining tracts', baseCost: 75 },
  { value: '10', label: '10+ adjoining tracts', baseCost: 100 },
  { value: 'unknown', label: 'Unknown', baseCost: 15 },
];

// FENCE ISSUES - UPDATED: minor discrepancy now +1 hr ($80)
export const FENCE_ISSUES: FieldOption[] = [
  { value: 'none', label: 'No fence or no issues', baseCost: 0 },
  { value: 'minor', label: 'Minor discrepancy', baseCost: 80 },     // +1 hr (was $50)
  { value: 'major', label: 'Significant dispute', baseCost: 150 },  // unchanged
];

// NEW MARKERS NEEDED - UPDATED: costs calculated dynamically based on corners
// baseCost is 0; actual pricing handled by calculateMarkersCost() in surveyConfigs
export const MONUMENTS_NEEDED: FieldOption[] = [
  { value: 'none', label: 'Just locate existing', baseCost: 0 },
  { value: 'few', label: 'A few need replacing', baseCost: 0 },
  { value: 'several', label: 'About half need replacing', baseCost: 0 },
  { value: 'all', label: 'Set all new pins', baseCost: 0 },
];

// PURPOSE - UPDATED: Removed "Building Permit", added "City Subdivision"
export const SURVEY_PURPOSE: FieldOption[] = [
  { value: 'fence', label: 'Fence Installation', baseCost: 0 },
  { value: 'sale', label: 'Property Sale', baseCost: 0 },
  { value: 'dispute', label: 'Boundary Dispute', baseCost: 75 },
  { value: 'personal', label: 'Personal Records', baseCost: 0 },
  { value: 'city_subdivision', label: 'City Subdivision', baseCost: 0 },
];

// SUBDIVISION LOT COUNT - NEW: conditional dropdown for city subdivision purpose
export const SUBDIVISION_LOT_COUNT: FieldOption[] = [
  { value: '2-3', label: '2-3 lots', baseCost: 1500 },
  { value: '4-5', label: '4-5 lots', baseCost: 1700 },
  { value: '6-8', label: '6-8 lots', baseCost: 2200 },
  { value: '8-12', label: '8-12 lots', baseCost: 3200 },
  { value: '12+', label: 'More than 12 lots', baseCost: 0 },  // "Please call for more info"
];

// =============================================================================
// RESIDENTIAL STRUCTURE FIELDS (Conditional - shown for residential types)
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
// INDIVIDUAL IMPROVEMENT TYPES (for dynamic improvement fields)
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

export const isAdditionalResidence = (improvementType: string): boolean => {
  return improvementType === 'guest_house' || improvementType === 'mobile_home';
};

// Calculate travel cost from numeric miles input
export const calculateTravelCost = (travelDistance: unknown): number => {
  const miles = parseFloat(travelDistance as string) || 0;
  return miles * TRAVEL_RATE_PER_MILE;
};

// Apply access cost: either flat add-on OR x1.2 multiplier on subtotal
export const applyAccessCost = (accessValue: unknown, currentTotal: number): number => {
  const mult = getMultiplier(ACCESS_CONDITIONS, accessValue);
  if (mult > 1) {
    return currentTotal * mult;
  }
  return currentTotal + getBaseCost(ACCESS_CONDITIONS, accessValue);
};