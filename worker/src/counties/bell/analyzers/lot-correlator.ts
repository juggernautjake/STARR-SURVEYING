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

  // ── Strategy 3.5: Fetch Google Maps location image ────────────
  // Captures satellite + street view with a pin at the geocoded address.
  // This gives the AI a real-world reference for WHERE the address is,
  // so it can match the pin to the correct lot on the plat.
  let googleMapsImages: { satellite: string | null; street: string | null } = { satellite: null, street: null };
  if (input.lat && input.lon) {
    try {
      onProgress('Fetching Google Maps location images for address pin...');
      googleMapsImages = await fetchGoogleMapsLocationImage(
        input.lat, input.lon, input.situsAddress, onProgress,
      );
    } catch (err) {
      onProgress(`⚠ Google Maps image fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Strategy 4: Visual AI correlation ──────────────────────────
  if (anthropicApiKey && platImages.length > 0) {
    onProgress('Running AI visual correlation: plat image + parcel map + Google Maps pin...');
    try {
      const aiResult = await aiLotCorrelation(
        input,
        platImages,
        platName,
        platAnalysis,
        parcelMapImage,
        neighborContext,
        googleMapsImages,
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
  googleMapsImages: { satellite: string | null; street: string | null },
  apiKey: string,
): Promise<LotCorrelationResult> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  // Build image content — ORDER MATTERS for AI reasoning:
  // 1. Google Maps satellite (real-world aerial with pin showing exact address location)
  // 2. Google Maps street/roadmap (road layout with pin)
  // 3. Plat image(s) (the recorded plat to match against)
  // 4. Generated parcel map (GIS polygon overlay)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageContent: any[] = [];
  const imageLabels: string[] = [];

  // Add Google Maps satellite image with address pin (most important for location)
  if (googleMapsImages.satellite) {
    imageContent.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png' as const, data: googleMapsImages.satellite },
    });
    imageLabels.push('IMAGE A: Google Maps SATELLITE view with red pin at the geocoded address');
  }

  // Add Google Maps roadmap image with address pin
  if (googleMapsImages.street) {
    imageContent.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png' as const, data: googleMapsImages.street },
    });
    imageLabels.push('IMAGE B: Google Maps ROADMAP view with red pin at the geocoded address');
  }

  // Add plat image(s)
  for (const img of platImages.slice(0, 2)) {
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
    imageLabels.push(`IMAGE ${String.fromCharCode(65 + imageLabels.length)}: Recorded plat drawing`);
  }

  // Add parcel map if available
  if (parcelMapImage) {
    imageContent.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png' as const, data: parcelMapImage },
    });
    imageLabels.push(`IMAGE ${String.fromCharCode(65 + imageLabels.length)}: Generated GIS parcel boundary map`);
  }

  // Parse street number from situs address for frontage matching
  const streetNumber = input.situsAddress?.match(/^(\d+)\s/)?.[1] ?? null;
  const streetName = input.situsAddress?.replace(/^\d+\s+/, '').replace(/,.*$/, '') ?? null;

  const hasGoogleImages = googleMapsImages.satellite || googleMapsImages.street;

  const prompt = `You are an expert property surveyor in Bell County, Texas. Your task is to identify EXACTLY which specific lot on this plat corresponds to the target property. Getting the wrong lot is a serious error — be precise.

IMAGES PROVIDED (in order):
${imageLabels.map(l => `  - ${l}`).join('\n')}

TARGET PROPERTY:
- Property ID: ${input.propertyId ?? 'unknown'}
- Owner: ${input.ownerName ?? 'unknown'}
- Situs Address: ${input.situsAddress ?? 'unknown'}${streetNumber ? `\n  → Street Number: ${streetNumber}` : ''}${streetName ? `\n  → Street Name: "${streetName}"` : ''}
- Lot: ${input.lotNumber ?? 'unknown'}, Block: ${input.blockNumber ?? 'unknown'}
- Subdivision: ${input.subdivisionName ?? 'unknown'}
- Acreage: ${input.acreage ?? 'unknown'}
- GPS Coordinates: ${input.lat.toFixed(6)}N, ${input.lon.toFixed(6)}W

PLAT: "${platName}"
${platAnalysis?.narrative ? `Plat narrative: ${platAnalysis.narrative}` : ''}
${platAnalysis?.lotDimensions?.length ? `Lot dimensions from AI analysis:\n${platAnalysis.lotDimensions.map(d => `  - ${d}`).join('\n')}` : ''}
${neighborContext}

${hasGoogleImages ? `CRITICAL — GOOGLE MAPS PIN LOCATION MATCHING:
The Google Maps satellite/street images show a RED PIN at the geocoded address (${input.situsAddress ?? '?'}). This pin shows you the REAL-WORLD location of the property.

Follow this procedure step by step:
1. ORIENT: Identify road names on both the Google Maps image and the plat. Note which direction is north on each. The plat may need to be mentally rotated to match the Google Maps orientation.
2. LOCATE PIN: Note the red pin's position relative to roads and intersections on the Google Maps image. What roads does it front on? Where is it relative to the nearest intersection?
3. MATCH ROADS: Find the same roads on the plat drawing. Match the road layout (intersections, curves, road names).
4. FIND LOT: The lot under/nearest the pin in the Google Maps image corresponds to a specific lot on the plat. Trace from the pin position through the road network to identify which lot on the plat occupies that same position.
5. VERIFY: Confirm with acreage, shape, and any visible building footprints.

IMPORTANT: The plat is likely rotated relative to the Google Maps view. You MUST orient the plat to match before making your determination. Look at the north arrow on the plat, road labels, and the shape of the road network to establish the correct orientation.` : `I have included the plat image(s)${parcelMapImage ? ' AND a generated map showing the target parcel boundary from GIS coordinates' : ''}. Use ALL available data to identify the target lot.`}

Determine which lot on this plat is the target property using this priority order:

1. **GOOGLE MAPS PIN LOCATION (highest priority when available)**:
   - The red pin on the satellite/street image shows WHERE the address physically is.
   - Match this position to the plat by aligning road networks between the images.
   - This is the most reliable signal because it's based on geocoded coordinates.

2. **SPATIAL/SHAPE MATCHING**:
   - Compare parcel shapes on Google Maps aerial to lot shapes on the plat.
   - Match building footprints visible on both images.
   - Compare the lot's position relative to road intersections.

3. **ACREAGE MATCHING**:
   - Target property is ${input.acreage ?? '?'} acres. Compare to each lot's area on the plat.
   - If only one lot has this acreage, that's a strong signal.

4. **LOT NUMBER MATCHING**:
   - CAD/GIS indicates Lot ${input.lotNumber ?? '?'}. Verify this matches by checking acreage and position, not just the number.
   - WARNING: The CAD lot number may not always match the plat if the subdivision was replatted.

5. **ADDRESS / OWNER NAME**:
   - Check for "${input.situsAddress ?? '?'}" or "${input.ownerName ?? '?'}" on the plat.

IMPORTANT: Do NOT simply default to the CAD lot number. Verify it using at least 2 independent signals. If the evidence suggests a DIFFERENT lot than the CAD record says, report the lot the evidence supports and explain the discrepancy.

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

// ── Google Maps Location Image ───────────────────────────────────────

/**
 * Fetch a Google Maps Static API satellite image with a red pin at the
 * geocoded address. This gives the AI a real-world aerial view showing
 * exactly where the address is located — critical for matching the pin
 * position to the correct lot/parcel on the plat.
 *
 * Returns base64 PNG or null if no API key is configured.
 */
async function fetchGoogleMapsLocationImage(
  lat: number,
  lon: number,
  address: string | null,
  onProgress: (msg: string) => void,
): Promise<{ satellite: string | null; street: string | null }> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    onProgress('⚠ Google Maps API key not configured — skipping location image capture');
    return { satellite: null, street: null };
  }

  const results: { satellite: string | null; street: string | null } = { satellite: null, street: null };

  // Capture satellite view with pin (zoom 19 = tight lot-level view)
  for (const maptype of ['satellite', 'roadmap'] as const) {
    const zoom = maptype === 'satellite' ? 19 : 18;
    const label = maptype === 'satellite' ? 'satellite' : 'street';

    const params = new URLSearchParams({
      center: `${lat},${lon}`,
      zoom: String(zoom),
      size: '1280x960',
      maptype,
      markers: `color:red|label:P|${lat},${lon}`,
      key: apiKey,
      scale: '2', // High-DPI for legibility
    });
    const url = `https://maps.googleapis.com/maps/api/staticmap?${params}`;

    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        const b64 = buf.toString('base64');
        if (maptype === 'satellite') results.satellite = b64;
        else results.street = b64;
        onProgress(`✓ Google Maps ${label} image captured (${(buf.length / 1024).toFixed(0)} KB)`);
      } else {
        onProgress(`⚠ Google Maps ${label} failed: HTTP ${resp.status}`);
      }
    } catch (err) {
      onProgress(`⚠ Google Maps ${label} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return results;
}

// ── Helpers ──────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
