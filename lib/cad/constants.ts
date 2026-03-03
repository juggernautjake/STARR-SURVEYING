// lib/cad/constants.ts — Default values for the Starr CAD engine
import type { DrawingSettings, FeatureStyle, Layer, SnapType } from './types';

export const MIN_ZOOM = 0.001;
export const MAX_ZOOM = 1000;

export const DEFAULT_DRAWING_SETTINGS: DrawingSettings = {
  units: 'FEET',
  gridVisible: true,
  gridMajorSpacing: 100,
  gridMinorDivisions: 10,
  gridStyle: 'DOTS',
  snapEnabled: true,
  snapTypes: ['ENDPOINT', 'MIDPOINT', 'INTERSECTION', 'NEAREST', 'GRID'],
  snapRadius: 15,
  backgroundColor: '#FFFFFF',
  paperSize: 'TABLOID',
  paperOrientation: 'LANDSCAPE',
  drawingScale: 50,
};

export const DEFAULT_FEATURE_STYLE: FeatureStyle = {
  color: '#000000',
  lineWeight: 1,
  opacity: 1,
};

export const DEFAULT_LAYERS: Omit<Layer, 'id'>[] = [
  {
    name: 'Layer 0',
    visible: true,
    locked: false,
    color: '#000000',
    lineWeight: 1,
    opacity: 1,
    isDefault: true,
  },
  {
    name: 'Construction',
    visible: true,
    locked: false,
    color: '#999999',
    lineWeight: 0.5,
    opacity: 0.5,
    isDefault: true,
  },
];

export const SNAP_INDICATOR_STYLES: Record<SnapType, { shape: string; color: string }> = {
  ENDPOINT: { shape: 'square', color: '#00FF00' },
  MIDPOINT: { shape: 'triangle', color: '#00FF00' },
  INTERSECTION: { shape: 'cross', color: '#FF0000' },
  NEAREST: { shape: 'diamond', color: '#FFFF00' },
  CENTER: { shape: 'circle', color: '#00FFFF' },
  PERPENDICULAR: { shape: 'square', color: '#FF00FF' },
  GRID: { shape: 'cross', color: '#808080' },
};
