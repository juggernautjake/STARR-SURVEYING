'use client';
// app/admin/cad/components/ImportDialog.tsx — Multi-step field data import wizard

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Upload,
  ChevronRight,
  ChevronLeft,
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  RefreshCw,
  Table2,
  Save,
  Trash2,
} from 'lucide-react';
import { useImportStore, usePointStore, useDrawingStore, useUndoStore, makeBatchEntry } from '@/lib/cad/store';
import { parseCSV } from '@/lib/cad/import/csv-parser';
import { parseRW5 } from '@/lib/cad/import/rw5-parser';
import { parseJobXML } from '@/lib/cad/import/jobxml-parser';
import { processImport } from '@/lib/cad/import/import-pipeline';
import { buildLineworkFeatures } from '@/lib/cad/import/linework-features';
import { BUILT_IN_PRESETS } from '@/lib/cad/import/types';
import type { CSVImportConfig } from '@/lib/cad/import/types';
import type { Feature, UndoOperation } from '@/lib/cad/types';
import { generateId } from '@/lib/cad/types';
import { DEFAULT_FEATURE_STYLE } from '@/lib/cad/constants';
import { fitPaperToBounds, boundsOfPoints } from '@/lib/cad/geometry/paper-fit';
import { PHASE3_DEFAULT_LAYERS } from '@/lib/cad/styles/default-layers';
import ModalFrame from '@/app/admin/components/ui/ModalFrame';

interface ImportDialogProps {
  onClose: () => void;
  onImportComplete?: () => void;
}

// ─── Step indicator ───
function StepIndicator({ current }: { current: string }) {
  const steps = [
    { key: 'FILE_SELECT', label: 'Select File' },
    { key: 'COLUMN_MAPPING', label: 'Columns' },
    { key: 'PREVIEW', label: 'Preview' },
    { key: 'VALIDATION', label: 'Validate' },
    { key: 'COMPLETE', label: 'Done' },
  ];
  const currentIdx = steps.findIndex(s => s.key === current);

  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((step, i) => {
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;
        return (
          <div key={step.key} className="flex items-center">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                isActive ? 'bg-blue-600 text-white' :
                isDone ? 'bg-gray-600 text-gray-300' :
                'text-gray-500'
              }`}
              style={!isActive && !isDone ? { backgroundColor: '#1a1f2e' } : {}}
            >
              {isDone
                ? <CheckCircle2 size={12} />
                : <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px]">{i + 1}</span>
              }
              {step.label}
            </div>
            {i < steps.length - 1 && (
              <ChevronRight size={14} className="text-gray-600 mx-1" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: File Select ───
function FileSelectStep() {
  const { setFile, rawText, fileType, file } = useImportStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(async (f: File) => {
    const text = await f.text();
    setFile(f, text);
  }, [setFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const previewLines = rawText.split('\n').slice(0, 10).join('\n');

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragging ? 'border-blue-400 bg-blue-950/20' : 'border-gray-600 hover:border-gray-500'
        }`}
        style={!dragging ? { backgroundColor: '#1a1f2e' } : {}}
      >
        <Upload size={32} className="mx-auto mb-3 text-gray-500" />
        <p className="text-sm text-gray-300 font-medium">Drop a file here or click to browse</p>
        <p className="text-xs text-gray-500 mt-1">Supports .csv, .txt, .rw5, .jxl, .xml</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt,.rw5,.jxl,.xml"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {/* File info */}
      {file && (
        <div className="flex items-center gap-3 px-3 py-2 bg-gray-700 rounded-lg text-sm">
          <FileText size={16} className="text-blue-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-gray-200 font-medium truncate">{file.name}</p>
            <p className="text-gray-400 text-xs">{(file.size / 1024).toFixed(1)} KB · Detected: {fileType}</p>
          </div>
        </div>
      )}

      {/* Preset selector */}
      {(fileType === 'CSV' || fileType === 'TXT') && <PresetPicker />}

      {/* Raw preview */}
      {rawText && (
        <div>
          <label className="block text-xs text-gray-400 mb-1">File Preview (first 10 lines)</label>
          <pre className="bg-gray-900 rounded p-3 text-xs text-gray-300 font-mono overflow-x-auto whitespace-pre-wrap border border-gray-700">
            {previewLines}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Preset picker — built-ins + persisted custom presets ───
//
// The picker subscribes to `customPresets` and `selectedPreset`
// so a freshly-saved preset shows up in the dropdown without
// closing the dialog. Custom presets persist across reloads
// via the `persist` middleware on `useImportStore` (Phase 8
// §9). A trash icon next to each custom preset lets the
// surveyor delete it from the saved list inline.
function PresetPicker() {
  const customPresets = useImportStore((s) => s.customPresets);
  const selectedPreset = useImportStore((s) => s.selectedPreset);
  const selectPreset = useImportStore((s) => s.selectPreset);
  const deleteCustomPreset = useImportStore((s) => s.deleteCustomPreset);

  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">Column Preset</label>
      <select
        value={selectedPreset?.id ?? ''}
        className="w-full bg-gray-700 text-gray-200 text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
        onChange={(e) => {
          const all = [...BUILT_IN_PRESETS, ...customPresets];
          const preset = all.find((p) => p.id === e.target.value);
          if (preset) selectPreset(preset);
        }}
      >
        <optgroup label="Built-in">
          {BUILT_IN_PRESETS.filter((p) => p.isBuiltIn).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </optgroup>
        {customPresets.length > 0 && (
          <optgroup label="Saved">
            {customPresets.map((p) => (
              <option key={p.id} value={p.id}>★ {p.name}</option>
            ))}
          </optgroup>
        )}
      </select>
      {customPresets.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {customPresets.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-[10px] text-gray-400"
            >
              <span className="truncate max-w-[120px]">{p.name}</span>
              <button
                type="button"
                title={`Delete saved preset "${p.name}"`}
                aria-label={`Delete preset ${p.name}`}
                className="text-gray-500 hover:text-red-400 transition-colors"
                onClick={() => deleteCustomPreset(p.id)}
              >
                <Trash2 size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Inline form for saving the current column-mapping
// configuration as a named preset. Lives at the bottom of
// the column-mapping step where the user has just dialled
// in delimiter / coordinate order / column indices.
function SavePresetSection() {
  const config = useImportStore((s) => s.config);
  const customPresets = useImportStore((s) => s.customPresets);
  const saveCustomPreset = useImportStore((s) => s.saveCustomPreset);
  const [name, setName] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedName = name.trim();
  const nameTaken = trimmedName.length > 0
    && customPresets.some((p) => p.name.toLowerCase() === trimmedName.toLowerCase());
  const canSave = trimmedName.length > 0 && !nameTaken;

  const onSave = () => {
    if (!canSave) return;
    saveCustomPreset(trimmedName, config);
    setName('');
    setFlash(`Saved "${trimmedName}" — pick it from the Column Preset dropdown next time.`);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 4000);
  };

  return (
    <div className="border-t border-gray-700 pt-3">
      <label className="block text-xs text-gray-400 mb-1.5 flex items-center gap-1.5">
        <Save size={11} />
        Save current configuration as a preset
      </label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) {
              e.preventDefault();
              onSave();
            }
          }}
          placeholder="e.g. ProjectX boundary import"
          className="flex-1 bg-gray-700 text-gray-200 text-xs px-2 py-1.5 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
        />
        <button
          type="button"
          disabled={!canSave}
          onClick={onSave}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            canSave
              ? 'bg-blue-600 text-white hover:bg-blue-500'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          Save Preset
        </button>
      </div>
      {nameTaken && (
        <p className="text-[10px] text-amber-400 mt-1">
          A preset named &quot;{trimmedName}&quot; already exists — pick a different name or delete the old one above.
        </p>
      )}
      {flash && !nameTaken && (
        <p className="text-[10px] text-green-400 mt-1">{flash}</p>
      )}
      <p className="text-[10px] text-gray-500 mt-1">
        Saved presets persist across browser reloads and appear in the Column Preset dropdown the next time you open the import wizard.
      </p>
    </div>
  );
}

// ─── Step 2: Column Mapping (CSV/TXT only) ───
function ColumnMappingStep() {
  const { config, setConfig, rawText } = useImportStore();

  const previewRows = rawText.split('\n').slice(0, 6).map(line =>
    line.split(config.delimiter === '\t' ? '\t' : config.delimiter)
  );

  const colCount = Math.max(...previewRows.map(r => r.length));

  return (
    <div className="space-y-4">
      {/* Settings row */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Delimiter</label>
          <select
            value={config.delimiter}
            onChange={e => setConfig({ delimiter: e.target.value as CSVImportConfig['delimiter'] })}
            className="w-full bg-gray-700 text-gray-200 text-sm px-2 py-1.5 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
          >
            <option value=",">Comma (,)</option>
            <option value={'\t'}>Tab (\t)</option>
            <option value=" ">Space</option>
            <option value="|">Pipe (|)</option>
            <option value=";">Semicolon (;)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Coord Order</label>
          <select
            value={config.coordinateOrder}
            onChange={e => setConfig({ coordinateOrder: e.target.value as 'NE' | 'EN' })}
            className="w-full bg-gray-700 text-gray-200 text-sm px-2 py-1.5 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
          >
            <option value="NE">N, E (Northing first)</option>
            <option value="EN">E, N (Easting first)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Code From</label>
          <select
            value={config.codePosition}
            onChange={e => setConfig({ codePosition: e.target.value as CSVImportConfig['codePosition'] })}
            className="w-full bg-gray-700 text-gray-200 text-sm px-2 py-1.5 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
          >
            <option value="FIRST_WORD">First Word</option>
            <option value="ENTIRE_FIELD">Entire Field</option>
            <option value="CUSTOM_REGEX">Custom Regex</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={config.hasHeader}
            onChange={e => setConfig({ hasHeader: e.target.checked })}
            className="rounded"
          />
          File has header row
        </label>
      </div>

      {/* Column assignment */}
      <div>
        <label className="block text-xs text-gray-400 mb-2">Column Assignment (0-indexed)</label>
        <div className="grid grid-cols-5 gap-2">
          {(['pointNumber', 'northing', 'easting', 'elevation', 'description'] as const).map(field => (
            <div key={field}>
              <label className="block text-[11px] text-gray-500 mb-0.5 capitalize">{field}</label>
              <input
                type="number"
                min={-1}
                max={colCount - 1}
                value={config.columns[field]}
                onChange={e => setConfig({ columns: { ...config.columns, [field]: parseInt(e.target.value) } })}
                className="w-full bg-gray-700 text-gray-200 text-xs px-2 py-1 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-500 mt-1">Use -1 for &quot;not present&quot; (elevation only)</p>
      </div>

      {/* Data preview */}
      {previewRows.length > 0 && (
        <div>
          <label className="block text-xs text-gray-400 mb-1">Data Preview</label>
          <div className="overflow-x-auto">
            <table className="text-xs font-mono border-collapse">
              <thead>
                <tr>
                  {Array.from({ length: colCount }, (_, i) => (
                    <th key={i} className="px-3 py-1 bg-gray-700 text-gray-300 border border-gray-600 text-center">
                      Col {i}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 5).map((row, ri) => (
                  <tr key={ri} className={ri === 0 && config.hasHeader ? 'opacity-50 italic' : ''}>
                    {Array.from({ length: colCount }, (_, ci) => (
                      <td key={ci} className="px-3 py-0.5 text-gray-300 border border-gray-700/50 max-w-32 truncate">
                        {row[ci] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SavePresetSection />
    </div>
  );
}

// ─── Step 3: Preview ───
function PreviewStep({ previewPoints }: { previewPoints: ReturnType<typeof processImport> | null }) {
  if (!previewPoints) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
        <RefreshCw size={16} className="animate-spin mr-2" />
        Parsing file…
      </div>
    );
  }

  const { points, stats } = previewPoints;
  const preview = points.slice(0, 50);

  return (
    <div className="space-y-3">
      {/* Stats summary */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: 'Total Points', value: stats.parsedSuccessfully, color: 'text-green-400' },
          { label: 'Parse Errors', value: stats.parseErrors, color: stats.parseErrors > 0 ? 'text-red-400' : 'text-gray-400' },
          { label: 'Line Strings', value: stats.lineStringsBuilt, color: 'text-blue-400' },
          { label: 'Unrecognized', value: stats.unrecognizedCodes, color: stats.unrecognizedCodes > 0 ? 'text-yellow-400' : 'text-gray-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-700 rounded p-2">
            <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[11px] text-gray-400">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Preview table */}
      <div className="overflow-auto max-h-64">
        <table className="w-full text-xs font-mono border-collapse">
          <thead className="sticky top-0" style={{ backgroundColor: '#1a1f2e' }}>
            <tr>
              <th className="px-2 py-1 text-left text-gray-400">#</th>
              <th className="px-2 py-1 text-left text-gray-400">Name</th>
              <th className="px-2 py-1 text-left text-gray-400">Northing</th>
              <th className="px-2 py-1 text-left text-gray-400">Easting</th>
              <th className="px-2 py-1 text-left text-gray-400">Code</th>
              <th className="px-2 py-1 text-left text-gray-400">Action</th>
              <th className="px-2 py-1 text-left text-gray-400">Layer</th>
            </tr>
          </thead>
          <tbody>
            {preview.map(pt => (
              <tr key={pt.id} className={`border-b border-gray-700/50 ${pt.validationIssues.length > 0 ? 'bg-yellow-950/20' : 'hover:bg-gray-700/50'}`}>
                <td className="px-2 py-0.5 text-gray-300">{pt.pointNumber}</td>
                <td className="px-2 py-0.5 text-gray-300">{pt.pointName}</td>
                <td className="px-2 py-0.5 text-gray-400">{pt.northing.toFixed(3)}</td>
                <td className="px-2 py-0.5 text-gray-400">{pt.easting.toFixed(3)}</td>
                <td className="px-2 py-0.5 text-blue-300">{pt.resolvedAlphaCode}{pt.codeSuffix ?? ''}</td>
                <td className="px-2 py-0.5 text-purple-300">{pt.monumentAction ?? '—'}</td>
                <td className="px-2 py-0.5 text-gray-400">{pt.layerId}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {points.length > 50 && (
          <p className="text-center text-xs text-gray-500 py-2">
            Showing first 50 of {points.length} points
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Step 4: Validation ───
function ValidationStep({ result }: { result: ReturnType<typeof processImport> | null }) {
  if (!result) return null;
  const { validationIssues } = result;

  const errors = validationIssues.filter(i => i.severity === 'ERROR');
  const warnings = validationIssues.filter(i => i.severity === 'WARNING');
  const infos = validationIssues.filter(i => i.severity === 'INFO');

  if (validationIssues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <CheckCircle2 size={40} className="text-green-400 mb-3" />
        <p className="text-gray-200 font-medium">No validation issues</p>
        <p className="text-gray-500 text-sm mt-1">All {result.stats.parsedSuccessfully} points parsed cleanly</p>
      </div>
    );
  }

  type IssueSeverity = 'ERROR' | 'WARNING' | 'INFO';
  type IssueGroup = { label: string; items: typeof validationIssues; severity: IssueSeverity; icon: React.ReactNode };
  const allGroups: IssueGroup[] = [
    { label: `${errors.length} Error${errors.length !== 1 ? 's' : ''}`, items: errors, severity: 'ERROR', icon: <AlertCircle size={14} className="text-red-400" /> },
    { label: `${warnings.length} Warning${warnings.length !== 1 ? 's' : ''}`, items: warnings, severity: 'WARNING', icon: <AlertTriangle size={14} className="text-yellow-400" /> },
    { label: `${infos.length} Info`, items: infos, severity: 'INFO', icon: <Info size={14} className="text-blue-400" /> },
  ];
  const groups = allGroups.filter(g => g.items.length > 0);

  return (
    <div className="space-y-3 max-h-80 overflow-auto">
      {groups.map(group => (
        <div key={group.severity}>
          <div className="flex items-center gap-2 mb-2">
            {group.icon}
            <span className="text-xs font-semibold text-gray-300">{group.label}</span>
          </div>
          <div className="space-y-1 ml-4">
            {group.items.slice(0, 20).map((issue, i) => (
              <div key={i} className="text-xs text-gray-400 rounded px-2 py-1" style={{ backgroundColor: '#1a1f2e' }}>
                {issue.message}
              </div>
            ))}
            {group.items.length > 20 && (
              <p className="text-xs text-gray-500 ml-2">…and {group.items.length - 20} more</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Step 5: Complete ───
function CompleteStep({ result, onViewPoints }: { result: ReturnType<typeof processImport> | null; onViewPoints: () => void }) {
  if (!result) return null;
  const { stats } = result;

  return (
    <div className="flex flex-col items-center text-center space-y-4 py-4">
      <CheckCircle2 size={48} className="text-green-400" />
      <div>
        <h3 className="text-gray-200 font-semibold text-lg">Import Complete</h3>
        <p className="text-gray-400 text-sm mt-1">{stats.parsedSuccessfully} points imported successfully</p>
      </div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
        {[
          ['Points', stats.parsedSuccessfully],
          ['Line Strings', stats.lineStringsBuilt],
          ['Point Groups', stats.pointGroupsFound],
          ['Monuments Found', stats.monumentsFound],
          ['Monuments Set', stats.monumentsSet],
          ['Monuments Calc', stats.monumentsCalculated],
        ].map(([label, val]) => (
          <div key={String(label)} className="bg-gray-700 rounded p-2 text-center">
            <div className="text-base font-bold text-blue-400">{val}</div>
            <div className="text-[11px] text-gray-400">{label}</div>
          </div>
        ))}
      </div>
      <button
        onClick={onViewPoints}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
      >
        <Table2 size={14} />
        View Point Table
      </button>
    </div>
  );
}

// ─── Main Dialog ───
export default function ImportDialog({ onClose, onImportComplete }: ImportDialogProps) {
  const importStore = useImportStore();
  const pointStore = usePointStore();
  const drawingStore = useDrawingStore();
  const undoStore = useUndoStore();
  const [importResult, setImportResult] = useState<ReturnType<typeof processImport> | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  // Default: import everything into one visible "Survey Points" layer.
  // Opt-in: split into per-code layers (the old behaviour).
  const [autoGenerateLayers, setAutoGenerateLayers] = useState(false);
  // Off by default: import just the points. Line-coded points are connected
  // into linework only when the surveyor opts in (or later via
  // Survey ▸ Connect Points into Linework). Lines are separate features.
  const [connectLinework, setConnectLinework] = useState(false);

  // The import store is an in-memory singleton. Reset it when the dialog
  // closes so the next import starts fresh at step 1 (not stuck on "Done")
  // and the previous file/result aren't held in memory.
  useEffect(() => {
    return () => { useImportStore.getState().reset(); };
  }, []);

  // Swapping the file mid-wizard invalidates the prior parse — drop the
  // dialog's local result so stale points from the old file can't be used.
  useEffect(() => {
    setImportResult(null);
  }, [importStore.file]);

  const canGoNext = () => {
    const { step, file, rawText } = importStore;
    if (step === 'FILE_SELECT') return !!file && !!rawText;
    if (step === 'COLUMN_MAPPING') return true;
    if (step === 'PREVIEW') return importResult !== null;
    if (step === 'VALIDATION') return importResult !== null;
    return false;
  };

  const handleNext = async () => {
    const { step, rawText, fileType, config } = importStore;

    // Build the parse result when moving to PREVIEW
    if (step === 'COLUMN_MAPPING' || (step === 'FILE_SELECT' && fileType !== 'CSV' && fileType !== 'TXT')) {
      setIsProcessing(true);
      try {
        const parsed = fileType === 'RW5'
          ? parseRW5(rawText)
          : fileType === 'JOBXML'
            ? parseJobXML(rawText)
            : parseCSV(rawText, config);
        const result = processImport(parsed, importStore.file?.name ?? 'unknown');
        setImportResult(result);
        importStore.setImportResult(result);
      } finally {
        setIsProcessing(false);
      }
    }

    if (step === 'FILE_SELECT' && (fileType === 'CSV' || fileType === 'TXT')) {
      importStore.nextStep(); // → COLUMN_MAPPING
      return;
    }

    importStore.nextStep();
  };

  const handleExecuteImport = () => {
    if (!importResult) return;

    // Layer setup. Default: one visible "Survey Points" layer holds
    // every imported point + linework. Opt-in (autoGenerateLayers):
    // split into the per-code default layers.
    const existingLayers = drawingStore.document.layers;
    const SINGLE_LAYER_ID = 'SURVEY-POINTS';

    if (autoGenerateLayers) {
      // Add only the default layers actually referenced by the import,
      // plus MISC as a fallback — instead of all 23 unconditionally.
      const referenced = new Set<string>(['MISC']);
      for (const pt of importResult.points) referenced.add(pt.layerId);
      const missingLayers = PHASE3_DEFAULT_LAYERS.filter(
        (l) => referenced.has(l.id) && !existingLayers[l.id],
      );
      for (const layer of missingLayers) drawingStore.addLayer(layer);
      drawingStore.setActiveLayer(
        importResult.points[0]?.layerId && drawingStore.document.layers[importResult.points[0].layerId]
          ? importResult.points[0].layerId
          : 'MISC',
      );
    } else if (!existingLayers[SINGLE_LAYER_ID]) {
      // Create the single target layer once.
      drawingStore.addLayer({
        id: SINGLE_LAYER_ID,
        name: 'Survey Points',
        visible: true,
        locked: false,
        frozen: false,
        color: '#000000',
        lineWeight: 0.5,
        lineTypeId: 'SOLID',
        opacity: 1,
        groupId: null,
        sortOrder: 0,
        isDefault: false,
        isProtected: false,
        autoAssignCodes: [],
      });
    }
    // Where features land this import.
    const targetLayerId = autoGenerateLayers ? null : SINGLE_LAYER_ID;
    if (!autoGenerateLayers) drawingStore.setActiveLayer(SINGLE_LAYER_ID);

    // Add points to point store
    pointStore.importPoints(importResult);

    // Build features for the drawing canvas
    const features: Feature[] = [];
    const operations: UndoOperation[] = [];

    for (const pt of importResult.points) {
      const pointFeature: Feature = {
        id: generateId(),
        type: 'POINT',
        geometry: { type: 'POINT', point: { x: pt.easting, y: pt.northing } },
        layerId: targetLayerId ?? pt.layerId,
        style: {
          ...DEFAULT_FEATURE_STYLE,
          color: pt.codeDefinition?.defaultColor ?? '#000000',
        },
        properties: {
          pointId: pt.id,
          pointName: pt.pointName,
          // Both resolved code forms are stored so the label can switch
          // between alpha (BC01) and numeric (308) per the document's
          // codeDisplayMode. `codeText` is the human remainder after the
          // code (e.g. "ACS", "cap 4636").
          code: pt.resolvedAlphaCode,
          codeNumeric: pt.resolvedNumericCode,
          codeText: pt.description ?? '',
          // Full code/description text exactly as imported (raw code +
          // any remainder), so the label always shows the complete value
          // — even when the code is long or not in the code library.
          // Falls back to the resolved code if the raw fields are empty.
          description:
            [pt.rawCode, pt.description]
              .map((s) => (s == null ? '' : String(s).trim()))
              .filter(Boolean)
              .join(' ') || pt.resolvedAlphaCode,
        },
      };
      pt.featureId = pointFeature.id;
      features.push(pointFeature);
      operations.push({ type: 'ADD_FEATURE', data: pointFeature });
    }

    // Connect line-coded points into linework only when opted in. The
    // line strings are still computed + stored on the point store, so the
    // surveyor can draw them later via Survey ▸ Connect Points into Linework.
    if (connectLinework) {
      const lineFeatures = buildLineworkFeatures(
        importResult.points,
        importResult.lineStrings,
        (p) => targetLayerId ?? p.layerId ?? 'MISC',
      );
      for (const lf of lineFeatures) {
        features.push(lf);
        operations.push({ type: 'ADD_FEATURE', data: lf });
      }
    }

    // Batch-add to drawing with a single undoable entry
    drawingStore.addFeatures(features);
    undoStore.pushUndo(
      makeBatchEntry(`Import ${importResult.stats.parsedSuccessfully} points`, operations),
    );

    // Reset the display origin to 0. Features are stored at their raw
    // survey coordinates (world = easting/northing), and the readout is
    // `displayed = world + origin` (lib/cad/geometry/units.ts). A
    // non-zero origin double-counts — a point at world 5000 with origin
    // 4800 displays ~9800 and renders far NE of where the HUD reports.
    // Older imports auto-set such an origin and it persists in the saved
    // drawing, so we explicitly clear it here to self-heal those files.
    {
      const prefs = drawingStore.document.settings.displayPreferences;
      if (prefs && (prefs.originNorthing !== 0 || prefs.originEasting !== 0)) {
        drawingStore.updateSettings({
          displayPreferences: { ...prefs, originNorthing: 0, originEasting: 0 },
        });
      }
    }

    // Center the paper sheet under the imported points and pick a
    // scale that fits them on the page. Features are stored at raw
    // state-plane coordinates (often in the millions) while the paper
    // frame defaults to world origin (0,0), so without this the points
    // render far off the sheet (up and to the right). paperOrigin is a
    // purely visual frame position — it never moves any geometry.
    {
      const bounds = boundsOfPoints(
        importResult.points.map((p) => ({ easting: p.easting, northing: p.northing })),
      );
      if (bounds) {
        const s = drawingStore.document.settings;
        const { drawingScale, paperOrigin } = fitPaperToBounds(
          bounds,
          s.paperSize ?? 'TABLOID',
          s.paperOrientation ?? 'LANDSCAPE',
        );
        drawingStore.updateSettings({ drawingScale, paperOrigin });
      }
    }

    // Importing points almost always precedes drawing lines BETWEEN
    // them, so make sure object snap is on (lock onto existing points).
    // Leave the grid + grid-snap off; just ensure ENDPOINT snapping is
    // available. Self-heals drawings saved while snap was off.
    {
      const s = drawingStore.document.settings;
      const needsEnable = !s.snapEnabled;
      const hasObjectSnap = s.snapTypes.some((t) => t !== 'GRID');
      if (needsEnable || !hasObjectSnap) {
        const types = hasObjectSnap
          ? s.snapTypes
          : ([...new Set([...s.snapTypes.filter((t) => t !== 'GRID'), 'ENDPOINT', 'MIDPOINT', 'INTERSECTION', 'NEAREST'])] as typeof s.snapTypes);
        drawingStore.updateSettings({ snapEnabled: true, snapTypes: types });
      }
    }

    // Force the canvas to (re)render and frame the newly-added points.
    // Without this the features are in the store but the view doesn't
    // visibly update until the next pan/zoom.
    setTimeout(() => window.dispatchEvent(new CustomEvent('cad:zoomExtents')), 50);

    importStore.nextStep(); // → COMPLETE
    onImportComplete?.();
  };

  const isLastDataStep = importStore.step === 'VALIDATION';

  return (
    <ModalFrame
      open
      onClose={onClose}
      scrollBody={false}
      title="Import Field Data"
      initialWidth={680}
      initialHeight={620}
      minWidth={440}
      minHeight={360}
    >
      <div className="flex flex-col h-full min-h-0 text-gray-200">
        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4">
          <StepIndicator current={importStore.step} />

          {importStore.step === 'FILE_SELECT' && <FileSelectStep />}
          {importStore.step === 'COLUMN_MAPPING' && <ColumnMappingStep />}
          {importStore.step === 'PREVIEW' && <PreviewStep previewPoints={importResult} />}
          {importStore.step === 'VALIDATION' && <ValidationStep result={importResult} />}
          {importStore.step === 'COMPLETE' && (
            <CompleteStep result={importResult} onViewPoints={() => { onClose(); onImportComplete?.(); }} />
          )}
        </div>

        {/* Footer */}
        {importStore.step !== 'COMPLETE' && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-700 shrink-0">
            <button
              onClick={() => importStore.step === 'FILE_SELECT' ? onClose() : importStore.prevStep()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
            >
              {importStore.step === 'FILE_SELECT' ? 'Cancel' : <><ChevronLeft size={14} />Back</>}
            </button>

            <div className="flex items-center gap-2">
              {isLastDataStep && (
                <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer mr-1 select-none" title="On: connect line-coded points into linework now (field-to-finish). Off (default): import points only — you can connect them later via Survey ▸ Connect Points into Linework.">
                  <input
                    type="checkbox"
                    checked={connectLinework}
                    onChange={(e) => setConnectLinework(e.target.checked)}
                    className="accent-blue-500"
                  />
                  Connect points into linework
                </label>
              )}
              {isLastDataStep && (
                <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer mr-1 select-none" title="On: split points into separate layers by survey code. Off (default): import everything into one 'Survey Points' layer.">
                  <input
                    type="checkbox"
                    checked={autoGenerateLayers}
                    onChange={(e) => setAutoGenerateLayers(e.target.checked)}
                    className="accent-blue-500"
                  />
                  Auto-generate layers by code
                </label>
              )}
              {isLastDataStep && (
                <button
                  onClick={handleExecuteImport}
                  disabled={!importResult || isProcessing}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-sm rounded-lg transition-colors font-medium"
                >
                  <CheckCircle2 size={14} />
                  Import {importResult ? `(${importResult.stats.parsedSuccessfully})` : ''}
                </button>
              )}
              {!isLastDataStep && (
                <button
                  onClick={handleNext}
                  disabled={!canGoNext() || isProcessing}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
                >
                  {isProcessing ? <RefreshCw size={14} className="animate-spin" /> : null}
                  Next <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </ModalFrame>
  );
}
