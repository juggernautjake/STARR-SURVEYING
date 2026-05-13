'use client';
// app/admin/org-settings/page.tsx
//
// Org settings — admin-only. Edit org name, billing contact, state,
// phone, and operational defaults (default invite role, MFA required,
// session timeout, webhook URL).
//
// Phase D-4 of CUSTOMER_PORTAL.md (smallest viable slice — basic
// fields. Logo upload + per-org domain restriction + export/delete
// flows are follow-up slices). Lives at /admin/org-settings to avoid
// collision with the legacy Starr-internal /admin/settings until
// M-10 rescopes the chrome.

import { useEffect, useState } from 'react';

interface OrgState {
  org: {
    id: string;
    slug: string;
    name: string;
    state: string | null;
    phone: string | null;
    primaryAdminEmail: string | null;
    billingContactEmail: string | null;
  };
  settings: {
    defaultInviteRole: string;
    mfaRequired: boolean;
    sessionTimeoutMin: number;
    webhookUrl: string | null;
  };
}

const ROLES = ['admin', 'surveyor', 'bookkeeper', 'field_only', 'view_only'];

export default function OrgSettingsPage() {
  const [state, setState] = useState<OrgState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/admin/org-settings', { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 403) {
          setError('Org settings are admin-only.');
        } else {
          setError(`Couldn't load settings (status ${res.status}).`);
        }
        return;
      }
      const data = (await res.json()) as OrgState;
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    if (!state) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/org-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: state.org.name,
          state: state.org.state,
          phone: state.org.phone,
          billingContactEmail: state.org.billingContactEmail ?? '',
          defaultInviteRole: state.settings.defaultInviteRole,
          mfaRequired: state.settings.mfaRequired,
          sessionTimeoutMin: state.settings.sessionTimeoutMin,
          webhookUrl: state.settings.webhookUrl,
        }),
      });
      if (res.ok) {
        setMessage('Saved.');
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setMessage(data.error ?? `Failed (status ${res.status}).`);
      }
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <div style={{ maxWidth: 720, margin: '2rem auto', padding: '2rem', color: 'rgba(255,255,255,0.7)' }}>
        {error}
      </div>
    );
  }
  if (!state) {
    return <div style={{ padding: '2rem', color: 'rgba(255,255,255,0.7)' }}>Loading…</div>;
  }

  function update<K extends keyof OrgState['org']>(k: K, v: OrgState['org'][K]) {
    setState((cur) => cur ? { ...cur, org: { ...cur.org, [k]: v } } : cur);
  }
  function updateSettings<K extends keyof OrgState['settings']>(k: K, v: OrgState['settings'][K]) {
    setState((cur) => cur ? { ...cur, settings: { ...cur.settings, [k]: v } } : cur);
  }

  return (
    <div style={{ maxWidth: 720, padding: '1.5rem' }}>
      <h1 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.6rem', margin: '0 0 0.5rem' }}>Org settings</h1>
      <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 1.5rem' }}>
        Configure how your organization works inside Starr Software. Changes apply to every member.
      </p>

      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Identity</h2>
        <div style={fieldGrid}>
          <Field label="Organization name" id="org-name">
            <input id="org-name" value={state.org.name} onChange={(e) => update('name', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Slug (read-only)" id="org-slug">
            <input id="org-slug" value={state.org.slug} readOnly style={{ ...inputStyle, opacity: 0.6 }} />
          </Field>
          <Field label="State" id="org-state">
            <input id="org-state" value={state.org.state ?? ''} onChange={(e) => update('state', e.target.value || null)} style={inputStyle} placeholder="TX" />
          </Field>
          <Field label="Phone" id="org-phone">
            <input id="org-phone" value={state.org.phone ?? ''} onChange={(e) => update('phone', e.target.value || null)} style={inputStyle} placeholder="(254) 555-0100" />
          </Field>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Billing contact</h2>
        <div style={fieldGrid}>
          <Field label="Billing contact email" id="org-billing-email">
            <input
              id="org-billing-email"
              type="email"
              value={state.org.billingContactEmail ?? ''}
              onChange={(e) => update('billingContactEmail', e.target.value || null)}
              style={inputStyle}
            />
          </Field>
          <Field label="Primary admin (read-only)" id="org-primary-admin">
            <input id="org-primary-admin" value={state.org.primaryAdminEmail ?? '—'} readOnly style={{ ...inputStyle, opacity: 0.6 }} />
          </Field>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Operational defaults</h2>
        <div style={fieldGrid}>
          <Field label="Default invite role" id="org-default-role">
            <select
              id="org-default-role"
              value={state.settings.defaultInviteRole}
              onChange={(e) => updateSettings('defaultInviteRole', e.target.value)}
              style={inputStyle}
            >
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Session timeout (minutes)" id="org-session">
            <input
              id="org-session"
              type="number"
              min={30}
              value={state.settings.sessionTimeoutMin}
              onChange={(e) => updateSettings('sessionTimeoutMin', Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="Webhook URL (optional)" id="org-webhook">
            <input
              id="org-webhook"
              value={state.settings.webhookUrl ?? ''}
              onChange={(e) => updateSettings('webhookUrl', e.target.value || null)}
              style={inputStyle}
              placeholder="https://your-firm.com/starr-webhook"
            />
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', alignSelf: 'end', paddingBottom: '0.5rem' }}>
            <input
              type="checkbox"
              checked={state.settings.mfaRequired}
              onChange={(e) => updateSettings('mfaRequired', e.target.checked)}
            />
            Require MFA at sign-in
          </label>
        </div>
      </section>

      <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center' }}>
        <button onClick={save} disabled={saving} style={primaryBtnStyle}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {message && <span style={{ color: message === 'Saved.' ? '#10B981' : '#FCA5A5', fontSize: '0.88rem' }}>{message}</span>}
      </div>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <label htmlFor={id} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 6,
  color: '#FFF',
  fontSize: '0.88rem',
  fontFamily: 'inherit',
};

const sectionStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  padding: '1.1rem 1.25rem',
  marginBottom: '1rem',
};

const sectionTitleStyle: React.CSSProperties = {
  fontFamily: 'Sora,sans-serif',
  fontSize: '1rem',
  margin: '0 0 0.85rem',
};

const fieldGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '0.7rem',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '0.6rem 1.2rem',
  background: '#FCD34D',
  color: '#0F1419',
  border: 0,
  borderRadius: 6,
  fontWeight: 600,
  fontSize: '0.9rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
