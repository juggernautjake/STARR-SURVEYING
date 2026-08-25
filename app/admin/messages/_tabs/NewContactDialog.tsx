// app/admin/contacts/NewContactDialog.tsx
//
// contacts plan Slice 3 — modal form for creating a contact from the
// list page. Posts to POST /api/admin/contacts; on success the parent
// navigates to the new profile so the surveyor can add the rest of
// the details inline.
//
// Labels picker: catalog-known labels render as toggle chips; the
// surveyor can also free-form add a custom label via the "Add label"
// input (sanitized by normalizeLabel server-side).

'use client';

import { useState, useCallback } from 'react';
import ModalFrame from '@/app/admin/components/ui/ModalFrame';
import { CONTACT_LABELS, findContactLabel, normalizeLabel } from '@/lib/contacts/labels';

interface CreatedContact {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (contact: CreatedContact) => void;
}

export default function NewContactDialog({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [customLabel, setCustomLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleLabel = useCallback((id: string) => {
    setLabels((cur) => (cur.includes(id) ? cur.filter((l) => l !== id) : [...cur, id]));
  }, []);

  const addCustomLabel = useCallback(() => {
    const key = normalizeLabel(customLabel);
    if (!key) return;
    setLabels((cur) => (cur.includes(key) ? cur : [...cur, key]));
    setCustomLabel('');
  }, [customLabel]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    if (!name.trim()) { setError('Name is required.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          company: company.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          labels,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data: { contact: { id: string; name: string } } = await res.json();
      onCreated({ id: data.contact.id, name: data.contact.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create the contact.');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, name, company, email, phone, labels, onCreated]);

  if (!open) return null;

  return (
    <ModalFrame open={open} onClose={onClose} title="New contact">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 360, maxWidth: 520 }}>
        <Field label="Name (required)">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Realtor"
            style={inputStyle}
            disabled={submitting}
          />
        </Field>
        <Field label="Company">
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Acme Realty"
            style={inputStyle}
            disabled={submitting}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            style={inputStyle}
            disabled={submitting}
          />
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            style={inputStyle}
            disabled={submitting}
          />
        </Field>

        <div>
          <div style={labelStyle}>Labels</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {CONTACT_LABELS.map((l) => {
              const active = labels.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggleLabel(l.id)}
                  style={active ? activeChipStyle : chipStyle}
                  title={l.description}
                  disabled={submitting}
                >
                  {l.label}
                </button>
              );
            })}
            {/* Custom labels the catalog doesn't know about (e.g.
                "realtor") stay attached as plain chips. */}
            {labels.filter((id) => !findContactLabel(id)).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => toggleLabel(id)}
                style={activeChipStyle}
                title={`Custom label "${id}" — click to remove`}
                disabled={submitting}
              >
                {id} ×
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomLabel(); } }}
              placeholder="Add a custom label (e.g. realtor, partner-firm)"
              style={{ ...inputStyle, fontSize: '0.85rem' }}
              disabled={submitting}
            />
            <button type="button" onClick={addCustomLabel} style={secondaryButtonStyle} disabled={submitting}>
              Add
            </button>
          </div>
        </div>

        {error && (<div role="alert" style={errorStyle}>{error}</div>)}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={secondaryButtonStyle} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            style={primaryButtonStyle}
            disabled={submitting || !name.trim()}
          >
            {submitting ? 'Creating…' : 'Create contact'}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.85rem', fontWeight: 600, marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-surface)',
  color: 'var(--theme-fg-primary)',
  fontSize: '0.9rem',
};
const chipStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid var(--theme-border, #e5e7eb)',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: '0.8rem',
};
const activeChipStyle: React.CSSProperties = {
  ...chipStyle,
  background: 'var(--theme-accent, #3b82f6)',
  color: 'var(--theme-accent-fg, white)',
  borderColor: 'var(--theme-accent, #3b82f6)',
};
const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid var(--theme-accent, #3b82f6)',
  background: 'var(--theme-accent, #3b82f6)',
  color: 'var(--theme-accent-fg, white)',
  cursor: 'pointer',
  fontSize: '0.9rem',
  fontWeight: 600,
};
const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--theme-border, #e5e7eb)',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: '0.9rem',
};
const errorStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  background: 'color-mix(in srgb, var(--theme-danger) 12%, var(--theme-bg-surface))',
  border: '1px solid var(--theme-danger)',
  color: 'var(--theme-danger)',
  fontSize: '0.85rem',
};
