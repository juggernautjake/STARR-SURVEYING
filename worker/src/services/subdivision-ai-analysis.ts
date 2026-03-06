// worker/src/services/subdivision-ai-analysis.ts — Phase 4 Step 6
// Holistic AI analysis of the entire subdivision plat using Claude Vision.
// Analyzes spatial layout, road network, infrastructure, setbacks, and issues.
//
// Spec §4.6 — Subdivision-Wide AI Analysis

import fs from 'fs';
import type { LotInventoryEntry, InteriorLine, SubdivisionAnalysisResult } from '../types/subdivision.js';

const AI_MODEL = process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929';

/** Plat extraction summary passed to the AI (from Phase 3 output) */
export interface PlatExtractionSummary {
  lots: { name: string; callCount: number; curveCount: number; confidence: number }[];
}

/** Deed data summary passed to the AI (from Phase 3 output) */
export interface DeedDataSummary {
  grantor: string | null;
  grantee: string | null;
  calledAcreage: number | null;
  metesAndBoundsCount: number;
}

export class SubdivisionAIAnalysis {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async analyzeSubdivision(
    platImagePaths: string[],
    lotInventory: LotInventoryEntry[],
    interiorLines: InteriorLine[],
    platExtraction: PlatExtractionSummary | null,
    deedData: DeedDataSummary | null,
  ): Promise<SubdivisionAnalysisResult> {
    // Read the primary plat image
    const platImage = platImagePaths[0];
    if (!platImage || !fs.existsSync(platImage)) {
      return this.emptyResult('No plat image available for AI analysis');
    }

    const imageData = fs.readFileSync(platImage);
    const base64 = imageData.toString('base64');

    const ext = platImage.toLowerCase();
    const mediaType = ext.endsWith('.jpg') || ext.endsWith('.jpeg')
      ? 'image/jpeg'
      : 'image/png';

    const lotInventoryText = lotInventory
      .map(
        (l) =>
          `${l.lotName}: CAD Owner=${l.cadOwner || 'unknown'}, ` +
          `Plat Acres=${l.platAcreage || '?'}, CAD Acres=${l.cadAcreage || '?'}, ` +
          `Status=${l.status}`,
      )
      .join('\n');

    const interiorLinesText = interiorLines
      .map(
        (l) =>
          `${l.lotA} ↔ ${l.lotB}: ${l.overallStatus} ` +
          `(bearing diff: ${l.bearingComparison?.angularDifference?.toFixed(4) || 'n/a'}°, ` +
          `dist diff: ${l.distanceComparison?.difference?.toFixed(2) || 'n/a'}')`,
      )
      .join('\n');

    const platExtractionText = platExtraction
      ? platExtraction.lots
          .map(
            (l) =>
              `${l.name}: ${l.callCount} straight calls + ${l.curveCount} curves, ` +
              `confidence=${l.confidence}`,
          )
          .join('\n')
      : 'No plat extraction data available';

    const deedDataText = deedData
      ? `Grantor: ${deedData.grantor}, Grantee: ${deedData.grantee}, ` +
        `Called Acreage: ${deedData.calledAcreage}, ` +
        `M&B calls: ${deedData.metesAndBoundsCount}`
      : 'No deed data available';

    const prompt = `You are a senior professional land surveyor reviewing a complete subdivision plat.

=== LOT INVENTORY ===
${lotInventoryText}

=== INTERIOR LINE VERIFICATION ===
${interiorLinesText || 'No interior lines analyzed yet'}

=== EXTRACTED LOT DATA ===
${platExtractionText}

=== DEED DATA ===
${deedDataText}

LOOKING AT THE PLAT IMAGE, analyze the ENTIRE SUBDIVISION and provide:

1. SPATIAL LAYOUT DESCRIPTION
   - How are the lots arranged relative to each other?
   - Which lots front on which roads?
   - Where are the reserves and common areas?
   - What is the general shape and orientation?

2. LOT-BY-LOT VERIFICATION
   - For each lot, does the extracted acreage match the number visible on the plat?
   - Are there any lots visible on the plat that are NOT in our inventory?
   - Are there any lots in CAD that are NOT on the plat?

3. ROAD NETWORK
   - What roads border the subdivision externally?
   - Are there any internal roads? Dedicated to public or private?
   - What are the approximate ROW widths?

4. UTILITY AND DRAINAGE INFRASTRUCTURE
   - Where are utility easements?
   - Where are drainage easements?
   - Are there any retention/detention areas?
   - Water/sewer routing visible?

5. SETBACK AND BUILDING LINE ANALYSIS
   - What are the setback requirements per lot?
   - Are building setback lines shown?
   - Any special setback conditions?

6. POTENTIAL ISSUES
   - Any lots with unusual shapes that could affect buildability?
   - Any potential access issues?
   - Any lots that appear landlocked?
   - Any drainage concerns?

7. AREA RECONCILIATION
   - Sum of individual lot areas vs. total subdivision area
   - Account for road dedications
   - Any unaccounted area?

8. RECOMMENDATIONS
   - What data is still missing for a complete analysis?
   - Which lots need additional attention?
   - Any red flags for a surveyor?

Return your analysis as structured text with clear section headers.`;

    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: 8000,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: mediaType, data: base64 },
                },
                { type: 'text', text: prompt },
              ],
            },
          ],
        }),
      });
    } catch (networkErr) {
      console.error('[SubdivisionAIAnalysis] Network error calling Anthropic API:', networkErr);
      return this.emptyResult(`Network error during AI analysis: ${networkErr}`);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '(unreadable)');
      console.error(
        `[SubdivisionAIAnalysis] Anthropic API error ${response.status}: ${errText}`,
      );
      return this.emptyResult(
        `AI analysis API error ${response.status} — ${errText.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as {
      content?: { text?: string }[];
    };
    const analysisText = data.content?.[0]?.text || '';

    return this.parseAnalysis(analysisText);
  }

  private parseAnalysis(text: string): SubdivisionAnalysisResult {
    const sections: Record<string, string> = {};
    let currentSection = 'preamble';

    for (const line of text.split('\n')) {
      const sectionMatch = line.match(/^#{1,3}\s*\d*\.?\s*(.+)/);
      if (sectionMatch) {
        currentSection = sectionMatch[1]
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '_');
      }
      sections[currentSection] =
        (sections[currentSection] || '') + line + '\n';
    }

    return {
      rawAnalysis: text,
      sections,
      spatialLayout: sections['spatial_layout_description'] || sections['spatial_layout'] || '',
      lotVerification: sections['lot-by-lot_verification'] || sections['lot_verification'] || '',
      roadNetwork: sections['road_network'] || '',
      infrastructure: sections['utility_and_drainage_infrastructure'] || sections['infrastructure'] || '',
      setbacks: sections['setback_and_building_line_analysis'] || sections['setbacks'] || '',
      issues: sections['potential_issues'] || sections['issues'] || '',
      areaReconciliation: sections['area_reconciliation'] || '',
      recommendations: sections['recommendations'] || '',
    };
  }

  private emptyResult(reason: string): SubdivisionAnalysisResult {
    return {
      rawAnalysis: reason,
      sections: {},
      spatialLayout: '',
      lotVerification: '',
      roadNetwork: '',
      infrastructure: '',
      setbacks: '',
      issues: '',
      areaReconciliation: '',
      recommendations: reason,
    };
  }
}
