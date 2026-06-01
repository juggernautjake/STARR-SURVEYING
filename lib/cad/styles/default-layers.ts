// lib/cad/styles/default-layers.ts — minimal default starting layers
//
// 2026-06-01 — trimmed to just TWO default layers per user ask:
//
//   > "Keep all of the initial survey elements with the title
//      block and descriptions and arrow and scale and everything
//      in the survey info layer and get rid of the other layers
//      besides Layer 1. That means we will just have the survey
//      layer and layer 1 layers initially."
//
// Kept layers:
//   - SURVEY-INFO  (protected — the title block + signature/seal
//                   block + graphic scale + north arrow + survey
//                   notes + certification all render as paper
//                   furniture gated on THIS layer's visibility)
//   - DEFAULT      ("Layer 1" — the single starting drawing layer)
//
// The standalone TITLE-BLOCK + ANNOTATION layers are no longer
// pre-seeded — the title block furniture already lives
// conceptually on SURVEY-INFO (it's a canvas overlay gated on
// the SURVEY-INFO eye, not a real Feature row). The `ANNOTATION`
// / `TITLE-BLOCK` ids remain valid logical routing tags for
// auto-generated annotations (area / bearing / curve labels) —
// the annotation render path keys off each annotation's own
// `visible` flag, not a matching document layer, so those labels
// still draw without the layers being pre-seeded.
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
  // ── Survey Info ──
  // SURVEY-INFO holds ALL the initial survey furniture: the title
  // block, seal / signature block, graphic scale, north arrow,
  // survey notes, certification. These render as paper-fixed
  // canvas overlays gated on this layer's `visible` flag, so the
  // SURVEY-INFO eye hides every one of them in one shot.
  // Protected so the user can't accidentally delete it.
  { id: 'SURVEY-INFO',   name: 'Survey Info',  visible: true, locked: false, frozen: false, color: '#000000', lineWeight: 0.35, lineTypeId: 'SOLID', opacity: 1, groupId: 'grp-survey-info', sortOrder: 0, isDefault: true, isProtected: true,  autoAssignCodes: [] },

  // ── Drawing ──
  // DEFAULT = single starting drawing layer the surveyor can
  // place geometry on out of the box. Display name "Layer 1"
  // (id stays DEFAULT so the AI layer-router + code-library
  // references that target the starter layer keep working).
  { id: 'DEFAULT',       name: 'Layer 1',      visible: true, locked: false, frozen: false, color: '#000000', lineWeight: 0.50, lineTypeId: 'SOLID', opacity: 1, groupId: 'grp-drawing',     sortOrder: 0, isDefault: true, isProtected: false, autoAssignCodes: [] },
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
