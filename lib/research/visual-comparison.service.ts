// lib/research/visual-comparison.service.ts — Enhanced visual comparison engine
//
// Takes map pin screenshots, satellite imagery, CAD/GIS parcel maps, and plat
// documents and performs systematic visual comparison to determine which specific
// lot the address is on.
//
// The comparison is done in three stages:
//   Stage 1: Identify the pin location on the map screenshot
//   Stage 2: Overlay the pin position against CAD/GIS parcel boundaries
//   Stage 3: Cross-reference the identified lot against plat documents
//
// This service extends the visual-lot-identifier by adding:
//   - Screenshot-to-parcel comparison logic
//   - Multi-image overlay analysis
//   - Structured comparison logging
//   - Trigger integration (fires triggers when criteria are met)

import { PipelineLogger } from './pipeline-logger';
import { callAI } from './ai-client';
import { loadDocumentImage, type LoadedImage } from './image-loader';
import { iterativeImageAnalysis, type IterativeAnalysisResult } from './iterative-image-analyzer.service';
import {
  createAtom,
  addAtomAndValidate,
  type DataAtom,
  type ValidationGraph,
} from './cross-validation.service';
import {
  evaluateTriggers,
  buildTriggerContext,
  type FiredTrigger,
} from './criteria-triggers';
import type { PromptKey } from './prompts';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ImageForComparison {
  /** Document ID in research_documents */
  document_id: string;
  /** What type of image this is */
  image_type: 'street_pin' | 'satellite_pin' | 'cad_gis' | 'usgs_satellite' | 'plat' | 'deed' | 'gis_screenshot';
  /** Human-readable label */
  label: string;
  /** Base64-encoded image data (loaded on demand) */
  base64?: string;
  /** Media type */
  media_type?: 'image/png' | 'image/jpeg';
  /** Extracted text/description from the document */
  description?: string;
}

export interface VisualComparisonResult {
  /** Which lot was identified */
  identified_lot: string | null;
  /** Which block */
  identified_block: string | null;
  /** Which subdivision */
  identified_subdivision: string | null;
  /** Property ID (if found on the parcel) */
  identified_prop_id: string | null;
  /** Overall confidence in the identification */
  confidence: number;
  /** Step-by-step reasoning */
  reasoning: string;
  /** Physical features that helped identify the lot */
  key_features: string[];
  /** Conflicts between image sources */
  conflicts: string[];
  /** Recommendations */
  recommendations: string[];
  /** Data atoms created */
  atoms_created: DataAtom[];
  /** Triggers that fired during comparison */
  triggers_fired: FiredTrigger[];
  /** Comparison details per image pair */
  pair_comparisons: PairComparison[];
}

export interface PairComparison {
  /** Image A type */
  image_a_type: string;
  /** Image B type */
  image_b_type: string;
  /** What was compared */
  comparison_focus: string;
  /** Result: agree, disagree, or inconclusive */
  result: 'agree' | 'disagree' | 'inconclusive';
  /** Details */
  detail: string;
  /** Confidence in this comparison */
  confidence: number;
}

// ── Image Loading ────────────────────────────────────────────────────────────
// Uses shared image-loader.ts to avoid duplicating Supabase fetch logic.
// The shared loader also returns extracted_text and document_label in a single
// DB query, eliminating the redundant second query that was here before.

// ── Core Comparison Function ─────────────────────────────────────────────────

/**
 * Run a systematic visual comparison across all available images.
 *
 * The comparison follows this order:
 *   1. Map pin screenshot → where did the address get pinned?
 *   2. Pin position → CAD/GIS overlay → which parcel polygon contains the pin?
 *   3. Identified parcel → plat document → does the plat confirm the lot number?
 *   4. All sources → consistency check → do all images agree?
 */
export async function runVisualComparison(
  address: string,
  images: ImageForComparison[],
  graph: ValidationGraph,
  logger: PipelineLogger,
): Promise<VisualComparisonResult> {
  logger.startPhase('visual_compare', `Running visual comparison for: ${address}`);

  const result: VisualComparisonResult = {
    identified_lot: null,
    identified_block: null,
    identified_subdivision: null,
    identified_prop_id: null,
    confidence: 0,
    reasoning: '',
    key_features: [],
    conflicts: [],
    recommendations: [],
    atoms_created: [],
    triggers_fired: [],
    pair_comparisons: [],
  };

  // Load images that we'll need
  const loadedImages: Map<string, { loaded: LoadedImage; image: ImageForComparison }> = new Map();

  const pinImages = images.filter(i => i.image_type === 'street_pin' || i.image_type === 'satellite_pin');
  const gisImages = images.filter(i => i.image_type === 'cad_gis' || i.image_type === 'gis_screenshot');
  const platImages = images.filter(i => i.image_type === 'plat');
  const satelliteImages = images.filter(i => i.image_type === 'usgs_satellite' || i.image_type === 'satellite_pin');

  logger.info('visual_compare', `Available images: ${pinImages.length} pin, ${gisImages.length} GIS, ${platImages.length} plat, ${satelliteImages.length} satellite`);

  // Load up to 4 images for comparison (Vision API limit per call)
  const imagesToLoad = [
    ...pinImages.slice(0, 1),
    ...gisImages.slice(0, 1),
    ...platImages.slice(0, 1),
    ...satelliteImages.slice(0, 1),
  ];

  // Load all images in parallel using the shared loader
  // The shared loader returns extracted_text and document_label in a single
  // DB query — no need for a second round-trip per image.
  const loadPromises = imagesToLoad.map(async (img) => {
    const loaded = await loadDocumentImage(img.document_id, logger);
    if (loaded) {
      loadedImages.set(img.document_id, { loaded, image: img });
    }
  });
  await Promise.all(loadPromises);

  if (loadedImages.size === 0) {
    logger.warn('visual_compare', 'No images could be loaded — cannot perform visual comparison');
    result.reasoning = 'No images available for visual comparison';
    logger.endPhase('visual_compare', 'Aborted — no images loaded');
    return result;
  }

  logger.info('visual_compare', `Loaded ${loadedImages.size}/${imagesToLoad.length} images for comparison`);

  // ── Deep-analyze each image iteratively before comparison ──────────────
  // Each image gets tile-based analysis to extract maximum detail.
  // The deep analysis findings are then fed into the comparison prompt.

  const deepAnalyses: Map<string, IterativeAnalysisResult> = new Map();

  for (const [docId, entry] of loadedImages) {
    const imgType = entry.image.image_type;
    // Plats always get forced tiling; other types tile when confidence is low
    const forceTiling = imgType === 'plat' || imgType === 'deed';
    const maxGrid = (imgType === 'plat' || imgType === 'deed') ? '3x3' as const : '2x2' as const;

    const prompt = [
      `Analyze this ${imgType.replace(/_/g, ' ')} image thoroughly.`,
      `The address being researched is: "${address}"`,
      `Read ALL text, lot numbers, street names, and features visible.`,
    ].join('\n');

    try {
      const deepResult = await iterativeImageAnalysis(
        entry.loaded.base64,
        entry.loaded.mediaType,
        { prompt, imageType: imgType, address, forceTiling, maxTileGrid: maxGrid },
        logger,
      );
      deepAnalyses.set(docId, deepResult);
      logger.info('visual_compare',
        `Deep analysis of ${imgType}: ${deepResult.total_passes} passes, ` +
        `confidence=${deepResult.final_confidence}%, ` +
        `lots=[${deepResult.merged.lot_numbers.join(', ')}]`,
      );
    } catch (err) {
      logger.warn('visual_compare', `Deep analysis of ${imgType} failed (using basic description): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Build the multi-image comparison prompt ───────────────────────────

  // Collect descriptions from loaded images — combine stored extracted_text
  // with the detailed findings from iterative deep analysis.
  const imageDescriptions: string[] = [];
  for (const [docId, entry] of loadedImages) {
    const parts: string[] = [];
    parts.push(`--- ${entry.image.image_type.toUpperCase()} (${entry.loaded.documentLabel || entry.image.label}) ---`);

    if (entry.loaded.extractedText) {
      parts.push(entry.loaded.extractedText);
    }

    // Append deep analysis findings (these come from iterative tile analysis)
    const deep = deepAnalyses.get(docId);
    if (deep && deep.merged.lot_numbers.length > 0) {
      parts.push(`\nDEEP ANALYSIS FINDINGS (${deep.total_passes} passes, tiling=${deep.used_tiling}):`);
      if (deep.merged.lot_numbers.length > 0) parts.push(`  Lot numbers found: ${deep.merged.lot_numbers.join(', ')}`);
      if (deep.merged.block_numbers.length > 0) parts.push(`  Block numbers found: ${deep.merged.block_numbers.join(', ')}`);
      if (deep.merged.street_names.length > 0) parts.push(`  Street names: ${deep.merged.street_names.join(', ')}`);
      if (deep.merged.subdivision_names.length > 0) parts.push(`  Subdivisions: ${deep.merged.subdivision_names.join(', ')}`);
      if (deep.merged.pin_position) parts.push(`  Pin position: ${deep.merged.pin_position}`);
      if (deep.merged.buildings.length > 0) parts.push(`  Buildings: ${deep.merged.buildings.join(', ')}`);
      if (deep.merged.features.length > 0) parts.push(`  Features: ${deep.merged.features.join(', ')}`);
      if (deep.merged.bearings.length > 0) parts.push(`  Bearings: ${deep.merged.bearings.join(', ')}`);
      if (deep.merged.distances.length > 0) parts.push(`  Distances: ${deep.merged.distances.join(', ')}`);
      if (deep.final_synthesis) parts.push(`  Synthesis: ${deep.final_synthesis}`);
    }

    imageDescriptions.push(parts.join('\n'));
  }

  // Run the AI comparison
  try {
    const comparisonResult = await callAI({
      promptKey: 'CROSS_REFERENCE_ANALYZER' as PromptKey,
      userContent: [
        `You are a Texas RPLS performing a SYSTEMATIC visual and data comparison to identify`,
        `which specific lot/parcel an address falls on.`,
        ``,
        `TARGET ADDRESS: ${address}`,
        ``,
        `You have ${loadedImages.size} images/data sources available. Here are their descriptions:`,
        ``,
        ...imageDescriptions,
        ``,
        `═══════════════════════════════════════════════════════════════════`,
        `COMPARISON METHODOLOGY — Follow these steps EXACTLY:`,
        `═══════════════════════════════════════════════════════════════════`,
        ``,
        `STAGE 1 — PIN LOCATION ANALYSIS:`,
        `  If a map pin image is available:`,
        `  a) Where exactly is the pin? (street, side, distance from intersection)`,
        `  b) What lot shape does the pin appear to be on?`,
        `  c) What are the adjacent addresses/lots?`,
        ``,
        `STAGE 2 — PARCEL DATA COMPARISON:`,
        `  If GIS/CAD parcel data is available:`,
        `  a) Find the parcel whose situs address matches "${address}"`,
        `  b) Note that parcel's lot number, block, property ID`,
        `  c) Does the parcel position match where the pin was placed?`,
        `  d) Do adjacent parcel addresses follow a logical numbering sequence?`,
        ``,
        `STAGE 3 — PLAT CROSS-REFERENCE:`,
        `  If a plat document is available:`,
        `  a) Find the lot number from the plat that matches the GIS lot`,
        `  b) Do the plat dimensions match the GIS parcel shape?`,
        `  c) Has the subdivision been replated? (different lot numbers)`,
        ``,
        `STAGE 4 — SATELLITE VERIFICATION:`,
        `  If satellite imagery is available:`,
        `  a) Match building footprint to the identified parcel`,
        `  b) Do fence lines match parcel boundaries?`,
        `  c) Does the driveway access match the correct lot?`,
        ``,
        `STAGE 5 — FINAL DETERMINATION:`,
        `  a) Which lot, block, and subdivision is this address on?`,
        `  b) What is the property ID?`,
        `  c) Rate confidence 0-100`,
        `  d) List physical features that support the identification`,
        `  e) List any conflicts between sources`,
        `  f) Pair-by-pair comparison results (which pairs agree/disagree)`,
        ``,
        `RESPOND WITH JSON:`,
        `{`,
        `  "lot_number": "7",`,
        `  "block_number": "2",`,
        `  "subdivision_name": "Oak Hills Addition",`,
        `  "prop_id": "123456",`,
        `  "confidence": 85,`,
        `  "reasoning": "Step-by-step reasoning...",`,
        `  "key_features": ["pin on south side of Oak St", "building footprint matches parcel"],`,
        `  "conflicts": ["plat shows lot 7 but GIS says lot 8"],`,
        `  "recommendations": ["verify with county clerk"],`,
        `  "pair_comparisons": [`,
        `    {`,
        `      "image_a": "street_pin",`,
        `      "image_b": "cad_gis",`,
        `      "focus": "lot identification",`,
        `      "result": "agree",`,
        `      "detail": "Pin falls within parcel boundary for lot 7",`,
        `      "confidence": 90`,
        `    }`,
        `  ]`,
        `}`,
      ].join('\n'),
      maxTokens: 8192,
      timeoutMs: 180_000,
    });

    const data = comparisonResult.response as Record<string, unknown>;

    result.identified_lot = data.lot_number ? String(data.lot_number) : null;
    result.identified_block = data.block_number ? String(data.block_number) : null;
    result.identified_subdivision = data.subdivision_name ? String(data.subdivision_name) : null;
    result.identified_prop_id = data.prop_id ? String(data.prop_id) : null;
    result.confidence = typeof data.confidence === 'number' ? data.confidence : 50;
    result.reasoning = String(data.reasoning || '');
    result.key_features = Array.isArray(data.key_features) ? data.key_features.map(String) : [];
    result.conflicts = Array.isArray(data.conflicts) ? data.conflicts.map(String) : [];
    result.recommendations = Array.isArray(data.recommendations) ? data.recommendations.map(String) : [];

    // Parse pair comparisons
    if (Array.isArray(data.pair_comparisons)) {
      result.pair_comparisons = (data.pair_comparisons as Array<Record<string, unknown>>).map(pc => ({
        image_a_type: String(pc.image_a || ''),
        image_b_type: String(pc.image_b || ''),
        comparison_focus: String(pc.focus || ''),
        result: (['agree', 'disagree', 'inconclusive'].includes(String(pc.result)) ? String(pc.result) : 'inconclusive') as 'agree' | 'disagree' | 'inconclusive',
        detail: String(pc.detail || ''),
        confidence: typeof pc.confidence === 'number' ? pc.confidence : 50,
      }));
    }

    logger.info('visual_compare', `AI identified: Lot ${result.identified_lot}, Block ${result.identified_block}, ${result.identified_subdivision}`, {
      lot: result.identified_lot,
      block: result.identified_block,
      subdivision: result.identified_subdivision,
      prop_id: result.identified_prop_id,
      confidence: result.confidence,
      pair_comparisons: result.pair_comparisons.length,
    });

    // Log pair comparisons
    for (const pc of result.pair_comparisons) {
      if (pc.result === 'agree') {
        logger.match('visual_compare', `${pc.image_a_type} ↔ ${pc.image_b_type}: AGREE on ${pc.comparison_focus} (${pc.confidence}%)`, { detail: pc.detail });
      } else if (pc.result === 'disagree') {
        logger.conflict('visual_compare', `${pc.image_a_type} ↔ ${pc.image_b_type}: DISAGREE on ${pc.comparison_focus}`, { detail: pc.detail });
      }
    }

    if (result.conflicts.length > 0) {
      for (const conflict of result.conflicts) {
        logger.conflict('visual_compare', conflict);
      }
    }

  } catch (err) {
    logger.error('visual_compare', `Visual comparison AI failed: ${err instanceof Error ? err.message : String(err)}`);
    result.reasoning = 'AI visual comparison failed';
  }

  // ── Create atoms from the comparison result ─────────────────────────────
  // Each identified value becomes a DataAtom with 'ai_comparison' as the source,
  // which will be cross-validated against atoms from other sources (ArcGIS, deed, plat).

  if (result.identified_lot) {
    const lotAtom = createAtom({
      category: 'lot_number',
      value: result.identified_lot,
      source: 'ai_comparison',
      extraction_method: 'Visual comparison of map pin, GIS, satellite, and plat images',
      confidence: result.confidence,
      confidence_reasoning: result.reasoning.substring(0, 200),
      pipeline_step: 'visual_comparison',
    });
    result.atoms_created.push(lotAtom);
    addAtomAndValidate(graph, lotAtom);
    logger.info('visual_compare', `Created lot_number atom: "${result.identified_lot}" (confidence: ${result.confidence}%)`);
  }

  if (result.identified_block) {
    const blockAtom = createAtom({
      category: 'block_number',
      value: result.identified_block,
      source: 'ai_comparison',
      extraction_method: 'Visual comparison — block identified from image analysis',
      confidence: result.confidence,
      confidence_reasoning: 'Block identified during visual lot comparison',
      pipeline_step: 'visual_comparison',
    });
    result.atoms_created.push(blockAtom);
    addAtomAndValidate(graph, blockAtom);
    logger.info('visual_compare', `Created block_number atom: "${result.identified_block}"`);
  }

  if (result.identified_subdivision) {
    const subdivAtom = createAtom({
      category: 'subdivision_name',
      value: result.identified_subdivision,
      source: 'ai_comparison',
      extraction_method: 'Visual comparison — subdivision identified from image analysis',
      confidence: result.confidence,
      confidence_reasoning: 'Subdivision identified during visual lot comparison',
      pipeline_step: 'visual_comparison',
    });
    result.atoms_created.push(subdivAtom);
    addAtomAndValidate(graph, subdivAtom);
    logger.info('visual_compare', `Created subdivision_name atom: "${result.identified_subdivision}"`);
  }

  if (result.identified_prop_id) {
    const propAtom = createAtom({
      category: 'property_id',
      value: result.identified_prop_id,
      source: 'ai_comparison',
      extraction_method: 'Visual comparison — property ID from GIS parcel data matched to pin location',
      confidence: Math.min(result.confidence, 85),
      confidence_reasoning: 'Property ID matched during visual lot identification',
      pipeline_step: 'visual_comparison',
    });
    result.atoms_created.push(propAtom);
    addAtomAndValidate(graph, propAtom);
    logger.info('visual_compare', `Created property_id atom: "${result.identified_prop_id}"`);
  }

  logger.info('visual_compare', `Created ${result.atoms_created.length} atoms from visual comparison`, {
    atoms: result.atoms_created.map(a => ({ category: a.category, value: a.value, confidence: a.confidence })),
  });

  // ── Evaluate triggers ──────────────────────────────────────────────────

  const triggerCtx = buildTriggerContext({
    graph,
    completed_phase: 'visual_compare',
    address,
    resources_analyzed: images.length,
    resource_labels: images.map(i => i.label),
  });

  const triggers = evaluateTriggers(triggerCtx, logger);
  result.triggers_fired = triggers;

  logger.endPhase('visual_compare', `Visual comparison complete: lot=${result.identified_lot}, confidence=${result.confidence}%, ${triggers.length} triggers fired`);

  return result;
}
