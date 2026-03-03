// lib/cad/codes/code-suffix-parser.ts
import type { ParsedPointCode, CodeSuffix } from '../types';
import { lookupCode } from './code-lookup';

const VALID_SUFFIXES: CodeSuffix[] = ['BA', 'EA', 'CA', 'B', 'E', 'C', 'A'];

/**
 * Parse a raw code string (like "742B", "FN03BA", "309") into its components.
 * Strips line-control suffixes (B/E/C/A/BA/EA/CA) only if the base code exists in the library.
 */
export function parseCodeWithSuffix(rawCode: string): ParsedPointCode {
  const trimmed = rawCode.trim().toUpperCase();

  // Try stripping each suffix (longest first to avoid partial matches)
  for (const suffix of VALID_SUFFIXES) {
    if (trimmed.endsWith(suffix)) {
      const base = trimmed.slice(0, -suffix.length);
      if (base.length === 0) continue; // Suffix is the entire code — not valid
      const def = lookupCode(base);
      if (def) {
        // Base code exists and suffix is valid
        return buildParsedCode(rawCode, base, suffix as CodeSuffix, def.connectType === 'LINE', def.isAutoSpline, true);
      }
      // Base doesn't exist — the "suffix" is part of the code name (e.g., "CALE" might be a code)
    }
  }

  // No suffix stripped — try full code as-is
  const def = lookupCode(trimmed);
  const isValid = def !== null;
  return buildParsedCode(rawCode, trimmed, null, def?.connectType === 'LINE' ?? false, def?.isAutoSpline ?? false, isValid);
}

function buildParsedCode(
  rawCode: string,
  baseCode: string,
  suffix: CodeSuffix | null,
  isLineCode: boolean,
  isAutoSpline: boolean,
  isValid: boolean,
): ParsedPointCode {
  const isNumeric = /^\d+$/.test(baseCode);
  return {
    rawCode,
    baseCode,
    isNumeric,
    isAlpha: !isNumeric,
    suffix,
    isValid,
    isLineCode,
    isAutoSpline,
  };
}

/** Get just the suffix from a raw code */
export function extractSuffix(rawCode: string): CodeSuffix | null {
  return parseCodeWithSuffix(rawCode).suffix;
}
