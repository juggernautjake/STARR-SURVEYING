'use client';
// app/platform/releases/page.tsx
//
// Operator release management: list + simple new-release composer.
// Phase G-2 of SOFTWARE_UPDATE_DISTRIBUTION.md.

import { useEffect, useState } from 'react';

interface ReleaseRow {
  id: string;
  version: string;
  releaseType: string;
  bundles: string[];
  required: boolean;
  publishedAt: string | null;
  rolloutStrategy: string;
  publishedBy: string | null;
  createdAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  feature:  '#3B82F6',
  bugfix:   '#10B981',
  breaking: '#EF4444',
  security: '#7F1D1D',
};

export default function PlatformReleasesPage() {
  const [releases, setReleases] = useState<ReleaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [draftVersion, setDraftVersion] = useState('');
  const [draftType, setDraftType] = useState<'feature' | 'bugfix' | 'breaking' | 'security'>('feature');
  const [draftBundles, setDraftBundles] = useState<string[]>([]);
  const [draftNotes, setDraftNotes] = useState('');
  const [draftRequired, setDraftRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/platform/releases', { cache: 'no-store' });
      if (!res.ok) {
        setError(`Couldn't load releases (status ${res.status}).`);
        return;
      }
      const data = (await res.json()) as { releases: ReleaseRow[] };
      setReleases(data.releases);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(publishNow: boolean) {
    if (!draftVersion.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/platform/releases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: draftVersion.trim(),
          releaseType: draftType,
          bundles: draftBundles,
          notesMarkdown: draftNotes,
          required: draftRequired,
          publishNow,
        }),
      });
      if (res.ok) {
        setComposing(false);
        setDraftVersion(''); setDraftNotes(''); setDraftBundles([]); setDraftRequired(false); setDraftType('feature');
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function toggleBundle(b: string) {
    setDraftBundles((cur) => cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b]);
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.8rem', margin: '0 0 0.25rem' }}>Releases</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0 }}>Tag a new version. Customers see release notes on their Hub.</p>
        </div>
        {!composing && (
          <button onClick={() => setComposing(true)} style={primaryBtnStyle}>+ New release</button>
        )}
      </header>

      {composing && (
        <section style={composerStyle}>
          <h2 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.1rem', margin: '0 0 1rem' }}>Tag a release</h2>
          <label style={fieldStyle}>
            <span>Version (semver)</span>
            <input type="text" value={draftVersion} onChange={(e) => setDraftVersion(e.target.value)} placeholder="v2.4.0" style={inputStyle} />
          </label>
          <label style={fieldStyle}>
            <span>Type</span>
            <select value={draftType} onChange={(e) => setDraftType(e.target.value as typeof draftType)} style={inputStyle}>
              <option value="feature">Feature</option>
              <option value="bugfix">Bug fix</option>
              <option value="breaking">Breaking change</option>
              <option value="security">Security</option>
            </select>
          </label>
          <fieldset style={fieldStyle}>
            <legend style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '0.3rem' }}>Affected bundles</legend>
            {['recon', 'draft', 'office', 'field', 'academy', 'firm_suite'].map((b) => (
              <label key={b} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '0.9rem', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={draftBundles.includes(b)} onChange={() => toggleBundle(b)} />
                {b}
              </label>
            ))}
          </fieldset>
          <label style={fieldStyle}>
            <span>Release notes (Markdown)</span>
            <textarea value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} rows={6} placeholder="## New&#10;- AI-suggested annotations in CAD" style={{ ...inputStyle, resize: 'vertical', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', marginBottom: '1rem' }}>
            <input type="checkbox" checked={draftRequired} onChange={(e) => setDraftRequired(e.target.checked)} />
            Required update (force mobile clients to update)
          </label>
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setComposing(false)} disabled={submitting} style={secondaryBtnStyle}>Cancel</button>
            <button onClick={() => handleSubmit(false)} disabled={!draftVersion.trim() || submitting} style={secondaryBtnStyle}>
              Save draft
            </button>
            <button onClick={() => handleSubmit(true)} disabled={!draftVersion.trim() || submitting} style={primaryBtnStyle}>
              {submitting ? 'Publishing…' : 'Publish now'}
            </button>
          </div>
        </section>
      )}

      {error ? (
        <div style={emptyStyle}>{error}</div>
      ) : !releases ? (
        <div style={emptyStyle}>Loading…</div>
      ) : releases.length === 0 ? (
        <div style={emptyStyle}>No releases yet. Tag the first one above.</div>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Version</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Bundles</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Required?</th>
              <th style={thStyle}>By</th>
              <th style={thStyle}>When</th>
            </tr>
          </thead>
          <tbody>
            {releases.map((r) => (
              <tr key={r.id}>
                <td style={tdStyle}>
                  <code style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: '0.85rem' }}>{r.version}</code>
                </td>
                <td style={tdStyle}>
                  <span style={{ color: TYPE_COLORS[r.releaseType] ?? '#9CA3AF', fontWeight: 600, fontSize: '0.82rem' }}>
                    {r.releaseType}
                  </span>
                </td>
                <td style={{ ...tdStyle, fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)' }}>
                  {r.bundles.length > 0 ? r.bundles.join(' · ') : <em style={{ color: 'rgba(255,255,255,0.4)' }}>all</em>}
                </td>
                <td style={tdStyle}>
                  {r.publishedAt ? (
                    <span style={{ color: '#10B981', fontWeight: 600, fontSize: '0.82rem' }}>Published</span>
                  ) : (
                    <span style={{ color: '#9CA3AF', fontSize: '0.82rem' }}>Draft</span>
                  )}
                </td>
                <td style={tdStyle}>
                  {r.required ? <span style={{ color: '#F59E0B', fontWeight: 600 }}>YES</span> : '—'}
                </td>
                <td style={{ ...tdStyle, fontFamily: 'JetBrains Mono,monospace', fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
                  {r.publishedBy ?? '—'}
                </td>
                <td style={{ ...tdStyle, color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem' }}>
                  {r.publishedAt ? new Date(r.publishedAt).toLocaleString() : new Date(r.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 6,
  color: '#FFF',
  fontSize: '0.88rem',
  fontFamily: 'inherit',
};

const fieldStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.85rem',
};

const composerStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  padding: '1.25rem',
  marginBottom: '1.5rem',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '0.55rem 1.1rem',
  background: '#FCD34D',
  color: '#0F1419',
  border: 0,
  borderRadius: 6,
  fontWeight: 600,
  fontSize: '0.88rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '0.55rem 1.1rem',
  background: 'rgba(255,255,255,0.06)',
  color: '#FFF',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 6,
  fontWeight: 500,
  fontSize: '0.88rem',
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

const tableStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  borderCollapse: 'separate',
  borderSpacing: 0,
  overflow: 'hidden',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.55rem 0.85rem',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: 'rgba(255,255,255,0.6)',
  borderBottom: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.04)',
};

const tdStyle: React.CSSProperties = {
  padding: '0.6rem 0.85rem',
  fontSize: '0.88rem',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
};
