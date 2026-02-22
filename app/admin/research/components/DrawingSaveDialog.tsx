// app/admin/research/components/DrawingSaveDialog.tsx — Save/export drawing dialog
'use client';

import { useEffect, useState } from 'react';

interface DrawingSaveDialogProps {
  isOpen: boolean;
  mode: 'save' | 'export';
  currentName: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}

export default function DrawingSaveDialog({
  isOpen,
  mode,
  currentName,
  onSave,
  onCancel,
}: DrawingSaveDialogProps) {
  const [name, setName] = useState(currentName);

  // Sync internal state when currentName prop changes (e.g., switching drawings)
  useEffect(() => {
    setName(currentName);
  }, [currentName]);

  if (!isOpen) return null;

  const isValid = name.trim().length > 0;

  return (
    <div
      className="research-save-dialog__overlay"
      onClick={onCancel}
      onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'save' ? 'Save Drawing' : 'Export Drawing'}
    >
      <div className="research-save-dialog" onClick={e => e.stopPropagation()}>
        <h3 className="research-save-dialog__title">
          {mode === 'save' ? 'Save Drawing' : 'Export Drawing'}
        </h3>

        <div className="research-save-dialog__field">
          <label className="research-save-dialog__label" htmlFor="drawing-name-input">
            {mode === 'save' ? 'Drawing Name' : 'File Name'}
          </label>
          <input
            id="drawing-name-input"
            type="text"
            className="research-save-dialog__input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Enter a name..."
            autoFocus
            aria-label={mode === 'save' ? 'Drawing name' : 'File name'}
            onKeyDown={e => {
              if (e.key === 'Enter' && isValid) onSave(name.trim());
              if (e.key === 'Escape') onCancel();
            }}
          />
          {!isValid && name.length > 0 && (
            <p className="research-save-dialog__error">Name cannot be blank</p>
          )}
        </div>

        {mode === 'save' && (
          <p className="research-save-dialog__hint">
            This saves the current drawing state including all elements,
            annotations, and style changes to the project database.
          </p>
        )}

        {mode === 'export' && (
          <p className="research-save-dialog__hint">
            This exports the full drawing data as a JSON file you can re-import
            later. Includes all geometry, styling, annotations, and confidence data.
          </p>
        )}

        <div className="research-save-dialog__actions">
          <button className="research-save-dialog__cancel-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="research-save-dialog__save-btn"
            onClick={() => isValid && onSave(name.trim())}
            disabled={!isValid}
          >
            {mode === 'save' ? 'Save' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
