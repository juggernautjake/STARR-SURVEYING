// app/admin/research/components/DrawingSaveDialog.tsx — Save/export drawing dialog
'use client';

import { useState } from 'react';

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

  if (!isOpen) return null;

  return (
    <div className="research-save-dialog__overlay" onClick={onCancel}>
      <div className="research-save-dialog" onClick={e => e.stopPropagation()}>
        <h3 className="research-save-dialog__title">
          {mode === 'save' ? 'Save Drawing' : 'Export Drawing'}
        </h3>

        <div className="research-save-dialog__field">
          <label className="research-save-dialog__label">
            {mode === 'save' ? 'Drawing Name' : 'File Name'}
          </label>
          <input
            type="text"
            className="research-save-dialog__input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Enter a name..."
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter' && name.trim()) onSave(name.trim());
              if (e.key === 'Escape') onCancel();
            }}
          />
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
            onClick={() => name.trim() && onSave(name.trim())}
            disabled={!name.trim()}
          >
            {mode === 'save' ? 'Save' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
