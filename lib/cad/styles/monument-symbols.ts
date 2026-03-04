// lib/cad/styles/monument-symbols.ts — Monument action → symbol resolution
import type { MonumentAction, PointCodeDefinition } from '../types';
import { getSymbolById } from './symbol-library';

export function resolveMonumentVisuals(
  codeDefinition: PointCodeDefinition | null,
  monumentAction: MonumentAction | null,
): { symbolId: string; color: string } {
  if (!codeDefinition || codeDefinition.category !== 'BOUNDARY_CONTROL') {
    return {
      // Use || (not ??) so that an empty string defaultSymbolId also falls back
      symbolId: codeDefinition?.defaultSymbolId || 'GENERIC_CROSS',
      color: codeDefinition?.defaultColor || '#000000',
    };
  }

  // Expanded code with explicit symbol
  if (codeDefinition.defaultSymbolId) {
    return {
      symbolId: codeDefinition.defaultSymbolId,
      color: codeDefinition.defaultColor,
    };
  }

  // Resolve by monument action (treat null/UNKNOWN as FOUND)
  const effectiveAction: 'FOUND' | 'SET' | 'CALCULATED' =
    monumentAction === 'SET' ? 'SET'
    : monumentAction === 'CALCULATED' ? 'CALCULATED'
    : 'FOUND';

  const monumentType = codeDefinition.monumentType ?? 'Generic';
  const sizeKey = (codeDefinition.monumentSize ?? '').replace(/["\/]/g, '');

  const symbolId = findSymbolForAction(monumentType, sizeKey, effectiveAction);
  const color =
    effectiveAction === 'SET'        ? '#FF0000'
    : effectiveAction === 'CALCULATED' ? '#FF00FF'
    : '#000000';

  return { symbolId, color };
}

function findSymbolForAction(type: string, size: string, action: 'FOUND' | 'SET' | 'CALCULATED'): string {
  const actionSuffix = action === 'CALCULATED' ? 'CALC' : action;

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

  // 1. Try with type + size (most specific)
  const specific = `MON_${prefix}${sizeStr}_${actionSuffix}`;
  if (getSymbolById(specific)) return specific;

  // 2. Try with type only (no size)
  if (sizeStr) {
    const withoutSize = `MON_${prefix}_${actionSuffix}`;
    if (getSymbolById(withoutSize)) return withoutSize;
  }

  // 3. Fall back to generic monument symbol for this action
  const genericFallback = `MON_GENERIC_${actionSuffix}`;
  if (getSymbolById(genericFallback)) return genericFallback;

  // 4. Last resort: generic cross (always present)
  return 'GENERIC_CROSS';
}
