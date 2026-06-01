// lib/cad/styles/default-layers.ts — minimal default starting layers
//
// cad-hub-greeting-and-field-data-trv-route Slice 3 — slimmed
// from 23 default layers across 6 groups down to 4 default
// layers across 2 groups per user ask:
//
//   > "The default layers should just be the layers for the
//      survey info blocks and the single starting layer. We
//      don't need all of the other starting default layers."
//
// Kept layers:
//   - SURVEY-INFO  (protected — paper furniture: north arrow,
//                   scale bar, etc.)
//   - TITLE-BLOCK  (the printed title block + signature panel)
//   - ANNOTATION   (free-form labels / notes)
//   - DEFAULT      (single general-purpose drawing layer)
//
// Removed layers (BOUNDARY, BOUNDARY-MON, EASEMENT,
// BUILDING-LINE, ROW, FLOOD, CONTROL, CURVE-DATA, STRUCTURES,
// FENCE, UTILITY-WATER/SEWER/GAS/ELEC/COMM, VEGETATION, TOPO,
// WATER-FEATURES, TRANSPORTATION, MISC) — the surveyor can
// re-add any of these manually + the field-data import
// pipeline still auto-creates layers from autoAssignCodes
// when needed.
//
// Static layer IDs preserved so the master code library can
// still reference them via `defaultLayerId`.

import type { LayerGroup } from './types';
import type { Layer } from '../types';

export const DEFAULT_LAYER_GROUPS: LayerGroup[] = [
  { id: 'grp-survey-info', name: 'Survey Info', collapsed: false, sortOrder: 0 },
  { id: 'grp-drawing',     name: 'Drawing',     collapsed: false, sortOrder: 1 },
];

export const PHASE3_DEFAULT_LAYERS: Layer[] = [
  // ── Survey Info block ──
  // SURVEY-INFO holds the paper furniture (north arrow + scale
  // bar + graphic-scale labels). Protected so the user can't
  // accidentally delete it and lose the rendered overlays.
  { id: 'SURVEY-INFO',   name: 'Survey Info',  visible: true, locked: false, frozen: false, color: '#000000', lineWeight: 0.35, lineTypeId: 'SOLID', opacity: 1, groupId: 'grp-survey-info', sortOrder: 0, isDefault: true, isProtected: true,  autoAssignCodes: [] },
  // TITLE-BLOCK = the boxed printed title-block + signature panel.
  { id: 'TITLE-BLOCK',   name: 'Title Block',  visible: true, locked: false, frozen: false, color: '#000000', lineWeight: 0.35, lineTypeId: 'SOLID', opacity: 1, groupId: 'grp-survey-info', sortOrder: 1, isDefault: true, isProtected: false, autoAssignCodes: [] },
  // ANNOTATION = free-form labels / notes the surveyor adds.
  { id: 'ANNOTATION',    name: 'Annotation',   visible: true, locked: false, frozen: false, color: '#000000', lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1, groupId: 'grp-survey-info', sortOrder: 2, isDefault: true, isProtected: false, autoAssignCodes: [] },

  // ── Drawing ──
  // DEFAULT = single starting drawing layer the surveyor can
  // place geometry on out of the box.
  { id: 'DEFAULT',       name: 'Default',      visible: true, locked: false, frozen: false, color: '#000000', lineWeight: 0.50, lineTypeId: 'SOLID', opacity: 1, groupId: 'grp-drawing',     sortOrder: 0, isDefault: true, isProtected: false, autoAssignCodes: [] },
];

/** Get all default layers as a Record<id, Layer>. */
export function getDefaultLayersRecord(): Record<string, Layer> {
  const record: Record<string, Layer> = {};
  for (const layer of PHASE3_DEFAULT_LAYERS) {
    record[layer.id] = layer;
  }
  return record;
}

/** Get default layer order (array of IDs). */
export function getDefaultLayerOrder(): string[] {
  return PHASE3_DEFAULT_LAYERS.map((l) => l.id);
}
