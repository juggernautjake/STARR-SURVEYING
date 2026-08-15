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

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // C21 — LIBRARY DEPTH PASS
  //
  // The count was right (40) and the coverage was not. Of those 40: 9 basic dash patterns, 9
  // symbol-in-line patterns, 12 fences, 5 "utility" entries of which FOUR were shot-marker helpers
  // rather than utility runs, and 5 specialty.
  //
  // Which is to say: **a boundary-survey product had no boundary line types.** No section line, no
  // right-of-way, no easement, no setback, no lot line, no tie line. And no topo line types — no
  // contour, no edge of pavement, no top of bank, no tree line. A surveyor drawing an easement had
  // to pick "Dashed" and remember what they meant by it, which is exactly the un-named-style
  // problem C18 fixed for fonts, one axis over.
  //
  // The underground runs below use BOTH an APWA colour and an inline letter. Colour alone fails
  // the moment the plat is printed in black and white — which is how a plat is filed.
  // ══════════════════════════════════════════════════════════════════════════════════════════════

  // ── BOUNDARY ──
  // Weights are the convention: the subject tract is the heaviest line on the sheet, adjoiners are
  // lighter, and anything not a property line is lighter still.
  { id: 'BOUNDARY_SUBJECT',  name: 'Subject Tract Boundary',   category: 'BOUNDARY', dashPattern: [],                      lineWeight: 1.4, inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['BL01'] },
  { id: 'BOUNDARY_ADJOINER', name: 'Adjoiner / Deed Line',     category: 'BOUNDARY', dashPattern: [26, 8],                 lineWeight: 0.6, inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['BL02'] },
  { id: 'SECTION_LINE',      name: 'Section Line',             category: 'BOUNDARY', dashPattern: [40, 8, 4, 8, 4, 8],     lineWeight: 1.2, inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['BL03'] },
  { id: 'QUARTER_SECTION',   name: 'Quarter Section Line',     category: 'BOUNDARY', dashPattern: [30, 8, 4, 8],           lineWeight: 0.9, inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['BL04'] },
  { id: 'RIGHT_OF_WAY',      name: 'Right-of-Way Line',        category: 'BOUNDARY', dashPattern: [24, 7, 2, 7],           lineWeight: 0.8, inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['BL05', '760'] },
  { id: 'LOT_LINE',          name: 'Platted Lot Line',         category: 'BOUNDARY', dashPattern: [],                      lineWeight: 0.5, inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['BL06'] },
  { id: 'EASEMENT',          name: 'Easement',                 category: 'BOUNDARY', dashPattern: [14, 6],                 lineWeight: 0.5, inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['BL07', '761'] },
  { id: 'EASEMENT_UTILITY',  name: 'Utility Easement',         category: 'BOUNDARY', dashPattern: [14, 6],                 lineWeight: 0.5, color: '#FF8C00', inlineSymbols: [{ symbolId: 'UTIL_LETTER_E', interval: 60, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 60, scaleReferenceScale: 50, symbolSize: 2.2, symbolRotation: 'FIXED', offset: 0, side: 'CENTER' }], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['BL08', '762'] },
  { id: 'EASEMENT_DRAINAGE', name: 'Drainage Easement',        category: 'BOUNDARY', dashPattern: [14, 6],                 lineWeight: 0.5, color: '#00A550', inlineSymbols: [{ symbolId: 'UTIL_LETTER_SD', interval: 60, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 60, scaleReferenceScale: 50, symbolSize: 2.2, symbolRotation: 'FIXED', offset: 0, side: 'CENTER' }], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['BL09', '763'] },
  { id: 'BUILDING_SETBACK',  name: 'Building Setback Line',    category: 'BOUNDARY', dashPattern: [8, 5],                  lineWeight: 0.4, inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['BL10', '764'] },
  // Dotted and light on purpose: a tie is a measurement, not a boundary, and it must never read as
  // one on a plat somebody may rely on.
  { id: 'TIE_LINE',          name: 'Tie Line',                 category: 'BOUNDARY', dashPattern: [1.5, 6],                lineWeight: 0.35, inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['BL11'] },
  { id: 'CENTERLINE_ROAD',   name: 'Road Centerline',          category: 'BOUNDARY', dashPattern: [26, 7, 8, 7],           lineWeight: 0.5, inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['BL12', '765'] },

  // ── TOPO ──
  { id: 'CONTOUR_INDEX',        name: 'Contour — Index',        category: 'TOPO', dashPattern: [],        lineWeight: 0.7,  color: '#8B4513', inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['TP10'] },
  { id: 'CONTOUR_INTERMEDIATE', name: 'Contour — Intermediate', category: 'TOPO', dashPattern: [],        lineWeight: 0.25, color: '#B8860B', inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['TP11'] },
  { id: 'CONTOUR_DEPRESSION',   name: 'Contour — Depression',   category: 'TOPO', dashPattern: [6, 4],    lineWeight: 0.35, color: '#8B4513', inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['TP12'] },
  { id: 'EDGE_PAVEMENT',        name: 'Edge of Pavement',       category: 'TOPO', dashPattern: [],        lineWeight: 0.45, inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['TP13', '620'] },
  { id: 'EDGE_GRAVEL',          name: 'Edge of Gravel / Dirt',  category: 'TOPO', dashPattern: [4, 3],    lineWeight: 0.4,  inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['TP14', '621'] },
  { id: 'CURB_LINE',            name: 'Curb / Curb & Gutter',   category: 'TOPO', dashPattern: [],        lineWeight: 0.6,  inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['TP15', '622'] },
  { id: 'SIDEWALK',             name: 'Sidewalk',               category: 'TOPO', dashPattern: [],        lineWeight: 0.3,  inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['TP16', '623'] },
  { id: 'BUILDING_OUTLINE',     name: 'Building Outline',       category: 'TOPO', dashPattern: [],        lineWeight: 0.7,  inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['TP17', '700'] },
  { id: 'DITCH_SWALE',          name: 'Ditch / Swale',          category: 'TOPO', dashPattern: [18, 6, 2, 6], lineWeight: 0.35, color: '#00A550', inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['TP18', '624'] },
  { id: 'TOP_OF_BANK',          name: 'Top of Bank',            category: 'TOPO', dashPattern: [12, 4, 4, 4], lineWeight: 0.4, inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['TP19', '625'] },
  { id: 'TOE_OF_SLOPE',         name: 'Toe of Slope',           category: 'TOPO', dashPattern: [12, 4, 4, 4, 4, 4], lineWeight: 0.4, inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['TP20', '626'] },
  { id: 'WATER_EDGE',           name: "Water's Edge",           category: 'TOPO', dashPattern: [],        lineWeight: 0.4,  color: '#0000FF', inlineSymbols: [], specialRenderer: 'WAVY', isBuiltIn: true, isEditable: false, assignedCodes: ['TP21', '627'] },
  { id: 'TREE_LINE',            name: 'Tree Line',              category: 'TOPO', dashPattern: [],        lineWeight: 0.3,  color: '#008000',
    inlineSymbols: [{ symbolId: 'VEG_SHRUB', interval: 10, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 10, scaleReferenceScale: 50, symbolSize: 2.4, symbolRotation: 'FIXED', offset: 0, side: 'CENTER' }],
    specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['TP22', '806'] },

  // ── UTILITY: the actual runs ──
  // Each is a dashed line interrupted by its letter, in the APWA colour a locator paints. The
  // letter is what survives a black-and-white print.
  { id: 'UG_ELECTRIC',   name: 'Underground Electric',  category: 'UTILITY', dashPattern: [20, 12], lineWeight: 0.4, color: '#FF0000',
    inlineSymbols: [{ symbolId: 'UTIL_LETTER_E',   interval: 32, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 32, scaleReferenceScale: 50, symbolSize: 2.4, symbolRotation: 'FIXED', offset: 0, side: 'CENTER' }],
    specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['UL01', '640'] },
  { id: 'OH_ELECTRIC',   name: 'Overhead Electric',     category: 'UTILITY', dashPattern: [26, 14], lineWeight: 0.4, color: '#FF0000',
    inlineSymbols: [{ symbolId: 'UTIL_LETTER_OHE', interval: 40, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 40, scaleReferenceScale: 50, symbolSize: 2.6, symbolRotation: 'FIXED', offset: 0, side: 'CENTER' }],
    specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['UL02', '641'] },
  { id: 'UG_TELEPHONE',  name: 'Underground Telephone', category: 'UTILITY', dashPattern: [20, 12], lineWeight: 0.4, color: '#FF8C00',
    inlineSymbols: [{ symbolId: 'UTIL_LETTER_T',   interval: 32, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 32, scaleReferenceScale: 50, symbolSize: 2.4, symbolRotation: 'FIXED', offset: 0, side: 'CENTER' }],
    specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['UL03', '642'] },
  { id: 'UG_FIBER',      name: 'Fiber Optic',           category: 'UTILITY', dashPattern: [20, 12], lineWeight: 0.4, color: '#FF8C00',
    inlineSymbols: [{ symbolId: 'UTIL_LETTER_FO',  interval: 34, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 34, scaleReferenceScale: 50, symbolSize: 2.4, symbolRotation: 'FIXED', offset: 0, side: 'CENTER' }],
    specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['UL04', '643'] },
  { id: 'UG_CABLE_TV',   name: 'Cable TV',              category: 'UTILITY', dashPattern: [20, 12], lineWeight: 0.4, color: '#FF8C00',
    inlineSymbols: [{ symbolId: 'UTIL_LETTER_CTV', interval: 36, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 36, scaleReferenceScale: 50, symbolSize: 2.4, symbolRotation: 'FIXED', offset: 0, side: 'CENTER' }],
    specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['UL05', '654'] },
  { id: 'UG_GAS',        name: 'Gas Line',              category: 'UTILITY', dashPattern: [20, 12], lineWeight: 0.4, color: '#FFD700',
    inlineSymbols: [{ symbolId: 'UTIL_LETTER_G',   interval: 32, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 32, scaleReferenceScale: 50, symbolSize: 2.4, symbolRotation: 'FIXED', offset: 0, side: 'CENTER' }],
    specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['UL06', '645'] },
  { id: 'UG_WATER',      name: 'Water Line',            category: 'UTILITY', dashPattern: [20, 12], lineWeight: 0.4, color: '#0000FF',
    inlineSymbols: [{ symbolId: 'UTIL_LETTER_W',   interval: 32, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 32, scaleReferenceScale: 50, symbolSize: 2.4, symbolRotation: 'FIXED', offset: 0, side: 'CENTER' }],
    specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['UL07', '646'] },
  { id: 'SANITARY_SEWER', name: 'Sanitary Sewer',       category: 'UTILITY', dashPattern: [20, 12], lineWeight: 0.4, color: '#00A550',
    inlineSymbols: [{ symbolId: 'UTIL_LETTER_SS',  interval: 34, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 34, scaleReferenceScale: 50, symbolSize: 2.4, symbolRotation: 'FIXED', offset: 0, side: 'CENTER' }],
    specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['UL08', '647'] },
  { id: 'STORM_SEWER',   name: 'Storm Sewer',           category: 'UTILITY', dashPattern: [20, 12], lineWeight: 0.4, color: '#00A550',
    inlineSymbols: [{ symbolId: 'UTIL_LETTER_SD',  interval: 34, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 34, scaleReferenceScale: 50, symbolSize: 2.4, symbolRotation: 'FIXED', offset: 0, side: 'CENTER' }],
    specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['UL09', '648'] },
  // Force main is drawn distinct from gravity sewer because it fails differently and a contractor
  // digging near one needs to know which it is.
  { id: 'FORCE_MAIN',    name: 'Force Main',            category: 'UTILITY', dashPattern: [24, 8, 2, 8], lineWeight: 0.45, color: '#00A550',
    inlineSymbols: [{ symbolId: 'UTIL_LETTER_SS',  interval: 40, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 40, scaleReferenceScale: 50, symbolSize: 2.4, symbolRotation: 'FIXED', offset: 0, side: 'CENTER' }],
    specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['UL10', '649'] },
  { id: 'IRRIGATION',    name: 'Irrigation Line',       category: 'UTILITY', dashPattern: [10, 8], lineWeight: 0.3, color: '#800080',
    inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['UL11', '650'] },
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
