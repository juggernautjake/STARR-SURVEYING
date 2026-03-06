// lib/cad/constants.ts — Default values for the Starr CAD engine
import type { DrawingSettings, FeatureStyle, SnapType, DisplayPreferences } from './types';
import { PHASE3_DEFAULT_LAYERS } from './styles/default-layers';

export { PHASE3_DEFAULT_LAYERS as DEFAULT_LAYERS };

export const MIN_ZOOM = 0.001;
export const MAX_ZOOM = 1000;

/** Default display preferences — decimal feet, DMS quadrant bearings, N/E coordinates */
export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  linearUnit: 'FT',
  linearFormat: 'DECIMAL',
  linearDecimalPlaces: 3,
  areaUnit: 'SQ_FT',
  angleFormat: 'DMS',
  bearingFormat: 'QUADRANT',
  coordMode: 'NE',
  originNorthing: 0,
  originEasting: 0,
};

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
  selectionColor: '#0088ff',
  hoverColor: '#66aaff',
  gridMajorColor: '#c8c8c8',
  gridMinorColor: '#e8e8e8',
  groupSelectMode: 'GROUP_FIRST',
  boxSelectMode: 'CROSSING_EXPAND_GROUPS',
  paperSize: 'TABLOID',
  paperOrientation: 'LANDSCAPE',
  drawingScale: 50,
  codeDisplayMode: 'ALPHA',
  displayPreferences: { ...DEFAULT_DISPLAY_PREFERENCES },
};

export const DEFAULT_FEATURE_STYLE: FeatureStyle = {
  color: null,
  lineWeight: null,
  opacity: 1,
  lineTypeId: null,
  symbolId: null,
  symbolSize: null,
  symbolRotation: 0,
  labelVisible: null,
  labelFormat: null,
  labelOffset: { x: 0, y: 0 },
  isOverride: false,
};

export const SNAP_INDICATOR_STYLES: Record<SnapType, { shape: string; color: string }> = {
  ENDPOINT: { shape: 'square', color: '#00FF00' },
  MIDPOINT: { shape: 'triangle', color: '#00FF00' },
  INTERSECTION: { shape: 'cross', color: '#FF0000' },
  NEAREST: { shape: 'diamond', color: '#FFFF00' },
  CENTER: { shape: 'circle', color: '#00FFFF' },
  PERPENDICULAR: { shape: 'square', color: '#FF00FF' },
  GRID: { shape: 'cross', color: '#808080' },
};
