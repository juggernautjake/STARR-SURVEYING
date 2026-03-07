// lib/cad/templates/types.ts — Template and print configuration types
import type { Point2D } from '../types';

export type PaperSize = 'LETTER' | 'TABLOID' | 'ARCH_C' | 'ARCH_D' | 'ARCH_E';

export const PAPER_DIMENSIONS: Record<PaperSize, { width: number; height: number }> = {
  LETTER:  { width: 8.5,  height: 11   },
  TABLOID: { width: 11,   height: 17   },
  ARCH_C:  { width: 18,   height: 24   },
  ARCH_D:  { width: 24,   height: 36   },
  ARCH_E:  { width: 36,   height: 48   },
};

export interface CompanyInfo {
  name: string;
  address: string;
  cityStateZip: string;
  phone: string;
  email: string;
  licenseNumber: string;
  logo: string | null;
}

export interface TitleBlockFields {
  projectName: string;
  projectSubtitle: string;
  projectAddress: string;
  clientName: string;
  surveyDate: string;
  sheetTitle: string;
  sheetNumber: string;
  drawnBy: string;
  checkedBy: string;
  jobNumber: string;
  scaleText: string;
}

export interface TitleBlockTemplateConfig {
  position: 'BOTTOM_RIGHT' | 'RIGHT_STRIP' | 'BOTTOM_STRIP' | 'CUSTOM';
  customBounds: { x: number; y: number; width: number; height: number } | null;
  fields: TitleBlockFields;
  showCompanyLogo: boolean;
  showCompanyInfo: boolean;
  showLicenseNumber: boolean;
  showSealPlaceholder: boolean;
  font: string;
  borderWeight: number;
  dividerWeight: number;
}

export interface NorthArrowTemplateConfig {
  style: 'SIMPLE' | 'COMPASS' | 'ORNATE' | 'MINIMAL';
  position: Point2D;
  size: number;
  rotation: number;
  showMagneticDeclination: boolean;
  magneticDeclination: number;
}

export interface ScaleBarTemplateConfig {
  position: Point2D;
  width: number;
  segments: 2 | 3 | 4 | 5 | 6 | 8;
  units: 'FEET' | 'METERS';
  font: string;
  fontSize: number;
}

export interface LegendEntryConfig {
  label: string;
  sampleType: 'LINE' | 'SYMBOL' | 'AREA';
  lineTypeId?: string;
  symbolId?: string;
  color: string;
  lineWeight?: number;
}

export interface LegendTemplateConfig {
  position: Point2D;
  width: number;
  autoPopulate: boolean;
  columns: 1 | 2;
  showLineTypes: boolean;
  showSymbols: boolean;
  showColors: boolean;
  title: string;
  font: string;
  fontSize: number;
  entries: LegendEntryConfig[];
}

export interface CertificationTemplateConfig {
  position: Point2D;
  width: number;
  visible: boolean;
  certificationText: string;
  surveyorName: string;
  licenseNumber: string;
  licenseState: string;
  firmName: string;
  showSignatureLine: boolean;
  showDateLine: boolean;
  showSealPlaceholder: boolean;
  sealDiameter: number;
  font: string;
  fontSize: number;
}

export interface StandardNotesTemplateConfig {
  position: Point2D;
  width: number;
  title: string;
  font: string;
  fontSize: number;
  selectedNoteIds: string[];
  customNotes: string[];
}

export interface BorderTemplateConfig {
  visible: boolean;
  style: 'SINGLE' | 'DOUBLE' | 'TRIPLE';
  outerWeight: number;
  innerWeight: number;
  spacing: number;
  tickMarks: boolean;
}

export interface DrawingTemplate {
  id: string;
  name: string;
  isBuiltIn: boolean;
  isEditable: boolean;
  paperSize: PaperSize;
  orientation: 'PORTRAIT' | 'LANDSCAPE';
  margins: { top: number; right: number; bottom: number; left: number };
  scale: number;
  titleBlock: TitleBlockTemplateConfig;
  northArrow: NorthArrowTemplateConfig;
  scaleBar: ScaleBarTemplateConfig;
  legend: LegendTemplateConfig;
  certification: CertificationTemplateConfig;
  standardNotes: StandardNotesTemplateConfig;
  border: BorderTemplateConfig;
  company: CompanyInfo;
}

export interface PrintConfig {
  paperSize: PaperSize;
  orientation: 'PORTRAIT' | 'LANDSCAPE';
  scale: number;
  scaleMode: 'FIXED' | 'FIT_TO_PAGE';
  printArea: 'EXTENTS' | 'DISPLAY' | 'WINDOW';
  windowBounds: { x: number; y: number; width: number; height: number } | null;
  centerOnPage: boolean;
  plotStyle: 'AS_DISPLAYED' | 'MONOCHROME' | 'GRAYSCALE';
  lineWeightScale: number;
  layerOverrides: Record<string, { visible: boolean; color?: string; weight?: number }>;
  printBorder: boolean;
  printTitleBlock: boolean;
  printNorthArrow: boolean;
  printScaleBar: boolean;
  printLegend: boolean;
  printCertification: boolean;
  printNotes: boolean;
  output: 'PDF' | 'PNG' | 'SVG';
  dpi: number;
  pdfCompression: boolean;
}

export interface DrawableArea {
  x: number;
  y: number;
  width: number;
  height: number;
}
