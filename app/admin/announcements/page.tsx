'use client';
// app/admin/announcements/page.tsx
//
// Release archive — every published release relevant to the
// customer's org bundles. The WhatsNewBanner on the Hub links here
// via "Read full notes →"; an optional ?id=<release-id> deep-links
// to a specific release.
//
// Phase D-7 / G-5. Pulls from /api/admin/announcements (new) for
// list; full Markdown body renders inline (cheap regex-based — no
// MDX dep) per WhatsNewBanner.summarizeMarkdown pattern.
//
// Spec: docs/planning/in-progress/CUSTOMER_PORTAL.md §3.9 +
//       docs/planning/in-progress/SOFTWARE_UPDATE_DISTRIBUTION.md §4.2.

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface Release {
  id: string;
  version: string;
  releaseType: string;
  bundles: string[];
  notesMarkdown: string | null;
  publishedAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  feature: '#1D3095',
  bugfix: '#059669',
  breaking: '#BD1218',
  security: '#7F1D1D',
};

const TYPE_LABELS: Record<string, string> = {
  feature: 'Feature',
  bugfix: 'Fix',
  breaking: 'Breaking',
  security: 'Security',
};

export default function AnnouncementsPage() {
  const params = useSearchParams();
  const focusId = params.get('id');
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/admin/announcements', { cache: 'no-store' });
        if (!res.ok) {
          setError(`Couldn't load releases (status ${res.status}).`);
          return;
        }
        const data = (await res.json()) as { releases: Release[] };
        if (!cancelled) setReleases(data.releases ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load.');
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const sortedReleases = useMemo(() => {
    if (!releases) return null;
    return [...releases].sort((a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
  }, [releases]);

  return (
    <div className="announcements-page">
      <header className="announcements-header">
        <h1>What&apos;s new</h1>
        <p>
          Every release that touches your org&apos;s bundles. Older releases
          are kept indefinitely.
        </p>
      </header>

      {error ? (
        <div className="announcements-error">{error}</div>
      ) : !sortedReleases ? (
        <div className="announcements-loading">Loading releases…</div>
      ) : sortedReleases.length === 0 ? (
        <div className="announcements-empty">
          No published releases for your bundles yet. They&apos;ll show up
          here when they ship.
        </div>
      ) : (
        <ol className="announcements-list">
          {sortedReleases.map((r) => (
            <li
              key={r.id}
              className={`announcement${focusId === r.id ? ' announcement--focused' : ''}`}
              id={r.id}
            >
              <div className="announcement-header">
                <span
                  className="announcement-type"
                  style={{ background: TYPE_COLORS[r.releaseType] ?? '#6B7280' }}
                >
                  {TYPE_LABELS[r.releaseType] ?? r.releaseType}
                </span>
                <span className="announcement-version">{r.version}</span>
                <span className="announcement-date">
                  {new Date(r.publishedAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                {r.bundles.length > 0 ? (
                  <span className="announcement-bundles">
                    {r.bundles.join(' · ')}
                  </span>
                ) : null}
              </div>
              {r.notesMarkdown ? (
                <div className="announcement-body">
                  {/* Cheap MD render — preserves paragraphs + lists; no
                      links or images to keep this dep-free. Phase 6
                      polish: swap in a proper MD renderer. */}
                  {r.notesMarkdown.split(/\n\n+/).map((para, i) => (
                    <p key={i}>{stripMarkdownInline(para)}</p>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      <style jsx>{`
        .announcements-page {
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem 1.5rem;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #0F1419;
        }
        .announcements-header h1 {
          font-family: 'Sora', sans-serif;
          font-size: 1.8rem;
          font-weight: 600;
          letter-spacing: -0.02em;
          margin: 0 0 0.5rem;
        }
        .announcements-header p {
          color: #6B7280;
          margin: 0 0 2rem;
        }
        .announcements-error,
        .announcements-loading,
        .announcements-empty {
          padding: 2rem;
          text-align: center;
          color: #6B7280;
          background: #F9FAFB;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
        }
        .announcements-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .announcement {
          background: #FFF;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          padding: 1.25rem 1.5rem;
        }
        .announcement--focused {
          border-color: #1D3095;
          box-shadow: 0 0 0 3px rgba(29, 48, 149, 0.1);
        }
        .announcement-header {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.6rem;
          margin-bottom: 0.85rem;
        }
        .announcement-type {
          color: #FFF;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          letter-spacing: 0.04em;
        }
        .announcement-version {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-weight: 700;
          color: #0F1419;
        }
        .announcement-date {
          font-size: 0.85rem;
          color: #6B7280;
        }
        .announcement-bundles {
          font-size: 0.78rem;
          color: #9CA3AF;
          margin-left: auto;
        }
        .announcement-body {
          color: #1F2937;
          font-size: 0.92rem;
          line-height: 1.55;
        }
        .announcement-body p {
          margin: 0 0 0.6rem;
        }
        .announcement-body p:last-child { margin-bottom: 0; }
      `}</style>
    </div>
  );
}

/** Same cheap-MD pattern as WhatsNewBanner.summarizeMarkdown — strips
 *  inline formatting but preserves prose. */
function stripMarkdownInline(s: string): string {
  return s
    .replace(/^#+ /gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*+] /gm, '• ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim();
}
