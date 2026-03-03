// lib/cad/validate.ts — .starr file schema validator & migrator
// Called before loadDocument() to ensure every required field is present
// and fill in sensible defaults for fields added in later versions.

import type { DrawingDocument } from './types';
import { DEFAULT_DRAWING_SETTINGS, DEFAULT_LAYERS } from './constants';
import { generateId } from './types';
import { cadLog } from './logger';

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
  const settings = typeof r.settings === 'object' && r.settings !== null
    ? { ...DEFAULT_DRAWING_SETTINGS, ...(r.settings as Record<string, unknown>) }
    : { ...DEFAULT_DRAWING_SETTINGS };

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
    const id = generateId();
    const [defaultLayer] = DEFAULT_LAYERS;
    (layers as Record<string, unknown>)[id] = { id, ...defaultLayer };
    layerOrder.push(id);
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
      f.style = { color: '#000000', lineWeight: 1, opacity: 1 };
    }
  }
  if (removedFeatureCount > 0) {
    cadLog.warn('FileIO', `Removed ${removedFeatureCount} malformed feature(s) from loaded document`);
  }

  return {
    id:        String(r.id),
    name:      typeof r.name === 'string' ? r.name : 'Untitled Drawing',
    created:   typeof r.created === 'string' ? r.created : new Date().toISOString(),
    modified:  typeof r.modified === 'string' ? r.modified : new Date().toISOString(),
    author:    typeof r.author === 'string' ? r.author : '',
    features:  features as DrawingDocument['features'],
    layers:    layers as DrawingDocument['layers'],
    layerOrder,
    settings:  settings as DrawingDocument['settings'],
  };
}
