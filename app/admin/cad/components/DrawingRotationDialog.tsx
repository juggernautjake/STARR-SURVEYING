'use client';
// app/admin/cad/components/DrawingRotationDialog.tsx
// Dialog for rotating the drawing view (visual only — does not alter survey data).

import { useCallback, useRef, useState } from 'react';
import { X, RotateCcw, RotateCw, Compass, RefreshCw } from 'lucide-react';
import { useDrawingStore } from '@/lib/cad/store';
import Tooltip from './Tooltip';
import UnitInput from './UnitInput';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface Props {
  onClose: () => void;
}

const QUICK_ANGLES = [0, 15, 30, 45, 60, 90, 180, 270];

export default function DrawingRotationDialog({ onClose }: Props) {
  useEscapeToClose(onClose);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  const drawingStore = useDrawingStore();
  const currentDeg = drawingStore.document.settings.drawingRotationDeg ?? 0;
  // Live azimuth tracked here; UnitInput parses + canonicalises before
  // surfacing the value through onChange.
  const [draftDeg, setDraftDeg] = useState(currentDeg);
  const normalized = ((draftDeg % 360) + 360) % 360;

  const apply = useCallback(
    (deg: number) => {
      const clamped = ((deg % 360) + 360) % 360;
      drawingStore.updateSettings({ drawingRotationDeg: clamped });
      setDraftDeg(clamped);
    },
    [drawingStore],
  );

  function handleApply() {
    apply(draftDeg);
  }

  return (
    <div ref={dialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
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

          {/* Angle input — UnitInput accepts decimal degrees, DMS-packed
              (45.3000 = 45°30'00"), DMS markers, hyphen-DMS, or quadrant
              bearings. Internally always stored as decimal-degree azimuth. */}
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">Rotation Angle (clockwise)</label>
            <div className="flex gap-2 items-stretch">
              <div className="flex-1">
                <UnitInput
                  kind="angle"
                  angleMode="AZIMUTH"
                  value={draftDeg}
                  onChange={(v) => setDraftDeg(v)}
                  description={'Accepts decimal degrees (45.5), DMS-packed (45.3000 = 45°30\'00"), DMS markers (45°30\'), or hyphen-DMS (45-30-00).'}
                  showUnitDropdown={false}
                />
              </div>
              <Tooltip label="Rotate 1° counter-clockwise">
                <button
                  onClick={() => apply(normalized - 1)}
                  className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300 hover:text-white transition-colors"
                >
                  <RotateCcw size={15} />
                </button>
              </Tooltip>
              <Tooltip label="Rotate 1° clockwise">
                <button
                  onClick={() => apply(normalized + 1)}
                  className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300 hover:text-white transition-colors"
                >
                  <RotateCw size={15} />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Quick angles */}
          <div className="space-y-1">
            <p className="text-xs text-gray-400 font-medium">Quick angles</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ANGLES.map((a) => (
                <button
                  key={a}
                  onClick={() => apply(a)}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    Math.abs(normalized - a) < 0.01
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
              onClick={() => apply(0)}
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
              className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
