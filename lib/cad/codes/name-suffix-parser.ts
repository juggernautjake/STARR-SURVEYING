// lib/cad/codes/name-suffix-parser.ts
import type { ParsedPointName, PointNameSuffix, MonumentAction } from '../types';
import type { PointCodeDefinition } from '../types';

interface SuffixPattern {
  regex: RegExp;
  action: PointNameSuffix;
  confidence: number;
  recalcMode: 'none' | 'dynamic';
}

// Ordered from most specific to least specific
const SUFFIX_PATTERNS: SuffixPattern[] = [
  // High confidence FOUND
  { regex: /^(.*?)(\d+)(found)$/i,      action: 'FOUND',      confidence: 1.0,  recalcMode: 'none' },
  { regex: /^(.*?)(\d+)(fnd)$/i,        action: 'FOUND',      confidence: 1.0,  recalcMode: 'none' },
  { regex: /^(.*?)(\d+)(fne)$/i,        action: 'FOUND',      confidence: 0.95, recalcMode: 'none' },
  { regex: /^(.*?)(\d+)(fdn)$/i,        action: 'FOUND',      confidence: 0.9,  recalcMode: 'none' },
  { regex: /^(.*?)(\d+)(fn)$/i,         action: 'FOUND',      confidence: 0.85, recalcMode: 'none' },
  { regex: /^(.*?)(\d+)(f)$/i,          action: 'FOUND',      confidence: 0.5,  recalcMode: 'none' },

  // High confidence SET
  { regex: /^(.*?)(\d+)(set)$/i,        action: 'SET',        confidence: 1.0,  recalcMode: 'none' },
  { regex: /^(.*?)(\d+)(ste)$/i,        action: 'SET',        confidence: 0.95, recalcMode: 'none' },
  { regex: /^(.*?)(\d+)(st)$/i,         action: 'SET',        confidence: 0.85, recalcMode: 'none' },
  { regex: /^(.*?)(\d+)(s)$/i,          action: 'SET',        confidence: 0.5,  recalcMode: 'none' },

  // Recalculation variants (cald, cale, calf, ...)
  { regex: /^(.*?)(\d+)(cal[d-z])$/i,   action: 'CALCULATED', confidence: 0.98, recalcMode: 'dynamic' },

  // High confidence CALCULATED
  { regex: /^(.*?)(\d+)(calculated)$/i, action: 'CALCULATED', confidence: 1.0,  recalcMode: 'none' },
  { regex: /^(.*?)(\d+)(calc)$/i,       action: 'CALCULATED', confidence: 1.0,  recalcMode: 'none' },
  { regex: /^(.*?)(\d+)(cal)$/i,        action: 'CALCULATED', confidence: 0.95, recalcMode: 'none' },
  { regex: /^(.*?)(\d+)(c)$/i,          action: 'CALCULATED', confidence: 0.4,  recalcMode: 'none' },
];

export function parsePointName(name: string): ParsedPointName {
  const trimmed = name.trim();

  for (const pattern of SUFFIX_PATTERNS) {
    const match = trimmed.match(pattern.regex);
    if (match) {
      const baseNumber = parseInt(match[2]);
      const suffixText = match[3];

      let recalcSeq = 0;
      let isRecalc = false;
      if (pattern.recalcMode === 'dynamic') {
        const lastChar = suffixText.charAt(suffixText.length - 1).toLowerCase();
        recalcSeq = lastChar.charCodeAt(0) - 'c'.charCodeAt(0);
        isRecalc = true;
      }

      return {
        baseNumber,
        suffix: suffixText,
        normalizedSuffix: pattern.action,
        suffixVariant: suffixText,
        suffixConfidence: pattern.confidence,
        isRecalc,
        recalcSequence: recalcSeq,
      };
    }
  }

  // No suffix — try to extract just a number
  const numMatch = trimmed.match(/^(\d+)$/);
  if (numMatch) {
    return {
      baseNumber: parseInt(numMatch[1]),
      suffix: '',
      normalizedSuffix: 'NONE',
      suffixVariant: '',
      suffixConfidence: 1.0,
      isRecalc: false,
      recalcSequence: 0,
    };
  }

  // Non-standard name
  const leadingNum = trimmed.match(/^(\d+)/);
  const trailingNum = trimmed.match(/(\d+)$/);
  const bestNum = leadingNum ? parseInt(leadingNum[1]) : (trailingNum ? parseInt(trailingNum[1]) : 0);

  return {
    baseNumber: bestNum,
    suffix: trimmed.replace(/\d+/g, ''),
    normalizedSuffix: 'NONE',
    suffixVariant: trimmed,
    suffixConfidence: 0,
    isRecalc: false,
    recalcSequence: 0,
  };
}

export function resolveMonumentAction(
  codeDefinition: PointCodeDefinition | null,
  parsedName: ParsedPointName,
): MonumentAction | null {
  if (codeDefinition?.monumentAction) {
    return codeDefinition.monumentAction;
  }
  if (codeDefinition?.category === 'BOUNDARY_CONTROL') {
    switch (parsedName.normalizedSuffix) {
      case 'FOUND': return 'FOUND';
      case 'SET': return 'SET';
      case 'CALCULATED': return 'CALCULATED';
      default: return 'UNKNOWN';
    }
  }
  return null;
}
