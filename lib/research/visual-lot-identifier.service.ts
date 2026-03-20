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
import { supabaseAdmin, RESEARCH_DOCUMENTS_BUCKET } from '@/lib/supabase';
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

/**
 * Load a research document image as base64 for Vision API.
 * Tries storage_url first, falls back to reading from Supabase Storage.
 */
async function loadDocumentImageBase64(documentId: string): Promise<{
  base64: string;
  mediaType: 'image/png' | 'image/jpeg';
} | null> {
  try {
    const { data: doc } = await supabaseAdmin
      .from('research_documents')
      .select('storage_path, storage_url, file_type')
      .eq('id', documentId)
      .single();

    if (!doc) return null;

    // Try fetching from public URL
    if (doc.storage_url) {
      try {
        const res = await fetch(doc.storage_url, {
          signal: AbortSignal.timeout(30_000),
        });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          const mediaType = doc.file_type === 'jpeg' || doc.file_type === 'jpg'
            ? 'image/jpeg' as const
            : 'image/png' as const;
          return { base64: buf.toString('base64'), mediaType };
        }
      } catch { /* fall through to storage download */ }
    }

    // Download from Supabase Storage
    if (doc.storage_path) {
      const { data: fileData } = await supabaseAdmin.storage
        .from(RESEARCH_DOCUMENTS_BUCKET)
        .download(doc.storage_path);

      if (fileData) {
        const buf = Buffer.from(await fileData.arrayBuffer());
        const mediaType = doc.file_type === 'jpeg' || doc.file_type === 'jpg'
          ? 'image/jpeg' as const
          : 'image/png' as const;
        return { base64: buf.toString('base64'), mediaType };
      }
    }

    return null;
  } catch {
    return null;
  }
}

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
      `You are analyzing a Google Maps street map screenshot with a RED PIN marker.`,
      `The pin marks the address: "${address}"`,
      ``,
      `TAKE YOUR TIME. Examine every detail carefully.`,
      ``,
      `1. STREETS: Read every street name label visible. List them ALL.`,
      `2. PIN POSITION: Describe exactly where the red pin is — which side of which street,`,
      `   near which intersection, how far from the nearest cross-street.`,
      `3. LOT OUTLINES: If lot/parcel outlines are visible, describe the shape and size`,
      `   of the lot the pin falls on and its neighbors.`,
      `4. LOT NUMBERS: If any lot or parcel numbers are visible, read them ALL.`,
      `5. BLOCK NUMBERS: If block numbers are visible, read them ALL.`,
      `6. SUBDIVISION NAME: If any subdivision or neighborhood name is visible, note it.`,
      `7. INTERSECTIONS: Name the nearest intersection to the pin.`,
      `8. ORIENTATION: Describe which direction is north (look at the Google Maps compass).`,
      `9. FEATURES: Note cul-de-sacs, curves, alley ways, easements, or unusual lot shapes.`,
      ``,
      `Respond with JSON:`,
      `{`,
      `  "description": "Detailed description of what you see",`,
      `  "streets_visible": ["Street Name 1", "Street Name 2"],`,
      `  "lot_numbers_visible": ["7", "8", "9"],`,
      `  "block_numbers_visible": ["2"],`,
      `  "subdivision_names_visible": ["Belton Heights"],`,
      `  "pin_position": "The red pin is on the SOUTH side of Oak Street, approximately 3 lots east of the intersection with Elm Ave",`,
      `  "features_near_pin": ["cul-de-sac", "corner lot"],`,
      `  "buildings_near_pin": ["single-family residence with L-shaped footprint"],`,
      `  "nearest_intersection": "Oak Street and Elm Avenue",`,
      `  "orientation": "North is toward the top of the image",`,
      `  "confidence": 85`,
      `}`,
    ].join('\n'),

    satellite_pin: [
      `You are analyzing a Google Maps SATELLITE/HYBRID image with a RED PIN marker.`,
      `The pin marks the address: "${address}"`,
      ``,
      `TAKE YOUR TIME. Examine every physical feature visible in the aerial imagery.`,
      ``,
      `1. PIN POSITION: Where is the red pin relative to buildings and features?`,
      `   Is it on a roof, in a yard, on a driveway, in a field?`,
      `2. BUILDINGS: Describe the building(s) near the pin — shape, size, color, orientation.`,
      `   Is there a main house, garage, shed, barn, pool?`,
      `3. PROPERTY FEATURES: Describe fence lines, driveways, sidewalks, landscaping.`,
      `   These physical features often align with property boundaries.`,
      `4. LOT SHAPE: Based on fence lines and landscaping, estimate the lot shape and size.`,
      `5. ADJACENT PROPERTIES: Describe neighboring lots for context.`,
      `6. STREETS: Name any labeled streets visible.`,
      `7. NATURAL FEATURES: Note any creeks, ponds, tree lines, or terrain changes.`,
      `8. UTILITY FEATURES: Note power lines, utility poles, pipeline corridors.`,
      ``,
      `Respond with the same JSON format as before.`,
    ].join('\n'),

    cad_gis: [
      `You are analyzing a CAD GIS PARCEL MAP from Bell County Appraisal District.`,
      `This image shows official parcel/lot boundaries overlaid on aerial imagery.`,
      `The address being researched is: "${address}"`,
      ``,
      `TAKE YOUR TIME. This is the most critical image for lot identification.`,
      ``,
      `1. PARCEL BOUNDARIES: Describe every visible parcel boundary line.`,
      `   What color are the boundary lines? Are they solid or dashed?`,
      `2. LOT NUMBERS: Read every lot or parcel number visible in or near the parcels.`,
      `   Look for small text labels inside or near each parcel polygon.`,
      `3. PARCEL SHAPES: Describe the shape and relative size of each visible parcel.`,
      `4. TARGET PARCEL: Based on the address, which parcel do you think is the target?`,
      `   Describe its shape, size, and position relative to streets and neighbors.`,
      `5. LOT LINES: If lot line segments are visible (often in a different color),`,
      `   describe the dimension labels on them.`,
      `6. STREETS: Name all streets visible and their orientation.`,
      `7. ADJACENT PARCELS: How many parcels are on each side of the target?`,
      `8. BLOCK STRUCTURE: Can you determine the block layout? How many lots in the block?`,
      ``,
      `CRITICAL: Your primary job is to identify which specific parcel/lot polygon`,
      `the searched address would fall inside. Use the street layout, lot positions,`,
      `and any visible lot numbers to make this determination.`,
      ``,
      `Respond with the same JSON format.`,
    ].join('\n'),

    plat: [
      `You are analyzing a SUBDIVISION PLAT document.`,
      `The address being researched is: "${address}"`,
      ``,
      `TAKE YOUR TIME. Plats contain the most precise lot information.`,
      ``,
      `1. SUBDIVISION NAME: What is the full subdivision name?`,
      `2. LOT NUMBERS: Read EVERY lot number visible. List them ALL.`,
      `3. BLOCK NUMBERS: Read EVERY block number. List them ALL.`,
      `4. DIMENSIONS: Read lot frontage, depth, and area measurements.`,
      `5. BEARINGS: Read any bearing notations on lot lines (e.g., N 45° 30' E).`,
      `6. DISTANCES: Read all distance labels on lot lines (e.g., 150.00').`,
      `7. STREETS: Name all streets shown and their right-of-way widths.`,
      `8. EASEMENTS: Note any easement designations with widths.`,
      `9. RECORDING INFO: Note Cabinet/Slide, Volume/Page, or instrument numbers.`,
      `10. SURVEYOR: Note the surveyor's name, RPLS number, and date.`,
      ``,
      `CRITICAL: Your job is to read EVERY piece of text in this plat.`,
      `Do not skip any labels, dimensions, or annotations.`,
      ``,
      `Respond with the same JSON format.`,
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
): Promise<LotIdentificationResult> {
  const steps: string[] = [];
  const atomsCreated: DataAtom[] = [];
  const imageAnalyses: LotIdentificationResult['image_analyses'] = {};

  steps.push(`Starting lot identification for: ${address}`);
  steps.push(`Available images: street_pin=${!!documentIds.streetPinDocId}, satellite_pin=${!!documentIds.satellitePinDocId}, cad_gis=${!!documentIds.cadGisDocId}, plats=${documentIds.platDocIds?.length ?? 0}`);

  // ── Step 1: Analyze each image individually ──────────────────────────────
  const analysisTasks: Promise<void>[] = [];

  if (documentIds.streetPinDocId) {
    analysisTasks.push((async () => {
      steps.push('[Step 1a] Analyzing Google street pin map…');
      const img = await loadDocumentImageBase64(documentIds.streetPinDocId!);
      if (img) {
        const analysis = await analyzeMapImage(img.base64, img.mediaType, 'street_pin', address);
        imageAnalyses.street_pin = analysis;
        steps.push(`[Step 1a] Found: ${analysis.streets_visible.length} streets, ${analysis.lot_numbers_visible.length} lots, pin: ${analysis.pin_position || 'not detected'}`);

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
        steps.push('[Step 1a] Could not load street pin image');
      }
    })());
  }

  if (documentIds.satellitePinDocId) {
    analysisTasks.push((async () => {
      steps.push('[Step 1b] Analyzing Google satellite pin map…');
      const img = await loadDocumentImageBase64(documentIds.satellitePinDocId!);
      if (img) {
        const analysis = await analyzeMapImage(img.base64, img.mediaType, 'satellite_pin', address);
        imageAnalyses.satellite_pin = analysis;
        steps.push(`[Step 1b] Found: ${analysis.buildings_near_pin.length} buildings, ${analysis.features_near_pin.length} features near pin`);
      } else {
        steps.push('[Step 1b] Could not load satellite pin image');
      }
    })());
  }

  if (documentIds.cadGisDocId) {
    analysisTasks.push((async () => {
      steps.push('[Step 1c] Analyzing CAD GIS parcel map…');
      const img = await loadDocumentImageBase64(documentIds.cadGisDocId!);
      if (img) {
        const analysis = await analyzeMapImage(img.base64, img.mediaType, 'cad_gis', address);
        imageAnalyses.cad_gis = analysis;
        steps.push(`[Step 1c] Found: ${analysis.lot_numbers_visible.length} lots, ${analysis.block_numbers_visible.length} blocks, ${analysis.streets_visible.length} streets`);

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
        steps.push('[Step 1c] Could not load CAD GIS image');
      }
    })());
  }

  // Analyze plat documents
  if (documentIds.platDocIds && documentIds.platDocIds.length > 0) {
    for (const platDocId of documentIds.platDocIds.slice(0, 3)) { // Max 3 plats
      analysisTasks.push((async () => {
        steps.push(`[Step 1d] Analyzing plat document ${platDocId}…`);
        const img = await loadDocumentImageBase64(platDocId);
        if (img) {
          const analysis = await analyzeMapImage(img.base64, img.mediaType, 'plat', address);
          imageAnalyses.plat = analysis; // Last plat wins (usually the most relevant)
          steps.push(`[Step 1d] Found: ${analysis.lot_numbers_visible.length} lots, ${analysis.block_numbers_visible.length} blocks, ${analysis.subdivision_names_visible.length} subdivisions`);

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
          steps.push(`[Step 1d] Could not load plat image ${platDocId}`);
        }
      })());
    }
  }

  // Run all image analyses in parallel
  await Promise.all(analysisTasks);

  // ── Step 2: AI comparison — synthesize all findings ──────────────────────
  steps.push('[Step 2] Running AI synthesis to identify the specific lot…');

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
        `an address falls on by comparing multiple map images and data sources.`,
        ``,
        `TAKE YOUR TIME. This is a critical determination that affects the entire survey.`,
        ``,
        `ADDRESS: ${address}`,
        ``,
        `I have analyzed multiple images and extracted the following data:`,
        ``,
        JSON.stringify(synthesisInput, null, 2),
        ``,
        `YOUR TASK:`,
        `1. Determine which specific LOT NUMBER the address pin falls on.`,
        `2. Determine the BLOCK NUMBER for that lot.`,
        `3. Determine the SUBDIVISION NAME.`,
        `4. Cross-check your identification against ALL data sources.`,
        `5. Flag any conflicts or inconsistencies between sources.`,
        `6. Provide specific recommendations if anything is uncertain.`,
        ``,
        `COMPARISON METHODOLOGY:`,
        `- Match the pin position from the street map to parcel boundaries on the CAD GIS image.`,
        `- Match building footprints from satellite imagery to lot shapes on the CAD GIS image.`,
        `- Cross-reference lot numbers from the CAD GIS with lot numbers from the plat.`,
        `- Verify the subdivision name from multiple sources.`,
        `- Check that the lot identification is consistent with the address number sequence.`,
        `  (e.g., if adjacent lots are numbered 5, 6, 7, the address should correspond`,
        `   to the correct lot based on the numbering pattern and the pin position)`,
        ``,
        `RESPOND WITH JSON:`,
        `{`,
        `  "lot_number": "7",`,
        `  "block_number": "2",`,
        `  "subdivision_name": "Belton Heights Addition",`,
        `  "confidence": 85,`,
        `  "reasoning": "Detailed step-by-step reasoning for the identification...",`,
        `  "key_features": ["pin is 3rd lot from corner", "matches building footprint"],`,
        `  "conflicts_detected": ["CAD shows lot 7 but plat labels it as lot 8"],`,
        `  "recommendations": ["Verify lot numbering with the county clerk plat records"]`,
        `}`,
      ].join('\n'),
      maxTokens: 4096,
      timeoutMs: 120_000, // 2 minutes — thorough analysis takes time
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

    steps.push(`[Step 2] AI identified: Lot ${lotNumber}, Block ${blockNumber}, ${subdivisionName} (confidence: ${overallConfidence}%)`);
    if (conflictsDetected.length > 0) {
      steps.push(`[Step 2] Conflicts: ${conflictsDetected.join('; ')}`);
    }
  } catch (err) {
    steps.push(`[Step 2] AI synthesis failed: ${err instanceof Error ? err.message : String(err)}`);
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

  steps.push(`[Step 3] Created ${atomsCreated.length} data atoms from visual analysis`);
  steps.push(`[Step 3] Validation graph: ${validationGraph.summary.total_atoms} atoms, ${validationGraph.summary.confirmed_count} confirmed, ${validationGraph.summary.conflicted_count} conflicted`);

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
