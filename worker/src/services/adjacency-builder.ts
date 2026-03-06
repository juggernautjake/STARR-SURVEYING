// worker/src/services/adjacency-builder.ts — Phase 4 Step 5
// Builds a graph of which lots are adjacent to which, and what's on each side.
// Uses Claude Vision to analyze the plat image for spatial relationships.
//
// Spec §4.8 — Lot Adjacency Matrix Builder

import fs from 'fs';
import type { AdjacencyMatrix, LotAdjacency } from '../types/subdivision.js';

const AI_MODEL = process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929';

export class AdjacencyBuilder {

  /**
   * Use AI vision analysis of the plat image to determine spatial adjacency
   * between lots.  Returns a matrix of which lots/features border each other
   * on each cardinal side.
   */
  async buildFromAI(
    platImagePath: string,
    lotNames: string[],
    apiKey: string,
  ): Promise<AdjacencyMatrix> {
    const imageData = fs.readFileSync(platImagePath);
    const base64 = imageData.toString('base64');

    const ext = platImagePath.toLowerCase();
    const mediaType = ext.endsWith('.jpg') || ext.endsWith('.jpeg')
      ? 'image/jpeg'
      : 'image/png';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 },
              },
              {
                type: 'text',
                text: `Looking at this subdivision plat, determine what is adjacent to each lot on every side.

LOTS IN THIS SUBDIVISION: ${lotNames.join(', ')}

For each lot, provide what is on its NORTH, SOUTH, EAST, and WEST sides.
Options include:
- Another lot (e.g., "lot_2")
- A reserve (e.g., "reserve_a")
- A road (e.g., "road:FM 436")
- An external property (e.g., "external:RK GAINES")
- Nothing/boundary of subdivision (e.g., "external:PERIMETER")

Return ONLY valid JSON (no markdown fences):
{
  "lot_1": { "north": ["external:RK GAINES"], "south": ["lot_2"], "east": ["road:FM 436"], "west": ["reserve_a"] },
  "lot_2": { "north": ["lot_1"], "south": ["lot_3"], "east": ["road:FM 436"], "west": ["reserve_a"] }
}

Use lowercase lot IDs like "lot_1", "reserve_a". For roads use "road:NAME". For external owners use "external:OWNER_NAME".`,
              },
            ],
          },
        ],
      }),
    });

    const data = (await response.json()) as {
      content?: { text?: string }[];
    };
    const text = data.content?.[0]?.text || '{}';

    try {
      const cleaned = text.replace(/```json?|```/g, '').trim();
      const parsed = JSON.parse(cleaned) as Record<string, Record<string, unknown>>;
      const adjacencies: Record<string, LotAdjacency> = {};

      for (const [lotId, adj] of Object.entries(parsed)) {
        const a = adj as Record<string, unknown>;
        adjacencies[lotId] = {
          north: toStringArray(a.north),
          south: toStringArray(a.south),
          east: toStringArray(a.east),
          west: toStringArray(a.west),
          northeast: toStringArray(a.northeast),
          northwest: toStringArray(a.northwest),
          southeast: toStringArray(a.southeast),
          southwest: toStringArray(a.southwest),
        };
      }

      return { lots: lotNames, adjacencies };
    } catch (e) {
      console.warn('[AdjacencyBuilder] AI parse failed:', e);
      return { lots: lotNames, adjacencies: {} };
    }
  }

  /**
   * Build adjacency from interior line analysis (no AI needed).
   * Uses verified shared boundaries to determine which lots are neighbors.
   */
  buildFromInteriorLines(
    lotNames: string[],
    sharedBoundaryPairs: { lotA: string; lotB: string }[],
  ): AdjacencyMatrix {
    const adjacencies: Record<string, LotAdjacency> = {};

    for (const name of lotNames) {
      const id = this.toLotId(name);
      adjacencies[id] = {
        north: [], south: [], east: [], west: [],
        northeast: [], northwest: [], southeast: [], southwest: [],
      };
    }

    // Without spatial data we can only record that lots are adjacent,
    // not the cardinal direction.  Store in "north" as a simple neighbor list.
    for (const { lotA, lotB } of sharedBoundaryPairs) {
      if (adjacencies[lotA] && !adjacencies[lotA].north.includes(lotB)) {
        adjacencies[lotA].north.push(lotB);
      }
      if (adjacencies[lotB] && !adjacencies[lotB].north.includes(lotA)) {
        adjacencies[lotB].north.push(lotA);
      }
    }

    return { lots: lotNames, adjacencies };
  }

  private toLotId(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  }
}

function toStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') return [val];
  return [];
}
