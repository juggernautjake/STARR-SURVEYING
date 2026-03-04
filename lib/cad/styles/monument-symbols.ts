// lib/cad/styles/monument-symbols.ts — Monument action → symbol resolution
import type { MonumentAction, PointCodeDefinition } from '../types';
import { getSymbolById } from './symbol-library';

export function resolveMonumentVisuals(
  codeDefinition: PointCodeDefinition | null,
  monumentAction: MonumentAction | null,
): { symbolId: string; color: string } {
  if (!codeDefinition || codeDefinition.category !== 'BOUNDARY_CONTROL') {
    return {
      symbolId: codeDefinition?.defaultSymbolId ?? 'GENERIC_CROSS',
      color: codeDefinition?.defaultColor ?? '#000000',
    };
  }

  // Expanded code with explicit symbol
  if (codeDefinition.defaultSymbolId) {
    return {
      symbolId: codeDefinition.defaultSymbolId,
      color: codeDefinition.defaultColor,
    };
  }

  // Resolve by monument action
  const monumentType = codeDefinition.monumentType ?? 'Generic';
  const sizeKey = (codeDefinition.monumentSize ?? '').replace(/["\/]/g, '');

  switch (monumentAction) {
    case 'FOUND':      return { symbolId: findSymbolForAction(monumentType, sizeKey, 'FOUND'), color: '#000000' };
    case 'SET':        return { symbolId: findSymbolForAction(monumentType, sizeKey, 'SET'),   color: '#FF0000' };
    case 'CALCULATED': return { symbolId: findSymbolForAction(monumentType, sizeKey, 'CALC'),  color: '#FF00FF' };
    default:           return { symbolId: findSymbolForAction(monumentType, sizeKey, 'FOUND'), color: '#000000' };
  }
}

function findSymbolForAction(type: string, size: string, action: string): string {
  const typeMap: Record<string, string> = {
    'Iron Rod': 'IR', 'Iron Pipe': 'IP', 'Concrete': 'CONC', 'Concrete Monument': 'CONC',
    'Cap/Disk': 'CAP', 'PK Nail': 'PKNAIL', 'Mag Nail': 'MAGNAIL',
  };
  // Map stripped fractional inch sizes to the zero-padded format used in symbol-library.ts IDs.
  // e.g. monumentSize '3/8"' → strip quotes/slashes → '38' → look up → '038' (as in MON_IR_038_FOUND)
  const sizeMap: Record<string, string> = {
    '38': '038', // 3/8"
    '12': '050', // 1/2"
    '58': '058', // 5/8"
    '34': '075', // 3/4"
  };
  const prefix = typeMap[type] ?? 'GENERIC';
  const rawSize = size.replace(/["\\/]/g, '');
  const mappedSize = sizeMap[rawSize] ?? rawSize;
  const sizeStr = mappedSize ? `_${mappedSize}` : '';
  const specific = `MON_${prefix}${sizeStr}_${action}`;

  if (getSymbolById(specific)) return specific;
  // Try without size
  const withoutSize = `MON_${prefix}_${action}`;
  if (getSymbolById(withoutSize)) return withoutSize;
  return `MON_GENERIC_${action}`;
}
