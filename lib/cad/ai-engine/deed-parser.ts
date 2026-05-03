// lib/cad/ai-engine/deed-parser.ts
//
// Phase 6 Stage 3 — regex-based deed-call extractor. Pure
// function; no Claude dependency in this slice. Handles the
// well-formatted metes-and-bounds patterns common in Texas
// county deeds:
//
//   "THENCE N 45°30'15" E, a distance of 234.56 feet to a
//    1/2" iron rod found, ..."
//   "thence along a curve to the right having a radius of
//    500.00 feet, an arc length of 78.54 feet, a chord
//    bearing of N 60°00'00" E, and a chord distance of
//    78.45 feet to a 5/8" iron rod set, ..."
//
// Two-layer approach planned for the full AI engine: this
// regex parser is layer 1; layer 2 (Claude-assisted via the
// worker) lands as a separate slice. The regex parser exits
// with a confidence score so the caller can fall back when
// it fails.

import { parseBearing, dmsToDecimal } from '../geometry/bearing';

import type { DeedCall } from './types';

/**
 * Parse a legal description into structured deed calls.
 *
 * Returns:
 *   * `calls`      — every THENCE block we could parse, indexed
 *                    in document order.
 *   * `confidence` — 0 to 1; ratio of calls where bearing OR
 *                    curveData parsed successfully. The caller
 *                    uses this to decide when to escalate to
 *                    the Claude-assisted parser.
 *
 * Pure function: no I/O, no global state. Safe to call from
 * anywhere in the worker pipeline or admin UI.
 */
export function parseCallsRegex(text: string): {
  calls: DeedCall[];
  confidence: number;
} {
  const calls: DeedCall[] = [];
  let callIndex = 0;

  // Match THENCE / thence blocks. The lookahead stops at the
  // next THENCE OR the closing "to the POINT/PLACE OF
  // BEGINNING" phrase OR end-of-text. /gi for global +
  // case-insensitive; /s for dot-matches-newlines on the
  // captured block.
  const thencePattern =
    /THENCE\s+([\s\S]*?)(?=THENCE|to the (?:POINT|PLACE) OF BEGINNING|$)/gi;

  let match: RegExpExecArray | null;
  while ((match = thencePattern.exec(text)) !== null) {
    const block = match[1].trim();
    if (block.length === 0) continue;
    const call = parseCallBlock(block, callIndex);
    if (call) {
      calls.push(call);
      callIndex++;
    }
  }

  const confidence =
    calls.length > 0
      ? calls.filter((c) => c.bearing !== null || c.curveData !== null)
          .length / calls.length
      : 0;

  return { calls, confidence };
}

/**
 * Parse one THENCE block into a single DeedCall. Returns null
 * only when the block is whitespace-empty (defensive). Blocks
 * with text but no recognizable bearing/curve still return a
 * DeedCall with nulls — the call's existence is preserved for
 * the reconciler even when the math couldn't be extracted.
 */
function parseCallBlock(block: string, index: number): DeedCall | null {
  const trimmed = block.trim();
  if (trimmed.length === 0) return null;

  // Try line call first: "N 45°30'15" E, a distance of 234.56 feet"
  // Allows wide tolerance on whitespace + various second-formats.
  const linePattern =
    /([NS])\s*(\d+)[°\s]+(\d+)['\s]+(\d+\.?\d*)["\s]*([EW])[\s,]*(?:a\s+)?distance\s+of\s+(\d+\.?\d+)\s*(?:feet|ft|')/i;
  const lineMatch = trimmed.match(linePattern);
  if (lineMatch) {
    const bearing = parseBearing(
      `${lineMatch[1]} ${lineMatch[2]} ${lineMatch[3]} ${lineMatch[4]} ${lineMatch[5]}`
    );
    const distance = Number.parseFloat(lineMatch[6]);
    return {
      index,
      type: 'LINE',
      bearing,
      distance: Number.isFinite(distance) ? distance : null,
      curveData: null,
      monument: extractMonument(trimmed),
      rawText: trimmed,
    };
  }

  // Try curve call: "along a curve to the right having a radius of 500"
  const curvePattern =
    /curve\s+to\s+the\s+(right|left)[\s\S]*?radius\s+of\s+(\d+\.?\d+)/i;
  const curveMatch = trimmed.match(curvePattern);
  if (curveMatch) {
    const direction = curveMatch[1].toUpperCase() as 'LEFT' | 'RIGHT';
    const radius = Number.parseFloat(curveMatch[2]);

    const arcMatch = trimmed.match(/arc\s+length\s+of\s+(\d+\.?\d+)/i);
    const chordBrgMatch = trimmed.match(
      /chord\s+bearing\s+of\s+([NS][^,]*?[EW])/i
    );
    const chordDistMatch = trimmed.match(
      /chord\s+distance\s+of\s+(\d+\.?\d+)/i
    );
    const deltaMatch = trimmed.match(
      /(?:central\s+angle|delta)\s+of\s+(\d+)[°\s]+(\d+)['\s]+(\d+\.?\d*)/i
    );

    return {
      index,
      type: 'CURVE',
      bearing: null,
      distance: null,
      curveData: {
        radius: Number.isFinite(radius) ? radius : null,
        arcLength: arcMatch ? Number.parseFloat(arcMatch[1]) : null,
        chordBearing: chordBrgMatch
          ? parseBearing(chordBrgMatch[1].trim())
          : null,
        chordDistance: chordDistMatch
          ? Number.parseFloat(chordDistMatch[1])
          : null,
        deltaAngle: deltaMatch
          ? dmsToDecimal(
              Number.parseInt(deltaMatch[1], 10),
              Number.parseInt(deltaMatch[2], 10),
              Number.parseFloat(deltaMatch[3])
            )
          : null,
        direction,
      },
      monument: extractMonument(trimmed),
      rawText: trimmed,
    };
  }

  // Block is recognisable as a call but the math didn't parse.
  // Keep the row so the reconciler can flag a discrepancy
  // ("deed mentions a call but parser couldn't extract bearing
  // / distance — manual review required").
  return {
    index,
    type: 'LINE',
    bearing: null,
    distance: null,
    curveData: null,
    monument: extractMonument(trimmed),
    rawText: trimmed,
  };
}

/**
 * Extract the trailing monument description from a call block,
 * e.g. `to a 1/2" iron rod found w/ cap`. Returns null when no
 * monument phrase matches.
 *
 * Patterns covered: iron rod, iron pipe, concrete monument,
 * cap, disk, PK nail, mag nail, railroad spike — with optional
 * found / set / calculated qualifier and optional cap.
 */
export function extractMonument(text: string): string | null {
  const monPattern =
    /to\s+(?:a\s+)?(\d[\d/]*["]?\s*(?:inch|in)?\s*(?:iron rod|iron pipe|concrete monument|cap|disk|pk nail|mag nail|railroad spike)(?:\s+(?:found|set|calculated))?(?:\s+w\/\s*cap)?)/i;
  const match = text.match(monPattern);
  return match ? match[1].trim() : null;
}
