// lib/cad/constants.ts — Default values for the Starr CAD engine
import type { DrawingSettings, FeatureStyle, SnapType, DisplayPreferences, LayerDisplayPreferences, TextLabelStyle, TitleBlockConfig } from './types';
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

  // Interaction & Viewport
  zoomSpeed: 1.0,
  zoomTowardCursor: true,
  invertScrollZoom: false,
  panSpeed: 1.0,
  dragThreshold: 5,

  // Grip & Handle appearance
  gripSize: 6,
  gripColor: '#0088ff',
  gripFillColor: '#ffffff',

  // Hover & highlight
  hoverGlowEnabled: true,
  hoverGlowIntensity: 1.0,
  selectionLineWidth: 1.5,

  // Labels & annotations display
  showPointLabels: true,
  showLineLabels: true,
  showDimensions: true,

  // Cursor
  cursorCrosshairSize: 24,
  showCursorCoordinates: false,

  // Auto-save
  autoSaveEnabled: true,
  autoSaveIntervalSec: 120,

  displayPreferences: { ...DEFAULT_DISPLAY_PREFERENCES },

  // Drawing view rotation (visual only)
  drawingRotationDeg: 0,

  // Title block — populated with sensible survey defaults
  titleBlock: {
    visible: true,
    northArrowStyle: 'STARR',
    northArrowSizeIn: 1.5,
    infoBoxStyle: 'STANDARD',
    firmName: '',
    surveyorName: '',
    surveyorLicense: '',
    projectName: '',
    projectNumber: '',
    clientName: '',
    surveyDate: '',
    scaleLabel: '',
    sheetNumber: '1',
    totalSheets: '1',
    notes: '',
    northArrowPos: null,
    titleBlockPos: null,
    scaleBarPos: null,
    scaleBarVisible: true,
    scaleBarLengthIn: 2.0,
  } satisfies TitleBlockConfig,
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

/** Default text style used for all label kinds unless overridden. */
export const DEFAULT_TEXT_LABEL_STYLE: TextLabelStyle = {
  fontFamily: 'Arial',
  fontSize: 12,
  fontWeight: 'normal',
  fontStyle: 'normal',
  color: null,           // inherit layer color
  backgroundColor: null, // transparent
  borderColor: null,
  padding: 2,
};

/** Default layer display preferences — everything off until the user opts in. */
export const DEFAULT_LAYER_DISPLAY_PREFERENCES: LayerDisplayPreferences = {
  showBearings: false,
  showDistances: false,
  showLineLabels: false,

  showPointNames: false,
  showPointDescriptions: false,
  showPointElevations: false,
  showPointCoordinates: false,

  showArea: false,
  showPerimeter: false,

  bearingTextStyle: { ...DEFAULT_TEXT_LABEL_STYLE },
  distanceTextStyle: { ...DEFAULT_TEXT_LABEL_STYLE },
  areaTextStyle: { ...DEFAULT_TEXT_LABEL_STYLE, fontSize: 14, fontWeight: 'bold' },
  pointNameTextStyle: { ...DEFAULT_TEXT_LABEL_STYLE, fontWeight: 'bold' },
  pointDescriptionTextStyle: { ...DEFAULT_TEXT_LABEL_STYLE },
  pointElevationTextStyle: { ...DEFAULT_TEXT_LABEL_STYLE, fontSize: 10 },
  pointCoordinateTextStyle: { ...DEFAULT_TEXT_LABEL_STYLE, fontSize: 10, fontFamily: 'Courier New' },

  pointLabelOffset: { x: 5, y: 5 },   // slightly right and above point
  pointLabelAutoRotate: false,

  bearingTextGap: 5,
  distanceTextGap: 5,

  // Per-layer format overrides — null = inherit from drawing-level preferences
  bearingFormatOverride: null,
  angleFormatOverride: null,
  linearUnitOverride: null,
  linearFormatOverride: null,
  linearDecimalPlacesOverride: null,
  areaUnitOverride: null,
  coordModeOverride: null,
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
