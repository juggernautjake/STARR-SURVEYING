'use client';
// app/admin/cad/components/SettingsDialog.tsx — Drawing settings & preferences

import { useState } from 'react';
import { X, Grid, ZoomIn, Sliders } from 'lucide-react';
import { useDrawingStore } from '@/lib/cad/store';
import type { SnapType } from '@/lib/cad/types';

interface Props {
  onClose: () => void;
}

const ALL_SNAP_TYPES: { type: SnapType; label: string; description: string }[] = [
  { type: 'ENDPOINT', label: 'Endpoint', description: 'Snaps to line/segment endpoints and point features' },
  { type: 'MIDPOINT', label: 'Midpoint', description: 'Snaps to the midpoint of line segments' },
  { type: 'INTERSECTION', label: 'Intersection', description: 'Snaps to intersections of two features' },
  { type: 'NEAREST', label: 'Nearest', description: 'Snaps to the closest point on any feature' },
  { type: 'CENTER', label: 'Center', description: 'Snaps to the center of arcs and circles (Phase 4)' },
  { type: 'PERPENDICULAR', label: 'Perpendicular', description: 'Snaps to perpendicular foot on a line (Phase 4)' },
  { type: 'GRID', label: 'Grid', description: 'Snaps to the nearest grid intersection' },
];

const TABS = ['Display', 'Grid', 'Snap', 'Document'] as const;
type Tab = typeof TABS[number];

export default function SettingsDialog({ onClose }: Props) {
  const drawingStore = useDrawingStore();
  const { settings } = drawingStore.document;
  const [activeTab, setActiveTab] = useState<Tab>('Display');

  function toggleSnapType(type: SnapType) {
    const current = settings.snapTypes;
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    drawingStore.updateSettings({ snapTypes: next });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl w-[480px] max-h-[80vh] flex flex-col text-sm text-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <Sliders size={16} className="text-blue-400" />
            <h2 className="font-semibold text-white">Settings &amp; Preferences</h2>
          </div>
          <button className="text-gray-400 hover:text-white transition-colors" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-700 shrink-0 text-xs">
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`px-4 py-2 transition-colors ${
                activeTab === tab
                  ? 'text-white border-b-2 border-blue-400 -mb-px'
                  : 'text-gray-400 hover:text-white'
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4 text-xs">

          {/* ── Display ─────────────────────────────────────────────────────── */}
          {activeTab === 'Display' && (
            <div className="space-y-3">
              <div>
                <label className="block text-gray-400 mb-1">Background Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="w-8 h-8 rounded cursor-pointer bg-transparent border border-gray-600 outline-none"
                    value={settings.backgroundColor}
                    onChange={(e) => drawingStore.updateSettings({ backgroundColor: e.target.value })}
                  />
                  <span className="text-gray-300 font-mono">{settings.backgroundColor}</span>
                </div>
                <p className="text-gray-500 mt-1">Canvas background color. White (#FFFFFF) is standard for survey drawings.</p>
              </div>

              <div className="border-t border-gray-700 pt-3">
                <label className="block text-gray-400 mb-1">Drawing Scale</label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">1″ =</span>
                  <input
                    className="w-20 bg-gray-700 text-white rounded px-2 py-1 outline-none font-mono"
                    type="number"
                    min="1"
                    step="1"
                    value={settings.drawingScale}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) drawingStore.updateSettings({ drawingScale: v });
                    }}
                  />
                  <span className="text-gray-400">feet</span>
                </div>
                <p className="text-gray-500 mt-1">Paper-to-world scale. Affects dimension labels in Phase 5.</p>
              </div>
            </div>
          )}

          {/* ── Grid ─────────────────────────────────────────────────────────── */}
          {activeTab === 'Grid' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white font-medium">Show Grid</div>
                  <div className="text-gray-500">Display grid on the canvas</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={settings.gridVisible}
                    onChange={() => drawingStore.updateSettings({ gridVisible: !settings.gridVisible })}
                  />
                  <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                </label>
              </div>

              <div className="border-t border-gray-700 pt-3">
                <label className="block text-gray-400 mb-1">Grid Style</label>
                <div className="flex gap-2">
                  {(['DOTS', 'LINES', 'CROSSHAIRS'] as const).map((style) => (
                    <button
                      key={style}
                      className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors ${
                        settings.gridStyle === style
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                      }`}
                      onClick={() => drawingStore.updateSettings({ gridStyle: style })}
                    >
                      {style === 'DOTS' ? '·· Dots' : style === 'LINES' ? '⊞ Lines' : '+ Crosshairs'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-700 pt-3">
                <label className="block text-gray-400 mb-2">Major Grid Spacing (ft)</label>
                <input
                  className="w-24 bg-gray-700 text-white rounded px-2 py-1 outline-none font-mono"
                  type="number"
                  min="1"
                  step="10"
                  value={settings.gridMajorSpacing}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v > 0) drawingStore.updateSettings({ gridMajorSpacing: v });
                  }}
                />
                <p className="text-gray-500 mt-1">Spacing between major (darker) grid lines in survey feet.</p>
              </div>

              <div className="border-t border-gray-700 pt-3">
                <label className="block text-gray-400 mb-2">Minor Divisions per Major</label>
                <input
                  className="w-24 bg-gray-700 text-white rounded px-2 py-1 outline-none font-mono"
                  type="number"
                  min="1"
                  max="50"
                  step="1"
                  value={settings.gridMinorDivisions}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v >= 1) drawingStore.updateSettings({ gridMinorDivisions: Math.max(1, Math.min(50, v)) });
                  }}
                />
                <p className="text-gray-500 mt-1">Number of minor grid subdivisions per major interval. 10 = 1/10th of major spacing.</p>
              </div>
            </div>
          )}

          {/* ── Snap ──────────────────────────────────────────────────────────── */}
          {activeTab === 'Snap' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white font-medium">Snap Enabled</div>
                  <div className="text-gray-500">Snap cursor to geometric points (F3 to toggle)</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={settings.snapEnabled}
                    onChange={() => drawingStore.updateSettings({ snapEnabled: !settings.snapEnabled })}
                  />
                  <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                </label>
              </div>

              <div className="border-t border-gray-700 pt-3">
                <label className="block text-gray-400 mb-1">Snap Radius (screen pixels)</label>
                <input
                  className="w-24 bg-gray-700 text-white rounded px-2 py-1 outline-none font-mono"
                  type="number"
                  min="5"
                  max="50"
                  step="1"
                  value={settings.snapRadius}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v)) drawingStore.updateSettings({ snapRadius: Math.max(5, Math.min(50, v)) });
                  }}
                />
                <p className="text-gray-500 mt-1">How many screen pixels from cursor to activate a snap point.</p>
              </div>

              <div className="border-t border-gray-700 pt-3">
                <div className="text-gray-400 mb-2">Active Snap Types</div>
                <div className="space-y-2">
                  {ALL_SNAP_TYPES.map(({ type, label, description }) => (
                    <label key={type} className="flex items-start gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-blue-500"
                        checked={settings.snapTypes.includes(type)}
                        onChange={() => toggleSnapType(type)}
                      />
                      <div>
                        <span className="text-white group-hover:text-blue-300 transition-colors">{label}</span>
                        <p className="text-gray-500 text-[10px]">{description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Document ─────────────────────────────────────────────────────── */}
          {activeTab === 'Document' && (
            <div className="space-y-3">
              <div>
                <label className="block text-gray-400 mb-1">Document Name</label>
                <input
                  className="w-full bg-gray-700 text-white rounded px-2 py-1 outline-none"
                  value={drawingStore.document.name}
                  onChange={(e) => drawingStore.updateDocumentName(e.target.value)}
                />
              </div>

              <div className="border-t border-gray-700 pt-3">
                <label className="block text-gray-400 mb-1">Author</label>
                <input
                  className="w-full bg-gray-700 text-white rounded px-2 py-1 outline-none"
                  value={drawingStore.document.author}
                  onChange={(e) => drawingStore.updateDocumentAuthor(e.target.value)}
                />
              </div>

              <div className="border-t border-gray-700 pt-3">
                <label className="block text-gray-400 mb-1">Paper Size</label>
                <select
                  className="w-full bg-gray-700 text-white rounded px-2 py-1 outline-none"
                  value={settings.paperSize}
                  onChange={(e) =>
                    drawingStore.updateSettings({
                      paperSize: e.target.value as typeof settings.paperSize,
                    })
                  }
                >
                  <option value="LETTER">Letter (8.5″ × 11″)</option>
                  <option value="TABLOID">Tabloid (11″ × 17″)</option>
                  <option value="ARCH_C">Arch C (18″ × 24″)</option>
                  <option value="ARCH_D">Arch D (24″ × 36″)</option>
                  <option value="ARCH_E">Arch E (36″ × 48″)</option>
                </select>
              </div>

              <div className="border-t border-gray-700 pt-3">
                <label className="block text-gray-400 mb-1">Orientation</label>
                <div className="flex gap-2">
                  {(['PORTRAIT', 'LANDSCAPE'] as const).map((o) => (
                    <button
                      key={o}
                      className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors ${
                        settings.paperOrientation === o
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                      }`}
                      onClick={() => drawingStore.updateSettings({ paperOrientation: o })}
                    >
                      {o === 'PORTRAIT' ? '📄 Portrait' : '📄 Landscape'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-700 pt-3 text-gray-500 text-[10px] space-y-0.5">
                <div>Created: {new Date(drawingStore.document.created).toLocaleString()}</div>
                <div>Modified: {new Date(drawingStore.document.modified).toLocaleString()}</div>
                <div>ID: <span className="font-mono">{drawingStore.document.id.slice(0, 8)}…</span></div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-700 text-gray-500 text-[10px] shrink-0 flex justify-between items-center">
          <span>Changes apply immediately — no save required</span>
          <button
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors text-xs"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
