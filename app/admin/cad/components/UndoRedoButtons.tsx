'use client';
// app/admin/cad/components/UndoRedoButtons.tsx — Phase 8 §8
// Toolbar Undo / Redo buttons. Mirrors the Edit-menu actions
// but lives at the top of the canvas so the user has a
// glance-and-click affordance without diving into a menu.
// Tooltips surface the next undo / redo description (e.g.
// "Undo Move Feature") so the user knows what they're about
// to reverse before clicking.

import { useUndoStore } from '@/lib/cad/store';
import Tooltip from './Tooltip';

export default function UndoRedoButtons() {
  const undoStore = useUndoStore();
  const canUndo = undoStore.canUndo();
  const canRedo = undoStore.canRedo();
  const undoDesc = undoStore.undoDescription();
  const redoDesc = undoStore.redoDescription();

  return (
    <div
      className="flex items-center gap-1 px-2 border-r border-gray-700 min-h-[40px]"
      style={{ backgroundColor: '#1a1f2e' }}
    >
      <Tooltip
        label={undoDesc ? `Undo ${undoDesc}` : 'Undo'}
        description={undoDesc ? 'Reverts the most recent edit.' : 'Nothing to undo.'}
        shortcut="Ctrl+Z"
        side="bottom"
        delay={400}
        disabled={!canUndo && !undoDesc}
      >
        <button
          type="button"
          aria-label={undoDesc ? `Undo ${undoDesc}` : 'Undo'}
          className={`flex items-center justify-center w-7 h-7 rounded border transition-colors
            ${canUndo
              ? 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600 hover:text-white'
              : 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed opacity-50'}`}
          onClick={() => { if (canUndo) undoStore.undo(); }}
          disabled={!canUndo}
        >
          <UndoIcon />
        </button>
      </Tooltip>
      <Tooltip
        label={redoDesc ? `Redo ${redoDesc}` : 'Redo'}
        description={redoDesc ? 'Reapplies the last undone edit.' : 'Nothing to redo.'}
        shortcut="Ctrl+Y"
        side="bottom"
        delay={400}
        disabled={!canRedo && !redoDesc}
      >
        <button
          type="button"
          aria-label={redoDesc ? `Redo ${redoDesc}` : 'Redo'}
          className={`flex items-center justify-center w-7 h-7 rounded border transition-colors
            ${canRedo
              ? 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600 hover:text-white'
              : 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed opacity-50'}`}
          onClick={() => { if (canRedo) undoStore.redo(); }}
          disabled={!canRedo}
        >
          <RedoIcon />
        </button>
      </Tooltip>
    </div>
  );
}

function UndoIcon() {
  // Curved arrow, head pointing left — represents reverting the most recent action.
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h7a3 3 0 0 1 0 6H6" />
      <polyline points="6 5 3 8 6 11" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 8H6a3 3 0 0 0 0 6h4" />
      <polyline points="10 5 13 8 10 11" />
    </svg>
  );
}
