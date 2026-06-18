// app/admin/employees/[email]/AdminPersonalInfoEditor.tsx
//
// Slice EP7b — client component that lets admins edit ANOTHER
// employee's personal info (DOB / gender / pronouns / bio) from
// the public profile page. The existing
// /api/admin/payroll/employees POST already accepts these four
// fields for any target email when the caller is admin; the
// non-admin branch limits the upsert to the signed-in user.
//
// Rendered conditionally from the server-side page only when the
// viewer's session carries the admin role.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface AdminPersonalInfoEditorProps {
  targetEmail: string;
  initial: {
    date_of_birth: string | null;
    gender: string | null;
    pronouns: string | null;
    bio: string | null;
  };
}

export default function AdminPersonalInfoEditor({ targetEmail, initial }: AdminPersonalInfoEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    date_of_birth: initial.date_of_birth ?? '',
    gender: initial.gender ?? '',
    pronouns: initial.pronouns ?? '',
    bio: initial.bio ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <button
        type="button"
        data-testid="employee-profile-admin-edit"
        className="admin-btn admin-btn--secondary admin-btn--sm"
        onClick={() => {
          setDraft({
            date_of_birth: initial.date_of_birth ?? '',
            gender: initial.gender ?? '',
            pronouns: initial.pronouns ?? '',
            bio: initial.bio ?? '',
          });
          setError(null);
          setEditing(true);
        }}
      >
        Edit personal info
      </button>
    );
  }

  return (
    <form
      data-testid="employee-profile-admin-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
          const res = await fetch('/api/admin/payroll/employees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_email: targetEmail,
              date_of_birth: draft.date_of_birth || null,
              gender: draft.gender || null,
              pronouns: draft.pronouns || null,
              bio: draft.bio || null,
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({})) as { error?: string };
            throw new Error(data.error ?? `HTTP ${res.status}`);
          }
          setEditing(false);
          // Pull fresh data into the server component.
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not save.');
        } finally {
          setSaving(false);
        }
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}
    >
      <div className="emp-manage__field">
        <label htmlFor="admin-dob">Date of birth</label>
        <input
          id="admin-dob"
          type="date"
          value={draft.date_of_birth}
          onChange={(e) => setDraft((d) => ({ ...d, date_of_birth: e.target.value }))}
        />
      </div>
      <div className="emp-manage__field">
        <label htmlFor="admin-gender">Gender</label>
        <input
          id="admin-gender"
          type="text"
          value={draft.gender}
          placeholder="Free-form"
          onChange={(e) => setDraft((d) => ({ ...d, gender: e.target.value }))}
        />
      </div>
      <div className="emp-manage__field">
        <label htmlFor="admin-pronouns">Pronouns</label>
        <input
          id="admin-pronouns"
          type="text"
          value={draft.pronouns}
          placeholder="she/her, they/them…"
          onChange={(e) => setDraft((d) => ({ ...d, pronouns: e.target.value }))}
        />
      </div>
      <div className="emp-manage__field" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
        <label htmlFor="admin-bio">About</label>
        <textarea
          id="admin-bio"
          rows={4}
          value={draft.bio}
          onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
          style={{ width: '100%', resize: 'vertical' }}
        />
      </div>
      {error && (
        <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.78rem' }}>{error}</p>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="admin-btn admin-btn--secondary admin-btn--sm"
          onClick={() => { setEditing(false); setError(null); }}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="admin-btn admin-btn--primary admin-btn--sm"
          disabled={saving}
          data-testid="employee-profile-admin-save"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
