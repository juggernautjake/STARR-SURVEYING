// app/admin/components/jobs/InlineEditField.tsx — click-to-edit field
// JOB_WORKSPACE_BUILDOUT slice D.
//
// Renders a value as static text with a subtle edit affordance; click
// to edit inline. Enter (or blur) saves via onSave; Esc cancels.
// `onSave` returns a Promise so the field can show a saving/za error
// state and roll back on failure.
'use client';
import { useEffect, useRef, useState } from 'react';

type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'tel' | 'email';

interface Props {
  value: string | number | null | undefined;
  onSave: (value: string) => Promise<void>;
  type?: FieldType;
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** Text shown when value is empty (e.g. "Add address"). */
  emptyLabel?: string;
  /** Render prefix/suffix around the static display (e.g. "$"). */
  display?: (v: string) => React.ReactNode;
  ariaLabel?: string;
}

export default function InlineEditField({
  value, onSave, type = 'text', options, placeholder, emptyLabel = 'Add…', display, ariaLabel,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);

  const current = value === null || value === undefined ? '' : String(value);

  useEffect(() => {
    if (!editing) return undefined;
    setDraft(current);
    // focus on next tick
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  async function commit() {
    if (draft === current) { setEditing(false); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
    setSaving(false);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  if (!editing) {
    return (
      <span
        className={`inline-edit ${current ? '' : 'inline-edit--empty'}`}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel ? `Edit ${ariaLabel}` : 'Edit'}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(true); } }}
        title="Click to edit"
      >
        {current ? (display ? display(current) : current) : emptyLabel}
        <span className="inline-edit__pencil" aria-hidden="true"> ✎</span>
      </span>
    );
  }

  const commonProps = {
    ref: inputRef as never,
    value: draft,
    disabled: saving,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setDraft(e.target.value),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
      if (e.key === 'Enter' && type !== 'textarea') { e.preventDefault(); commit(); }
    },
    onBlur: () => { if (type !== 'select') commit(); },
    className: 'inline-edit__input',
  };

  return (
    <span className="inline-edit inline-edit--active">
      {type === 'textarea' ? (
        <textarea {...commonProps} placeholder={placeholder} rows={3} />
      ) : type === 'select' ? (
        <select {...commonProps} onBlur={undefined} onChange={(e) => { setDraft(e.target.value); }} >
          {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input {...commonProps} type={type} placeholder={placeholder} />
      )}
      {type === 'select' || type === 'textarea' ? (
        <span className="inline-edit__actions">
          <button type="button" className="inline-edit__btn inline-edit__btn--save" disabled={saving} onMouseDown={(e) => { e.preventDefault(); commit(); }}>Save</button>
          <button type="button" className="inline-edit__btn" disabled={saving} onMouseDown={(e) => { e.preventDefault(); cancel(); }}>Cancel</button>
        </span>
      ) : null}
      {saving && <span className="inline-edit__status"> saving…</span>}
      {error && <span className="inline-edit__error" role="alert"> {error}</span>}
    </span>
  );
}
