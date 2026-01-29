// =============================================================================
// SURVEY CALCULATOR TYPES AND COMMON OPTIONS
// =============================================================================

export interface FieldOption {
  value: string;
  label: string;
  hoursMultiplier?: number;
  additionalHours?: number;
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
  baseHours: number;
  minPrice: number;
  fields: FormField[];
  calculateHours: (values: Record<string, unknown>) => number;
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

export const HOURLY_RATE = 130;
export const MILEAGE_RATE = 0.67;
export const TRAVEL_SPEED_AVG = 50;

// =============================================================================
// COMMON FIELD OPTIONS - FINAL CALIBRATION v3
// 
// PRICING TARGETS (square-root-like curve):
// - Small (0.1-3 acres): $700-950
// - Medium (3-10 acres): $950-1,750
// - Larger (10-50 acres): $1,750-2,400
// - Very large (50-200+ acres): $2,400-5,000+
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
    { value: 'lampasas', label: 'Lampasas County' },
    { value: 'milam', label: 'Milam County' },
    { value: 'falls', label: 'Falls County' },
    { value: 'mclennan', label: 'McLennan County' },
    { value: 'williamson', label: 'Williamson County' },
    { value: 'travis', label: 'Travis County' },
    { value: 'burnet', label: 'Burnet County' },
    { value: 'hamilton', label: 'Hamilton County' },
    { value: 'bosque', label: 'Bosque County' },
    { value: 'hill', label: 'Hill County' },
    { value: 'limestone', label: 'Limestone County' },
    { value: 'robertson', label: 'Robertson County' },
    { value: 'brazos', label: 'Brazos County' },
    { value: 'other', label: 'Other (specify in notes)' },
  ],
};

// PROPERTY SIZE - Updated tiers with finer granularity for small lots
// Base hours: 3, plus these ADDITIONAL hours
// Typical scenarios (with some trees, unknown markers, older survey):
// <0.25ac→$650-800, 0.25-0.5ac→$700-850, 0.5-1ac→$720-880, 1-2ac→$780-950
export const PROPERTY_SIZE: FieldOption[] = [
  { value: '0.1', label: 'Less than 0.25 acres', additionalHours: 1.0 },     // ~$650-800 typical
  { value: '0.375', label: '0.25 - 0.5 acres', additionalHours: 1.2 },       // ~$700-850 typical
  { value: '0.75', label: '0.5 - 1 acre', additionalHours: 1.5 },            // ~$720-880 typical
  { value: '1.5', label: '1 - 2 acres', additionalHours: 2.0 },              // ~$780-950 typical
  { value: '3', label: '2 - 4 acres', additionalHours: 3.5 },                // ~$980-1,180 typical
  { value: '5', label: '4 - 6 acres', additionalHours: 6.0 },                // ~$1,280-1,550 typical
  { value: '8', label: '6 - 10 acres', additionalHours: 8.0 },               // ~$1,530-1,870 typical
  { value: '12.5', label: '10 - 15 acres', additionalHours: 10.0 },          // ~$1,780-2,170 typical
  { value: '22', label: '15 - 30 acres', additionalHours: 11.5 },            // ~$1,970-2,400 typical
  { value: '40', label: '30 - 50 acres', additionalHours: 13.5 },            // ~$2,220-2,710 typical
  { value: '75', label: '50 - 100 acres', additionalHours: 17.5 },           // ~$2,720-3,320 typical
  { value: '150', label: '100 - 200 acres', additionalHours: 24.5 },         // ~$3,600-4,400 typical
  { value: '250', label: '200+ acres', additionalHours: 35.5 },              // ~$4,990-6,100 typical
];

// CORNERS - Additive hours (small impact)
export const PROPERTY_CORNERS: FieldOption[] = [
  { value: '4', label: '4 corners (rectangular)', additionalHours: 0 },
  { value: '5', label: '5 corners', additionalHours: 0.15 },
  { value: '6', label: '6 corners', additionalHours: 0.3 },
  { value: '7', label: '7-8 corners', additionalHours: 0.5 },
  { value: '10', label: '9-12 corners', additionalHours: 0.8 },
  { value: '15', label: '13+ corners', additionalHours: 1.25 },
  { value: 'unknown', label: 'Unknown', additionalHours: 0.15 },
];

// VEGETATION - Small multipliers
export const VEGETATION: FieldOption[] = [
  { value: 'open', label: 'Open/Clear - Lawn, pasture, cleared', hoursMultiplier: 1.0 },
  { value: 'scattered', label: 'Scattered Trees - Clear sight lines', hoursMultiplier: 1.02 },
  { value: 'moderate', label: 'Moderate Woods - Mixed areas', hoursMultiplier: 1.05 },
  { value: 'dense', label: 'Dense Woods - Limited visibility', hoursMultiplier: 1.12 },
  { value: 'thick_brush', label: 'Thick Brush/Cedar - Machete needed', hoursMultiplier: 1.22 },
  { value: 'unknown', label: 'Unknown', hoursMultiplier: 1.03 },
];

// TERRAIN - Small multipliers
export const TERRAIN: FieldOption[] = [
  { value: 'flat', label: 'Flat - Level ground', hoursMultiplier: 1.0 },
  { value: 'gentle', label: 'Gentle Rolling - 0-10% slopes', hoursMultiplier: 1.0 },
  { value: 'moderate', label: 'Moderate Hills - 10-20% slopes', hoursMultiplier: 1.03 },
  { value: 'steep', label: 'Steep - 20-35% slopes', hoursMultiplier: 1.08 },
  { value: 'very_steep', label: 'Very Steep/Bluffs - 35%+ slopes', hoursMultiplier: 1.15 },
  { value: 'unknown', label: 'Unknown', hoursMultiplier: 1.02 },
];

// WATER FEATURES - Additive hours (small impact)
export const WATER_FEATURES: FieldOption[] = [
  { value: 'none', label: 'None', additionalHours: 0 },
  { value: 'pond_small', label: 'Small Pond/Stock Tank', additionalHours: 0.15 },
  { value: 'pond_large', label: 'Large Pond/Lake', additionalHours: 0.4 },
  { value: 'creek_dry', label: 'Dry Creek/Drainage', additionalHours: 0.1 },
  { value: 'creek_seasonal', label: 'Seasonal Creek', additionalHours: 0.3 },
  { value: 'creek_permanent', label: 'Permanent Creek/Stream', additionalHours: 0.6 },
  { value: 'river', label: 'River/Major Waterway', additionalHours: 1.0 },
  { value: 'wetland', label: 'Wetland/Marsh', additionalHours: 0.6 },
  { value: 'multiple', label: 'Multiple Features', additionalHours: 0.8 },
  { value: 'unknown', label: 'Unknown', additionalHours: 0.15 },
];

// EXISTING SURVEY - Additive hours (small impact)
export const EXISTING_SURVEY: FieldOption[] = [
  { value: 'recent', label: 'Recent (within 5 years) - Have copy', additionalHours: 0 },
  { value: 'recent_no_copy', label: 'Recent (within 5 years) - No copy', additionalHours: 0.15 },
  { value: 'older', label: 'Older (5-15 years)', additionalHours: 0.3 },
  { value: 'very_old', label: 'Old (15-30 years)', additionalHours: 0.5 },
  { value: 'ancient', label: 'Very Old (30+ years)', additionalHours: 0.7 },
  { value: 'none', label: 'No Previous Survey', additionalHours: 1.0 },
  { value: 'unknown', label: 'Unknown', additionalHours: 0.35 },
];

// EXISTING MONUMENTS - Additive hours (small impact)
export const EXISTING_MONUMENTS: FieldOption[] = [
  { value: 'all_found', label: 'All corners visible', additionalHours: 0 },
  { value: 'most_found', label: 'Most corners (1-2 missing)', additionalHours: 0.15 },
  { value: 'some_found', label: 'About half findable', additionalHours: 0.35 },
  { value: 'few_found', label: 'Few or none visible', additionalHours: 0.7 },
  { value: 'unknown', label: 'Unknown', additionalHours: 0.35 },
];

// ACCESS CONDITIONS - Very small multipliers
export const ACCESS_CONDITIONS: FieldOption[] = [
  { value: 'paved', label: 'Paved Road - Direct access', hoursMultiplier: 1.0 },
  { value: 'gravel', label: 'Gravel/Caliche Road', hoursMultiplier: 1.0 },
  { value: 'dirt', label: 'Dirt Road - Passable by car', hoursMultiplier: 1.0 },
  { value: 'rough', label: 'Rough Road - High clearance needed', hoursMultiplier: 1.02 },
  { value: '4wd', label: '4WD/ATV Required', hoursMultiplier: 1.04 },
  { value: 'gated', label: 'Gated - Coordinate access', hoursMultiplier: 1.0 },
  { value: 'walk_in', label: 'Walk-In Only', hoursMultiplier: 1.06 },
  { value: 'unknown', label: 'Unknown', hoursMultiplier: 1.0 },
];

// TRAVEL DISTANCE - Just for travel cost calculation
export const TRAVEL_DISTANCE: FieldOption[] = [
  { value: '0', label: 'Belton/Temple/Killeen (0-15 mi)', additionalHours: 0 },
  { value: '25', label: '15-30 miles', additionalHours: 0 },
  { value: '40', label: '30-50 miles', additionalHours: 0 },
  { value: '60', label: '50-75 miles', additionalHours: 0 },
  { value: '85', label: '75-100 miles', additionalHours: 0 },
  { value: '125', label: '100-150 miles', additionalHours: 0 },
  { value: '175', label: '150-200 miles', additionalHours: 0 },
  { value: '250', label: '200-300 miles', additionalHours: 0 },
  { value: '350', label: '300+ miles', additionalHours: 0 },
];

// ADJOINING - Additive hours (small impact)
export const ADJOINING: FieldOption[] = [
  { value: '1', label: '1-2 adjoining tracts', additionalHours: 0 },
  { value: '3', label: '3-4 adjoining tracts', additionalHours: 0.1 },
  { value: '5', label: '5-6 adjoining tracts', additionalHours: 0.2 },
  { value: '7', label: '7-10 adjoining tracts', additionalHours: 0.4 },
  { value: '10', label: '10+ adjoining tracts', additionalHours: 0.65 },
  { value: 'unknown', label: 'Unknown', additionalHours: 0.1 },
];