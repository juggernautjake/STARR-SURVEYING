// lib/research/visual-lot-identifier.service.ts — AI visual lot identification & comparison
//
// Uses Claude Vision to analyze map images side-by-side and determine which
// specific lot/parcel an address pin falls on. This is the core "seeing eye"
// of the research pipeline — it looks at map screenshots, CAD GIS images,
// and plat documents to identify the target lot.
//
// Pipeline:
//   1. Analyze the Google Maps pin image — extract street names, lot shapes, pin position
//   2. Analyze the CAD GIS parcel image — extract parcel boundaries, lot numbers, dimensions
//   3. Compare pin position to parcel boundaries — identify which lot contains the pin
//   4. If plat images are available, compare lot identification against plat lot numbers
//   5. Cross-check all findings against extracted data atoms
//
// Each step produces DataAtoms that are fed into the cross-validation graph.

import { callVision, callAI } from './ai-client';
import { loadDocumentImage } from './image-loader';
import type { PipelineLogger } from './pipeline-logger';
import {
  createAtom,
  addAtomAndValidate,
  type DataAtom,
  type ValidationGraph,
} from './cross-validation.service';
import type { PromptKey } from './prompts';

// ── Types ────────────────────────────────────────────────────────────────────

/** Result of analyzing a single map image */
export interface MapImageAnalysis {
  /** What the AI sees in the image */
  description: string;
  /** Street names visible */
  streets_visible: string[];
  /** Lot/parcel numbers visible */
  lot_numbers_visible: string[];
  /** Block numbers visible */
  block_numbers_visible: string[];
  /** Subdivision names visible */
  subdivision_names_visible: string[];
  /** Pin position description (relative to features) */
  pin_position: string | null;
  /** Physical features near the pin */
  features_near_pin: string[];
  /** Building footprints visible near pin */
  buildings_near_pin: string[];
  /** Confidence in the analysis (0–100) */
  confidence: number;
  /** Raw AI response for debugging */
  raw_response: Record<string, unknown>;
}

/** Result of comparing multiple images for lot identification */
export interface LotIdentificationResult {
  /** The identified lot number */
  lot_number: string | null;
  /** The identified block number */
  block_number: string | null;
  /** The identified subdivision name */
  subdivision_name: string | null;
  /** Confidence in the lot identification (0–100) */
  confidence: number;
  /** Detailed reasoning for the identification */
  reasoning: string;
  /** What physical features helped identify the lot */
  key_features: string[];
  /** Conflicts detected between sources */
  conflicts_detected: string[];
  /** Recommendations for the researcher */
  recommendations: string[];
  /** DataAtoms created during this analysis */
  atoms_created: DataAtom[];
  /** Individual image analyses */
  image_analyses: {
    street_pin?: MapImageAnalysis;
    satellite_pin?: MapImageAnalysis;
    cad_gis?: MapImageAnalysis;
    plat?: MapImageAnalysis;
  };
  /** Step-by-step log of the analysis */
  steps: string[];
}

// ── Image Loading ────────────────────────────────────────────────────────────
// Uses shared image-loader.ts — see loadDocumentImage() in image-loader.ts

// ── Single Image Analysis ────────────────────────────────────────────────────

/**
 * Analyze a single map image to extract visible features.
 * Uses a detailed prompt that instructs the AI to take its time
 * and thoroughly examine every detail in the image.
 */
async function analyzeMapImage(
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg',
  imageType: 'street_pin' | 'satellite_pin' | 'cad_gis' | 'plat',
  address: string,
): Promise<MapImageAnalysis> {
  const typePrompts: Record<string, string> = {
    street_pin: [
      `You are a Texas Registered Professional Land Surveyor analyzing a Google Maps`,
      `street map screenshot with a RED PIN marker.`,
      `The pin marks the address: "${address}"`,
      ``,
      `TAKE YOUR TIME. This is a SURVEY-CRITICAL analysis. Examine every detail carefully.`,
      `Your goal is to determine EXACTLY which lot/parcel the pin falls on.`,
      ``,
      `STEP 1 — READ ALL TEXT:`,
      `  - Read every street name label visible. Spell each one exactly as shown.`,
      `  - Read every lot number, parcel number, or address number visible.`,
      `  - Read every block number or subdivision name visible.`,
      ``,
      `STEP 2 — LOCATE THE PIN PRECISELY:`,
      `  - Which street is the pin on? Which side of the street (N, S, E, W)?`,
      `  - How far from the nearest intersection? Count lots if possible.`,
      `  - Is it a corner lot, interior lot, cul-de-sac lot, or flag lot?`,
      `  - What is the address number on the pin's lot vs. adjacent lots?`,
      `    (Address numbering patterns help determine which lot is which)`,
      ``,
      `STEP 3 — MAP THE LOT CONTEXT:`,
      `  - How many lots are visible in the pin's block?`,
      `  - What is the lot numbering sequence (e.g., lots go 1-12 east to west)?`,
      `  - Count the pin's position in the sequence.`,
      `  - Note any irregular lot shapes, flag lots, or common areas.`,
      ``,
      `STEP 4 — IDENTIFY PHYSICAL LANDMARKS:`,
      `  - Cul-de-sacs, curves, alleys, easements, parks, or vacant lots.`,
      `  - These help orient the lot within the block.`,
      ``,
      `Respond with JSON:`,
      `{`,
      `  "description": "Detailed description of what you see",`,
      `  "streets_visible": ["Street Name 1", "Street Name 2"],`,
      `  "lot_numbers_visible": ["7", "8", "9"],`,
      `  "block_numbers_visible": ["2"],`,
      `  "subdivision_names_visible": ["Belton Heights"],`,
      `  "pin_position": "The red pin is on the SOUTH side of Oak Street, 3rd lot east of the intersection with Elm Ave, appears to be an interior lot roughly 60ft wide",`,
      `  "features_near_pin": ["cul-de-sac to the east", "corner lot to the west"],`,
      `  "buildings_near_pin": ["single-family residence with L-shaped footprint"],`,
      `  "nearest_intersection": "Oak Street and Elm Avenue",`,
      `  "orientation": "North is toward the top of the image",`,
      `  "address_numbering_pattern": "Addresses increase eastward: 101, 103, 105...",`,
      `  "lot_count_in_block": 12,`,
      `  "pin_lot_position_in_block": "3rd from west end",`,
      `  "confidence": 85`,
      `}`,
    ].join('\n'),

    satellite_pin: [
      `You are a Texas Registered Professional Land Surveyor analyzing a Google Maps`,
      `SATELLITE/HYBRID image with a RED PIN marker.`,
      `The pin marks the address: "${address}"`,
      ``,
      `TAKE YOUR TIME. Physical features visible in satellite imagery often correspond`,
      `directly to property boundaries. Fence lines, driveways, and landscaping changes`,
      `are your best clues.`,
      ``,
      `STEP 1 — PIN POSITION:`,
      `  - Is the pin on a roof, in a yard, on a driveway, in a field?`,
      `  - The pin marks where Google placed the address — note if it seems offset.`,
      ``,
      `STEP 2 — BUILDING FOOTPRINTS:`,
      `  - Describe the main building: shape (rectangular, L-shaped, T-shaped), size,`,
      `    roof color, orientation (front faces N/S/E/W).`,
      `  - Note outbuildings: garage, shed, barn, pool, covered patio.`,
      `  - The building position within the lot helps confirm which lot it is.`,
      ``,
      `STEP 3 — PROPERTY BOUNDARY INDICATORS:`,
      `  - Fence lines (these are the BEST indicator of property boundaries)`,
      `  - Landscaping changes (mowed vs unmowed, different ground cover)`,
      `  - Driveways and sidewalks (often at property edges)`,
      `  - Retaining walls, hedge rows, tree lines`,
      ``,
      `STEP 4 — LOT DIMENSIONS:`,
      `  - Estimate the lot width (frontage) and depth from visible boundaries.`,
      `  - Compare to adjacent lots — similar size? Bigger? Smaller?`,
      `  - A standard Texas residential lot is roughly 60-80 ft wide, 120-150 ft deep.`,
      ``,
      `STEP 5 — ADJACENT PROPERTIES:`,
      `  - Describe the lots on each side and behind. Similar buildings?`,
      `  - This context helps identify the lot within the block.`,
      ``,
      `Respond with JSON (same format as before, include all fields).`,
    ].join('\n'),

    cad_gis: [
      `You are a Texas Registered Professional Land Surveyor analyzing an AERIAL IMAGE`,
      `of the parcel area. Below the image description, you will find a list of parcels`,
      `from the County Appraisal District GIS database that are within this view.`,
      ``,
      `The address being researched is: "${address}"`,
      ``,
      `TAKE YOUR TIME. This is the MOST CRITICAL step in lot identification.`,
      `You must match what you SEE in the aerial image to what you KNOW from the`,
      `parcel database to determine which specific lot the address falls on.`,
      ``,
      `STEP 1 — EXAMINE THE AERIAL IMAGE:`,
      `  - Identify all buildings, driveways, streets, and physical features.`,
      `  - Count the number of developed lots visible along each street.`,
      `  - Note lot sizes — which are larger/smaller, which are vacant.`,
      ``,
      `STEP 2 — MATCH TO PARCEL DATA:`,
      `  - The description below this image contains a list of parcels with:`,
      `    PropID, Lot number, Block number, Acreage, Address, and Owner.`,
      `  - Match each visible lot/building to a parcel from the list.`,
      `  - The address on the parcel data should correspond to the building position.`,
      ``,
      `STEP 3 — IDENTIFY THE TARGET PARCEL:`,
      `  - Which parcel in the list has the address "${address}" or closest match?`,
      `  - Does the lot position and size match what you see in the aerial?`,
      `  - Confirm by checking adjacent parcels — do their addresses line up?`,
      ``,
      `STEP 4 — VERIFY BY CROSS-CHECKING:`,
      `  - Address number sequence: does the address numbering increase in the`,
      `    direction you'd expect based on lot positions?`,
      `  - Lot acreage: does the visible lot size match the stated acreage?`,
      `  - Owner/building: does the building type match a residential/commercial owner?`,
      ``,
      `Respond with JSON (same format as before). CRITICAL: include the PropID if found.`,
    ].join('\n'),

    plat: [
      `You are a Texas Registered Professional Land Surveyor analyzing a RECORDED`,
      `SUBDIVISION PLAT document. This is the MOST AUTHORITATIVE source for lot`,
      `identification, lot numbers, and lot dimensions.`,
      ``,
      `The address being researched is: "${address}"`,
      ``,
      `TAKE YOUR TIME. Read EVERY piece of text in this plat. Plats are legal documents`,
      `filed with the county clerk — their lot numbering is definitive.`,
      ``,
      `STEP 1 — HEADER INFORMATION:`,
      `  - Full subdivision name (exactly as written, including "Addition", "Phase", etc.)`,
      `  - Recording information: Cabinet/Slide, Volume/Page, or instrument number`,
      `  - Date of recording, date of survey`,
      `  - Surveyor name, RPLS number, firm name`,
      ``,
      `STEP 2 — LOT LAYOUT:`,
      `  - Read EVERY lot number. List them ALL, in order.`,
      `  - Read EVERY block number.`,
      `  - Note how lots are numbered: clockwise? counterclockwise? east to west?`,
      `  - Note the numbering pattern — this is critical for matching address to lot.`,
      ``,
      `STEP 3 — DIMENSIONS FOR EACH LOT:`,
      `  - Frontage (width along the street)`,
      `  - Depth (distance from street to back property line)`,
      `  - Area in square feet or acres`,
      `  - Any irregular shapes — flag lots, pie-shaped lots, etc.`,
      ``,
      `STEP 4 — METES AND BOUNDS:`,
      `  - Read bearing notations on lot lines (e.g., N 45° 30' 15" E)`,
      `  - Read all distance labels (e.g., 150.00')`,
      `  - Note any curve data (arc length, radius, chord, delta)`,
      ``,
      `STEP 5 — STREETS AND EASEMENTS:`,
      `  - Street names and right-of-way widths`,
      `  - Easement types (utility, drainage, access) and widths`,
      `  - Building setback lines`,
      ``,
      `STEP 6 — IDENTIFY THE TARGET LOT:`,
      `  - Based on the address "${address}", which lot is most likely?`,
      `  - Consider street frontage, lot numbering, and address patterns.`,
      ``,
      `Respond with JSON (same format as before). Include ALL lot numbers and blocks.`,
    ].join('\n'),
  };

  const prompt = typePrompts[imageType] || typePrompts.street_pin;

  try {
    const result = await callVision(
      imageBase64,
      mediaType,
      'AERIAL_IMAGE_ANALYZER' as PromptKey,
      prompt,
    );

    const data = result.response as Record<string, unknown>;

    return {
      description: String(data.description || ''),
      streets_visible: Array.isArray(data.streets_visible) ? data.streets_visible.map(String) : [],
      lot_numbers_visible: Array.isArray(data.lot_numbers_visible) ? data.lot_numbers_visible.map(String) : [],
      block_numbers_visible: Array.isArray(data.block_numbers_visible) ? data.block_numbers_visible.map(String) : [],
      subdivision_names_visible: Array.isArray(data.subdivision_names_visible) ? data.subdivision_names_visible.map(String) : [],
      pin_position: data.pin_position ? String(data.pin_position) : null,
      features_near_pin: Array.isArray(data.features_near_pin) ? data.features_near_pin.map(String) : [],
      buildings_near_pin: Array.isArray(data.buildings_near_pin) ? data.buildings_near_pin.map(String) : [],
      confidence: typeof data.confidence === 'number' ? data.confidence : 50,
      raw_response: data,
    };
  } catch {
    return {
      description: 'Analysis failed',
      streets_visible: [],
      lot_numbers_visible: [],
      block_numbers_visible: [],
      subdivision_names_visible: [],
      pin_position: null,
      features_near_pin: [],
      buildings_near_pin: [],
      confidence: 0,
      raw_response: {},
    };
  }
}

// ── Multi-Image Comparison & Lot Identification ──────────────────────────────

/**
 * Run the full lot identification pipeline:
 *   1. Analyze each available image individually
 *   2. Compare findings across images
 *   3. Identify the specific lot
 *   4. Cross-check against existing data atoms
 *   5. Create new atoms with full provenance
 */
export async function identifyLotFromImages(
  address: string,
  documentIds: {
    streetPinDocId?: string | null;
    satellitePinDocId?: string | null;
    cadGisDocId?: string | null;
    platDocIds?: string[];
  },
  validationGraph: ValidationGraph,
  logger?: PipelineLogger,
): Promise<LotIdentificationResult> {
  const steps: string[] = [];
  const atomsCreated: DataAtom[] = [];
  const imageAnalyses: LotIdentificationResult['image_analyses'] = {};

  const log = (msg: string) => {
    steps.push(msg);
    logger?.info('lot_identify', msg);
  };

  const logWarn = (msg: string) => {
    steps.push(msg);
    logger?.warn('lot_identify', msg);
  };

  const logError = (msg: string) => {
    steps.push(msg);
    logger?.error('lot_identify', msg);
  };

  log(`Starting lot identification for: ${address}`);
  log(`Available images: street_pin=${!!documentIds.streetPinDocId}, satellite_pin=${!!documentIds.satellitePinDocId}, cad_gis=${!!documentIds.cadGisDocId}, plats=${documentIds.platDocIds?.length ?? 0}`);

  // ── Step 1: Analyze each image individually ──────────────────────────────
  const analysisTasks: Promise<void>[] = [];

  if (documentIds.streetPinDocId) {
    analysisTasks.push((async () => {
      log('[Step 1a] Analyzing Google street pin map…');
      const img = await loadDocumentImage(documentIds.streetPinDocId!, logger);
      if (img) {
        const analysis = await analyzeMapImage(img.base64, img.mediaType, 'street_pin', address);
        imageAnalyses.street_pin = analysis;
        log(`[Step 1a] Found: ${analysis.streets_visible.length} streets, ${analysis.lot_numbers_visible.length} lots, pin: ${analysis.pin_position || 'not detected'}`);

        // Create atoms from street pin analysis
        if (analysis.pin_position) {
          const atom = createAtom({
            category: 'pin_location', value: analysis.pin_position,
            source: 'google_maps', source_document_id: documentIds.streetPinDocId,
            extraction_method: 'AI Vision analysis of Google Maps street pin image',
            confidence: analysis.confidence,
            confidence_reasoning: 'Pin position extracted from Google Maps screenshot by AI Vision',
            pipeline_step: 'visual_lot_identification',
          });
          atomsCreated.push(atom);
          addAtomAndValidate(validationGraph, atom);
        }

        for (const lotNum of analysis.lot_numbers_visible) {
          const atom = createAtom({
            category: 'lot_number', value: lotNum,
            source: 'ai_vision', source_document_id: documentIds.streetPinDocId,
            extraction_method: 'AI Vision — lot number read from Google Maps street pin image',
            confidence: Math.min(analysis.confidence, 70),
            confidence_reasoning: 'Lot number read from map image — may be partially visible',
            pipeline_step: 'visual_lot_identification',
          });
          atomsCreated.push(atom);
          addAtomAndValidate(validationGraph, atom);
        }

        for (const subdiv of analysis.subdivision_names_visible) {
          const atom = createAtom({
            category: 'subdivision_name', value: subdiv,
            source: 'ai_vision', source_document_id: documentIds.streetPinDocId,
            extraction_method: 'AI Vision — subdivision name read from map image',
            confidence: Math.min(analysis.confidence, 75),
            confidence_reasoning: 'Subdivision name visible on map image',
            pipeline_step: 'visual_lot_identification',
          });
          atomsCreated.push(atom);
          addAtomAndValidate(validationGraph, atom);
        }
      } else {
        logWarn('[Step 1a] Could not load street pin image');
      }
    })());
  }

  if (documentIds.satellitePinDocId) {
    analysisTasks.push((async () => {
      log('[Step 1b] Analyzing Google satellite pin map…');
      const img = await loadDocumentImage(documentIds.satellitePinDocId!, logger);
      if (img) {
        const analysis = await analyzeMapImage(img.base64, img.mediaType, 'satellite_pin', address);
        imageAnalyses.satellite_pin = analysis;
        log(`[Step 1b] Found: ${analysis.buildings_near_pin.length} buildings, ${analysis.features_near_pin.length} features near pin`);
      } else {
        logWarn('[Step 1b] Could not load satellite pin image');
      }
    })());
  }

  if (documentIds.cadGisDocId) {
    analysisTasks.push((async () => {
      log('[Step 1c] Analyzing CAD GIS parcel map…');
      const img = await loadDocumentImage(documentIds.cadGisDocId!, logger);
      if (img) {
        const analysis = await analyzeMapImage(img.base64, img.mediaType, 'cad_gis', address);
        imageAnalyses.cad_gis = analysis;
        log(`[Step 1c] Found: ${analysis.lot_numbers_visible.length} lots, ${analysis.block_numbers_visible.length} blocks, ${analysis.streets_visible.length} streets`);

        // CAD GIS lot numbers are more authoritative than map labels
        for (const lotNum of analysis.lot_numbers_visible) {
          const atom = createAtom({
            category: 'lot_number', value: lotNum,
            source: 'ai_vision', source_document_id: documentIds.cadGisDocId,
            extraction_method: 'AI Vision — lot number read from CAD GIS parcel map',
            confidence: Math.min(analysis.confidence, 80),
            confidence_reasoning: 'Lot number from official CAD GIS parcel boundaries',
            pipeline_step: 'visual_lot_identification',
          });
          atomsCreated.push(atom);
          addAtomAndValidate(validationGraph, atom);
        }

        for (const blockNum of analysis.block_numbers_visible) {
          const atom = createAtom({
            category: 'block_number', value: blockNum,
            source: 'ai_vision', source_document_id: documentIds.cadGisDocId,
            extraction_method: 'AI Vision — block number read from CAD GIS parcel map',
            confidence: Math.min(analysis.confidence, 80),
            confidence_reasoning: 'Block number from official CAD GIS parcel boundaries',
            pipeline_step: 'visual_lot_identification',
          });
          atomsCreated.push(atom);
          addAtomAndValidate(validationGraph, atom);
        }
      } else {
        logWarn('[Step 1c] Could not load CAD GIS image');
      }
    })());
  }

  // Analyze plat documents
  if (documentIds.platDocIds && documentIds.platDocIds.length > 0) {
    for (const platDocId of documentIds.platDocIds.slice(0, 3)) { // Max 3 plats
      analysisTasks.push((async () => {
        log(`[Step 1d] Analyzing plat document ${platDocId}…`);
        const img = await loadDocumentImage(platDocId, logger);
        if (img) {
          const analysis = await analyzeMapImage(img.base64, img.mediaType, 'plat', address);
          imageAnalyses.plat = analysis; // Last plat wins (usually the most relevant)
          log(`[Step 1d] Found: ${analysis.lot_numbers_visible.length} lots, ${analysis.block_numbers_visible.length} blocks, ${analysis.subdivision_names_visible.length} subdivisions`);

          // Plat lot numbers are the most authoritative visual source
          for (const lotNum of analysis.lot_numbers_visible) {
            const atom = createAtom({
              category: 'lot_number', value: lotNum,
              source: 'ai_vision', source_document_id: platDocId,
              extraction_method: 'AI Vision — lot number read from recorded plat image',
              confidence: Math.min(analysis.confidence, 88),
              confidence_reasoning: 'Lot number from recorded subdivision plat — authoritative source',
              pipeline_step: 'visual_lot_identification',
            });
            atomsCreated.push(atom);
            addAtomAndValidate(validationGraph, atom);
          }
        } else {
          logWarn(`[Step 1d] Could not load plat image ${platDocId}`);
        }
      })());
    }
  }

  // Run all image analyses in parallel
  await Promise.all(analysisTasks);

  // ── Step 2: AI comparison — synthesize all findings ──────────────────────
  log('[Step 2] Running AI synthesis to identify the specific lot…');

  const synthesisInput = {
    address,
    street_pin_analysis: imageAnalyses.street_pin || null,
    satellite_pin_analysis: imageAnalyses.satellite_pin || null,
    cad_gis_analysis: imageAnalyses.cad_gis || null,
    plat_analysis: imageAnalyses.plat || null,
    existing_data: {
      lot_atoms: validationGraph.atoms
        .filter(a => a.category === 'lot_number')
        .map(a => ({ value: a.value, source: a.source, confidence: a.confidence, state: a.validation_state })),
      block_atoms: validationGraph.atoms
        .filter(a => a.category === 'block_number')
        .map(a => ({ value: a.value, source: a.source, confidence: a.confidence, state: a.validation_state })),
      subdivision_atoms: validationGraph.atoms
        .filter(a => a.category === 'subdivision_name')
        .map(a => ({ value: a.value, source: a.source, confidence: a.confidence, state: a.validation_state })),
      property_id_atoms: validationGraph.atoms
        .filter(a => a.category === 'property_id')
        .map(a => ({ value: a.value, source: a.source, confidence: a.confidence })),
    },
    conflicts: validationGraph.conflicts.filter(c => !c.resolved).map(c => ({
      category: c.category,
      severity: c.severity,
      description: c.description,
    })),
  };

  let lotNumber: string | null = null;
  let blockNumber: string | null = null;
  let subdivisionName: string | null = null;
  let overallConfidence = 0;
  let reasoning = '';
  let keyFeatures: string[] = [];
  let conflictsDetected: string[] = [];
  let recommendations: string[] = [];

  try {
    const result = await callAI({
      promptKey: 'CROSS_REFERENCE_ANALYZER' as PromptKey,
      userContent: [
        `You are a Texas Registered Professional Land Surveyor identifying which specific lot`,
        `an address falls on. You have analyzed multiple images and data sources. Now you`,
        `must SYNTHESIZE all findings to make a definitive lot identification.`,
        ``,
        `TAKE YOUR TIME. This is a CRITICAL determination that affects the entire survey.`,
        `An incorrect lot identification means the wrong property gets surveyed.`,
        ``,
        `═══════════════════════════════════════════════════════════════════`,
        `TARGET ADDRESS: ${address}`,
        `═══════════════════════════════════════════════════════════════════`,
        ``,
        `DATA FROM ALL SOURCES:`,
        JSON.stringify(synthesisInput, null, 2),
        ``,
        `═══════════════════════════════════════════════════════════════════`,
        `SYNTHESIS METHODOLOGY — Follow these steps in order:`,
        `═══════════════════════════════════════════════════════════════════`,
        ``,
        `STEP 1: ESTABLISH THE PIN LOCATION`,
        `  - Where exactly did the Google Maps pin land?`,
        `  - Which side of which street? How many lots from the nearest intersection?`,
        `  - Is the pin on a building roof, in a yard, or offset?`,
        ``,
        `STEP 2: MATCH PIN TO PARCEL`,
        `  - Using the CAD GIS / aerial analysis, which parcel polygon does the pin fall inside?`,
        `  - What lot number does that parcel have in the CAD database?`,
        `  - What is the situs address on that parcel?`,
        `  - Does the situs address match our target address?`,
        ``,
        `STEP 3: VERIFY WITH THE PLAT`,
        `  - If a plat was analyzed, do the lot numbers from the plat match the CAD?`,
        `  - Sometimes plat lots are renumbered during replats — check for discrepancies.`,
        `  - Does the lot's position in the plat match the pin's physical position?`,
        ``,
        `STEP 4: CROSS-CHECK ADDRESS NUMBERING`,
        `  - Do adjacent lot addresses follow a logical numbering pattern?`,
        `  - Even-numbered addresses are typically on one side of the street,`,
        `    odd on the other. Does our address fit?`,
        `  - Does the address number increase in the direction expected for this area?`,
        ``,
        `STEP 5: VERIFY LOT SIZE AND SHAPE`,
        `  - Does the lot acreage from the CAD match the physical lot size visible?`,
        `  - Does the building footprint fit naturally within the identified lot?`,
        `  - Are the lot dimensions from the plat consistent with what we see?`,
        ``,
        `STEP 6: FLAG CONFLICTS`,
        `  - List every discrepancy between sources.`,
        `  - For each conflict, state which source you trust more and why.`,
        `  - Rate conflict severity: CRITICAL if lot number disagrees,`,
        `    MAJOR if block/subdivision differs, MINOR if formatting only.`,
        ``,
        `STEP 7: FINAL DETERMINATION`,
        `  - State your conclusion: which lot, which block, which subdivision.`,
        `  - Rate your confidence 0-100.`,
        `  - List what physical features or data points give you the most confidence.`,
        ``,
        `RESPOND WITH JSON:`,
        `{`,
        `  "lot_number": "7",`,
        `  "block_number": "2",`,
        `  "subdivision_name": "Belton Heights Addition",`,
        `  "prop_id": 123456,`,
        `  "confidence": 85,`,
        `  "reasoning": "Step-by-step reasoning following the methodology above...",`,
        `  "key_features": ["pin lands on 3rd lot from corner matching lot 7", "building footprint matches"],`,
        `  "conflicts_detected": ["CAD shows lot 7 but plat labels the same position as lot 8"],`,
        `  "recommendations": ["Verify lot numbering with county clerk plat records"],`,
        `  "adjacent_lots": [`,
        `    { "lot": "6", "block": "2", "address": "103 Oak St", "direction": "west" },`,
        `    { "lot": "8", "block": "2", "address": "107 Oak St", "direction": "east" }`,
        `  ]`,
        `}`,
      ].join('\n'),
      maxTokens: 8192,
      timeoutMs: 180_000, // 3 minutes — thorough analysis takes time
    });

    const data = result.response as Record<string, unknown>;
    lotNumber = data.lot_number ? String(data.lot_number) : null;
    blockNumber = data.block_number ? String(data.block_number) : null;
    subdivisionName = data.subdivision_name ? String(data.subdivision_name) : null;
    overallConfidence = typeof data.confidence === 'number' ? data.confidence : 50;
    reasoning = String(data.reasoning || 'No reasoning provided');
    keyFeatures = Array.isArray(data.key_features) ? data.key_features.map(String) : [];
    conflictsDetected = Array.isArray(data.conflicts_detected) ? data.conflicts_detected.map(String) : [];
    recommendations = Array.isArray(data.recommendations) ? data.recommendations.map(String) : [];

    log(`[Step 2] AI identified: Lot ${lotNumber}, Block ${blockNumber}, ${subdivisionName} (confidence: ${overallConfidence}%)`);
    if (conflictsDetected.length > 0) {
      logWarn(`[Step 2] Conflicts: ${conflictsDetected.join('; ')}`);
    }
  } catch (err) {
    logError(`[Step 2] AI synthesis failed: ${err instanceof Error ? err.message : String(err)}`);
    reasoning = 'AI synthesis failed — using best available data from individual analyses';

    // Fallback: use the most common lot number across all analyses
    const allLots = [
      ...(imageAnalyses.cad_gis?.lot_numbers_visible ?? []),
      ...(imageAnalyses.plat?.lot_numbers_visible ?? []),
      ...(imageAnalyses.street_pin?.lot_numbers_visible ?? []),
    ];
    if (allLots.length > 0) {
      // Use the most frequent lot number
      const freq = new Map<string, number>();
      for (const l of allLots) freq.set(l, (freq.get(l) || 0) + 1);
      const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
      lotNumber = sorted[0][0];
      overallConfidence = 40; // Low confidence for fallback
    }
  }

  // ── Step 3: Create final identification atom ─────────────────────────────
  if (lotNumber) {
    const idAtom = createAtom({
      category: 'lot_identification',
      value: [
        lotNumber && `Lot ${lotNumber}`,
        blockNumber && `Block ${blockNumber}`,
        subdivisionName,
      ].filter(Boolean).join(', '),
      normalized: { lot: lotNumber, block: blockNumber, subdivision: subdivisionName },
      source: 'ai_comparison',
      extraction_method: 'AI visual comparison of map pin, CAD GIS, satellite, and plat images',
      confidence: overallConfidence,
      confidence_reasoning: reasoning.substring(0, 200),
      pipeline_step: 'visual_lot_identification',
    });
    atomsCreated.push(idAtom);
    addAtomAndValidate(validationGraph, idAtom);

    // Also create specific atoms for the identified lot/block/subdivision
    const lotAtom = createAtom({
      category: 'lot_number', value: lotNumber,
      source: 'ai_comparison',
      extraction_method: 'AI visual lot identification — cross-image comparison',
      confidence: overallConfidence,
      confidence_reasoning: 'Lot identified by comparing map pin position against CAD parcel boundaries',
      pipeline_step: 'visual_lot_identification',
    });
    atomsCreated.push(lotAtom);
    addAtomAndValidate(validationGraph, lotAtom);

    if (blockNumber) {
      const blockAtom = createAtom({
        category: 'block_number', value: blockNumber,
        source: 'ai_comparison',
        extraction_method: 'AI visual lot identification — cross-image comparison',
        confidence: overallConfidence,
        confidence_reasoning: 'Block identified during visual lot identification',
        pipeline_step: 'visual_lot_identification',
      });
      atomsCreated.push(blockAtom);
      addAtomAndValidate(validationGraph, blockAtom);
    }

    if (subdivisionName) {
      const subdivAtom = createAtom({
        category: 'subdivision_name', value: subdivisionName,
        source: 'ai_comparison',
        extraction_method: 'AI visual lot identification — cross-image comparison',
        confidence: overallConfidence,
        confidence_reasoning: 'Subdivision identified during visual lot identification',
        pipeline_step: 'visual_lot_identification',
      });
      atomsCreated.push(subdivAtom);
      addAtomAndValidate(validationGraph, subdivAtom);
    }
  }

  log(`[Step 3] Created ${atomsCreated.length} data atoms from visual analysis`);
  log(`[Step 3] Validation graph: ${validationGraph.summary.total_atoms} atoms, ${validationGraph.summary.confirmed_count} confirmed, ${validationGraph.summary.conflicted_count} conflicted`);

  return {
    lot_number: lotNumber,
    block_number: blockNumber,
    subdivision_name: subdivisionName,
    confidence: overallConfidence,
    reasoning,
    key_features: keyFeatures,
    conflicts_detected: conflictsDetected,
    recommendations,
    atoms_created: atomsCreated,
    image_analyses: imageAnalyses,
    steps,
  };
}
