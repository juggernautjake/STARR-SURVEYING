'use client';
// app/admin/cad/components/NewDrawingDialog.tsx
// Startup dialog: user chooses paper size and creates a blank drawing
// or goes straight to importing survey data.

import { useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { useDrawingStore } from '@/lib/cad/store';
import { generateId } from '@/lib/cad/types';

interface Props {
  onClose: () => void;
  onImport: () => void; // Opens the survey-data import wizard
}

const PAPER_SIZES = [
  { value: 'LETTER',  label: 'Letter',   desc: '8.5 × 11 in' },
  { value: 'TABLOID', label: 'Tabloid',  desc: '11 × 17 in'  },
  { value: 'ARCH_C',  label: 'Arch C',   desc: '18 × 24 in'  },
  { value: 'ARCH_D',  label: 'Arch D',   desc: '24 × 36 in'  },
  { value: 'ARCH_E',  label: 'Arch E',   desc: '36 × 48 in'  },
] as const;

type PaperSize = (typeof PAPER_SIZES)[number]['value'];

export default function NewDrawingDialog({ onClose, onImport }: Props) {
  const drawingStore = useDrawingStore();
  const [drawingName, setDrawingName] = useState('Untitled Drawing');
  const [paperSize, setPaperSize] = useState<PaperSize>('TABLOID');
  const [orientation, setOrientation] = useState<'PORTRAIT' | 'LANDSCAPE'>('LANDSCAPE');
  const [scale, setScale] = useState(50);

  function handleCreate() {
    // Reset to blank document
    drawingStore.newDocument();
    drawingStore.updateDocumentName(drawingName.trim() || 'Untitled Drawing');
    drawingStore.updateSettings({ paperSize, paperOrientation: orientation, drawingScale: scale });

    // Add one default layer so drawing can start immediately
    const layerId = generateId();
    drawingStore.addLayer({
      id: layerId,
      name: 'Layer 0',
      visible: true,
      locked: false,
      frozen: false,
      color: '#000000',
      lineWeight: 0.25,
      lineTypeId: 'SOLID',
      opacity: 1,
      groupId: null,
      sortOrder: 0,
      isDefault: false,
      isProtected: false,
      autoAssignCodes: [],
    });
    drawingStore.setActiveLayer(layerId);

    onClose();
    setTimeout(() => window.dispatchEvent(new CustomEvent('cad:zoomExtents')), 200);
  }

  function handleImport() {
    // Reset to blank then open import wizard
    drawingStore.newDocument();
    onClose();
    onImport();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg text-sm text-gray-200">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-700">
          <h1 className="text-xl font-bold text-white">STARR CAD</h1>
          <p className="text-gray-400 text-xs mt-1">
            Start a new drawing or import existing survey data.
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Drawing name */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">Drawing Name</label>
            <input
              type="text"
              value={drawingName}
              onChange={(e) => setDrawingName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-3 py-1.5 outline-none focus:border-blue-500"
              placeholder="Untitled Drawing"
            />
          </div>

          {/* Paper size */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">Paper Size</label>
            <div className="grid grid-cols-5 gap-1.5">
              {PAPER_SIZES.map((ps) => (
                <button
                  key={ps.value}
                  onClick={() => setPaperSize(ps.value)}
                  className={`flex flex-col items-center py-2 px-1 rounded border text-center transition-colors
                    ${paperSize === ps.value
                      ? 'bg-blue-700 border-blue-500 text-white'
                      : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-white'}`}
                >
                  <span className="text-xs font-semibold">{ps.label}</span>
                  <span className="text-[10px] text-gray-500 mt-0.5 leading-tight">{ps.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Orientation + Scale */}
          <div className="flex gap-6">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Orientation</label>
              <div className="flex gap-2">
                {(['LANDSCAPE', 'PORTRAIT'] as const).map((o) => (
                  <button
                    key={o}
                    onClick={() => setOrientation(o)}
                    className={`px-3 py-1 text-xs rounded border transition-colors
                      ${orientation === o
                        ? 'bg-blue-700 border-blue-500 text-white'
                        : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'}`}
                  >
                    {o === 'LANDSCAPE' ? '⬛ Landscape' : '📄 Portrait'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Drawing Scale (1″ =)</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={scale}
                  onChange={(e) => setScale(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-1 outline-none focus:border-blue-500 font-mono text-center"
                />
                <span className="text-gray-500 text-xs">feet</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-2 flex gap-3">
          <button
            onClick={handleCreate}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <FileText size={16} />
            Create New Drawing
          </button>
          <button
            onClick={handleImport}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Upload size={16} />
            Import Survey Data
          </button>
        </div>
      </div>
    </div>
  );
}
