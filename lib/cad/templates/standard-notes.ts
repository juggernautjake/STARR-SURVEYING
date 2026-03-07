// lib/cad/templates/standard-notes.ts — Standard survey notes library

export interface StandardNote {
  id: string;
  category: string;
  text: string;
  isDefault: boolean;
}

export const STANDARD_NOTES: StandardNote[] = [
  // Basis of Bearing
  {
    id: 'BOB_GPS',
    category: 'Basis of Bearing',
    text: 'Basis of bearing is the Texas State Plane Coordinate System, Central Zone (NAD 83), as determined by GPS observations.',
    isDefault: true,
  },
  {
    id: 'BOB_DEED',
    category: 'Basis of Bearing',
    text: 'Basis of bearing is per the deed recorded in Volume {{vol}}, Page {{pg}}, {{county}} County deed records.',
    isDefault: false,
  },
  {
    id: 'BOB_PLAT',
    category: 'Basis of Bearing',
    text: 'Basis of bearing is per the plat recorded in Cabinet {{cab}}, Slide {{slide}}, {{county}} County plat records.',
    isDefault: false,
  },

  // Monuments Found
  {
    id: 'MON_IRF',
    category: 'Monuments',
    text: 'All iron rod monuments found are as noted on the plat.',
    isDefault: true,
  },
  {
    id: 'MON_IRS',
    category: 'Monuments',
    text: 'All iron rod monuments set are 1/2" iron rods with a plastic cap stamped "{{license}}" unless otherwise noted.',
    isDefault: true,
  },
  {
    id: 'MON_5_8_IRS',
    category: 'Monuments',
    text: 'All iron rod monuments set are 5/8" iron rods with a plastic cap stamped "{{license}}" unless otherwise noted.',
    isDefault: false,
  },
  {
    id: 'MON_CALC',
    category: 'Monuments',
    text: 'Calculated corners are as shown and are not monumented.',
    isDefault: false,
  },

  // Survey Type
  {
    id: 'TYPE_BOUNDARY',
    category: 'Survey Type',
    text: 'This is a boundary survey performed in accordance with the Texas Society of Professional Surveyors standards.',
    isDefault: true,
  },
  {
    id: 'TYPE_TOPO',
    category: 'Survey Type',
    text: 'This is a topographic survey. Contour interval is {{interval}} feet.',
    isDefault: false,
  },
  {
    id: 'TYPE_ALTA',
    category: 'Survey Type',
    text: 'This survey was prepared in accordance with the current minimum standard detail requirements for ALTA/NSPS Land Title Surveys as adopted by ALTA and NSPS.',
    isDefault: false,
  },

  // Flood Zone
  {
    id: 'FLOOD_PANEL',
    category: 'Flood Zone',
    text: 'According to the Flood Insurance Rate Map, Community Panel No. {{panel}}, dated {{date}}, the subject tract lies in Flood Zone {{zone}}.',
    isDefault: false,
  },
  {
    id: 'FLOOD_X',
    category: 'Flood Zone',
    text: 'According to the current FEMA Flood Insurance Rate Map, the subject property appears to lie in Flood Zone X (areas determined to be outside the 0.2% annual chance floodplain).',
    isDefault: false,
  },
  {
    id: 'FLOOD_AE',
    category: 'Flood Zone',
    text: 'According to the current FEMA Flood Insurance Rate Map, a portion of the subject property appears to lie in Flood Zone AE (Special Flood Hazard Area). Base Flood Elevation: {{bfe}} feet.',
    isDefault: false,
  },

  // Easements
  {
    id: 'EASE_UTILITY',
    category: 'Easements',
    text: 'Utility easements are as shown on this plat.',
    isDefault: true,
  },
  {
    id: 'EASE_DRAINAGE',
    category: 'Easements',
    text: 'Drainage easements are as shown on this plat.',
    isDefault: false,
  },
  {
    id: 'EASE_DEED',
    category: 'Easements',
    text: 'Easements of record, if any, were not researched. Only easements physically evident on the ground are shown.',
    isDefault: false,
  },

  // Area
  {
    id: 'AREA_SQFT',
    category: 'Area',
    text: 'Total area = {{sqft}} square feet ({{acres}} acres), more or less.',
    isDefault: false,
  },
  {
    id: 'AREA_NET',
    category: 'Area',
    text: 'Net area after right-of-way dedication = {{sqft}} square feet ({{acres}} acres), more or less.',
    isDefault: false,
  },

  // Coordinates
  {
    id: 'COORD_SPCS',
    category: 'Coordinates',
    text: 'Coordinates shown are Texas State Plane, Central Zone (NAD 83), US Survey Feet.',
    isDefault: false,
  },
  {
    id: 'COORD_LOCAL',
    category: 'Coordinates',
    text: 'Coordinates shown are local assumed coordinates.',
    isDefault: false,
  },

  // General
  {
    id: 'GEN_DATE',
    category: 'General',
    text: 'This survey was performed on the ground on {{date}}.',
    isDefault: true,
  },
  {
    id: 'GEN_SCALE',
    category: 'General',
    text: 'Scale: 1" = {{scale}} feet.',
    isDefault: false,
  },
  {
    id: 'GEN_ADJOINER',
    category: 'General',
    text: 'All adjoining property ownership shown hereon is from available deed records and has not been verified by field survey.',
    isDefault: false,
  },
  {
    id: 'GEN_UNDERGROUND',
    category: 'General',
    text: 'Underground utilities, if any, were not located by this survey. Contact 811 before digging.',
    isDefault: false,
  },
];

/** Return the default notes (isDefault === true). */
export function getDefaultNotes(): StandardNote[] {
  return STANDARD_NOTES.filter((n) => n.isDefault);
}

/**
 * Replace {{variable}} placeholders in a note template with provided values.
 * Variables not found in `vars` are left as-is.
 */
export function formatNoteText(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
}
