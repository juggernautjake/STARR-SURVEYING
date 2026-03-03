// lib/cad/codes/code-lookup.ts
import type { PointCodeDefinition } from '../types';
import { MASTER_CODE_LIBRARY } from './code-library';

// Bidirectional lookup maps
const byAlpha = new Map<string, PointCodeDefinition>();
const byNumeric = new Map<string, PointCodeDefinition>();

for (const code of MASTER_CODE_LIBRARY) {
  byAlpha.set(code.alphaCode.toUpperCase(), code);
  byNumeric.set(code.numericCode, code);
}

/**
 * Look up a code definition by either alpha code (e.g., "BC02") or numeric code (e.g., "309").
 * Returns null if not found.
 */
export function lookupCode(code: string): PointCodeDefinition | null {
  const upper = code.toUpperCase().trim();
  return byAlpha.get(upper) ?? byNumeric.get(upper) ?? null;
}

/** Look up by alpha code only */
export function lookupByAlpha(alphaCode: string): PointCodeDefinition | null {
  return byAlpha.get(alphaCode.toUpperCase()) ?? null;
}

/** Look up by numeric code only */
export function lookupByNumeric(numericCode: string): PointCodeDefinition | null {
  return byNumeric.get(numericCode) ?? null;
}

/** Get all codes in a category */
export function getCodesByCategory(category: string): PointCodeDefinition[] {
  return MASTER_CODE_LIBRARY.filter(c => c.category === category);
}

/** Get all line codes (connectType === 'LINE') */
export function getAllLineCodes(): PointCodeDefinition[] {
  return MASTER_CODE_LIBRARY.filter(c => c.connectType === 'LINE');
}

/** Get all point codes (connectType === 'POINT') */
export function getAllPointCodes(): PointCodeDefinition[] {
  return MASTER_CODE_LIBRARY.filter(c => c.connectType === 'POINT');
}
