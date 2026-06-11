// lib/cad/styles/code-to-symbol.ts
//
// cad-domain-audit Slice M — pure helper that resolves a point code
// (the first token of the description, e.g. "309 inside 315 1in") to
// a symbol id from the symbol library. Extracted from the TRV
// importer (`lib/cad/io/trv-to-drawing.ts:275–281`) so the same rule
// fires on every point-creation path — TRV import, AI `addPoint`,
// CSV import, the manual Draw Point tool. Without this, an iron-rod
// monument code drew as a generic crosshair unless it came in via a
// TRV file.
//
// Resolution is deterministic: the first symbol whose `assignedCodes`
// includes the token EXACTLY wins (case-insensitive match against
// the library's canonical uppercase ids). Returns `null` when no
// symbol claims the token, so the caller leaves the feature with its
// existing `symbolId` (typically `null` → default crosshair).

import { getSymbolsByAssignedCode } from './symbol-library';
import type { SymbolDefinition } from './types';

/** Pick the symbol id assigned to the given code, or null when no
 *  library symbol claims it. `code` may be the whole description
 *  ("309 inside 315 1in") — only the first whitespace-separated
 *  token is checked, matching the TRV importer's convention. An
 *  empty / whitespace-only / undefined code resolves to null. */
export function assignSymbolForCode(
  code: string | null | undefined,
  customSymbols: SymbolDefinition[] = [],
): string | null {
  const trimmed = (code ?? '').trim();
  if (trimmed.length === 0) return null;
  // Same first-token rule the TRV importer uses, so existing TRV
  // imports and new creation paths agree on which token to look up.
  const token = trimmed.split(/\s+/)[0];
  if (!token) return null;
  const matches = getSymbolsByAssignedCode(token, customSymbols);
  if (matches.length === 0) return null;
  return matches[0].id;
}
