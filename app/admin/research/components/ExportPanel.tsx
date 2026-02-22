// app/admin/research/components/ExportPanel.tsx — Export step UI
// Format selection, download actions, and project completion
'use client';

import { useState } from 'react';
import type { ExportFormat, ViewMode, ComparisonResult } from '@/types/research';
import Tooltip from './Tooltip';

interface ExportPanelProps {
  projectId: string;
  drawingId: string;
  drawingName: string;
  comparison: ComparisonResult | null;
  onExport: (format: ExportFormat, viewMode: ViewMode) => Promise<void>;
  onMarkComplete: () => void;
  isExporting: boolean;
  lastExport: { format: string; filename: string } | null;
  showUITooltips?: boolean;
}

const FORMAT_OPTIONS: {
  format: ExportFormat;
  label: string;
  desc: string;
  icon: string;
  available: boolean;
  tip: string;
}[] = [
  {
    format: 'svg',
    label: 'SVG',
    desc: 'Scalable Vector Graphics — crisp at any zoom, editable in Illustrator/Inkscape',
    icon: '\uD83D\uDCC0',
    available: true,
    tip: 'Export as SVG file. Best for digital viewing and editing. Scales perfectly at any size.',
  },
  {
    format: 'json',
    label: 'JSON',
    desc: 'Full drawing data — all elements, geometry, confidence, and metadata',
    icon: '\uD83D\uDCC4',
    available: true,
    tip: 'Export raw drawing data as JSON. Includes all elements, attributes, and metadata. Good for backups and data exchange.',
  },
  {
    format: 'png',
    label: 'PNG',
    desc: 'Raster image at print quality (300 DPI)',
    icon: '\uD83D\uDDBC\uFE0F',
    available: false,
    tip: 'PNG export will be available in a future update. Use SVG for now.',
  },
  {
    format: 'pdf',
    label: 'PDF',
    desc: 'Print-ready PDF with proper paper size and margins',
    icon: '\uD83D\uDCCB',
    available: false,
    tip: 'PDF export will be available in a future update. Use SVG for now.',
  },
  {
    format: 'dxf',
    label: 'DXF',
    desc: 'AutoCAD-compatible DXF with layer mapping',
    icon: '\uD83D\uDCD0',
    available: false,
    tip: 'DXF export for AutoCAD/Civil 3D will be available in a future update.',
  },
];

const VIEW_MODE_OPTIONS: { mode: ViewMode; label: string }[] = [
  { mode: 'standard', label: 'Standard' },
  { mode: 'feature', label: 'Feature Color' },
  { mode: 'confidence', label: 'Confidence' },
];

export default function ExportPanel({
  projectId,
  drawingId,
  drawingName,
  comparison,
  onExport,
  onMarkComplete,
  isExporting,
  lastExport,
  showUITooltips = true,
}: ExportPanelProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('svg');
  const [selectedView, setSelectedView] = useState<ViewMode>('standard');
  const tips = showUITooltips;

  const selectedFormatInfo = FORMAT_OPTIONS.find(f => f.format === selectedFormat)!;

  return (
    <div className="research-export">
      {/* Summary card */}
      {comparison && (
        <div className="research-export__summary">
          <div className="research-export__summary-row">
            <span className="research-export__summary-label">Drawing</span>
            <span className="research-export__summary-value">{drawingName}</span>
          </div>
          <div className="research-export__summary-row">
            <span className="research-export__summary-label">Confidence</span>
            <span className="research-export__summary-value" style={{
              color: comparison.overall_confidence >= 75 ? '#059669'
                : comparison.overall_confidence >= 55 ? '#F59E0B'
                : '#EF4444',
              fontWeight: 700,
            }}>
              {comparison.overall_confidence}%
            </span>
          </div>
          {comparison.persisting_issues.length > 0 && (
            <div className="research-export__summary-row">
              <span className="research-export__summary-label">Open Issues</span>
              <span className="research-export__summary-value research-export__summary-value--warn">
                {comparison.persisting_issues.length} issue{comparison.persisting_issues.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Format Selection */}
      <div className="research-export__section">
        <h4 className="research-export__section-title">Export Format</h4>
        <div className="research-export__formats">
          {FORMAT_OPTIONS.map(opt => (
            <Tooltip key={opt.format} text={opt.tip} enabled={tips} position="top">
              <button
                className={`research-export__format-card ${selectedFormat === opt.format ? 'research-export__format-card--active' : ''} ${!opt.available ? 'research-export__format-card--disabled' : ''}`}
                onClick={() => opt.available && setSelectedFormat(opt.format)}
                disabled={!opt.available}
              >
                <span className="research-export__format-icon">{opt.icon}</span>
                <span className="research-export__format-label">{opt.label}</span>
                <span className="research-export__format-desc">{opt.desc}</span>
                {!opt.available && (
                  <span className="research-export__format-badge">Coming Soon</span>
                )}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* View Mode for visual exports */}
      {(selectedFormat === 'svg' || selectedFormat === 'png' || selectedFormat === 'pdf') && (
        <div className="research-export__section">
          <h4 className="research-export__section-title">View Mode</h4>
          <Tooltip text="Choose which color scheme to use in the exported drawing" enabled={tips} position="bottom">
            <div className="research-export__view-modes">
              {VIEW_MODE_OPTIONS.map(opt => (
                <button
                  key={opt.mode}
                  className={`research-export__view-btn ${selectedView === opt.mode ? 'research-export__view-btn--active' : ''}`}
                  onClick={() => setSelectedView(opt.mode)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Tooltip>
        </div>
      )}

      {/* Export button */}
      <div className="research-export__actions">
        <button
          className="research-export__export-btn"
          onClick={() => onExport(selectedFormat, selectedView)}
          disabled={isExporting || !selectedFormatInfo.available}
        >
          {isExporting ? 'Exporting...' : `Export as ${selectedFormatInfo.label}`}
        </button>

        {lastExport && (
          <div className="research-export__last">
            Last export: <strong>{lastExport.filename}</strong>
          </div>
        )}
      </div>

      {/* Mark Complete */}
      <div className="research-export__complete">
        <Tooltip text="Mark this research project as complete. You can still make changes later." enabled={tips} position="top">
          <button
            className="research-export__complete-btn"
            onClick={onMarkComplete}
          >
            Mark Project Complete
          </button>
        </Tooltip>
        <p className="research-export__complete-note">
          Marking complete moves the project to the finished state. You can still return to edit and re-export at any time.
        </p>
      </div>
    </div>
  );
}
