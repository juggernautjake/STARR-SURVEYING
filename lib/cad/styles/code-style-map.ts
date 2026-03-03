// lib/cad/styles/code-style-map.ts — Build default code-to-style mappings from code library
import type { PointCodeDefinition } from '../types';
import type { CodeStyleMapping } from './types';

export function buildDefaultCodeStyleMap(
  codeLibrary: PointCodeDefinition[],
): Map<string, CodeStyleMapping> {
  const map = new Map<string, CodeStyleMapping>();

  for (const code of codeLibrary) {
    const mapping: CodeStyleMapping = {
      codeAlpha: code.alphaCode,
      codeNumeric: code.numericCode,
      description: code.description,
      category: code.category,
      symbolId: code.defaultSymbolId || 'GENERIC_CROSS',
      symbolSize: code.connectType === 'POINT' ? 2.5 : 0,
      symbolColor: code.defaultColor,
      lineTypeId: code.defaultLineTypeId || 'SOLID',
      lineWeight: code.defaultLineWeight || 0.25,
      lineColor: code.defaultColor,
      labelFormat: code.defaultLabelFormat,
      labelVisible: true,
      layerId: code.defaultLayerId || 'MISC',
      isUserModified: false,
    };
    map.set(code.alphaCode, mapping);
    if (code.numericCode) map.set(code.numericCode, mapping);
  }

  return map;
}
