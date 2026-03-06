// lib/cad/styles/default-layers.ts — 22 default survey layers + 6 groups
import type { LayerGroup } from './types';
import type { Layer } from '../types';

export const DEFAULT_LAYER_GROUPS: LayerGroup[] = [
  { id: 'grp-boundary',  name: 'Boundary & Control', collapsed: false, sortOrder: 0 },
  { id: 'grp-improve',   name: 'Improvements',       collapsed: false, sortOrder: 1 },
  { id: 'grp-utility',   name: 'Utilities',           collapsed: false, sortOrder: 2 },
  { id: 'grp-natural',   name: 'Natural Features',    collapsed: false, sortOrder: 3 },
  { id: 'grp-transport', name: 'Transportation',      collapsed: false, sortOrder: 4 },
  { id: 'grp-annot',     name: 'Annotation & Misc',   collapsed: false, sortOrder: 5 },
];

// Static layer definitions — use fixed IDs so they can be referenced by code library
export const PHASE3_DEFAULT_LAYERS: Layer[] = [
  // ── Boundary & Control ──
  { id: 'BOUNDARY',      name: 'Boundary',            visible: true, locked: false, frozen: false, color: '#000000', lineWeight: 0.50, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-boundary', sortOrder: 0, isDefault: true, isProtected: false, autoAssignCodes: ['PL01','PL06','350','355'] },
  { id: 'BOUNDARY-MON',  name: 'Boundary Monuments',  visible: true, locked: false, frozen: false, color: '#000000', lineWeight: 0.75, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-boundary', sortOrder: 1, isDefault: true, isProtected: false, autoAssignCodes: ['BC01','BC02','BC03','BC04','BC05','BC06','BC07','BC08','BC09','BC10','BC11','BC12','BC13','BC14','BC15','BC16','BC17','BC18','BC19','BC20','BC21','BC22','BC23','BC24','BC25','BC26','BC27','BC33'] },
  { id: 'EASEMENT',      name: 'Easement',            visible: true, locked: false, frozen: false, color: '#27AE60', lineWeight: 0.35, lineTypeId: 'DASHED',       opacity: 1, groupId: 'grp-boundary', sortOrder: 2, isDefault: true, isProtected: false, autoAssignCodes: ['PL02','351'] },
  { id: 'BUILDING-LINE', name: 'Building Line',       visible: true, locked: false, frozen: false, color: '#2980B9', lineWeight: 0.75, lineTypeId: 'DASH_DOT',     opacity: 1, groupId: 'grp-boundary', sortOrder: 3, isDefault: true, isProtected: false, autoAssignCodes: ['PL03','352'] },
  { id: 'ROW',           name: 'Right-of-Way',        visible: true, locked: false, frozen: false, color: '#E74C3C', lineWeight: 0.50, lineTypeId: 'DASHED_HEAVY', opacity: 1, groupId: 'grp-boundary', sortOrder: 4, isDefault: true, isProtected: false, autoAssignCodes: ['PL04','PL05','353','354'] },
  { id: 'FLOOD',         name: 'Flood Zone',          visible: true, locked: false, frozen: false, color: '#00BCD4', lineWeight: 0.75, lineTypeId: 'DASH_DOT_DOT', opacity: 1, groupId: 'grp-boundary', sortOrder: 5, isDefault: true, isProtected: false, autoAssignCodes: ['PL07','356'] },
  { id: 'CONTROL',       name: 'Survey Control',      visible: true, locked: false, frozen: false, color: '#FF0000', lineWeight: 0.75, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-boundary', sortOrder: 6, isDefault: true, isProtected: false, autoAssignCodes: ['SC01','SC02','SC03','SC04','SC05','SC06','300','301','302','303','304','305'] },
  { id: 'CURVE-DATA',    name: 'Curve Data',          visible: true, locked: false, frozen: false, color: '#9B59B6', lineWeight: 0.18, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-boundary', sortOrder: 7, isDefault: true, isProtected: false, autoAssignCodes: ['CV01','CV02','CV03','CV04','CV05','CV06','CV07','CV08','CV09','CV10'] },

  // ── Improvements ──
  { id: 'STRUCTURES',    name: 'Structures',          visible: true, locked: false, frozen: false, color: '#7F8C8D', lineWeight: 0.35, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-improve',  sortOrder: 0, isDefault: true, isProtected: false, autoAssignCodes: ['ST01','ST02','ST03','ST04','ST05','ST06','ST07','ST08','ST09','ST10','ST11','ST12'] },
  { id: 'FENCE',         name: 'Fences',              visible: true, locked: false, frozen: false, color: '#E67E22', lineWeight: 0.75, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-improve',  sortOrder: 1, isDefault: true, isProtected: false, autoAssignCodes: ['FN01','FN02','FN03','FN04','FN05','FN06','FN07','FN08','FN09','FN10','FN11','FN12','FN13','FN14','FN15'] },

  // ── Utilities ──
  { id: 'UTILITY-WATER', name: 'Water',               visible: true, locked: false, frozen: false, color: '#3498DB', lineWeight: 0.75, lineTypeId: 'DASHED',       opacity: 1, groupId: 'grp-utility',  sortOrder: 0, isDefault: true, isProtected: false, autoAssignCodes: ['UT01','UT02','UT03','UT04','UT05','UT19','UT20'] },
  { id: 'UTILITY-SEWER', name: 'Sewer',               visible: true, locked: false, frozen: false, color: '#27AE60', lineWeight: 0.75, lineTypeId: 'DASHED',       opacity: 1, groupId: 'grp-utility',  sortOrder: 1, isDefault: true, isProtected: false, autoAssignCodes: ['UT06','UT07'] },
  { id: 'UTILITY-GAS',   name: 'Gas',                 visible: true, locked: false, frozen: false, color: '#F1C40F', lineWeight: 0.75, lineTypeId: 'DASHED',       opacity: 1, groupId: 'grp-utility',  sortOrder: 2, isDefault: true, isProtected: false, autoAssignCodes: ['UT08','UT09','UT10'] },
  { id: 'UTILITY-ELEC',  name: 'Electric',            visible: true, locked: false, frozen: false, color: '#FF8C00', lineWeight: 0.75, lineTypeId: 'DASHED',       opacity: 1, groupId: 'grp-utility',  sortOrder: 3, isDefault: true, isProtected: false, autoAssignCodes: ['UT11','UT12','UT13','UT14','UT15','UT16'] },
  { id: 'UTILITY-COMM',  name: 'Communication',       visible: true, locked: false, frozen: false, color: '#800080', lineWeight: 0.75, lineTypeId: 'DASHED',       opacity: 1, groupId: 'grp-utility',  sortOrder: 4, isDefault: true, isProtected: false, autoAssignCodes: ['UT17','UT18'] },

  // ── Natural Features ──
  { id: 'VEGETATION',    name: 'Vegetation',          visible: true, locked: false, frozen: false, color: '#008000', lineWeight: 0.18, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-natural',  sortOrder: 0, isDefault: true, isProtected: false, autoAssignCodes: ['VG01','VG02','VG03','VG04','VG05','VG06','VG07','VG08'] },
  { id: 'TOPO',          name: 'Topography',          visible: true, locked: false, frozen: false, color: '#8B4513', lineWeight: 0.18, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-natural',  sortOrder: 1, isDefault: true, isProtected: false, autoAssignCodes: ['TP01','TP02','TP03','TP04','TP05','TP06','PL08','PL09','MS05'] },
  { id: 'WATER-FEATURES',name: 'Water Features',      visible: true, locked: false, frozen: false, color: '#0000FF', lineWeight: 0.75, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-natural',  sortOrder: 2, isDefault: true, isProtected: false, autoAssignCodes: ['TP07','TP08','TP09','TP10','TP11'] },

  // ── Transportation ──
  { id: 'TRANSPORTATION',name: 'Transportation',      visible: true, locked: false, frozen: false, color: '#808080', lineWeight: 0.75, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-transport',sortOrder: 0, isDefault: true, isProtected: false, autoAssignCodes: ['TR01','TR02','TR03','TR04','TR05','TR06','TR07','TR08'] },

  // ── Annotation & Misc ──
  { id: 'ANNOTATION',    name: 'Annotation',          visible: true, locked: false, frozen: false, color: '#000000', lineWeight: 0.75, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-annot',    sortOrder: 0, isDefault: true, isProtected: false, autoAssignCodes: [] },
  { id: 'TITLE-BLOCK',   name: 'Title Block',         visible: true, locked: false, frozen: false, color: '#000000', lineWeight: 0.35, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-annot',    sortOrder: 1, isDefault: true, isProtected: false, autoAssignCodes: [] },
  { id: 'MISC',          name: 'Miscellaneous',       visible: true, locked: false, frozen: false, color: '#000000', lineWeight: 0.18, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-annot',    sortOrder: 2, isDefault: true, isProtected: false, autoAssignCodes: ['MS01','MS02','MS03','MS04'] },
];

/** Get 22 default layers as a Record<id, Layer> */
export function getDefaultLayersRecord(): Record<string, Layer> {
  const record: Record<string, Layer> = {};
  for (const layer of PHASE3_DEFAULT_LAYERS) {
    record[layer.id] = layer;
  }
  return record;
}

/** Get default layer order (array of IDs) */
export function getDefaultLayerOrder(): string[] {
  return PHASE3_DEFAULT_LAYERS.map(l => l.id);
}
