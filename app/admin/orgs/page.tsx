'use client';
// app/admin/orgs/page.tsx
//
// Organizations the caller belongs to. Click "Switch to" to make
// that org active. Pre-M-9 implementation: server mirrors the choice
// into both user_active_org and registered_users.default_org_id, so
// every existing org-scoped API picks it up after a reload.
//
// The topbar org-switcher dropdown that this page substitutes for
// lands with the M-10 chrome rework.
//
// Phase D-8 of CUSTOMER_PORTAL.md.

import { useEffect, useState } from 'react';

interface Membership {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: string;
  status: string;
  joinedAt: string | null;
  isActive: boolean;
}

export default function OrgsPage() {
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/admin/orgs', { cache: 'no-store' });
      if (!res.ok) {
        setError(`Couldn't load organizations (status ${res.status}).`);
        return;
      }
      const data = (await res.json()) as { memberships: Membership[] };
      setMemberships(data.memberships);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    }
  }

  useEffect(() => { load(); }, []);

  async function switchTo(orgId: string) {
    setSwitching(orgId);
    try {
      const res = await fetch('/api/admin/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });
      if (res.ok) {
        window.location.href = '/admin/me';
      } else {
        setSwitching(null);
      }
    } catch {
      setSwitching(null);
    }
  }

  return (
    <div style={{ maxWidth: 720, padding: '1.5rem' }}>
      <h1 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.6rem', margin: '0 0 0.5rem' }}>
        Your organizations
      </h1>
      <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 1.5rem' }}>
        Switch the active organization for your session. Only org-scoped data
        for the active org is visible.
      </p>

      {error ? (
        <div style={emptyStyle}>{error}</div>
      ) : !memberships ? (
        <div style={emptyStyle}>Loading…</div>
      ) : memberships.length === 0 ? (
        <div style={emptyStyle}>You aren&apos;t a member of any organization yet.</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {memberships.map((m) => (
            <li key={m.orgId} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.85rem 1rem',
              background: m.isActive ? 'rgba(252,211,77,0.08)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${m.isActive ? 'rgba(252,211,77,0.3)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 10,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <div style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.05rem', fontWeight: 600 }}>
                  {m.orgName}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)' }}>
                  {m.orgSlug ? <code style={{ fontFamily: 'JetBrains Mono,monospace' }}>{m.orgSlug}</code> : null}
                  {m.orgSlug ? ' · ' : ''}
                  {m.role}
                  {m.joinedAt ? ' · joined ' + new Date(m.joinedAt).toLocaleDateString() : ''}
                </div>
              </div>
              {m.isActive ? (
                <span style={{
                  padding: '0.25rem 0.7rem',
                  background: '#FCD34D',
                  color: '#0F1419',
                  borderRadius: 999,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}>
                  Active
                </span>
              ) : (
                <button
                  onClick={() => switchTo(m.orgId)}
                  disabled={switching === m.orgId}
                  style={primaryBtnStyle}
                >
                  {switching === m.orgId ? 'Switching…' : 'Switch to'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '0.45rem 0.95rem',
  background: '#FCD34D',
  color: '#0F1419',
  border: 0,
  borderRadius: 6,
  fontWeight: 600,
  fontSize: '0.85rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const emptyStyle: React.CSSProperties = {
  padding: '2rem',
  textAlign: 'center',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  color: 'rgba(255,255,255,0.6)',
};
