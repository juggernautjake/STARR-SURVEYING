// app/admin/roles/custom/CustomRoleBuilderClient.tsx
//
// Slice W7 — client surface for the role builder. Server
// component reads the initial list, this component handles the
// create form + the list re-render after success.

'use client';

import { useState } from 'react';
import { slugifyRoleKey } from '@/lib/admin/role-builder';

interface CustomRole {
  id: string;
  key: string;
  label: string;
  description: string | null;
  permissions: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export default function CustomRoleBuilderClient({ initialRoles }: { initialRoles: CustomRole[] }) {
  const [roles, setRoles] = useState<CustomRole[]>(initialRoles);
  const [draft, setDraft] = useState<{ label: string; key: string; description: string; permissions: string }>({
    label: '',
    key: '',
    description: '',
    permissions: '{}',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live-preview slug from the label when the key field is empty.
  const slug = draft.key.trim() || slugifyRoleKey(draft.label) || '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <form
        data-testid="admin-role-builder-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          let permissions: Record<string, unknown> = {};
          try {
            const parsed = JSON.parse(draft.permissions || '{}') as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              permissions = parsed as Record<string, unknown>;
            } else {
              throw new Error('permissions must be a JSON object');
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Invalid JSON.');
            return;
          }
          setSaving(true);
          try {
            const res = await fetch('/api/admin/roles/custom', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                label: draft.label,
                key: draft.key || undefined,
                description: draft.description || undefined,
                permissions,
              }),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({})) as { error?: string };
              throw new Error(data.error ?? `HTTP ${res.status}`);
            }
            const data = await res.json() as { role: CustomRole };
            setRoles((cur) => [data.role, ...cur]);
            setDraft({ label: '', key: '', description: '', permissions: '{}' });
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save.');
          } finally {
            setSaving(false);
          }
        }}
        style={{
          padding: '1rem',
          border: '1px solid #E5E7EB',
          borderRadius: 8,
          background: '#FAFBFF',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <strong style={{ fontSize: '0.95rem' }}>New role</strong>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>Label</span>
          <input
            type="text"
            data-testid="admin-role-builder-label"
            value={draft.label}
            placeholder="Dispatcher Lead"
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            required
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>
            Key <span style={{ fontWeight: 400, color: '#6B7280' }}>(optional — auto-slugged from label)</span>
          </span>
          <input
            type="text"
            data-testid="admin-role-builder-key"
            value={draft.key}
            placeholder={slug || 'dispatcher_lead'}
            onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>Description</span>
          <input
            type="text"
            data-testid="admin-role-builder-description"
            value={draft.description}
            placeholder="What does this role do?"
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>
            Permissions <span style={{ fontWeight: 400, color: '#6B7280' }}>(JSON object)</span>
          </span>
          <textarea
            data-testid="admin-role-builder-permissions"
            value={draft.permissions}
            rows={3}
            spellCheck={false}
            onChange={(e) => setDraft((d) => ({ ...d, permissions: e.target.value }))}
            style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
          />
        </label>
        {error && (
          <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.78rem', margin: 0 }}>{error}</p>
        )}
        <div>
          <button
            type="submit"
            disabled={saving || !draft.label.trim()}
            className="admin-btn admin-btn--primary admin-btn--sm"
            data-testid="admin-role-builder-submit"
          >
            {saving ? 'Saving…' : 'Create role'}
          </button>
        </div>
      </form>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
        <table data-testid="admin-role-builder-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFBFF', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Key</th>
              <th style={{ padding: '0.5rem' }}>Label</th>
              <th style={{ padding: '0.5rem' }}>Description</th>
              <th style={{ padding: '0.5rem' }}>Created by</th>
            </tr>
          </thead>
          <tbody>
            {roles.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '0.75rem', color: '#6B7280', textAlign: 'center' }}>
                  No custom roles yet — add one above.
                </td>
              </tr>
            ) : (
              roles.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{r.key}</td>
                  <td style={{ padding: '0.5rem' }}>{r.label}</td>
                  <td style={{ padding: '0.5rem', color: '#374151' }}>{r.description ?? '—'}</td>
                  <td style={{ padding: '0.5rem', color: '#6B7280' }}>{r.created_by ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
