// worker/src/research/salvage-json-array.ts — E1: a truncated list is not an empty list.
//
// ── THE FAILURE ─────────────────────────────────────────────────────────────────────────────────
//
// Two runs on 2026-09-02, two counties, two properties, one failure:
//
//     Bell:   ✕ Stage1D | Claude | ai-variant-generation — Unterminated string in JSON at position 1452
//     Milam:  ✕ Stage1D | Claude | ai-variant-generation — Unexpected end of JSON input
//
// The model's JSON was cut off mid-string. Position 1452 against `max_tokens: 1024` is a ceiling,
// not a prompt problem — and both generators then did `catch { return [] }`, throwing away a dozen
// perfectly good variants because the thirteenth was clipped.
//
// Raising the ceiling makes truncation rarer. It cannot make it impossible, because the model
// chooses the length. So the parse has to degrade instead of collapsing: an array cut off after
// eleven complete entries HAS eleven usable entries, and the eleven are the whole point of the call.
//
// ── WHY NOT A REGEX ─────────────────────────────────────────────────────────────────────────────
//
// A regex over `{...}` chunks gets braces inside strings wrong, and a street name is exactly the
// kind of value that contains punctuation. This walks the string tracking quote and escape state,
// which is the only way to know whether a `}` closes an object or sits inside `"FM 436 }"`.

export interface SalvageResult<T> {
  items: T[];
  /** True when the input did not parse and complete elements had to be recovered from it. */
  truncated: boolean;
  /** Why the parse failed, when it did. Null on a clean parse. */
  reason: string | null;
}

/**
 * Parse a JSON array, recovering the complete leading elements if it is cut off.
 *
 * A clean parse returns `truncated: false` and the whole array. A cut-off one returns every element
 * that finished, and says so. Anything that is not a salvageable array — an object, prose, an empty
 * string — returns no items rather than guessing.
 */
export function salvageJsonArray<T = unknown>(raw: string): SalvageResult<T> {
  const text = (raw ?? '').trim();
  if (!text) return { items: [], truncated: false, reason: 'empty response' };

  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return { items: parsed as T[], truncated: false, reason: null };
    return { items: [], truncated: false, reason: 'response was not a JSON array' };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const recovered = recoverCompleteElements<T>(text);
    if (recovered.length === 0) return { items: [], truncated: true, reason };
    return { items: recovered, truncated: true, reason };
  }
}

/**
 * Walk a truncated JSON array and return the elements that finished.
 *
 * Tracks string and escape state, so a brace or bracket inside a value is not mistaken for
 * structure. Records the position after every element that closes at depth 1, then re-parses the
 * prefix up to the last of them with a `]` appended — re-parses rather than hand-building the
 * values, so the result is whatever JSON.parse says it is and not this function's opinion.
 */
function recoverCompleteElements<T>(text: string): T[] {
  const start = text.indexOf('[');
  if (start === -1) return [];

  let depth = 0;
  let inString = false;
  let escaped = false;
  let lastCompleteEnd = -1;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '[' || ch === '{') {
      depth += 1;
    } else if (ch === ']' || ch === '}') {
      depth -= 1;
      // Depth 1 means we just closed an element of the outer array.
      if (depth === 1) lastCompleteEnd = i;
    } else if (ch === ',' && depth === 1) {
      // A comma at depth 1 also ends an element — this is the case for an array of strings or
      // numbers, which never reach depth 2 at all.
      lastCompleteEnd = i - 1;
    }
  }

  if (lastCompleteEnd <= start) return [];

  const prefix = text.slice(start, lastCompleteEnd + 1).replace(/,\s*$/, '');
  try {
    const parsed = JSON.parse(`${prefix}]`) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
