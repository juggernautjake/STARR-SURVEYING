'use client';
// app/admin/cad/components/RenameConfirmDialog.tsx
//
// Guarded point-name change (plan §10.3/§10.4). Warns about the blast
// radius (linework references, exports), offers a safer "duplicate with
// the new name" alternative, lets the user proceed anyway, and can
// remember the choice so power users renaming many points aren't nagged.
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md §10

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useExitTransition } from '../hooks/useExitTransition';

export interface RenameDialogData {
  featureId: string;
  oldName: string;
  newName: string;
  /** # of linework features referencing the point. */
  referenceCount: number;
  /** cross-layer derivative names (e.g. "255:1"). */
  derivatives: string[];
  /** true when newName collides with an existing point. */
  nameTaken: boolean;
}

export default function RenameConfirmDialog({
  data,
  onChoose,
  onCancel,
}: {
  data: RenameDialogData;
  onChoose: (strategy: 'RENAME' | 'DUPLICATE', remember: boolean) => void;
  onCancel: () => void;
}) {
  const [remember, setRemember] = useState(false);
  const { closing, requestClose } = useExitTransition(onCancel);
  const { oldName, newName, referenceCount, derivatives, nameTaken } = data;

  return (
    <div className={`fixed inset-0 z-[120] flex items-center justify-center bg-black/60 ${closing ? 'opacity-0 transition-opacity duration-150' : 'animate-[fadeIn_150ms_ease-out] motion-reduce:animate-none'}`}>
      <div className={`bg-gray-800 border border-gray-600 rounded-lg shadow-2xl w-full max-w-md text-sm text-gray-200 ${closing ? 'opacity-0 scale-95 transition-all duration-150' : 'animate-[scaleIn_180ms_cubic-bezier(0.16,1,0.3,1)] motion-reduce:animate-none'}`}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-700">
          <AlertTriangle size={18} className="text-amber-400" />
          <h2 className="font-semibold text-white">Change point name?</h2>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p>
            Rename point <strong className="text-white">{oldName || '(unnamed)'}</strong> →{' '}
            <strong className="text-white">{newName}</strong>?
          </p>

          {nameTaken && (
            <p className="text-amber-300 bg-amber-950/40 border border-amber-800 rounded px-2 py-1.5">
              ⚠ A point named <strong>{newName}</strong> already exists. Renaming in place would
              create a duplicate name — consider a different name, or use “Duplicate”.
            </p>
          )}

          <ul className="text-xs text-gray-400 list-disc pl-5 space-y-1">
            <li>
              {referenceCount > 0
                ? `${referenceCount} line/shape feature(s) reference this point and will be updated to match.`
                : 'No linework references this point.'}
            </li>
            {derivatives.length > 0 && (
              <li>Cross-layer copies ({derivatives.join(', ')}) will be re-based to the new name.</li>
            )}
            <li>Exports (CSV/DXF/LandXML) key on the point name, so delivered files will use the new value.</li>
          </ul>

          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="accent-blue-500"
            />
            Remember my choice for future point-name changes
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-700">
          <button
            type="button"
            onClick={requestClose}
            className="px-3 py-1.5 text-gray-300 hover:bg-gray-700 rounded"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onChoose('DUPLICATE', remember)}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded"
            title="Create a new point with the new name, leaving the original and its references intact"
          >
            Duplicate instead
          </button>
          <button
            type="button"
            onClick={() => onChoose('RENAME', remember)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium"
          >
            Rename everywhere
          </button>
        </div>
      </div>
    </div>
  );
}
