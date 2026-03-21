// worker/src/counties/bell/analyzers/lot-correlator.ts
// Correlates the target property to a specific lot on a plat.
//
// When a plat covers multiple lots (e.g., a subdivision plat with 6 lots),
// we need to determine which lot belongs to the target property. This module
// uses three strategies:
//
//   1. Data-level: Match property ID, lot/block, and acreage against plat data
//   2. Spatial: Use parcel boundary coordinates + GIS lot lines to identify the lot
//   3. Visual AI: Send the plat image + a generated parcel map to AI for correlation
//
// The generated parcel map is a simple SVG rendered from the GIS parcel boundary
// coordinates, showing the target parcel highlighted with its neighbors.

import { BELL_ENDPOINTS, TIMEOUTS } from '../config/endpoints.js';
import { buildUsageFromTokens } from './ai-cost-helpers.js';
import type { AiUsageSummary } from '../types/research-result.js';

// ── Types ────────────────────────────────────────────────────────────

export interface LotCorrelationInput {
  /** Target property lot number from CAD/GIS */
  lotNumber: string | null;
  /** Target property block number */
  blockNumber: string | null;
  /** Target property acreage */
  acreage: number | null;
  /** Target property owner name */
  ownerName: string | null;
  /** Target property ID from Bell CAD */
  propertyId: string | null;
  /** Target property address */
  situsAddress: string | null;
  /** Parcel boundary polygon from GIS [lon, lat] rings */
  parcelBoundary: number[][][] | null;
  /** Geocoded centroid */
  lat: number;
  lon: number;
  /** Subdivision name */
  subdivisionName: string | null;
}

export interface LotCorrelationResult {
  /** Which lot on the plat corresponds to the target property */
  identifiedLot: string | null;
  /** Confidence in the identification (0-100) */
  confidence: number;
  /** How the lot was identified */
  method: string;
  /** Detailed reasoning */
  reasoning: string;
  /** Base64 PNG of generated parcel context map (if generated) */
  parcelMapImage: string | null;
  /** AI usage for the correlation call */
  aiUsage: Partial<AiUsageSummary>;
}

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Identify which lot on a plat corresponds to the target property.
 * Uses data matching first, then visual AI correlation if needed.
 */
export async function correlateTargetLot(
  input: LotCorrelationInput,
  platImages: string[],
  platName: string,
  platAnalysis: { lotDimensions?: string[]; narrative?: string; adjacentReferences?: string[] } | null,
  anthropicApiKey: string,
  onProgress: (msg: string) => void,
): Promise<LotCorrelationResult> {
  onProgress(`Correlating target lot on plat "${platName}"...`);

  // ── Strategy 1: Data-level matching ────────────────────────────
  const dataMatch = tryDataMatch(input, platAnalysis, onProgress);
  if (dataMatch && dataMatch.confidence >= 80) {
    onProgress(`✓ Lot identified via data matching: Lot ${dataMatch.identifiedLot} (${dataMatch.confidence}% confidence)`);
    return { ...dataMatch, parcelMapImage: null, aiUsage: {} };
  }

  // ── Strategy 2: Generate parcel context map ────────────────────
  let parcelMapImage: string | null = null;
  if (input.parcelBoundary) {
    try {
      onProgress('Generating parcel context map from GIS coordinates...');
      parcelMapImage = await generateParcelMap(input);
      if (parcelMapImage) {
        onProgress('✓ Parcel context map generated');
      }
    } catch (err) {
      onProgress(`⚠ Could not generate parcel map: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Strategy 3: Query GIS for neighboring parcels context ──────
  let neighborContext = '';
  if (input.parcelBoundary) {
    try {
      const neighbors = await queryNeighborParcels(input.parcelBoundary, onProgress);
      if (neighbors.length > 0) {
        neighborContext = `\nNEIGHBORING PARCELS (from GIS):\n` +
          neighbors.map(n => `  - ${n.propertyId}: ${n.ownerName}, ${n.acreage ?? '?'}ac, ${n.situsAddress ?? 'no address'}`).join('\n');
        onProgress(`Found ${neighbors.length} neighboring parcel(s) for context`);
      }
    } catch (err) {
      onProgress(`⚠ Could not query neighbors: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Strategy 4: Visual AI correlation ──────────────────────────
  if (anthropicApiKey && platImages.length > 0) {
    onProgress('Running AI visual correlation: plat image + parcel map...');
    try {
      const aiResult = await aiLotCorrelation(
        input,
        platImages,
        platName,
        platAnalysis,
        parcelMapImage,
        neighborContext,
        anthropicApiKey,
      );
      onProgress(`✓ AI lot correlation: ${aiResult.identifiedLot ? `Lot ${aiResult.identifiedLot}` : 'could not determine'} (${aiResult.confidence}% confidence) — ${aiResult.reasoning}`);
      return { ...aiResult, parcelMapImage };
    } catch (err) {
      onProgress(`⚠ AI lot correlation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Fall back to data match (even if low confidence) or unknown
  if (dataMatch) {
    return { ...dataMatch, parcelMapImage, aiUsage: {} };
  }

  return {
    identifiedLot: input.lotNumber,
    confidence: input.lotNumber ? 30 : 0,
    method: 'fallback',
    reasoning: input.lotNumber
      ? `Using lot number ${input.lotNumber} from CAD/GIS but could not confirm on plat`
      : 'Could not determine which lot on the plat corresponds to the target property',
    parcelMapImage,
    aiUsage: {},
  };
}

// ── Strategy 1: Data Match ───────────────────────────────────────────

function tryDataMatch(
  input: LotCorrelationInput,
  platAnalysis: { lotDimensions?: string[]; narrative?: string; adjacentReferences?: string[] } | null,
  onProgress: (msg: string) => void,
): LotCorrelationResult | null {
  if (!input.lotNumber) return null;

  const lotNum = input.lotNumber.replace(/^0+/, '');
  let confidence = 40; // Base: we have a lot number
  const reasons: string[] = [`CAD/GIS lot number: ${lotNum}`];

  // Check if lot number appears in plat analysis
  if (platAnalysis?.lotDimensions) {
    const lotPattern = new RegExp(`\\bLot\\s+0*${lotNum}\\b`, 'i');
    const matchingDims = platAnalysis.lotDimensions.filter(d => lotPattern.test(d));
    if (matchingDims.length > 0) {
      confidence += 25;
      reasons.push(`Lot ${lotNum} found in plat dimensions (${matchingDims.length} entries)`);
      onProgress(`  Data match: Lot ${lotNum} found in plat dimensions`);
    }
  }

  // Check if acreage matches any lot dimension
  if (input.acreage && platAnalysis?.lotDimensions) {
    const acreStr = input.acreage.toFixed(2);
    const acreMatch = platAnalysis.lotDimensions.some(d =>
      d.includes(acreStr) || d.includes(input.acreage!.toFixed(3)),
    );
    if (acreMatch) {
      confidence += 15;
      reasons.push(`Acreage ${input.acreage} found in plat data`);
    }
  }

  // Check narrative for lot reference
  if (platAnalysis?.narrative) {
    const narrative = platAnalysis.narrative.toUpperCase();
    const lotPattern = new RegExp(`\\bLOT\\s+0*${lotNum}\\b`, 'i');
    if (lotPattern.test(narrative)) {
      confidence += 10;
      reasons.push('Lot referenced in narrative');
    }
  }

  // Check if owner name appears in adjacent references
  if (input.ownerName && platAnalysis?.adjacentReferences) {
    const ownerUpper = input.ownerName.toUpperCase();
    const ownerParts = ownerUpper.split(/[,\s]+/).filter(p => p.length > 2);
    const ownerInAdj = platAnalysis.adjacentReferences.some(ref => {
      const refUpper = ref.toUpperCase();
      return ownerParts.some(p => refUpper.includes(p));
    });
    if (ownerInAdj) {
      confidence += 10;
      reasons.push('Owner name found in adjacent references');
    }
  }

  confidence = Math.min(100, confidence);

  return {
    identifiedLot: lotNum,
    confidence,
    method: 'data-match',
    reasoning: reasons.join('; '),
    parcelMapImage: null,
    aiUsage: {},
  };
}

// ── Strategy 2: Generate Parcel Map ──────────────────────────────────

/**
 * Generate a simple SVG map showing the target parcel highlighted,
 * then convert to PNG via sharp for use in AI vision calls.
 */
async function generateParcelMap(input: LotCorrelationInput): Promise<string | null> {
  if (!input.parcelBoundary || input.parcelBoundary.length === 0) return null;

  // Compute bounding box of parcel
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const ring of input.parcelBoundary) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  // Add padding (30% around parcel)
  const lonRange = maxLon - minLon;
  const latRange = maxLat - minLat;
  const pad = Math.max(lonRange, latRange) * 0.3;
  minLon -= pad; maxLon += pad;
  minLat -= pad; maxLat += pad;

  const width = 800;
  const height = 800;

  // Transform coords to SVG space (flip Y axis since lat increases upward)
  const toSvgX = (lon: number) => ((lon - minLon) / (maxLon - minLon)) * width;
  const toSvgY = (lat: number) => height - ((lat - minLat) / (maxLat - minLat)) * height;

  // Build parcel polygon path
  const rings = input.parcelBoundary.map(ring =>
    ring.map(([lon, lat]) => `${toSvgX(lon).toFixed(1)},${toSvgY(lat).toFixed(1)}`).join(' '),
  );

  // Compute centroid for label
  const firstRing = input.parcelBoundary[0];
  const cx = firstRing.reduce((s, [lon]) => s + lon, 0) / firstRing.length;
  const cy = firstRing.reduce((s, [, lat]) => s + lat, 0) / firstRing.length;
  const labelX = toSvgX(cx);
  const labelY = toSvgY(cy);

  // Build label text
  const labelLines: string[] = [];
  if (input.lotNumber) labelLines.push(`Lot ${input.lotNumber}`);
  if (input.acreage) labelLines.push(`${input.acreage} ac`);
  if (input.situsAddress) labelLines.push(input.situsAddress.split(',')[0]);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#f0f4f8"/>
  <text x="${width / 2}" y="25" text-anchor="middle" font-family="Arial" font-size="16" font-weight="bold" fill="#1e3a5f">
    Target Property — GIS Parcel Boundary
  </text>
  ${input.subdivisionName ? `<text x="${width / 2}" y="45" text-anchor="middle" font-family="Arial" font-size="13" fill="#4a6785">${escapeXml(input.subdivisionName)}</text>` : ''}

  <!-- Parcel boundary -->
  ${rings.map((pts, i) => `<polygon points="${pts}" fill="${i === 0 ? 'rgba(59,130,246,0.2)' : 'rgba(239,68,68,0.1)'}" stroke="${i === 0 ? '#2563eb' : '#dc2626'}" stroke-width="3"/>`).join('\n  ')}

  <!-- Centroid marker -->
  <circle cx="${labelX.toFixed(1)}" cy="${labelY.toFixed(1)}" r="6" fill="#dc2626" stroke="#fff" stroke-width="2"/>

  <!-- Labels -->
  ${labelLines.map((line, i) => `<text x="${labelX.toFixed(1)}" y="${(labelY + 20 + i * 18).toFixed(1)}" text-anchor="middle" font-family="Arial" font-size="14" font-weight="bold" fill="#1e3a5f">${escapeXml(line)}</text>`).join('\n  ')}

  <!-- Coordinate info -->
  <text x="10" y="${height - 10}" font-family="monospace" font-size="10" fill="#64748b">
    Centroid: ${cy.toFixed(6)}N, ${cx.toFixed(6)}W | Bounds: ${minLat.toFixed(4)}-${maxLat.toFixed(4)}N, ${minLon.toFixed(4)}-${maxLon.toFixed(4)}W
  </text>

  <!-- North arrow -->
  <g transform="translate(${width - 40}, 60)">
    <line x1="0" y1="20" x2="0" y2="-15" stroke="#1e3a5f" stroke-width="2" marker-end="url(#arrow)"/>
    <text x="0" y="-20" text-anchor="middle" font-family="Arial" font-size="12" font-weight="bold" fill="#1e3a5f">N</text>
  </g>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#1e3a5f"/>
    </marker>
  </defs>
</svg>`;

  try {
    const { default: sharp } = await import('sharp') as { default: typeof import('sharp') };
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    return pngBuffer.toString('base64');
  } catch (err) {
    console.warn(`[lot-correlator] SVG→PNG conversion failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Strategy 3: Query Neighbor Parcels ───────────────────────────────

interface NeighborParcel {
  propertyId: string;
  ownerName: string;
  acreage: number | null;
  situsAddress: string | null;
}

async function queryNeighborParcels(
  parcelBoundary: number[][][],
  onProgress: (msg: string) => void,
): Promise<NeighborParcel[]> {
  // Compute bounding box with small buffer
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const ring of parcelBoundary) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  const buffer = 0.0005; // ~55m buffer
  const envelope = `${minLon - buffer},${minLat - buffer},${maxLon + buffer},${maxLat + buffer}`;

  const queryUrl = `${BELL_ENDPOINTS.gis.parcelLayer}${BELL_ENDPOINTS.gis.queryPath}`;
  const params = new URLSearchParams({
    geometry: envelope,
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: 'prop_id_text,file_as_name,legal_acreage,situs_num,situs_street',
    returnGeometry: 'false',
    f: 'json',
  });

  const resp = await fetch(`${queryUrl}?${params}`, {
    signal: AbortSignal.timeout(TIMEOUTS.arcgisQuery),
  });

  if (!resp.ok) return [];

  const data = await resp.json() as {
    features?: Array<{
      attributes?: Record<string, string | number | null>;
    }>;
  };

  if (!data.features) return [];

  return data.features.slice(0, 20).map(f => {
    const a = f.attributes ?? {};
    return {
      propertyId: String(a.prop_id_text ?? a.prop_id ?? ''),
      ownerName: String(a.file_as_name ?? ''),
      acreage: typeof a.legal_acreage === 'number' ? a.legal_acreage : null,
      situsAddress: [a.situs_num, a.situs_street].filter(Boolean).join(' ') || null,
    };
  });
}

// ── Strategy 4: AI Visual Correlation ────────────────────────────────

async function aiLotCorrelation(
  input: LotCorrelationInput,
  platImages: string[],
  platName: string,
  platAnalysis: { lotDimensions?: string[]; narrative?: string } | null,
  parcelMapImage: string | null,
  neighborContext: string,
  apiKey: string,
): Promise<LotCorrelationResult> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  // Build image content
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageContent: any[] = [];

  // Add plat image(s)
  for (const img of platImages.slice(0, 2)) {
    // Resize if needed
    let imgData = img;
    let mediaType: 'image/png' | 'image/jpeg' = 'image/png';
    try {
      const { default: sharp } = await import('sharp') as { default: typeof import('sharp') };
      const buf = Buffer.from(img, 'base64');
      const meta = await sharp(buf).metadata();
      if (meta.width && meta.height && (meta.width > 4000 || meta.height > 4000)) {
        const scale = 4000 / Math.max(meta.width, meta.height);
        const resized = await sharp(buf)
          .resize(Math.round(meta.width * scale), Math.round(meta.height * scale))
          .jpeg({ quality: 80 })
          .toBuffer();
        imgData = resized.toString('base64');
        mediaType = 'image/jpeg';
      }
    } catch { /* use original */ }

    imageContent.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: imgData },
    });
  }

  // Add parcel map if available
  if (parcelMapImage) {
    imageContent.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png' as const, data: parcelMapImage },
    });
  }

  // Parse street number from situs address for frontage matching
  const streetNumber = input.situsAddress?.match(/^(\d+)\s/)?.[1] ?? null;
  const streetName = input.situsAddress?.replace(/^\d+\s+/, '').replace(/,.*$/, '') ?? null;

  const prompt = `You are an expert property surveyor in Bell County, Texas. Your task is to identify EXACTLY which specific lot on this plat corresponds to the target property. Getting the wrong lot is a serious error — be precise.

TARGET PROPERTY:
- Property ID: ${input.propertyId ?? 'unknown'}
- Owner: ${input.ownerName ?? 'unknown'}
- Situs Address: ${input.situsAddress ?? 'unknown'}${streetNumber ? `\n  → Street Number: ${streetNumber} (look for this number on the plat or determine which lot has this address based on lot numbering patterns)` : ''}${streetName ? `\n  → Street Name: "${streetName}" (the lot must front on or be accessed from this street)` : ''}
- Lot: ${input.lotNumber ?? 'unknown'}, Block: ${input.blockNumber ?? 'unknown'}
- Subdivision: ${input.subdivisionName ?? 'unknown'}
- Acreage: ${input.acreage ?? 'unknown'}
- GPS Coordinates: ${input.lat.toFixed(6)}N, ${input.lon.toFixed(6)}W

PLAT: "${platName}"
${platAnalysis?.narrative ? `Plat narrative: ${platAnalysis.narrative}` : ''}
${platAnalysis?.lotDimensions?.length ? `Lot dimensions from AI analysis:\n${platAnalysis.lotDimensions.map(d => `  - ${d}`).join('\n')}` : ''}
${neighborContext}

${parcelMapImage ? 'I have included the plat image(s) AND a generated map showing the target parcel boundary from GIS coordinates (red outline with label). Use the parcel shape, size, and position to match it to a lot on the plat.' : 'I have included the plat image(s). Use ALL available data to identify the target lot.'}

CRITICAL: Determine which lot on this plat is the target property using this priority order:

1. **ADDRESS MATCHING (highest priority)**:
   - If the plat shows street addresses or lot addresses, match the target address "${input.situsAddress ?? '?'}" directly.
   - If addresses aren't shown, determine which lot FACES the street "${streetName ?? '?'}". Lots on a plat are typically numbered sequentially along a street — if address ${streetNumber ?? '?'} is between addresses of neighboring lots, it's likely the lot in that position.
   - Consider the address numbering pattern: odd numbers on one side, even on the other. ${streetNumber ? `Address ${streetNumber} is ${parseInt(streetNumber) % 2 === 0 ? 'even (typically south/west side)' : 'odd (typically north/east side)'}.` : ''}

2. **PROPERTY ID MATCHING**:
   - Property ID "${input.propertyId ?? '?'}" from Bell CAD often encodes lot information. Look for this ID or its lot portion on the plat.

3. **LOT NUMBER MATCHING**:
   - CAD/GIS indicates Lot ${input.lotNumber ?? '?'}. Verify this matches by checking acreage and position, not just the number.
   - WARNING: The CAD lot number may not always match the plat lot number if the subdivision was replatted or lots were renumbered.

4. **ACREAGE MATCHING**:
   - Target property is ${input.acreage ?? '?'} acres. Compare to each lot's area shown on the plat.
   - If only one lot has this acreage, that's a strong signal.

5. **SPATIAL POSITION**:
   - If the parcel map is provided, compare the target parcel shape and position to lots on the plat.
   - Consider relative position within the subdivision (corner lot, interior lot, cul-de-sac).

6. **OWNER NAME**:
   - Check if "${input.ownerName ?? '?'}" appears on the plat or in adjacent references.

IMPORTANT: Do NOT simply default to the CAD lot number. Verify it using at least 2 independent signals (address, acreage, position, etc.). If the evidence suggests a DIFFERENT lot than the CAD record says, report the lot the evidence supports and explain the discrepancy.

Respond in JSON:
{
  "identifiedLot": "<lot number/label that matches, or null if cannot determine>",
  "confidence": <0-100>,
  "reasoning": "<detailed explanation including: which signals matched, which conflicted, which lot faces the target street, acreage comparison for each candidate lot, and why you chose this lot over alternatives>"
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        ...imageContent,
        { type: 'text', text: prompt },
      ],
    }],
  });

  const textBlock = response.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined;
  const callUsage = buildUsageFromTokens(
    response.usage?.input_tokens ?? 0,
    response.usage?.output_tokens ?? 0,
  );

  if (textBlock) {
    try {
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { identifiedLot?: string | null; confidence?: number; reasoning?: string };
        return {
          identifiedLot: parsed.identifiedLot ?? null,
          confidence: parsed.confidence ?? 0,
          method: 'ai-visual',
          reasoning: parsed.reasoning ?? 'AI visual correlation',
          parcelMapImage: null,
          aiUsage: callUsage,
        };
      }
    } catch { /* fall through */ }
  }

  return {
    identifiedLot: null,
    confidence: 0,
    method: 'ai-visual-failed',
    reasoning: 'AI response could not be parsed',
    parcelMapImage: null,
    aiUsage: callUsage,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
