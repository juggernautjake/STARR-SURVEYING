'use client';
// app/admin/me/components/WhatsNewBanner.tsx
//
// "What's new in v2.4" banner that appears on the Hub when a release
// the user hasn't acknowledged is published for one of their org's
// bundles. Consumes /api/app/version?for=user (shipped in slice G-4).
//
// Dismissal stores the acknowledged release id in localStorage —
// per-user, per-browser. Phase D-7 wires durable acks via
// public.release_acks (a row per user per release).
//
// Spec: docs/planning/in-progress/SOFTWARE_UPDATE_DISTRIBUTION.md §4.1.

import { useCallback, useEffect, useState } from 'react';

interface LatestRelease {
  id: string;
  version: string;
  title: string;
  type: string;
  publishedAt: string;
  notesMarkdown: string | null;
  bundles: string[];
}

const ACK_STORAGE_KEY = 'starr-saas-whatsnew-acked';

function loadAcks(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(ACK_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function persistAck(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const set = loadAcks();
    set.add(id);
    window.localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* swallow — localStorage failures shouldn't break the banner */
  }
}

export default function WhatsNewBanner() {
  const [release, setRelease] = useState<LatestRelease | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchLatest() {
      try {
        const res = await fetch('/api/app/version?for=user', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { latestRelease?: LatestRelease | null };
        if (cancelled) return;
        const latest = data.latestRelease ?? null;
        if (!latest) return;
        const acked = loadAcks();
        if (acked.has(latest.id)) return;
        setRelease(latest);
      } catch {
        // Silent — banner is non-critical UI
      }
    }
    fetchLatest();
    return () => { cancelled = true; };
  }, []);

  const dismiss = useCallback(() => {
    if (release) persistAck(release.id);
    setDismissed(true);
  }, [release]);

  if (!release || dismissed) return null;

  return (
    <section className="hub-whatsnew" role="status" aria-live="polite">
      <div className="hub-whatsnew__inner">
        <span className="hub-whatsnew__pill">{release.version}</span>
        <div className="hub-whatsnew__body">
          <strong className="hub-whatsnew__title">{release.title}</strong>
          {release.notesMarkdown ? (
            <span className="hub-whatsnew__excerpt">
              {summarizeMarkdown(release.notesMarkdown, 140)}
            </span>
          ) : null}
        </div>
        <a className="hub-whatsnew__link" href="/admin/announcements">
          Read full notes →
        </a>
        <button
          type="button"
          className="hub-whatsnew__dismiss"
          onClick={dismiss}
          aria-label="Dismiss release notes"
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </section>
  );
}

/** Strip Markdown formatting + trim. Cheap server-style render: drops
 *  headings/lists/links syntax, keeps the prose. */
function summarizeMarkdown(md: string, maxLen: number): string {
  const plain = md
    .replace(/^#+ /gm, '')                       // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1')           // bold
    .replace(/\*([^*]+)\*/g, '$1')               // italic
    .replace(/`([^`]+)`/g, '$1')                 // code
    .replace(/^\s*[-*+] /gm, '')                 // list bullets
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')     // links
    .replace(/\n+/g, ' ')                        // newlines → spaces
    .replace(/\s+/g, ' ')                        // collapse spaces
    .trim();
  if (plain.length <= maxLen) return plain;
  return plain.slice(0, maxLen - 1).trimEnd() + '…';
}
