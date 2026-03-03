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
    'Iron Rod': 'IR', 'Iron Pipe': 'IP', 'Concrete': 'CONC',
    'Cap/Disk': 'CAP', 'PK Nail': 'PKNAIL', 'Mag Nail': 'MAGNAIL',
  };
  const prefix = typeMap[type] ?? 'GENERIC';
  const sizeStr = size ? `_${size}` : '';
  const specific = `MON_${prefix}${sizeStr}_${action}`;

  if (getSymbolById(specific)) return specific;
  return `MON_GENERIC_${action}`;
}
