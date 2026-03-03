// lib/cad/import/types.ts — Import-specific types

export interface RawPointData {
  pointNumber: number;
  pointName: string;
  northing: number;
  easting: number;
  elevation: number | null;
  rawCode: string;
  description: string;
}

export interface ParsedImportRow {
  lineNumber: number;
  rawLine: string;
  error: string | null;
  data: RawPointData | null;
}

export interface CSVImportConfig {
  delimiter: ',' | '\t' | ' ' | '|' | ';';
  hasHeader: boolean;
  skipRows: number;
  encoding: 'utf-8' | 'ascii' | 'latin1';
  columns: {
    pointNumber: number;
    northing: number;
    easting: number;
    elevation: number;
    description: number;
  };
  coordinateOrder: 'NE' | 'EN';
  codePosition: 'FIRST_WORD' | 'ENTIRE_FIELD' | 'CUSTOM_REGEX';
  codeRegex?: string;
  presetName: string | null;
  presetId: string | null;
}

export interface ImportPreset {
  id: string;
  name: string;
  config: CSVImportConfig;
  description: string;
  isBuiltIn: boolean;
}

export const DEFAULT_CSV_CONFIG: CSVImportConfig = {
  delimiter: ',',
  hasHeader: false,
  skipRows: 0,
  encoding: 'utf-8',
  columns: { pointNumber: 0, northing: 1, easting: 2, elevation: 3, description: 4 },
  coordinateOrder: 'NE',
  codePosition: 'FIRST_WORD',
  presetName: null,
  presetId: null,
};

export const BUILT_IN_PRESETS: ImportPreset[] = [
  {
    id: 'carlson-survce',
    name: 'Carlson SurvCE (N,E,Z,Desc)',
    config: {
      delimiter: ',', hasHeader: false, skipRows: 0, encoding: 'utf-8',
      columns: { pointNumber: 0, northing: 1, easting: 2, elevation: 3, description: 4 },
      coordinateOrder: 'NE', codePosition: 'FIRST_WORD',
      presetName: 'Carlson SurvCE', presetId: 'carlson-survce',
    },
    description: 'Standard Carlson SurvCE export: PtNum, N, E, Elev, Code+Desc',
    isBuiltIn: true,
  },
  {
    id: 'trimble-pnezd',
    name: 'Trimble PNEZD',
    config: {
      delimiter: ',', hasHeader: false, skipRows: 0, encoding: 'utf-8',
      columns: { pointNumber: 0, northing: 1, easting: 2, elevation: 3, description: 4 },
      coordinateOrder: 'NE', codePosition: 'FIRST_WORD',
      presetName: 'Trimble PNEZD', presetId: 'trimble-pnezd',
    },
    description: 'Standard Trimble PNEZD format',
    isBuiltIn: true,
  },
  {
    id: 'generic-penzd',
    name: 'Generic PENZD',
    config: {
      delimiter: ',', hasHeader: false, skipRows: 0, encoding: 'utf-8',
      columns: { pointNumber: 0, northing: 2, easting: 1, elevation: 3, description: 4 },
      coordinateOrder: 'EN', codePosition: 'FIRST_WORD',
      presetName: 'Generic PENZD', presetId: 'generic-penzd',
    },
    description: 'Easting first, then Northing',
    isBuiltIn: true,
  },
  {
    id: 'custom',
    name: 'Custom',
    config: {
      delimiter: ',', hasHeader: false, skipRows: 0, encoding: 'utf-8',
      columns: { pointNumber: 0, northing: 1, easting: 2, elevation: 3, description: 4 },
      coordinateOrder: 'NE', codePosition: 'FIRST_WORD',
      presetName: null, presetId: 'custom',
    },
    description: 'Custom column mapping',
    isBuiltIn: false,
  },
];
