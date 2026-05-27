// lib/cad/styles/linetype-library.ts — Built-in line type library
import type { LineTypeDefinition, InlineSymbolConfig } from './types';

/** Inline-symbol config helper to keep the library readable. */
function sym(
  symbolId: string,
  opts: Partial<InlineSymbolConfig> = {}
): InlineSymbolConfig {
  return {
    symbolId,
    interval: 40,
    intervalMode: 'FIXED',
    scaleReferenceInterval: 40,
    scaleReferenceScale: 50,
    symbolSize: 2.5,
    symbolRotation: 'FIXED',
    offset: 0,
    side: 'CENTER',
    ...opts,
  };
}

export const BUILTIN_LINE_TYPES: LineTypeDefinition[] = [
  // ── Basic ── (dash values are WORLD FEET; gaps are deliberately
  //   generous so dashed/dotted lines read as dashed at survey zoom.)
  { id: 'SOLID',        name: 'Solid',         category: 'BASIC', dashPattern: [],                       inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [] },
  { id: 'DASHED',       name: 'Dashed',        category: 'BASIC', dashPattern: [10, 6],                  inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [] },
  { id: 'DASHED_HEAVY', name: 'Dashed Heavy',  category: 'BASIC', dashPattern: [18, 9],                  inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [] },
  { id: 'LONG_DASH',    name: 'Long Dash',     category: 'BASIC', dashPattern: [34, 14],                 inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [] },
  { id: 'DOTTED',       name: 'Dotted',        category: 'BASIC', dashPattern: [1.5, 7],                 inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [] },
  { id: 'DASH_DOT',     name: 'Dash-Dot',      category: 'BASIC', dashPattern: [18, 7, 1.5, 7],          inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [] },
  { id: 'DASH_DOT_DOT', name: 'Dash-Dot-Dot',  category: 'BASIC', dashPattern: [18, 7, 1.5, 7, 1.5, 7],  inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [] },
  { id: 'CENTER',       name: 'Center',        category: 'BASIC', dashPattern: [26, 7, 8, 7],            inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [] },
  { id: 'PHANTOM',      name: 'Phantom',       category: 'BASIC', dashPattern: [26, 7, 7, 7, 7, 7],      inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [] },

  // ── Symbol-in-line patterns (dashes interrupted by a glyph) ──
  { id: 'DASH_X',        name: 'Dash · X · Dash  (–  –  X  –  –)',       category: 'PATTERN', dashPattern: [8, 6],  specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [], inlineSymbols: [sym('FENCE_BARB_X',      { interval: 44, symbolSize: 2.6 })] },
  { id: 'DASH_CIRCLE',   name: 'Dash · O · Dash  (–  –  O  –  –)',       category: 'PATTERN', dashPattern: [8, 6],  specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [], inlineSymbols: [sym('GENERIC_CIRCLE_O',   { interval: 44, symbolSize: 2.6 })] },
  { id: 'DASH_CIRCLE_SM', name: 'Dash · o · Dash  (small circle)',      category: 'PATTERN', dashPattern: [8, 6],  specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [], inlineSymbols: [sym('GENERIC_CIRCLE_O',   { interval: 30, symbolSize: 1.6 })] },
  { id: 'DASH_SQUARE',   name: 'Dash · □ · Dash',                       category: 'PATTERN', dashPattern: [8, 6],  specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [], inlineSymbols: [sym('GENERIC_SQUARE_O',   { interval: 44, symbolSize: 2.4 })] },
  { id: 'DASH_TRIANGLE', name: 'Dash · △ · Dash',                       category: 'PATTERN', dashPattern: [8, 6],  specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [], inlineSymbols: [sym('GENERIC_TRIANGLE_O', { interval: 44, symbolSize: 2.4 })] },
  { id: 'DASH_INFINITY', name: 'Dash · ∞ · Dash  (---∞---∞)',           category: 'PATTERN', dashPattern: [10, 8], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [], inlineSymbols: [sym('GENERIC_INFINITY',   { interval: 48, symbolSize: 3.0, symbolRotation: 'ALONG_LINE' })] },
  { id: 'LONGDASH_X',    name: 'Long-dash · x  (___x___x)',             category: 'PATTERN', dashPattern: [24, 8], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [], inlineSymbols: [sym('FENCE_BARB_X',      { interval: 32, symbolSize: 2.2 })] },
  { id: 'LONGDASH_CIRCLE', name: 'Long-dash · o  (___o___o)',           category: 'PATTERN', dashPattern: [24, 8], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [], inlineSymbols: [sym('GENERIC_CIRCLE_O',   { interval: 32, symbolSize: 2.2 })] },
  { id: 'TICK_LINE',     name: 'Tick Marks  (┼┼┼┼)',                    category: 'PATTERN', dashPattern: [],      specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [], inlineSymbols: [sym('GENERIC_TICK', { interval: 20, symbolSize: 2.5, symbolRotation: 'PERPENDICULAR' })] },

  // ── Fences (12 types) ──
  { id: 'FENCE_BARBED_WIRE', name: 'Barbed Wire',   category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN01', '740'],
    inlineSymbols: [{ symbolId: 'FENCE_BARB_X',      interval: 20, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 20, scaleReferenceScale: 50, symbolSize: 2.0, symbolRotation: 'FIXED',        offset: 0, side: 'CENTER' }] },
  { id: 'FENCE_WOVEN_WIRE',  name: 'Woven Wire',    category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN02', '741'],
    inlineSymbols: [{ symbolId: 'FENCE_CL_DIAMOND',  interval: 15, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 15, scaleReferenceScale: 50, symbolSize: 2.0, symbolRotation: 'ALONG_LINE',  offset: 0, side: 'CENTER' }] },
  { id: 'FENCE_CHAIN_LINK',  name: 'Chain Link',    category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN03', '742'],
    inlineSymbols: [{ symbolId: 'FENCE_CL_DIAMOND',  interval: 15, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 15, scaleReferenceScale: 50, symbolSize: 2.5, symbolRotation: 'FIXED',        offset: 0, side: 'CENTER' }] },
  { id: 'FENCE_METAL_IRON',  name: 'Metal/Iron',    category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN04', '743'],
    inlineSymbols: [{ symbolId: 'FENCE_BOARD_TICK',  interval: 10, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 10, scaleReferenceScale: 50, symbolSize: 2.0, symbolRotation: 'PERPENDICULAR', offset: 0, side: 'RIGHT' }] },
  { id: 'FENCE_WOOD_PRIVACY', name: 'Wood Privacy', category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN05', '744'],
    inlineSymbols: [{ symbolId: 'FENCE_BOARD_TICK',  interval: 12, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 12, scaleReferenceScale: 50, symbolSize: 2.0, symbolRotation: 'PERPENDICULAR', offset: 0, side: 'RIGHT' }] },
  { id: 'FENCE_WOOD_PICKET',  name: 'Wood Picket',  category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN06', '745'],
    inlineSymbols: [{ symbolId: 'FENCE_BOARD_TICK',  interval: 8,  intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 8,  scaleReferenceScale: 50, symbolSize: 1.5, symbolRotation: 'PERPENDICULAR', offset: 0, side: 'RIGHT' }] },
  { id: 'FENCE_SPLIT_RAIL',   name: 'Split Rail',   category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN07', '746'],
    inlineSymbols: [{ symbolId: 'FENCE_BOARD_TICK',  interval: 12, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 12, scaleReferenceScale: 50, symbolSize: 2.0, symbolRotation: 'ALONG_LINE',   offset: 0, side: 'CENTER' }] },
  { id: 'FENCE_BLOCK_WALL',   name: 'Block Wall',   category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN08', '747'],
    inlineSymbols: [{ symbolId: 'FENCE_BOARD_TICK',  interval: 10, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 10, scaleReferenceScale: 50, symbolSize: 2.0, symbolRotation: 'PERPENDICULAR', offset: 0, side: 'BOTH' }] },
  { id: 'FENCE_PIPE',         name: 'Pipe Fence',   category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN09', '748'],
    inlineSymbols: [{ symbolId: 'GENERIC_DOT',        interval: 15, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 15, scaleReferenceScale: 50, symbolSize: 1.5, symbolRotation: 'FIXED',        offset: 0, side: 'CENTER' }] },
  { id: 'FENCE_CABLE',        name: 'Cable Fence',  category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN10', '749'],
    inlineSymbols: [{ symbolId: 'GENERIC_CROSS',      interval: 15, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 15, scaleReferenceScale: 50, symbolSize: 1.5, symbolRotation: 'ALONG_LINE',  offset: 0, side: 'CENTER' }] },
  { id: 'FENCE_ELECTRIC',     name: 'Electric',     category: 'FENCE', dashPattern: [6, 3], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN11', '750'],
    inlineSymbols: [{ symbolId: 'FENCE_BARB_X',       interval: 25, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 25, scaleReferenceScale: 50, symbolSize: 2.0, symbolRotation: 'FIXED',        offset: 0, side: 'CENTER' }] },
  { id: 'FENCE_GUARDRAIL',    name: 'Guardrail',    category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN12', '751'],
    inlineSymbols: [{ symbolId: 'FENCE_BOARD_TICK',   interval: 12, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 12, scaleReferenceScale: 50, symbolSize: 2.0, symbolRotation: 'ALONG_LINE',   offset: 0, side: 'CENTER' }] },

  // ── Utility (symbols placed on every vertex / shot) ──
  { id: 'UTIL_POLE_LINE',    name: 'Utility Poles (at each shot)',  category: 'UTILITY', dashPattern: [],      specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [], inlineSymbols: [sym('UTIL_POLE',     { intervalMode: 'AT_VERTICES', symbolSize: 2.5 })] },
  { id: 'UTIL_POLE_SPACED',  name: 'Utility Poles (spaced)',        category: 'UTILITY', dashPattern: [],      specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [], inlineSymbols: [sym('UTIL_POLE',     { interval: 60, symbolSize: 2.5 })] },
  { id: 'OVERHEAD_UTILITY',  name: 'Overhead Utility (–/–)',        category: 'UTILITY', dashPattern: [10, 5], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [], inlineSymbols: [sym('UTIL_POLE',     { interval: 80, symbolSize: 2.2 })] },
  { id: 'FENCE_SHOTS_X',     name: 'Fence Shots (X at each shot)',  category: 'UTILITY', dashPattern: [],      specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [], inlineSymbols: [sym('FENCE_BARB_X',  { intervalMode: 'AT_VERTICES', symbolSize: 2.4 })] },
  { id: 'SHOT_DOTS',         name: 'Shot Dots (dot at each shot)',  category: 'UTILITY', dashPattern: [],      specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [], inlineSymbols: [sym('GENERIC_DOT',   { intervalMode: 'AT_VERTICES', symbolSize: 1.8 })] },

  // ── Specialty ──
  { id: 'RETAINING_WALL', name: 'Retaining Wall', category: 'SPECIALTY', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN13', '752', 'ST08', '507'],
    inlineSymbols: [{ symbolId: 'FENCE_BOARD_TICK', interval: 4, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 4, scaleReferenceScale: 50, symbolSize: 2.0, symbolRotation: 'PERPENDICULAR', offset: 0, side: 'RIGHT' }] },
  { id: 'OVERHEAD_POWER', name: 'Overhead Power', category: 'SPECIALTY', dashPattern: [8, 3], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['UT15', '644'],
    inlineSymbols: [{ symbolId: 'FENCE_BOARD_TICK', interval: 30, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 30, scaleReferenceScale: 50, symbolSize: 1.5, symbolRotation: 'PERPENDICULAR', offset: 0, side: 'CENTER' }] },
  { id: 'RAILROAD', name: 'Railroad', category: 'SPECIALTY', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['TR08', '707'],
    inlineSymbols: [{ symbolId: 'RR_CROSSTIE', interval: 6, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 6, scaleReferenceScale: 50, symbolSize: 3.0, symbolRotation: 'PERPENDICULAR', offset: 0, side: 'BOTH' }] },
  { id: 'HEDGE', name: 'Hedge', category: 'SPECIALTY', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN14', '753'],
    inlineSymbols: [{ symbolId: 'VEG_TREE_DECID', interval: 8, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 8, scaleReferenceScale: 50, symbolSize: 2.5, symbolRotation: 'FIXED', offset: 0, side: 'CENTER' }] },
  { id: 'CREEK_WAVY', name: 'Creek/Stream', category: 'SPECIALTY', dashPattern: [], specialRenderer: 'WAVY', isBuiltIn: true, isEditable: false, assignedCodes: ['TP07', '632'],
    inlineSymbols: [] },
];

/** Look up a line type by ID */
export function getLineTypeById(id: string): LineTypeDefinition | undefined {
  return BUILTIN_LINE_TYPES.find(lt => lt.id === id);
}

/**
 * Get all line types in a specific category.
 */
export function getLineTypesByCategory(category: LineTypeDefinition['category']): LineTypeDefinition[] {
  return BUILTIN_LINE_TYPES.filter(lt => lt.category === category);
}

/**
 * Find a line type by ID, searching built-in library first then custom types.
 * Returns undefined only if not found in either. Never throws.
 */
export function findLineType(id: string, customLineTypes: LineTypeDefinition[] = []): LineTypeDefinition | undefined {
  if (!id) return undefined;
  return BUILTIN_LINE_TYPES.find(lt => lt.id === id) ?? customLineTypes.find(lt => lt.id === id);
}

/**
 * Resolve a line type ID to a definition, falling back to SOLID if not found.
 * Never returns undefined — safe to use without null checks in renderers.
 */
export function resolveLineTypeWithFallback(id: string | null | undefined, customLineTypes: LineTypeDefinition[] = []): LineTypeDefinition {
  if (id) {
    const lt = findLineType(id, customLineTypes);
    if (lt) return lt;
  }
  // SOLID is always present in the built-in library
  return BUILTIN_LINE_TYPES.find(lt => lt.id === 'SOLID')!;
}
