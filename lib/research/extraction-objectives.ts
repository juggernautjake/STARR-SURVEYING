// lib/research/extraction-objectives.ts — Comprehensive data extraction objectives registry
//
// Defines EVERY type of information that should be searched for in EVERY resource.
// Each resource type gets a tailored checklist of extraction objectives.
// After analysis, the checklist is scored: found / not found / not applicable.

// ── Master Data Categories ──────────────────────────────────────────────────
// This is the single authoritative list of everything we look for.

export interface ExtractionObjective {
  /** Unique key for this objective */
  id: string;
  /** Human-readable label */
  label: string;
  /** Detailed description of what to extract */
  description: string;
  /** Which AtomCategory(s) this maps to for cross-validation */
  atom_categories: string[];
  /** Priority: critical objectives MUST be found if present */
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** Resource types where this objective is applicable */
  applicable_to: ResourceType[];
}

export type ResourceType =
  | 'gis_map'           // Any GIS/CAD map viewer (Bell CAD, ArcGIS, etc.)
  | 'aerial_imagery'    // Satellite/aerial photos
  | 'plat_document'     // Recorded subdivision plat
  | 'deed_document'     // Recorded deed instrument
  | 'survey_document'   // Survey/field notes
  | 'tax_record'        // Tax/appraisal record
  | 'flood_map'         // FEMA flood zone map
  | 'street_map'        // Google Maps, OpenStreetMap, etc.
  | 'parcel_data'       // Programmatic parcel attribute data
  | 'title_document'    // Title commitment/policy
  | 'easement_document' // Easement instrument
  | 'right_of_way'      // TxDOT or utility ROW
  | 'field_notes'       // Surveyor field notes
  | 'county_record'     // Any county clerk record
  | 'esearch_portal'    // Bell CAD eSearch portal
  | 'any';              // Applies to every resource

// ── The Master Objectives List ──────────────────────────────────────────────

export const EXTRACTION_OBJECTIVES: ExtractionObjective[] = [
  // ── IDENTITY ──────────────────────────────────────────────────
  {
    id: 'property_id',
    label: 'Property ID / Parcel Number',
    description: 'CAD property ID, parcel number, APN, or tax ID that uniquely identifies this parcel in the county system',
    atom_categories: ['property_id'],
    priority: 'critical',
    applicable_to: ['gis_map', 'parcel_data', 'tax_record', 'esearch_portal', 'deed_document', 'any'],
  },
  {
    id: 'owner_name',
    label: 'Current Owner Name',
    description: 'Full name of the current property owner (individual or entity)',
    atom_categories: ['owner_name'],
    priority: 'critical',
    applicable_to: ['parcel_data', 'deed_document', 'tax_record', 'esearch_portal', 'title_document', 'any'],
  },
  {
    id: 'situs_address',
    label: 'Property Address (Situs)',
    description: 'Physical street address of the property including house number, street, city, state, zip',
    atom_categories: ['situs_address'],
    priority: 'critical',
    applicable_to: ['parcel_data', 'tax_record', 'esearch_portal', 'street_map', 'gis_map', 'any'],
  },
  {
    id: 'mailing_address',
    label: 'Owner Mailing Address',
    description: 'Mailing address of the property owner (may differ from situs)',
    atom_categories: ['other'],
    priority: 'low',
    applicable_to: ['parcel_data', 'tax_record', 'esearch_portal'],
  },

  // ── LOT / BLOCK / SUBDIVISION ─────────────────────────────────
  {
    id: 'lot_number',
    label: 'Lot Number',
    description: 'Lot number within the subdivision or block (e.g., "Lot 7", "Lot 0001")',
    atom_categories: ['lot_number'],
    priority: 'critical',
    applicable_to: ['gis_map', 'plat_document', 'deed_document', 'parcel_data', 'survey_document', 'any'],
  },
  {
    id: 'block_number',
    label: 'Block Number',
    description: 'Block number within the subdivision (e.g., "Block 2", "BLK A")',
    atom_categories: ['block_number'],
    priority: 'critical',
    applicable_to: ['gis_map', 'plat_document', 'deed_document', 'parcel_data', 'survey_document', 'any'],
  },
  {
    id: 'subdivision_name',
    label: 'Subdivision / Addition Name',
    description: 'Name of the recorded subdivision, addition, or development (e.g., "Oak Hills Phase 2")',
    atom_categories: ['subdivision_name'],
    priority: 'critical',
    applicable_to: ['gis_map', 'plat_document', 'deed_document', 'parcel_data', 'survey_document', 'any'],
  },
  {
    id: 'abstract_number',
    label: 'Abstract / Survey Number',
    description: 'Abstract number of the original Texas land grant survey (e.g., "A-0057")',
    atom_categories: ['abstract_number'],
    priority: 'high',
    applicable_to: ['gis_map', 'deed_document', 'parcel_data', 'survey_document', 'any'],
  },
  {
    id: 'survey_name',
    label: 'Original Survey Name',
    description: 'Name of the original Texas land grant survey or surveyor (e.g., "S.P. RR CO SURVEY")',
    atom_categories: ['survey_name'],
    priority: 'high',
    applicable_to: ['gis_map', 'deed_document', 'parcel_data', 'survey_document', 'any'],
  },

  // ── AREA & DIMENSIONS ────────────────────────────────────────
  {
    id: 'acreage',
    label: 'Acreage / Area',
    description: 'Total area of the parcel in acres, square feet, or other units. Look for legal acreage, computed area, and stated area.',
    atom_categories: ['acreage'],
    priority: 'critical',
    applicable_to: ['gis_map', 'plat_document', 'deed_document', 'parcel_data', 'survey_document', 'any'],
  },
  {
    id: 'lot_dimensions',
    label: 'Lot Dimensions (Frontage x Depth)',
    description: 'Lot width (frontage) and depth measurements. Look for dimensions like "100\' x 140\'" or individual side lengths.',
    atom_categories: ['distance'],
    priority: 'high',
    applicable_to: ['gis_map', 'plat_document', 'survey_document', 'parcel_data'],
  },
  {
    id: 'line_lengths',
    label: 'Individual Line/Side Lengths',
    description: 'Length of each boundary line segment in feet or other units. Look for dimensions along each side of the parcel.',
    atom_categories: ['distance'],
    priority: 'high',
    applicable_to: ['gis_map', 'plat_document', 'deed_document', 'survey_document'],
  },
  {
    id: 'shape_perimeter',
    label: 'Perimeter / Shape Length',
    description: 'Total perimeter of the parcel boundary in linear feet',
    atom_categories: ['distance'],
    priority: 'medium',
    applicable_to: ['gis_map', 'plat_document', 'parcel_data', 'survey_document'],
  },

  // ── METES AND BOUNDS ──────────────────────────────────────────
  {
    id: 'bearings',
    label: 'Bearings / Directions',
    description: 'Compass bearings for each boundary line (e.g., "N 45° 30\' 15\" E"). Each bearing should be individually tracked.',
    atom_categories: ['bearing'],
    priority: 'high',
    applicable_to: ['plat_document', 'deed_document', 'survey_document', 'field_notes'],
  },
  {
    id: 'distances',
    label: 'Distances / Calls',
    description: 'Distance for each bearing call (e.g., "150.00 feet"). Paired with bearings to form complete boundary calls.',
    atom_categories: ['distance'],
    priority: 'high',
    applicable_to: ['plat_document', 'deed_document', 'survey_document', 'field_notes'],
  },
  {
    id: 'boundary_calls',
    label: 'Complete Boundary Calls',
    description: 'Combined bearing + distance calls forming boundary descriptions (e.g., "S 89°58\'30\" W, 100.00 feet")',
    atom_categories: ['boundary_call'],
    priority: 'high',
    applicable_to: ['plat_document', 'deed_document', 'survey_document', 'field_notes'],
  },
  {
    id: 'point_of_beginning',
    label: 'Point of Beginning (POB)',
    description: 'The starting point of the metes and bounds description. May reference a monument, intersection, or coordinate.',
    atom_categories: ['point_of_beginning'],
    priority: 'high',
    applicable_to: ['plat_document', 'deed_document', 'survey_document', 'field_notes'],
  },
  {
    id: 'curve_data',
    label: 'Curve Data (Arc, Radius, Chord)',
    description: 'For curved boundaries: arc length, radius, central angle, chord bearing, chord distance, tangent length',
    atom_categories: ['boundary_call'],
    priority: 'high',
    applicable_to: ['plat_document', 'deed_document', 'survey_document'],
  },
  {
    id: 'closure_error',
    label: 'Closure Error / Precision',
    description: 'Survey closure error ratio (e.g., "1:10,000") and any stated precision or error of closure',
    atom_categories: ['other'],
    priority: 'medium',
    applicable_to: ['survey_document', 'plat_document', 'field_notes'],
  },

  // ── MONUMENTS & MARKERS ───────────────────────────────────────
  {
    id: 'monuments',
    label: 'Monuments / Boundary Markers',
    description: 'Physical boundary markers: iron rods, pipes, caps, stones, concrete monuments, PK nails, railroad spikes, etc.',
    atom_categories: ['monument'],
    priority: 'high',
    applicable_to: ['plat_document', 'deed_document', 'survey_document', 'field_notes', 'gis_map'],
  },
  {
    id: 'monument_condition',
    label: 'Monument Condition',
    description: 'Whether monuments were found, set, or are missing. Notes on condition (bent, damaged, etc.)',
    atom_categories: ['monument'],
    priority: 'medium',
    applicable_to: ['survey_document', 'field_notes'],
  },
  {
    id: 'control_points',
    label: 'Control Points / Coordinates',
    description: 'GPS coordinates, state plane coordinates, or other control point data used to georeference the survey',
    atom_categories: ['other'],
    priority: 'medium',
    applicable_to: ['survey_document', 'field_notes', 'gis_map'],
  },

  // ── EASEMENTS & ENCUMBRANCES ──────────────────────────────────
  {
    id: 'easements',
    label: 'Easements',
    description: 'Any easements: utility, drainage, access, conservation, pipeline, electric, water, sewer, etc. Include width and location.',
    atom_categories: ['easement'],
    priority: 'critical',
    applicable_to: ['plat_document', 'deed_document', 'survey_document', 'gis_map', 'title_document', 'easement_document', 'any'],
  },
  {
    id: 'easement_width',
    label: 'Easement Width',
    description: 'Width of each easement in feet (e.g., "10\' utility easement", "15\' drainage easement")',
    atom_categories: ['easement'],
    priority: 'high',
    applicable_to: ['plat_document', 'deed_document', 'survey_document', 'easement_document'],
  },
  {
    id: 'easement_type',
    label: 'Easement Type & Purpose',
    description: 'Type of each easement: utility (electric, gas, water, sewer, telecom), drainage, access, pipeline, conservation, etc.',
    atom_categories: ['easement'],
    priority: 'high',
    applicable_to: ['plat_document', 'deed_document', 'survey_document', 'easement_document', 'title_document'],
  },
  {
    id: 'setback_lines',
    label: 'Building Setback Lines',
    description: 'Building setback lines / building lines showing minimum distance from property boundary for construction',
    atom_categories: ['easement'],
    priority: 'high',
    applicable_to: ['plat_document', 'survey_document'],
  },
  {
    id: 'restrictions',
    label: 'Restrictive Covenants / Restrictions',
    description: 'Deed restrictions, HOA restrictions, use restrictions, or references to recorded restrictive covenants',
    atom_categories: ['other'],
    priority: 'medium',
    applicable_to: ['deed_document', 'plat_document', 'title_document'],
  },
  {
    id: 'liens_encumbrances',
    label: 'Liens & Other Encumbrances',
    description: 'Tax liens, mechanic liens, mortgages, deeds of trust, or other recorded encumbrances',
    atom_categories: ['other'],
    priority: 'medium',
    applicable_to: ['title_document', 'county_record', 'esearch_portal'],
  },

  // ── RIGHT-OF-WAY ──────────────────────────────────────────────
  {
    id: 'right_of_way',
    label: 'Right-of-Way (ROW)',
    description: 'Road right-of-way width and extent. TxDOT ROW, county road ROW, or private road ROW.',
    atom_categories: ['other'],
    priority: 'high',
    applicable_to: ['plat_document', 'survey_document', 'right_of_way', 'gis_map', 'deed_document'],
  },
  {
    id: 'right_of_way_width',
    label: 'ROW Width',
    description: 'Width of road right-of-way in feet (e.g., "60\' ROW", "80\' R/W")',
    atom_categories: ['other'],
    priority: 'high',
    applicable_to: ['plat_document', 'survey_document', 'right_of_way', 'gis_map'],
  },

  // ── DEED / TITLE ──────────────────────────────────────────────
  {
    id: 'deed_reference',
    label: 'Deed Reference (Volume/Page/Instrument)',
    description: 'Deed recording reference: Volume, Page, Instrument Number, County Clerk file number',
    atom_categories: ['deed_reference'],
    priority: 'critical',
    applicable_to: ['deed_document', 'parcel_data', 'esearch_portal', 'title_document', 'any'],
  },
  {
    id: 'deed_date',
    label: 'Deed Date',
    description: 'Date the deed was executed or recorded',
    atom_categories: ['other'],
    priority: 'high',
    applicable_to: ['deed_document', 'parcel_data', 'esearch_portal', 'title_document'],
  },
  {
    id: 'grantor',
    label: 'Grantor (Seller)',
    description: 'Name of the grantor (person/entity conveying the property)',
    atom_categories: ['other'],
    priority: 'high',
    applicable_to: ['deed_document', 'title_document', 'esearch_portal', 'county_record'],
  },
  {
    id: 'grantee',
    label: 'Grantee (Buyer)',
    description: 'Name of the grantee (person/entity receiving the property)',
    atom_categories: ['other'],
    priority: 'high',
    applicable_to: ['deed_document', 'title_document', 'esearch_portal', 'county_record'],
  },
  {
    id: 'deed_type',
    label: 'Deed Type',
    description: 'Type of deed: General Warranty, Special Warranty, Quitclaim, Deed of Trust, etc.',
    atom_categories: ['other'],
    priority: 'medium',
    applicable_to: ['deed_document', 'title_document'],
  },
  {
    id: 'consideration',
    label: 'Consideration / Sale Price',
    description: 'Amount paid for the property (consideration) or "$10 and other valuable consideration"',
    atom_categories: ['other'],
    priority: 'low',
    applicable_to: ['deed_document'],
  },
  {
    id: 'chain_of_title',
    label: 'Chain of Title References',
    description: 'References to prior deeds in the chain of title, tracing ownership history',
    atom_categories: ['deed_reference'],
    priority: 'high',
    applicable_to: ['deed_document', 'title_document', 'esearch_portal'],
  },

  // ── PLAT ──────────────────────────────────────────────────────
  {
    id: 'plat_reference',
    label: 'Plat Reference (Cabinet/Slide or Volume/Page)',
    description: 'Plat recording reference: Cabinet, Slide, Volume, Page, or Instrument Number',
    atom_categories: ['plat_reference'],
    priority: 'critical',
    applicable_to: ['plat_document', 'deed_document', 'parcel_data', 'esearch_portal', 'any'],
  },
  {
    id: 'plat_date',
    label: 'Plat Recording Date',
    description: 'Date the plat was recorded at the county clerk',
    atom_categories: ['other'],
    priority: 'medium',
    applicable_to: ['plat_document', 'county_record'],
  },
  {
    id: 'surveyor_name',
    label: 'Surveyor / Engineer Name & RPLS Number',
    description: 'Registered Professional Land Surveyor name and RPLS license number who prepared the plat/survey',
    atom_categories: ['other'],
    priority: 'medium',
    applicable_to: ['plat_document', 'survey_document', 'field_notes'],
  },
  {
    id: 'plat_scale',
    label: 'Plat Scale',
    description: 'Scale of the plat drawing (e.g., "1\" = 50\'", "1:600")',
    atom_categories: ['other'],
    priority: 'low',
    applicable_to: ['plat_document', 'survey_document'],
  },

  // ── SURROUNDING LOTS ──────────────────────────────────────────
  {
    id: 'adjacent_lots',
    label: 'Adjacent / Surrounding Lots',
    description: 'Lot numbers, blocks, owners, and addresses of all adjacent and surrounding properties',
    atom_categories: ['other'],
    priority: 'high',
    applicable_to: ['gis_map', 'plat_document', 'parcel_data', 'aerial_imagery', 'any'],
  },
  {
    id: 'adjacent_owners',
    label: 'Adjacent Property Owners',
    description: 'Names of owners of adjacent/adjoining properties (important for boundary dispute context)',
    atom_categories: ['other'],
    priority: 'medium',
    applicable_to: ['gis_map', 'parcel_data', 'deed_document', 'survey_document'],
  },
  {
    id: 'lot_numbering_pattern',
    label: 'Lot Numbering Pattern & Sequence',
    description: 'How lots are numbered in this block/subdivision — sequential, odd/even by street side, etc.',
    atom_categories: ['other'],
    priority: 'medium',
    applicable_to: ['gis_map', 'plat_document', 'parcel_data', 'aerial_imagery'],
  },
  {
    id: 'address_numbering_pattern',
    label: 'Address Numbering Pattern',
    description: 'House number sequence along the street — ascending/descending, odds one side / evens the other',
    atom_categories: ['other'],
    priority: 'medium',
    applicable_to: ['gis_map', 'street_map', 'parcel_data', 'aerial_imagery'],
  },

  // ── PHYSICAL FEATURES ─────────────────────────────────────────
  {
    id: 'buildings',
    label: 'Buildings & Structures',
    description: 'Visible buildings, structures, outbuildings. Include roof shape/color, approximate footprint size, position on lot.',
    atom_categories: ['other'],
    priority: 'medium',
    applicable_to: ['aerial_imagery', 'gis_map', 'survey_document'],
  },
  {
    id: 'fences',
    label: 'Fences & Walls',
    description: 'Visible fence lines, retaining walls, or other boundary indicators. Type (wood, chain-link, stone) and alignment.',
    atom_categories: ['other'],
    priority: 'medium',
    applicable_to: ['aerial_imagery', 'survey_document'],
  },
  {
    id: 'driveways_access',
    label: 'Driveways & Access Points',
    description: 'Driveway locations, access points, curb cuts. Position relative to lot boundaries.',
    atom_categories: ['other'],
    priority: 'low',
    applicable_to: ['aerial_imagery', 'gis_map', 'street_map'],
  },
  {
    id: 'vegetation_terrain',
    label: 'Vegetation & Terrain',
    description: 'Trees, landscaping, cleared areas, terrain features. Useful for identifying lot boundaries from aerial photos.',
    atom_categories: ['other'],
    priority: 'low',
    applicable_to: ['aerial_imagery'],
  },
  {
    id: 'water_features',
    label: 'Water Features',
    description: 'Creeks, ponds, drainage channels, floodways, or wetlands on or adjacent to the property',
    atom_categories: ['other'],
    priority: 'medium',
    applicable_to: ['aerial_imagery', 'gis_map', 'flood_map', 'survey_document'],
  },
  {
    id: 'utilities',
    label: 'Utility Infrastructure',
    description: 'Visible utility poles, transformers, manholes, fire hydrants, utility pedestals. Indicates utility easement locations.',
    atom_categories: ['other'],
    priority: 'low',
    applicable_to: ['aerial_imagery', 'gis_map', 'survey_document'],
  },

  // ── LEGAL DESCRIPTION ─────────────────────────────────────────
  {
    id: 'legal_description',
    label: 'Full Legal Description',
    description: 'Complete legal description text including lot/block, subdivision, abstract, and metes & bounds if applicable',
    atom_categories: ['legal_description'],
    priority: 'critical',
    applicable_to: ['deed_document', 'parcel_data', 'survey_document', 'title_document', 'plat_document', 'any'],
  },

  // ── VALUES & TAX ──────────────────────────────────────────────
  {
    id: 'market_value',
    label: 'Market Value',
    description: 'Appraised market value of the property (land + improvements)',
    atom_categories: ['market_value'],
    priority: 'medium',
    applicable_to: ['parcel_data', 'tax_record', 'esearch_portal'],
  },
  {
    id: 'land_value',
    label: 'Land Value',
    description: 'Appraised value of the land only (without improvements)',
    atom_categories: ['land_value'],
    priority: 'low',
    applicable_to: ['parcel_data', 'tax_record', 'esearch_portal'],
  },
  {
    id: 'improvement_value',
    label: 'Improvement Value',
    description: 'Appraised value of improvements (buildings, structures) on the land',
    atom_categories: ['improvement_value'],
    priority: 'low',
    applicable_to: ['parcel_data', 'tax_record', 'esearch_portal'],
  },
  {
    id: 'tax_year',
    label: 'Tax Year',
    description: 'Current tax year and any prior year data available',
    atom_categories: ['other'],
    priority: 'low',
    applicable_to: ['tax_record', 'esearch_portal', 'parcel_data'],
  },

  // ── FLOOD & ENVIRONMENT ───────────────────────────────────────
  {
    id: 'flood_zone',
    label: 'FEMA Flood Zone',
    description: 'FEMA flood zone designation (Zone X, A, AE, etc.) and whether in Special Flood Hazard Area (SFHA)',
    atom_categories: ['flood_zone'],
    priority: 'high',
    applicable_to: ['flood_map', 'gis_map', 'parcel_data', 'survey_document'],
  },
  {
    id: 'base_flood_elevation',
    label: 'Base Flood Elevation (BFE)',
    description: 'FEMA Base Flood Elevation if in a floodplain',
    atom_categories: ['flood_zone'],
    priority: 'medium',
    applicable_to: ['flood_map', 'survey_document'],
  },
  {
    id: 'wetlands',
    label: 'Wetlands',
    description: 'Any wetland areas or delineations on or adjacent to the property',
    atom_categories: ['other'],
    priority: 'low',
    applicable_to: ['gis_map', 'aerial_imagery', 'survey_document'],
  },

  // ── JURISDICTION ──────────────────────────────────────────────
  {
    id: 'city_name',
    label: 'City / Municipality',
    description: 'City or municipality the property is located in, or ETJ (extra-territorial jurisdiction)',
    atom_categories: ['city_name'],
    priority: 'medium',
    applicable_to: ['gis_map', 'parcel_data', 'esearch_portal', 'any'],
  },
  {
    id: 'school_district',
    label: 'School District',
    description: 'School district the property falls within',
    atom_categories: ['school_district'],
    priority: 'low',
    applicable_to: ['gis_map', 'parcel_data', 'esearch_portal'],
  },
  {
    id: 'county',
    label: 'County',
    description: 'County where the property is located',
    atom_categories: ['other'],
    priority: 'medium',
    applicable_to: ['parcel_data', 'deed_document', 'any'],
  },

  // ── MAP / GIS SPECIFIC ────────────────────────────────────────
  {
    id: 'parcel_boundaries',
    label: 'Parcel Boundary Lines',
    description: 'Visible parcel/property boundary lines on maps. Are they clear? Do they match expected lot shape?',
    atom_categories: ['parcel_geometry'],
    priority: 'high',
    applicable_to: ['gis_map', 'aerial_imagery', 'plat_document'],
  },
  {
    id: 'layer_data',
    label: 'Map Layer Information',
    description: 'What layers are visible? Parcels, lot lines, easements, utilities, flood zones, aerial, streets, etc.',
    atom_categories: ['other'],
    priority: 'medium',
    applicable_to: ['gis_map'],
  },
  {
    id: 'map_labels',
    label: 'Map Labels & Annotations',
    description: 'Any labels visible on the map: lot numbers, block numbers, owner names, addresses, dimensions, areas',
    atom_categories: ['other'],
    priority: 'high',
    applicable_to: ['gis_map', 'aerial_imagery'],
  },
  {
    id: 'coordinate_system',
    label: 'Coordinate System / Datum',
    description: 'What coordinate system or datum is used? WKID 2277, NAD83, WGS84, etc.',
    atom_categories: ['other'],
    priority: 'low',
    applicable_to: ['gis_map', 'survey_document'],
  },

  // ── STREETS & ROADS ───────────────────────────────────────────
  {
    id: 'street_names',
    label: 'Street Names',
    description: 'Names of streets bordering or near the property',
    atom_categories: ['other'],
    priority: 'high',
    applicable_to: ['gis_map', 'street_map', 'plat_document', 'aerial_imagery', 'any'],
  },
  {
    id: 'street_type',
    label: 'Street Type & Classification',
    description: 'Road class: FM road, state highway, county road, city street, private road, cul-de-sac, etc.',
    atom_categories: ['other'],
    priority: 'low',
    applicable_to: ['gis_map', 'street_map', 'plat_document'],
  },
  {
    id: 'intersections',
    label: 'Nearby Intersections',
    description: 'Intersections near the property that help establish location context',
    atom_categories: ['other'],
    priority: 'medium',
    applicable_to: ['gis_map', 'street_map', 'aerial_imagery'],
  },

  // ── MILITARY / SPECIAL ────────────────────────────────────────
  {
    id: 'military_proximity',
    label: 'Military Installation Proximity',
    description: 'Whether property is near or within military installation boundaries (Fort Cavazos in Bell County)',
    atom_categories: ['other'],
    priority: 'low',
    applicable_to: ['gis_map', 'parcel_data'],
  },
];

// ── Objective Lookup Helpers ────────────────────────────────────────────────

/** Get all objectives applicable to a specific resource type */
export function getObjectivesForResource(resourceType: ResourceType): ExtractionObjective[] {
  return EXTRACTION_OBJECTIVES.filter(
    obj => obj.applicable_to.includes(resourceType) || obj.applicable_to.includes('any'),
  );
}

/** Get objectives by priority level */
export function getObjectivesByPriority(
  resourceType: ResourceType,
  priority: ExtractionObjective['priority'],
): ExtractionObjective[] {
  return getObjectivesForResource(resourceType).filter(obj => obj.priority === priority);
}

/** Build an AI prompt section listing what to look for in a resource */
export function buildExtractionPrompt(resourceType: ResourceType): string {
  const objectives = getObjectivesForResource(resourceType);
  const critical = objectives.filter(o => o.priority === 'critical');
  const high = objectives.filter(o => o.priority === 'high');
  const medium = objectives.filter(o => o.priority === 'medium');
  const low = objectives.filter(o => o.priority === 'low');

  const formatSection = (objs: ExtractionObjective[], label: string) => {
    if (objs.length === 0) return '';
    return `\n### ${label}\n${objs.map(o => `- **${o.label}**: ${o.description}`).join('\n')}`;
  };

  return [
    '## EXTRACTION OBJECTIVES — What to search for in this resource:',
    formatSection(critical, 'CRITICAL (must extract if present)'),
    formatSection(high, 'HIGH PRIORITY'),
    formatSection(medium, 'MEDIUM PRIORITY'),
    formatSection(low, 'LOW PRIORITY (extract if easily visible)'),
  ].filter(Boolean).join('\n');
}

// ── Extraction Result Tracking ──────────────────────────────────────────────

export type ObjectiveResult = 'found' | 'not_found' | 'not_applicable' | 'partial';

export interface ObjectiveOutcome {
  /** Objective ID */
  objective_id: string;
  /** Result of searching for this objective */
  result: ObjectiveResult;
  /** Extracted value(s) if found */
  extracted_values: string[];
  /** Confidence in the extraction (0-100) */
  confidence: number;
  /** Notes about the extraction */
  notes: string | null;
}

export interface ResourceExtractionReport {
  /** Resource identifier (artifact ID, URL, file name, etc.) */
  resource_id: string;
  /** Human-readable resource label */
  resource_label: string;
  /** Resource type */
  resource_type: ResourceType;
  /** When the extraction was performed */
  timestamp: string;
  /** Per-objective outcomes */
  objectives: ObjectiveOutcome[];
  /** AI-generated summary of what was found in this resource */
  summary: string;
  /** Interesting observations or anomalies noted */
  interesting_findings: string[];
  /** Score: how many critical+high objectives were found vs total applicable */
  extraction_score: {
    critical_found: number;
    critical_total: number;
    high_found: number;
    high_total: number;
    total_found: number;
    total_applicable: number;
    percentage: number;
  };
}

/** Calculate the extraction score for a resource report */
export function calculateExtractionScore(
  outcomes: ObjectiveOutcome[],
  resourceType: ResourceType,
): ResourceExtractionReport['extraction_score'] {
  const objectives = getObjectivesForResource(resourceType);
  const criticalIds = new Set(objectives.filter(o => o.priority === 'critical').map(o => o.id));
  const highIds = new Set(objectives.filter(o => o.priority === 'high').map(o => o.id));

  let criticalFound = 0, criticalTotal = 0;
  let highFound = 0, highTotal = 0;
  let totalFound = 0, totalApplicable = 0;

  for (const outcome of outcomes) {
    if (outcome.result === 'not_applicable') continue;
    totalApplicable++;
    if (outcome.result === 'found' || outcome.result === 'partial') totalFound++;
    if (criticalIds.has(outcome.objective_id)) {
      criticalTotal++;
      if (outcome.result === 'found' || outcome.result === 'partial') criticalFound++;
    }
    if (highIds.has(outcome.objective_id)) {
      highTotal++;
      if (outcome.result === 'found' || outcome.result === 'partial') highFound++;
    }
  }

  return {
    critical_found: criticalFound,
    critical_total: criticalTotal,
    high_found: highFound,
    high_total: highTotal,
    total_found: totalFound,
    total_applicable: totalApplicable,
    percentage: totalApplicable > 0 ? Math.round((totalFound / totalApplicable) * 100) : 0,
  };
}
