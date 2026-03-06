'use client';
// app/admin/cad/components/DrawingRotationDialog.tsx
// Dialog for rotating the drawing view (visual only — does not alter survey data).

import { useState, useCallback } from 'react';
import { X, RotateCcw, RotateCw, Compass, RefreshCw } from 'lucide-react';
import { useDrawingStore } from '@/lib/cad/store';
import Tooltip from './Tooltip';

interface Props {
  onClose: () => void;
}

const QUICK_ANGLES = [0, 15, 30, 45, 60, 90, 180, 270];

export default function DrawingRotationDialog({ onClose }: Props) {
  const drawingStore = useDrawingStore();
  const currentDeg = drawingStore.document.settings.drawingRotationDeg ?? 0;
  const [inputVal, setInputVal] = useState(String(currentDeg));

  const parsedDeg = parseFloat(inputVal);
  const isValid = !isNaN(parsedDeg) && isFinite(parsedDeg);
  const normalised = isValid ? ((parsedDeg % 360) + 360) % 360 : currentDeg;

  const apply = useCallback(
    (deg: number) => {
      const clamped = ((deg % 360) + 360) % 360;
      drawingStore.updateSettings({ drawingRotationDeg: clamped });
      setInputVal(String(Math.round(clamped * 1000) / 1000));
    },
    [drawingStore],
  );

  function handleApply() {
    if (!isValid) return;
    apply(parsedDeg);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl w-[420px] text-sm text-gray-200 overflow-hidden animate-[scaleIn_180ms_cubic-bezier(0.16,1,0.3,1)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-600 bg-gray-750">
          <div className="flex items-center gap-2">
            <Compass size={16} className="text-blue-400" />
            <h2 className="font-semibold text-white">Rotate Drawing View</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          <p className="text-xs text-gray-400 leading-relaxed">
            Rotates the visual presentation of the entire drawing on the paper.
            Survey data (bearings, distances, coordinates) is <strong className="text-gray-200">never changed</strong> — only the view orientation shifts.
            The north arrow automatically compensates to always indicate true north.
          </p>

          {/* Angle input */}
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">Rotation Angle (degrees, clockwise)</label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                min="-360"
                max="360"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleApply(); }}
                className="flex-1 bg-gray-700 border border-gray-500 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-400"
                placeholder="0"
              />
              <Tooltip label="Rotate 1° counter-clockwise">
                <button
                  onClick={() => { apply(normalised - 1); setInputVal(String(((normalised - 1 + 360) % 360))); }}
                  className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300 hover:text-white transition-colors"
                >
                  <RotateCcw size={15} />
                </button>
              </Tooltip>
              <Tooltip label="Rotate 1° clockwise">
                <button
                  onClick={() => { apply(normalised + 1); setInputVal(String((normalised + 1) % 360)); }}
                  className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300 hover:text-white transition-colors"
                >
                  <RotateCw size={15} />
                </button>
              </Tooltip>
            </div>
            {!isValid && inputVal !== '' && (
              <p className="text-xs text-red-400">Enter a valid number.</p>
            )}
          </div>

          {/* Quick angles */}
          <div className="space-y-1">
            <p className="text-xs text-gray-400 font-medium">Quick angles</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ANGLES.map((a) => (
                <button
                  key={a}
                  onClick={() => { apply(a); setInputVal(String(a)); }}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    Math.abs(normalised - a) < 0.01
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white'
                  }`}
                >
                  {a}°
                </button>
              ))}
            </div>
          </div>

          {/* Current value indicator */}
          <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-700/50 rounded p-2">
            <Compass size={13} className="text-blue-400 flex-shrink-0" />
            <span>
              Current view rotation:{' '}
              <span className="text-white font-medium">{Math.round(currentDeg * 100) / 100}°</span>
              {currentDeg !== 0 && (
                <span className="text-gray-500">
                  {' '}(north arrow offset by {Math.round(currentDeg * 100) / 100}°)
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-between px-4 py-3 border-t border-gray-600">
          <Tooltip label="Reset rotation to 0° (standard orientation)">
            <button
              onClick={() => { apply(0); setInputVal('0'); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded transition-colors"
            >
              <RefreshCw size={13} />
              Reset
            </button>
          </Tooltip>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 rounded transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => { handleApply(); onClose(); }}
              disabled={!isValid}
              className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
