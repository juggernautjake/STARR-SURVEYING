// lib/cad/styles/symbol-library.ts — Built-in CAD survey symbol library
import type { SymbolDefinition } from './types';

export const BUILTIN_SYMBOLS: SymbolDefinition[] = [

  // ═══════════════════════════════════════════════════
  // MONUMENTS — FOUND (solid fill, black)
  // ═══════════════════════════════════════════════════

  {
    id: 'MON_GENERIC_FOUND', name: 'Monument Found (Generic)', category: 'MONUMENT_FOUND',
    paths: [{ type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 8,
    colorMode: 'FIXED', fixedColor: '#000000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: [],
  },
  {
    id: 'MON_IR_038_FOUND', name: '3/8" IR Found', category: 'MONUMENT_FOUND',
    paths: [{ type: 'CIRCLE', cx: 0, cy: 0, r: 2.5, fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.0, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#000000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC01', '308'],
  },
  {
    id: 'MON_IR_050_FOUND', name: '1/2" IR Found', category: 'MONUMENT_FOUND',
    paths: [{ type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#000000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC02', '309'],
  },
  {
    id: 'MON_IR_058_FOUND', name: '5/8" IR Found', category: 'MONUMENT_FOUND',
    paths: [{ type: 'CIRCLE', cx: 0, cy: 0, r: 3.2, fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.8, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#000000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC03', '310'],
  },
  {
    id: 'MON_IR_075_FOUND', name: '3/4" IR Found', category: 'MONUMENT_FOUND',
    paths: [{ type: 'CIRCLE', cx: 0, cy: 0, r: 3.5, fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.0, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#000000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC04', '311'],
  },
  {
    id: 'MON_IP_FOUND', name: 'Iron Pipe Found', category: 'MONUMENT_FOUND',
    paths: [{ type: 'RECT', x: -3, y: -3, width: 6, height: 6, fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#000000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC13', '312'],
  },
  {
    id: 'MON_CONC_FOUND', name: 'Concrete Mon Found', category: 'MONUMENT_FOUND',
    paths: [{ type: 'RECT', x: -4, y: -4, width: 8, height: 8, fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.7 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.5, minSize: 1, maxSize: 8,
    colorMode: 'FIXED', fixedColor: '#000000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC16', '313'],
  },
  {
    id: 'MON_CAP_FOUND', name: 'Cap/Disk Found', category: 'MONUMENT_FOUND',
    paths: [{ type: 'PATH', d: 'M 0 -4 L 4 0 L 0 4 L -4 0 Z', fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#000000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC19', '314'],
  },
  {
    id: 'MON_PKNAIL_FOUND', name: 'PK Nail Found', category: 'MONUMENT_FOUND',
    paths: [{ type: 'PATH', d: 'M -3 -3 L 3 3 M 3 -3 L -3 3', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.7 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.0, minSize: 1, maxSize: 5,
    colorMode: 'FIXED', fixedColor: '#000000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC22', '338'],
  },
  {
    id: 'MON_MAGNAIL_FOUND', name: 'Mag Nail Found', category: 'MONUMENT_FOUND',
    paths: [{ type: 'PATH', d: 'M 0 -4 L 2.4 3.2 L -3.8 -1.2 L 3.8 -1.2 L -2.4 3.2 Z', fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.4 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#000000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC24', '340'],
  },

  // ═══════════════════════════════════════════════════
  // MONUMENTS — SET (open/outline, red)
  // ═══════════════════════════════════════════════════

  {
    id: 'MON_GENERIC_SET', name: 'Monument Set (Generic)', category: 'MONUMENT_SET',
    paths: [{ type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.7 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 8,
    colorMode: 'FIXED', fixedColor: '#FF0000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: [],
  },
  {
    id: 'MON_IR_038_SET', name: '3/8" IR Set', category: 'MONUMENT_SET',
    paths: [{ type: 'CIRCLE', cx: 0, cy: 0, r: 2.5, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.7 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.0, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#FF0000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC33', '315'],
  },
  {
    id: 'MON_IR_050_SET', name: '1/2" IR Set', category: 'MONUMENT_SET',
    paths: [{ type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.7 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#FF0000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC06', '317'],
  },
  {
    id: 'MON_IR_058_SET', name: '5/8" IR Set', category: 'MONUMENT_SET',
    paths: [{ type: 'CIRCLE', cx: 0, cy: 0, r: 3.2, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.7 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.8, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#FF0000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC07', '318'],
  },
  {
    id: 'MON_IR_075_SET', name: '3/4" IR Set', category: 'MONUMENT_SET',
    paths: [{ type: 'CIRCLE', cx: 0, cy: 0, r: 3.5, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.7 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.0, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#FF0000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC08', '319'],
  },
  {
    id: 'MON_IP_SET', name: 'Iron Pipe Set', category: 'MONUMENT_SET',
    paths: [{ type: 'RECT', x: -3, y: -3, width: 6, height: 6, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.7 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#FF0000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC14', '320'],
  },
  {
    id: 'MON_CONC_SET', name: 'Concrete Mon Set', category: 'MONUMENT_SET',
    paths: [{ type: 'RECT', x: -4, y: -4, width: 8, height: 8, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.7 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.5, minSize: 1, maxSize: 8,
    colorMode: 'FIXED', fixedColor: '#FF0000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC17', '321'],
  },
  {
    id: 'MON_CAP_SET', name: 'Cap/Disk Set', category: 'MONUMENT_SET',
    paths: [{ type: 'PATH', d: 'M 0 -4 L 4 0 L 0 4 L -4 0 Z', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.7 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#FF0000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC20', '322'],
  },
  {
    id: 'MON_PKNAIL_SET', name: 'PK Nail Set', category: 'MONUMENT_SET',
    paths: [{ type: 'PATH', d: 'M -3 -3 L 3 3 M 3 -3 L -3 3', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.7 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.0, minSize: 1, maxSize: 5,
    colorMode: 'FIXED', fixedColor: '#FF0000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC23', '339'],
  },
  {
    id: 'MON_MAGNAIL_SET', name: 'Mag Nail Set', category: 'MONUMENT_SET',
    paths: [{ type: 'PATH', d: 'M 0 -4 L 2.4 3.2 L -3.8 -1.2 L 3.8 -1.2 L -2.4 3.2 Z', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.7 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#FF0000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC25', '341'],
  },

  // ═══════════════════════════════════════════════════
  // MONUMENTS — CALCULATED (target/crosshair, magenta)
  // ═══════════════════════════════════════════════════

  {
    id: 'MON_GENERIC_CALC', name: 'Monument Calc (Generic)', category: 'MONUMENT_CALC',
    paths: [
      { type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      { type: 'PATH', d: 'M -4.5 0 L 4.5 0 M 0 -4.5 L 0 4.5', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.4 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 8,
    colorMode: 'FIXED', fixedColor: '#FF00FF', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: [],
  },
  {
    id: 'MON_IR_038_CALC', name: '3/8" IR Calc', category: 'MONUMENT_CALC',
    paths: [
      { type: 'CIRCLE', cx: 0, cy: 0, r: 2.5, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      { type: 'PATH', d: 'M -4 0 L 4 0 M 0 -4 L 0 4', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.4 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.0, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#FF00FF', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC09', '327'],
  },
  {
    id: 'MON_IR_050_CALC', name: '1/2" IR Calc', category: 'MONUMENT_CALC',
    paths: [
      { type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      { type: 'PATH', d: 'M -4.5 0 L 4.5 0 M 0 -4.5 L 0 4.5', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.4 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#FF00FF', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC10', '328'],
  },
  {
    id: 'MON_IR_058_CALC', name: '5/8" IR Calc', category: 'MONUMENT_CALC',
    paths: [
      { type: 'CIRCLE', cx: 0, cy: 0, r: 3.2, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      { type: 'PATH', d: 'M -4.8 0 L 4.8 0 M 0 -4.8 L 0 4.8', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.4 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.8, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#FF00FF', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC11', '329'],
  },
  {
    id: 'MON_IR_075_CALC', name: '3/4" IR Calc', category: 'MONUMENT_CALC',
    paths: [
      { type: 'CIRCLE', cx: 0, cy: 0, r: 3.5, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      { type: 'PATH', d: 'M -5 0 L 5 0 M 0 -5 L 0 5', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.4 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.0, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#FF00FF', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC12', '330'],
  },

  // ═══════════════════════════════════════════════════
  // SURVEY CONTROL
  // ═══════════════════════════════════════════════════

  {
    id: 'CTRL_TRIANGLE', name: 'Control Point', category: 'CONTROL',
    paths: [{ type: 'PATH', d: 'M 0 -4.5 L 4 3.5 L -4 3.5 Z', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.7 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.0, minSize: 1, maxSize: 8,
    colorMode: 'FIXED', fixedColor: '#FF0000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['SC01', '300'],
  },
  {
    id: 'CTRL_BENCHMARK', name: 'Benchmark', category: 'CONTROL',
    paths: [
      { type: 'PATH', d: 'M 0 -4.5 L 4 3.5 L -4 3.5 Z', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.7 },
      { type: 'TEXT', text: 'BM', tx: 0, ty: 1, fontSize: 3, fill: 'INHERIT', stroke: 'NONE', strokeWidth: 0 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.5, minSize: 1, maxSize: 8,
    colorMode: 'FIXED', fixedColor: '#FF0000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['SC02', '301'],
  },

  // ═══════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════

  {
    id: 'UTIL_HYDRANT', name: 'Fire Hydrant', category: 'UTILITY',
    paths: [
      { type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      { type: 'TEXT', text: 'FH', tx: 0, ty: 0.5, fontSize: 2.8, fill: 'INHERIT', stroke: 'NONE', strokeWidth: 0 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.0, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#FF0000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['UT03', '602'],
  },
  {
    id: 'UTIL_WATER_METER', name: 'Water Meter', category: 'UTILITY',
    paths: [
      { type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      { type: 'TEXT', text: 'WM', tx: 0, ty: 0.5, fontSize: 2.5, fill: 'INHERIT', stroke: 'NONE', strokeWidth: 0 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#0000FF', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['UT01', '600'],
  },
  {
    id: 'UTIL_MANHOLE', name: 'Manhole', category: 'UTILITY',
    paths: [
      { type: 'CIRCLE', cx: 0, cy: 0, r: 3.5, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      { type: 'PATH', d: 'M -3.5 0 L 3.5 0 M 0 -3.5 L 0 3.5', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.4 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.0, minSize: 1, maxSize: 6,
    colorMode: 'CODE', fixedColor: null, defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['UT06', '610'],
  },
  {
    id: 'UTIL_POWER_POLE', name: 'Power Pole', category: 'UTILITY',
    paths: [
      { type: 'CIRCLE', cx: 0, cy: 0, r: 2.5, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      { type: 'TEXT', text: 'PP', tx: 0, ty: 0.5, fontSize: 2.5, fill: 'INHERIT', stroke: 'NONE', strokeWidth: 0 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#FF8C00', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['UT12', '641'],
  },
  {
    id: 'UTIL_VALVE', name: 'Valve', category: 'UTILITY',
    paths: [
      { type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      { type: 'TEXT', text: 'V', tx: 0, ty: 0.5, fontSize: 3.5, fill: 'INHERIT', stroke: 'NONE', strokeWidth: 0 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#3498DB', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['UT02', '601'],
  },
  {
    id: 'UTIL_CLEAN_OUT', name: 'Clean Out', category: 'UTILITY',
    paths: [
      { type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      { type: 'TEXT', text: 'CO', tx: 0, ty: 0.5, fontSize: 2.5, fill: 'INHERIT', stroke: 'NONE', strokeWidth: 0 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#27AE60', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['UT07', '611'],
  },

  // ═══════════════════════════════════════════════════
  // VEGETATION
  // ═══════════════════════════════════════════════════

  {
    id: 'VEG_TREE_DECID', name: 'Deciduous Tree', category: 'VEGETATION',
    paths: [
      { type: 'PATH', d: 'M 0 -4 C 2 -4.5 4.5 -2 4.5 0 C 4.5 2 3 4.5 0 4.5 C -3 4.5 -4.5 2 -4.5 0 C -4.5 -2 -2 -4.5 0 -4 Z', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      { type: 'CIRCLE', cx: 0, cy: 0, r: 0.8, fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.3 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.5, minSize: 2, maxSize: 12,
    colorMode: 'FIXED', fixedColor: '#008000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['VG01', '720'],
  },
  {
    id: 'VEG_TREE_EVERG', name: 'Evergreen Tree', category: 'VEGETATION',
    paths: [
      { type: 'PATH', d: 'M 0 -4.5 L 1 -1 L 4 -2.5 L 2 0 L 4 2.5 L 1 1 L 0 4.5 L -1 1 L -4 2.5 L -2 0 L -4 -2.5 L -1 -1 Z', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.0, minSize: 2, maxSize: 10,
    colorMode: 'FIXED', fixedColor: '#006400', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['VG02', '721'],
  },

  // ═══════════════════════════════════════════════════
  // FENCE INLINE SYMBOLS (used by line type renderer)
  // ═══════════════════════════════════════════════════

  {
    id: 'FENCE_BARB_X', name: 'Barbed Wire X', category: 'FENCE_INLINE',
    paths: [{ type: 'PATH', d: 'M -2 -2 L 2 2 M 2 -2 L -2 2', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 1.5, minSize: 0.5, maxSize: 4,
    colorMode: 'LAYER', fixedColor: null, defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: [],
  },
  {
    id: 'FENCE_CL_DIAMOND', name: 'Chain Link Diamond', category: 'FENCE_INLINE',
    paths: [{ type: 'PATH', d: 'M 0 -3 L 2 0 L 0 3 L -2 0 Z', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.0, minSize: 0.5, maxSize: 4,
    colorMode: 'LAYER', fixedColor: null, defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: [],
  },
  {
    id: 'FENCE_BOARD_TICK', name: 'Wood Privacy Tick', category: 'FENCE_INLINE',
    paths: [{ type: 'PATH', d: 'M 0 0 L 0 -3', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.0, minSize: 0.5, maxSize: 4,
    colorMode: 'LAYER', fixedColor: null, defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: [],
  },
  {
    id: 'RR_CROSSTIE', name: 'Railroad Crosstie', category: 'FENCE_INLINE',
    paths: [{ type: 'PATH', d: 'M 0 -3.5 L 0 3.5', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.8 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.0, minSize: 1, maxSize: 5,
    colorMode: 'LAYER', fixedColor: null, defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: [],
  },

  // ═══════════════════════════════════════════════════
  // GENERIC FALLBACKS
  // ═══════════════════════════════════════════════════

  {
    id: 'GENERIC_CROSS', name: 'Cross', category: 'GENERIC',
    paths: [{ type: 'PATH', d: 'M -3 0 L 3 0 M 0 -3 L 0 3', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.0, minSize: 0.5, maxSize: 6,
    colorMode: 'LAYER', fixedColor: null, defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: [],
  },
  {
    id: 'GENERIC_DOT', name: 'Dot', category: 'GENERIC',
    paths: [{ type: 'CIRCLE', cx: 0, cy: 0, r: 1, fill: 'INHERIT', stroke: 'NONE', strokeWidth: 0 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 1.5, minSize: 0.5, maxSize: 4,
    colorMode: 'LAYER', fixedColor: null, defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: [],
  },
  {
    id: 'GENERIC_QUESTION', name: 'Unknown Code', category: 'GENERIC',
    paths: [
      { type: 'CIRCLE', cx: 0, cy: 0, r: 3.5, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      { type: 'TEXT', text: '?', tx: 0, ty: 1, fontSize: 5, fill: 'INHERIT', stroke: 'NONE', strokeWidth: 0 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.0, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#FF0000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: [],
  },
];

/** Look up a symbol definition by ID */
export function getSymbolById(id: string): SymbolDefinition | undefined {
  return BUILTIN_SYMBOLS.find(s => s.id === id);
}

/** Get all symbols for a given category */
export function getSymbolsByCategory(category: SymbolDefinition['category']): SymbolDefinition[] {
  return BUILTIN_SYMBOLS.filter(s => s.category === category);
}

/**
 * Get all symbols (built-in + custom) that are assigned to a specific point code.
 * Returns built-in matches first, then custom.
 */
export function getSymbolsByAssignedCode(code: string, customSymbols: SymbolDefinition[] = []): SymbolDefinition[] {
  const all = [...BUILTIN_SYMBOLS, ...customSymbols];
  return all.filter(s => s.assignedCodes.includes(code));
}

/**
 * Find a symbol by ID, searching built-in library first then custom symbols.
 * Returns undefined only if not found in either. Never throws.
 */
export function findSymbol(id: string, customSymbols: SymbolDefinition[] = []): SymbolDefinition | undefined {
  if (!id) return undefined;
  return BUILTIN_SYMBOLS.find(s => s.id === id) ?? customSymbols.find(s => s.id === id);
}

/**
 * Resolve a symbol ID to a definition, falling back to GENERIC_QUESTION if not found.
 * Never returns undefined — safe to use without null checks in renderers.
 */
export function resolveSymbolWithFallback(id: string | null | undefined, customSymbols: SymbolDefinition[] = []): SymbolDefinition {
  if (id) {
    const sym = findSymbol(id, customSymbols);
    if (sym) return sym;
  }
  // Fall back to GENERIC_QUESTION (always present in built-in library)
  return BUILTIN_SYMBOLS.find(s => s.id === 'GENERIC_QUESTION')!;
}
