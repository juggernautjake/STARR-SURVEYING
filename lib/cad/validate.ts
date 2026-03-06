// lib/cad/validate.ts — .starr file schema validator & migrator
// Called before loadDocument() to ensure every required field is present
// and fill in sensible defaults for fields added in later versions.

import type { DrawingDocument } from './types';
import { DEFAULT_DRAWING_SETTINGS, DEFAULT_LAYERS, DEFAULT_DISPLAY_PREFERENCES } from './constants';
import { generateId } from './types';
import { cadLog } from './logger';
import { DEFAULT_LAYER_GROUPS, getDefaultLayersRecord, getDefaultLayerOrder } from './styles/default-layers';
import { DEFAULT_GLOBAL_STYLE_CONFIG } from './styles/types';

/** Minimal structural check — throws a descriptive Error if critical fields are missing. */
function assertShape(raw: unknown): asserts raw is Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('File is not a valid drawing object.');
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) {
    throw new Error('Drawing is missing a valid "id" field.');
  }
  if (typeof r.features !== 'object' || r.features === null || Array.isArray(r.features)) {
    throw new Error('Drawing "features" field must be an object map.');
  }
  if (typeof r.layers !== 'object' || r.layers === null || Array.isArray(r.layers)) {
    throw new Error('Drawing "layers" field must be an object map.');
  }
  if (!Array.isArray(r.layerOrder)) {
    throw new Error('Drawing "layerOrder" field must be an array.');
  }
}

/**
 * Validate and migrate a raw parsed object into a well-formed DrawingDocument.
 * - Throws if the structure is critically malformed.
 * - Back-fills any missing optional settings (forwards-compat with old .starr files).
 */
export function validateAndMigrateDocument(raw: unknown): DrawingDocument {
  assertShape(raw);

  const r = raw as Record<string, unknown>;

  // Fill in missing settings fields (added in later builds)
  const rawSettings = typeof r.settings === 'object' && r.settings !== null
    ? (r.settings as Record<string, unknown>)
    : {};
  // Back-fill displayPreferences — merge defaults first, then overlay saved values
  const savedDisplayPrefs = (rawSettings.displayPreferences && typeof rawSettings.displayPreferences === 'object')
    ? { ...DEFAULT_DISPLAY_PREFERENCES, ...(rawSettings.displayPreferences as Record<string, unknown>) }
    : { ...DEFAULT_DISPLAY_PREFERENCES };
  // Back-fill titleBlock — merge defaults then overlay saved values
  const savedTitleBlock = (rawSettings.titleBlock && typeof rawSettings.titleBlock === 'object')
    ? { ...DEFAULT_DRAWING_SETTINGS.titleBlock, ...(rawSettings.titleBlock as Record<string, unknown>) }
    : { ...DEFAULT_DRAWING_SETTINGS.titleBlock };
  const settings = {
    ...DEFAULT_DRAWING_SETTINGS,
    ...rawSettings,
    displayPreferences: savedDisplayPrefs,
    titleBlock: savedTitleBlock,
    // Ensure drawingRotationDeg defaults to 0 for older documents
    drawingRotationDeg: typeof rawSettings.drawingRotationDeg === 'number' ? rawSettings.drawingRotationDeg : 0,
  };

  // Ensure layerOrder only references layers that actually exist
  const layers = r.layers as Record<string, unknown>;
  const layerOrder = (r.layerOrder as string[]).filter((id) => {
    const ok = typeof layers[id] === 'object' && layers[id] !== null;
    if (!ok) cadLog.warn('FileIO', `layerOrder references unknown layer "${id}" — removed`);
    return ok;
  });

  // Guarantee at least one layer exists
  if (layerOrder.length === 0) {
    cadLog.warn('FileIO', 'No valid layers found — inserting default Layer 0');
    const newId = generateId();
    const [defaultLayer] = DEFAULT_LAYERS;
    (layers as Record<string, unknown>)[newId] = { ...defaultLayer, id: newId };
    layerOrder.push(newId);
  }

  // Validate features: remove any that reference non-existent layers
  const features = r.features as Record<string, unknown>;
  const layerSet = new Set(layerOrder);
  let removedFeatureCount = 0;
  for (const [fid, feat] of Object.entries(features)) {
    if (!feat || typeof feat !== 'object') {
      delete features[fid];
      removedFeatureCount++;
      continue;
    }
    const f = feat as Record<string, unknown>;
    if (typeof f.layerId !== 'string' || !layerSet.has(f.layerId)) {
      // Re-assign to first layer instead of discarding
      f.layerId = layerOrder[0];
    }
    // Ensure required feature fields exist
    if (!f.id) f.id = fid;
    if (!f.properties || typeof f.properties !== 'object') f.properties = {};
    if (!f.style || typeof f.style !== 'object') {
      f.style = {
        color: null, lineWeight: null, opacity: 1,
        lineTypeId: null, symbolId: null, symbolSize: null,
        symbolRotation: 0, labelVisible: null, labelFormat: null,
        labelOffset: { x: 0, y: 0 }, isOverride: false,
      };
    } else {
      // Back-fill Phase 3 style fields for documents saved before Phase 3
      const style = f.style as Record<string, unknown>;
      if (!('lineTypeId'      in style)) style.lineTypeId      = null;
      if (!('symbolId'        in style)) style.symbolId        = null;
      if (!('symbolSize'      in style)) style.symbolSize      = null;
      if (!('symbolRotation'  in style)) style.symbolRotation  = 0;
      if (!('labelVisible'    in style)) style.labelVisible    = null;
      if (!('labelFormat'     in style)) style.labelFormat     = null;
      if (!('labelOffset'     in style)) style.labelOffset     = { x: 0, y: 0 };
      if (!('isOverride'      in style)) style.isOverride      = false;
    }
  }
  if (removedFeatureCount > 0) {
    cadLog.warn('FileIO', `Removed ${removedFeatureCount} malformed feature(s) from loaded document`);
  }

  // ── Phase 3: back-fill layer Phase 3 fields ─────────────────────────────────
  for (const layerVal of Object.values(layers)) {
    if (!layerVal || typeof layerVal !== 'object') continue;
    const l = layerVal as Record<string, unknown>;
    if (!('frozen'          in l)) l.frozen          = false;
    if (!('lineTypeId'      in l)) l.lineTypeId      = 'SOLID';
    if (!('groupId'         in l)) l.groupId         = null;
    if (!('sortOrder'       in l)) l.sortOrder       = 0;
    if (!('isProtected'     in l)) l.isProtected     = false;
    if (!('autoAssignCodes' in l)) l.autoAssignCodes = [];
  }

  // ── Phase 3: layer groups ─────────────────────────────────────────────────
  const layerGroups = (r.layerGroups && typeof r.layerGroups === 'object' && !Array.isArray(r.layerGroups))
    ? (r.layerGroups as DrawingDocument['layerGroups'])
    : (() => {
        const groups: DrawingDocument['layerGroups'] = {};
        for (const g of DEFAULT_LAYER_GROUPS) groups[g.id] = g;
        return groups;
      })();

  const layerGroupOrder = Array.isArray(r.layerGroupOrder)
    ? (r.layerGroupOrder as string[])
    : DEFAULT_LAYER_GROUPS.map(g => g.id);

  // ── Phase 3: merge default layers that are missing from the loaded document ─
  // (ensures 22 default layers are always present when loading an older file)
  const defaultLayers = getDefaultLayersRecord();
  const defaultLayerOrder = getDefaultLayerOrder();
  let layerOrderExtended = layerOrder;
  for (const dlId of defaultLayerOrder) {
    if (!layers[dlId]) {
      // defaultLayers[dlId].id already equals dlId (static fixed IDs), but be explicit
      (layers as Record<string, unknown>)[dlId] = { ...defaultLayers[dlId], id: dlId };
      layerOrderExtended = [...layerOrderExtended, dlId];
    }
  }

  return {
    id:               String(r.id),
    name:             typeof r.name    === 'string' ? r.name    : 'Untitled Drawing',
    created:          typeof r.created === 'string' ? r.created : new Date().toISOString(),
    modified:         typeof r.modified === 'string' ? r.modified : new Date().toISOString(),
    author:           typeof r.author  === 'string' ? r.author  : '',
    features:         features    as DrawingDocument['features'],
    layers:           layers      as DrawingDocument['layers'],
    layerOrder:       layerOrderExtended,
    layerGroups,
    layerGroupOrder,
    customSymbols:    Array.isArray(r.customSymbols)  ? (r.customSymbols  as DrawingDocument['customSymbols'])  : [],
    customLineTypes:  Array.isArray(r.customLineTypes) ? (r.customLineTypes as DrawingDocument['customLineTypes']) : [],
    codeStyleOverrides: (r.codeStyleOverrides && typeof r.codeStyleOverrides === 'object' && !Array.isArray(r.codeStyleOverrides))
      ? (r.codeStyleOverrides as DrawingDocument['codeStyleOverrides'])
      : {},
    // Back-fill: spread DEFAULT_GLOBAL_STYLE_CONFIG first so all required keys are
    // always present, then overlay whatever was saved (safe migration pattern).
    globalStyleConfig: (r.globalStyleConfig && typeof r.globalStyleConfig === 'object')
      ? { ...DEFAULT_GLOBAL_STYLE_CONFIG, ...(r.globalStyleConfig as Partial<DrawingDocument['globalStyleConfig']>) }
      : { ...DEFAULT_GLOBAL_STYLE_CONFIG },
    // Back-fill project images (added after initial release)
    projectImages: (r.projectImages && typeof r.projectImages === 'object' && !Array.isArray(r.projectImages))
      ? (r.projectImages as DrawingDocument['projectImages'])
      : {},
    settings: settings as DrawingDocument['settings'],
  };
}
