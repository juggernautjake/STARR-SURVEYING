// lib/cad/operations/suggest-code-mapping.ts
//
// Phase 8 §11.7 Slice 19 — fuzzy auto-suggest for the
// code-remap table in the cross-layer transfer dialog. When
// the source code doesn't exist in the target layer's
// autoAssignCodes[], we hunt the allow-list for a plausible
// match so the surveyor can accept the suggestion with one
// click rather than typing every remap by hand.
//
// Heuristics (highest confidence first):
//   1. EXACT match — source code is in the allow-list as-is.
//      (Caller should have already filtered these out, but
//      we still return confidence 1.0 for safety.)
//   2. SHARED-BASE — source strips trailing line-control
//      suffix (B / E / BA / EA / C / A) and the result is in
//      the allow-list. Common case: "BC02B" → "BC02".
//   3. PREFIX — allow-list entry starts with the source code
//      (or vice versa). "BC" → "BC02-FOUND".
//   4. SUBSTRING — allow-list entry contains the source code
//      (or vice versa). "MON" → "MONUMENT".
//   5. EDIT-DISTANCE — Damerau-Levenshtein distance ≤ 2
//      relative to the longer string's length. "IRS" → "IRSC".
//
// Confidence is rolled up so the caller can decide whether to
// auto-fill (≥ 0.8) or just surface the suggestion (< 0.8).
// Pure: no DOM, no store reads.

const LINE_CONTROL_SUFFIXES = ['BA', 'EA', 'CA', 'B', 'E', 'C', 'A'] as const;

export interface CodeMapSuggestion {
  /** Suggested target code (already uppercased). */
  target: string;
  /** 0–1 confidence. Caller may auto-fill at ≥ 0.8. */
  confidence: number;
  /** Human-readable label for the surveyor; populated when
   *  the caller needs to surface "why this suggestion." */
  reason: 'EXACT' | 'SHARED_BASE' | 'PREFIX' | 'SUBSTRING' | 'EDIT_DISTANCE';
}

/**
 * Strip the trailing line-control suffix from a code (if any).
 * "BC02B" → "BC02", "FENCE-EA" → "FENCE-", "AB" → null.
 * Returns null when no recognised suffix strips cleanly.
 */
function stripLineControlSuffix(code: string): string | null {
  const upper = code.toUpperCase();
  for (const suf of LINE_CONTROL_SUFFIXES) {
    if (upper.endsWith(suf) && upper.length > suf.length) {
      const base = upper.slice(0, -suf.length);
      // Avoid stripping the last char of every two-char code
      // (e.g. "AB" → "A" is rarely what the surveyor means).
      if (base.length < 2) continue;
      return base;
    }
  }
  return null;
}

/**
 * Damerau-Levenshtein with adjacent transposition. Capped at
 * a small max so we bail early on far-apart strings.
 */
function damerauLevenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  // 2D DP table.
  const dp: number[][] = Array.from({ length: la + 1 }, () => new Array<number>(lb + 1).fill(0));
  for (let i = 0; i <= la; i += 1) dp[i][0] = i;
  for (let j = 0; j <= lb; j += 1) dp[0][j] = j;
  for (let i = 1; i <= la; i += 1) {
    let rowMin = Infinity;
    for (let j = 1; j <= lb; j += 1) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      let v = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) {
        v = Math.min(v, dp[i - 2][j - 2] + 1);
      }
      dp[i][j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1; // early bail
  }
  return dp[la][lb];
}

/**
 * Suggest the most plausible target code for one source code,
 * given the target layer's allow-list. Returns null when no
 * heuristic produced any match.
 */
export function suggestCodeMapping(
  sourceCode: string,
  targetAllowList: ReadonlyArray<string>,
): CodeMapSuggestion | null {
  const src = sourceCode.toUpperCase().trim();
  if (!src) return null;
  const allow = targetAllowList.map((c) => c.toUpperCase().trim()).filter(Boolean);
  if (allow.length === 0) return null;

  // 1. Exact match.
  if (allow.includes(src)) {
    return { target: src, confidence: 1.0, reason: 'EXACT' };
  }

  // 2. Shared-base — strip surveyor's line-control suffix
  // and see if the stripped form is in the allow-list.
  const base = stripLineControlSuffix(src);
  if (base && allow.includes(base)) {
    return { target: base, confidence: 0.95, reason: 'SHARED_BASE' };
  }
  // Also: allow-list entry might be the base of the source.
  for (const entry of allow) {
    const entryStripped = stripLineControlSuffix(entry);
    if (entryStripped && entryStripped === src) {
      return { target: entry, confidence: 0.9, reason: 'SHARED_BASE' };
    }
  }

  // 3. Prefix match either direction.
  for (const entry of allow) {
    if (entry.startsWith(src) || src.startsWith(entry)) {
      // Confidence scales with overlap length over the
      // longer of the two strings.
      const overlap = Math.min(entry.length, src.length);
      const longer = Math.max(entry.length, src.length);
      const ratio = overlap / longer;
      // Cap at 0.85 so EXACT / SHARED_BASE outrank prefix.
      return { target: entry, confidence: Math.min(0.85, ratio), reason: 'PREFIX' };
    }
  }

  // 4. Substring match.
  for (const entry of allow) {
    if (entry.includes(src) || src.includes(entry)) {
      const overlap = Math.min(entry.length, src.length);
      const longer = Math.max(entry.length, src.length);
      const ratio = overlap / longer;
      return { target: entry, confidence: Math.min(0.75, ratio), reason: 'SUBSTRING' };
    }
  }

  // 5. Edit distance ≤ 2 (relative to the longer string).
  let best: { entry: string; dist: number } | null = null;
  for (const entry of allow) {
    const longer = Math.max(entry.length, src.length);
    const maxAllowed = Math.min(2, Math.floor(longer / 2));
    if (maxAllowed === 0) continue;
    const d = damerauLevenshtein(src, entry, maxAllowed);
    if (d <= maxAllowed && (best === null || d < best.dist)) {
      best = { entry, dist: d };
    }
  }
  if (best) {
    const longer = Math.max(best.entry.length, src.length);
    const ratio = 1 - best.dist / longer;
    return { target: best.entry, confidence: Math.min(0.7, ratio), reason: 'EDIT_DISTANCE' };
  }

  return null;
}

/**
 * Build a default code-map for every code in `conflictingCodes`
 * by running suggestCodeMapping against each. Returns
 * Record<sourceCode, targetCode> populated only with high-
 * confidence suggestions (≥ 0.8). Surveyor can edit / extend
 * the map in the dialog UI.
 */
export function buildDefaultCodeMap(
  conflictingCodes: ReadonlyArray<string>,
  targetAllowList: ReadonlyArray<string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const code of conflictingCodes) {
    const sug = suggestCodeMapping(code, targetAllowList);
    if (sug && sug.confidence >= 0.8) {
      out[code.toUpperCase().trim()] = sug.target;
    }
  }
  return out;
}
