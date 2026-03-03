'use client';
// lib/cad/store/import-store.ts — State for the import wizard dialog
import { create } from 'zustand';
import type { ImportResult } from '../import/import-pipeline';
import type { CSVImportConfig, ImportPreset, ParsedImportRow } from '../import/types';
import { DEFAULT_CSV_CONFIG, BUILT_IN_PRESETS } from '../import/types';

export type ImportStep = 'FILE_SELECT' | 'COLUMN_MAPPING' | 'PREVIEW' | 'VALIDATION' | 'COMPLETE';
export type FileType = 'CSV' | 'TXT' | 'RW5' | 'JOBXML';

interface ImportStore {
  // Dialog visibility
  isOpen: boolean;

  // Wizard step
  step: ImportStep;

  // File info
  file: File | null;
  fileType: FileType | null;
  rawText: string;

  // Config
  config: CSVImportConfig;
  selectedPreset: ImportPreset | null;
  customPresets: ImportPreset[];

  // Preview data
  previewRows: ParsedImportRow[];
  previewLimit: number;

  // Import result
  importResult: ImportResult | null;

  // Actions
  openDialog: () => void;
  closeDialog: () => void;
  setFile: (file: File, text: string) => void;
  setConfig: (config: Partial<CSVImportConfig>) => void;
  selectPreset: (preset: ImportPreset) => void;
  saveCustomPreset: (name: string, config: CSVImportConfig) => void;
  deleteCustomPreset: (id: string) => void;
  setPreviewRows: (rows: ParsedImportRow[]) => void;
  setImportResult: (result: ImportResult) => void;
  nextStep: () => void;
  prevStep: () => void;
  reset: () => void;
}

const STEP_ORDER: ImportStep[] = ['FILE_SELECT', 'COLUMN_MAPPING', 'PREVIEW', 'VALIDATION', 'COMPLETE'];

function detectFileType(fileName: string): FileType {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'rw5') return 'RW5';
  if (ext === 'jxl' || ext === 'xml' || ext === 'jobxml') return 'JOBXML';
  return 'CSV';
}

export const useImportStore = create<ImportStore>((set, get) => ({
  isOpen: false,
  step: 'FILE_SELECT',
  file: null,
  fileType: null,
  rawText: '',
  config: { ...DEFAULT_CSV_CONFIG },
  selectedPreset: BUILT_IN_PRESETS[0],
  customPresets: [],
  previewRows: [],
  previewLimit: 50,
  importResult: null,

  openDialog: () => set({ isOpen: true, step: 'FILE_SELECT' }),

  closeDialog: () => set({ isOpen: false }),

  setFile: (file, text) =>
    set({
      file,
      fileType: detectFileType(file.name),
      rawText: text,
    }),

  setConfig: (config) =>
    set((state) => ({ config: { ...state.config, ...config } })),

  selectPreset: (preset) =>
    set({ selectedPreset: preset, config: { ...preset.config } }),

  saveCustomPreset: (name, config) => {
    const id = `custom-${Date.now()}`;
    const newPreset: ImportPreset = {
      id,
      name,
      config: { ...config, presetName: name, presetId: id },
      description: 'User-saved preset',
      isBuiltIn: false,
    };
    set((state) => ({ customPresets: [...state.customPresets, newPreset] }));
  },

  deleteCustomPreset: (id) =>
    set((state) => ({ customPresets: state.customPresets.filter(p => p.id !== id) })),

  setPreviewRows: (rows) => set({ previewRows: rows }),

  setImportResult: (result) => set({ importResult: result }),

  nextStep: () => {
    const current = get().step;
    const idx = STEP_ORDER.indexOf(current);
    const fileType = get().fileType;

    // Skip COLUMN_MAPPING for RW5 and JOBXML
    let nextIdx = idx + 1;
    if (STEP_ORDER[nextIdx] === 'COLUMN_MAPPING' && fileType !== 'CSV' && fileType !== 'TXT') {
      nextIdx++;
    }

    if (nextIdx < STEP_ORDER.length) {
      set({ step: STEP_ORDER[nextIdx] });
    }
  },

  prevStep: () => {
    const current = get().step;
    const idx = STEP_ORDER.indexOf(current);
    const fileType = get().fileType;

    let prevIdx = idx - 1;
    if (STEP_ORDER[prevIdx] === 'COLUMN_MAPPING' && fileType !== 'CSV' && fileType !== 'TXT') {
      prevIdx--;
    }

    if (prevIdx >= 0) {
      set({ step: STEP_ORDER[prevIdx] });
    }
  },

  reset: () =>
    set({
      step: 'FILE_SELECT',
      file: null,
      fileType: null,
      rawText: '',
      config: { ...DEFAULT_CSV_CONFIG },
      selectedPreset: BUILT_IN_PRESETS[0],
      previewRows: [],
      importResult: null,
    }),
}));
