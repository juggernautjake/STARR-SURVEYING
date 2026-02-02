// app/components/surveyCalculatorTypes.ts
// =============================================================================
// SURVEY CALCULATOR TYPES AND COMMON OPTIONS
// =============================================================================

export interface FieldOption {
  value: string;
  label: string;
  hoursMultiplier?: number;  // For scaling factors (vegetation, terrain)
  baseCost?: number;         // For flat dollar add-ons
  hoursAdded?: number;       // For hourly additions
  premium?: number;          // For percentage premiums
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

export const HOURLY_RATE = 150; // Adjusted to approximate original pricing

export const MILEAGE_RATE = 0.67;
export const TRAVEL_SPEED_AVG = 50;
export const TRAVEL_HOURLY_RATE = 65; // Half rate for travel time

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

export const PROPERTY_COUNTY_FIELD: FormField = {
  id: 'propertyCounty',
  label: 'County',
  type: 'select',
  required: true,
  options: [
    { value: 'bell', label: 'Bell County' },
    { value: 'coryell', label: 'Coryell County' },
    { value: 'milam', label: 'Milam County' },
    { value: 'falls', label: 'Falls County' },
    { value: 'mclennan', label: 'McLennan County' },
    { value: 'williamson', label: 'Williamson County' },
    { value: 'travis', label: 'Travis County' },
    { value: 'robertson', label: 'Robertson County' },
    { value: 'brazos', label: 'Brazos County' },
    { value: 'leon', label: 'Leon County' },
    { value: 'madison', label: 'Madison County' },
    { value: 'other', label: 'Other' },
  ],
};

export const CUSTOM_COUNTY_FIELD: FormField = {
  id: 'customCounty',
  label: 'Custom County Name',
  type: 'text',
  required: true,
  placeholder: 'Enter county name',
  showWhen: { field: 'propertyCounty', value: 'other' },
};

// =============================================================================
// PROPERTY TYPE - Restructured
// =============================================================================
export const PROPERTY_TYPE: FieldOption[] = [
  { value: 'residential_urban', label: 'Residential - City/Subdivision', premium: 0, hoursAdded: 0 },
  { value: 'residential_rural', label: 'Residential - Rural/Country', premium: 0, hoursAdded: 0 },
  { value: 'commercial_subdivision', label: 'Commercial — Subdivision', premium: 0.10, hoursAdded: 0 },
  { value: 'commercial_non_sub', label: 'Commercial — Non-Subdivision/Rural', premium: 0.10, hoursAdded: 1.5 },
  { value: 'agricultural', label: 'Agricultural', premium: 0, hoursAdded: 0 },
  { value: 'vacant', label: 'Vacant/Undeveloped', premium: 0, hoursAdded: 0 },
];

// =============================================================================
// PROPERTY SIZE - Convert to hours
// =============================================================================
export const PROPERTY_SIZE: FieldOption[] = [
  { value: '0.25', label: 'Less than 0.25 acres', hoursAdded: 0 },
  { value: '0.25-0.5', label: '0.25 – 0.5 acres', hoursAdded: 0.5 },
  { value: '0.5-1', label: '0.5 – 1 acre', hoursAdded: 1.5 },
  { value: '1-2', label: '1 – 2 acres', hoursAdded: 1.5 },
  { value: '2-5', label: '2 – 5 acres', hoursAdded: 2 },
  { value: '5-10', label: '5 – 10 acres', hoursAdded: 3 },
  { value: '10-20', label: '10 – 20 acres', hoursAdded: 4 },
  { value: '20-40', label: '20 – 40 acres', hoursAdded: 5 },
  { value: '40-80', label: '40 – 80 acres', hoursAdded: 6 },
  { value: '80-160', label: '80 – 160 acres', hoursAdded: 10 },
  { value: '160+', label: '160+ acres', hoursAdded: 12 },
];

// =============================================================================
// PROPERTY CORNERS - Convert to hours
// =============================================================================
export const PROPERTY_CORNERS: FieldOption[] = [
  { value: '4', label: '4 corners (rectangular or semi-rectangular)', hoursAdded: 0 },
  { value: '5', label: '5 corners', hoursAdded: 0.3 },
  { value: '6', label: '6 corners', hoursAdded: 0.6 },
  { value: '7-8', label: '7–8 corners', hoursAdded: 1.5 },
  { value: '9-12', label: '9–12 corners', hoursAdded: 2.5 },
  { value: '13+', label: '13+ corners', hoursAdded: 4 },
  { value: 'unknown', label: 'Unknown', hoursAdded: 1 },
];

// =============================================================================
// SCALING FACTORS - Multiply the property size cost ONLY
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
// FLAT ADD-ONS - Added directly to total (not scaled)
// =============================================================================

// PREVIOUS SURVEY - Convert to hours
export const EXISTING_SURVEY: FieldOption[] = [
  { value: 'recent_copy', label: 'Recent survey with copy available', hoursAdded: -0.5 },
  { value: 'recent_no_copy', label: 'Recent survey, no copy', hoursAdded: 0 },
  { value: 'older', label: 'Older survey (5–15 years)', hoursAdded: 0.5 },
  { value: 'old', label: 'Old survey (15–30 years)', hoursAdded: 0.75 },
  { value: 'very_old', label: 'Very old survey (30+ years)', hoursAdded: 1 },
  { value: 'none', label: 'No previous survey', hoursAdded: 1.5 },
  { value: 'unknown', label: 'Unknown', hoursAdded: 1 },
];

// CORNER MARKERS - Updated wording
export const EXISTING_MONUMENTS: FieldOption[] = [
  { value: 'all_found', label: 'All corner markers present', baseCost: 0 },
  { value: 'most_found', label: 'Most corner markers present', baseCost: 25 },
  { value: 'some_found', label: 'Some corner markers present', baseCost: 50 },
  { value: 'few_found', label: 'Few or none present', baseCost: 100 },
  { value: 'unknown', label: 'Unknown', baseCost: 50 },
];

// PROPERTY ACCESS - Change to multipliers for specific
export const ACCESS_CONDITIONS: FieldOption[] = [
  { value: 'paved', label: 'Paved Road - Direct access', baseCost: 0 },
  { value: 'gravel', label: 'Gravel/Caliche Road', baseCost: 0 },
  { value: 'dirt', label: 'Dirt Road - Passable by car', baseCost: 0 },
  { value: 'rough', label: 'Rough Road - High clearance needed', baseCost: 25 },
  { value: '4wd', label: '4WD/ATV Required', hoursMultiplier: 1.2 },
  { value: 'gated', label: 'Gated - Coordinate access', baseCost: 0 },
  { value: 'walk_in', label: 'Walk-In Only', baseCost: 75 },
  { value: 'unknown', label: 'Unknown', hoursMultiplier: 1.2 },
];

// WATERWAY BOUNDARY - Simple yes/no (applies 20% multiplier if yes)
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

// FENCE ISSUES - Partial conversion
export const FENCE_ISSUES: FieldOption[] = [
  { value: 'none', label: 'No fence or no issues', baseCost: 0 },
  { value: 'minor', label: 'Minor discrepancy', hoursAdded: 1 },
  { value: 'significant', label: 'Significant dispute', baseCost: 150 },
];

// PURPOSE - Changes
export const SURVEY_PURPOSE: FieldOption[] = [
  { value: 'fence', label: 'Fence Installation', baseCost: 0 },
  { value: 'sale', label: 'Property Sale', baseCost: 0 },
  { value: 'dispute', label: 'Boundary Dispute', baseCost: 75 },
  { value: 'personal', label: 'Personal Records', baseCost: 0 },
  { value: 'city_subdivision', label: 'City Subdivision', baseCost: 0 },
];

// LOT COUNT for city subdivision
export const LOT_COUNT: FieldOption[] = [
  { value: '2-3', label: '2–3 lots', baseCost: 1500 },
  { value: '4-5', label: '4–5 lots', baseCost: 1700 },
  { value: '6-8', label: '6–8 lots', baseCost: 2200 },
  { value: '8-12', label: '8–12 lots', baseCost: 3200 },
  { value: '12+', label: 'More than 12 lots', baseCost: 0 },
];

// =============================================================================
// RESIDENTIAL STRUCTURE FIELDS (Conditional - shown for residential types)
// =============================================================================

// Does property have a residence?
export const HAS_RESIDENCE: FieldOption[] = [
  { value: 'no', label: 'No - Vacant lot', baseCost: 0 },
  { value: 'yes', label: 'Yes - Has residence', baseCost: 0 },
];

// Residence complexity by outside corners
export const RESIDENCE_CORNERS: FieldOption[] = [
  { value: '4', label: '4 corners (simple rectangle)', baseCost: 75 },
  { value: '6', label: '5-6 corners (L-shape or simple)', baseCost: 100 },
  { value: '8', label: '7-8 corners (typical home)', baseCost: 150 },
  { value: '10', label: '9-10 corners (larger home)', baseCost: 200 },
  { value: '12', label: '11-14 corners (complex)', baseCost: 275 },
  { value: '15', label: '15+ corners (very complex)', baseCost: 375 },
  { value: 'unknown', label: 'Unknown', baseCost: 150 },
];

// Residence size by square footage
export const RESIDENCE_SIZE: FieldOption[] = [
  { value: 'small', label: 'Under 1,500 sq ft', baseCost: 0 },
  { value: 'medium', label: '1,500 - 2,500 sq ft', baseCost: 25 },
  { value: 'large', label: '2,500 - 4,000 sq ft', baseCost: 50 },
  { value: 'very_large', label: '4,000 - 6,000 sq ft', baseCost: 100 },
  { value: 'estate', label: '6,000+ sq ft', baseCost: 175 },
  { value: 'unknown', label: 'Unknown', baseCost: 25 },
];

// Garage
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

// Number of other improvements
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

// Additional residence corners (for guest house/ADU)
export const ADDITIONAL_RESIDENCE_CORNERS: FieldOption[] = [
  { value: '4', label: '4 corners (simple rectangle)', baseCost: 50 },
  { value: '6', label: '5-6 corners', baseCost: 75 },
  { value: '8', label: '7-8 corners', baseCost: 100 },
  { value: '10', label: '9+ corners', baseCost: 150 },
  { value: 'unknown', label: 'Unknown', baseCost: 75 },
];

// Additional residence size
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

export const getHoursAdded = (opts: FieldOption[] | undefined, val: unknown): number => {
  if (!opts || val === undefined || val === '') return 0;
  const opt = opts.find(o => o.value === val);
  return opt?.hoursAdded || 0;
};

export const getPremium = (opts: FieldOption[] | undefined, val: unknown): number => {
  if (!opts || val === undefined || val === '') return 0;
  const opt = opts.find(o => o.value === val);
  return opt?.premium || 0;
};

export const getMultiplier = (opts: FieldOption[] | undefined, val: unknown): number => {
  if (!opts || val === undefined || val === '') return 1;
  const opt = opts.find(o => o.value === val);
  return opt?.hoursMultiplier || 1;
};

// Check if an improvement type is an additional residence
export const isAdditionalResidence = (improvementType: string): boolean => {
  return improvementType === 'guest_house' || improvementType === 'mobile_home';
};