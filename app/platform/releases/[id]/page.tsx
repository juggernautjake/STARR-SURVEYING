'use client';
// app/platform/releases/[id]/page.tsx
//
// Single-release detail + delivery analytics. Surfaces orgsNotified
// / reads / dismissals / acks alongside the release notes.
//
// Phase G-9 of SOFTWARE_UPDATE_DISTRIBUTION.md.

import Link from 'next/link';
import { use, useEffect, useState } from 'react';

interface Release {
  id: string;
  version: string;
  releaseType: string;
  bundles: string[];
  required: boolean;
  notesMarkdown: string | null;
  publishedAt: string | null;
  scheduledFor: string | null;
  rolloutStrategy: string;
  publishedBy: string | null;
  createdAt: string;
}

interface Analytics {
  orgsNotified: number;
  reads: number;
  dismissals: number;
  acks: number;
}

const TYPE_COLORS: Record<string, string> = {
  feature:  '#3B82F6',
  bugfix:   '#10B981',
  breaking: '#EF4444',
  security: '#7F1D1D',
};

interface PageProps { params: Promise<{ id: string }> }

export default function ReleaseDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const [data, setData] = useState<{ release: Release; analytics: Analytics } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/platform/releases/${id}`, { cache: 'no-store' });
        if (!res.ok) {
          setError(`Couldn't load release (status ${res.status}).`);
          return;
        }
        const d = (await res.json()) as { release: Release; analytics: Analytics };
        if (!cancelled) setData(d);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed.');
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (error) {
    return <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem', color: '#FCA5A5' }}>{error}</div>;
  }
  if (!data) {
    return <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem', color: 'rgba(255,255,255,0.6)' }}>Loading…</div>;
  }

  const { release, analytics } = data;
  const readPct = analytics.orgsNotified > 0 ? Math.round((analytics.reads / analytics.orgsNotified) * 100) : 0;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <Link href="/platform/releases" style={{ color: '#FCD34D', fontSize: '0.85rem', textDecoration: 'none' }}>
        ← All releases
      </Link>

      <header style={{ marginTop: '0.6rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.3rem' }}>
          <h1 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.8rem', margin: 0 }}>
            <code style={{ fontFamily: 'JetBrains Mono,monospace' }}>{release.version}</code>
          </h1>
          <span style={{ color: TYPE_COLORS[release.releaseType] ?? '#9CA3AF', fontWeight: 600, fontSize: '0.88rem' }}>
            {release.releaseType}
          </span>
          {release.required && (
            <span style={{ color: '#F59E0B', fontWeight: 700, fontSize: '0.78rem' }}>REQUIRED</span>
          )}
        </div>
        <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)' }}>
          {release.publishedAt
            ? `Published ${new Date(release.publishedAt).toLocaleString()}`
            : `Draft (created ${new Date(release.createdAt).toLocaleString()})`}
          {release.publishedBy && ` · by ${release.publishedBy}`}
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.85rem', marginBottom: '1.5rem' }}>
        <Stat label="Orgs notified" value={String(analytics.orgsNotified)} />
        <Stat label="Reads" value={String(analytics.reads)} secondary={`${readPct}%`} />
        <Stat label="Dismissals" value={String(analytics.dismissals)} />
        <Stat label="Acks" value={String(analytics.acks)} />
      </div>

      <section style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        padding: '1.25rem',
      }}>
        <h2 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1rem', margin: '0 0 0.75rem' }}>
          Release notes
        </h2>
        {release.bundles.length > 0 && (
          <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', marginBottom: '0.85rem' }}>
            Bundles: {release.bundles.join(' · ')}
          </div>
        )}
        {release.notesMarkdown ? (
          <pre style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'rgba(255,255,255,0.85)',
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: '0.85rem',
            lineHeight: 1.55,
          }}>
            {release.notesMarkdown}
          </pre>
        ) : (
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: 0 }}>
            No release notes were entered for this release.
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, secondary }: { label: string; value: string; secondary?: string }) {
  return (
    <div style={{
      padding: '0.85rem 1rem',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10,
    }}>
      <div style={{
        fontSize: '0.72rem',
        color: 'rgba(255,255,255,0.6)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        fontWeight: 600,
      }}>
        {label}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '0.45rem',
        marginTop: '0.2rem',
      }}>
        <span style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.45rem', fontWeight: 600 }}>{value}</span>
        {secondary && <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' }}>{secondary}</span>}
      </div>
    </div>
  );
}
