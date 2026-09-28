'use client';
// app/admin/components/files/SelectionControls.tsx — the checkbox on each file, "Select all", and
// the bar that appears once something is selected: "3 selected · Delete · Download · Clear".
// Owner, 2026-09-27. Real <input type="checkbox">es, so keyboard (Space) and screen readers work
// with no extra wiring; the hit area is 44 px on touch screens (see DeleteFiles.css).

import { useEffect, useRef } from 'react';
import { Download, Trash2, X } from 'lucide-react';
import type { FileSelection } from './useFileSelection';
import './DeleteFiles.css';

export function FileCheckbox({ id, name, selection, className }: {
  id: string;
  name: string;
  selection: FileSelection;
  className?: string;
}) {
  return (
    <label className={`fsel__check${className ? ` ${className}` : ''}`} onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={selection.isSelected(id)}
        // onClick (not onChange) carries shiftKey; onChange is a no-op to keep React quiet.
        onClick={(e) => selection.onCheck(id, e)}
        onChange={() => {}}
        aria-label={`Select ${name}`}
        data-testid={`fsel-check-${id}`}
      />
    </label>
  );
}

export function SelectAllCheckbox({ selection, total, label = 'Select all' }: { selection: FileSelection; total: number; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selection.all === 'some';
  }, [selection.all]);
  if (total === 0) return null;
  return (
    <label className="fsel__all">
      <span className="fsel__check">
        <input
          ref={ref}
          type="checkbox"
          checked={selection.all === 'all'}
          onChange={selection.toggleAll}
          aria-label={`${label} (${total})`}
          data-testid="fsel-all"
        />
      </span>
      <span>{label}</span>
    </label>
  );
}

export function SelectionBar({ selection, onDelete, onDownload, deleteDisabledReason, busy }: {
  selection: FileSelection;
  onDelete: () => void;
  onDownload?: () => void;
  /** When set, Delete is disabled and this says why (e.g. none of the selected can be deleted here). */
  deleteDisabledReason?: string | null;
  busy?: boolean;
}) {
  if (selection.count === 0) return null;
  return (
    <div className="fsel__bar" role="toolbar" aria-label="Selected files" data-testid="fsel-bar">
      <span className="fsel__count" aria-live="polite">{selection.count} selected</span>
      <button
        type="button"
        className="fsel__btn fsel__btn--danger"
        onClick={onDelete}
        disabled={busy || Boolean(deleteDisabledReason)}
        title={deleteDisabledReason ?? 'Delete the selected files'}
        data-testid="fsel-delete"
      >
        <Trash2 size={15} aria-hidden="true" /> Delete
      </button>
      {onDownload && (
        <button type="button" className="fsel__btn" onClick={onDownload} disabled={busy} data-testid="fsel-download">
          <Download size={15} aria-hidden="true" /> Download
        </button>
      )}
      <button type="button" className="fsel__btn" onClick={selection.clear} disabled={busy} data-testid="fsel-clear">
        <X size={15} aria-hidden="true" /> Clear
      </button>
    </div>
  );
}
