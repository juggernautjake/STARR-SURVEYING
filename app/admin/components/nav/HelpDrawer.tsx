'use client';
// app/admin/components/nav/HelpDrawer.tsx
//
// Right-side help drawer surfaced by the `?` button in AdminPageHeader
// (ADMIN_NAVIGATION_REDESIGN.md §13.7). Pulls per-page content from
// `lib/admin/help-catalog.ts` with a workspace-level fallback.
//
// ── AI FALLBACK (audit §5 item 15) ──────────────────────────────────────────
//
// 150 of 158 pages had no curated entry, so the "help me, I'm stuck" surface
// said "no help curated for this page yet" — an answer about the state of a
// source file, to a person who wanted to know what a page does.
//
// The curated lookup still runs synchronously and paints first: it is local,
// it is instant, and a spinner in front of content we already have is a
// regression on the pages that ARE documented. Only when it comes back empty
// does the drawer ask `/api/admin/help/generate`, which repeats the curated
// check server-side (curated always wins), returns a previously cached answer
// if one exists, and generates otherwise.
//
// Generated help is LABELLED as generated. A reader who cannot tell a good
// guess from a fact trusts them equally, and this one is written from route
// metadata alone — it can be right about what a page is for and still not know
// what is on it.
//
// Closes on backdrop click + Escape. Focus traps inside the drawer
// while open — no big focus-trap library, just an effect that pushes
// initial focus to the close button.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X, Sparkles, Bot } from 'lucide-react';
import { lookupHelp, type HelpEntry } from '@/lib/admin/help-catalog';
import { useAssistant } from '../assistant/AssistantProvider';

interface HelpDrawerProps {
  open: boolean;
  pathname: string;
  workspaceHref: string | null;
  workspaceLabel: string;
  routeLabel: string | null;
  onClose: () => void;
}

export default function HelpDrawer({
  open,
  pathname,
  workspaceHref,
  workspaceLabel,
  routeLabel,
  onClose,
}: HelpDrawerProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const { openAssistant } = useAssistant();

  // Curated first, synchronously — no flash of "loading" on a documented page.
  const curated: HelpEntry | null = lookupHelp(pathname, workspaceHref);
  const [fetched, setFetched] = useState<HelpEntry | null>(null);
  const [source, setSource] = useState<'curated' | 'generated' | 'unavailable' | 'loading'>(
    curated ? 'curated' : 'loading',
  );

  useEffect(() => {
    if (!open || curated) return;
    let cancelled = false;
    setFetched(null);
    setSource('loading');
    fetch(`/api/admin/help/generate?path=${encodeURIComponent(pathname)}`)
      .then((r) => r.json())
      .then((j: { entry?: HelpEntry | null; source?: string }) => {
        if (cancelled) return;
        if (j.entry) {
          setFetched(j.entry);
          setSource(j.source === 'curated' ? 'curated' : 'generated');
        } else {
          setSource('unavailable');
        }
      })
      // A help drawer that renders an error about an AI the reader never invoked is worse than one
      // that says nothing was written yet, which is true either way.
      .catch(() => { if (!cancelled) setSource('unavailable'); });
    return () => { cancelled = true; };
  }, [open, curated, pathname]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const entry: HelpEntry | null = curated ?? fetched;

  // Handing the assistant the page path, not just the question: the route is part of its grounding,
  // so "what is this page for" has a subject only if it knows which page was open when it was asked.
  function askAssistant() {
    onClose();
    openAssistant(`What is the ${routeLabel || workspaceLabel} page (${pathname}) for, and how do I use it?`);
  }

  return (
    <>
      <div
        className="help-drawer__backdrop"
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 20, 25, 0.35)',
          zIndex: 220,
          animation: 'help-drawer-fade 0.15s ease-out',
        }}
      />
      <aside
        className="help-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Page help"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          width: 'min(420px, 95vw)',
          background: 'var(--color-bg-card)',
          boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.18)',
          zIndex: 221,
          display: 'flex',
          flexDirection: 'column',
          animation: 'help-drawer-slide 0.18s ease-out',
        }}
      >
        <header
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0 }}>
            <span style={{ fontFamily: 'Inter,sans-serif', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {workspaceLabel}
            </span>
            <span style={{ fontFamily: 'Sora,sans-serif', fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              Help — {routeLabel || workspaceLabel}
            </span>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close help"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.35rem',
              borderRadius: '6px',
              color: 'var(--color-text-tertiary)',
            }}
          >
            <X size={20} />
          </button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.15rem 1.25rem' }}>
          {entry ? (
            <>
              <h2 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 0.45rem' }}>
                {entry.title}
              </h2>
              {source === 'generated' ? (
                // The label is the point. Written from route metadata, this can describe what a page
                // is for correctly and still be wrong about what is on it; a reader who cannot tell
                // it apart from a curated entry has no way to weigh it.
                <p style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'Inter,sans-serif', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-warning-text)', background: 'var(--color-warning-surface)', padding: '0.2rem 0.5rem', borderRadius: '999px', margin: '0 0 0.6rem' }}>
                  <Sparkles size={11} aria-hidden="true" /> Written by AI from this page&apos;s registry entry
                </p>
              ) : null}
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '0.88rem', color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '0 0 1rem' }}>
                {entry.blurb}
              </p>
              <h3 style={{ fontFamily: 'Inter,sans-serif', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem' }}>
                Tips
              </h3>
              <ul style={{ paddingLeft: '1.1rem', margin: '0 0 1.15rem' }}>
                {entry.tips.map((tip) => (
                  <li key={tip} style={{ fontFamily: 'Inter,sans-serif', fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.55, marginBottom: '0.45rem' }}>
                    {tip}
                  </li>
                ))}
              </ul>
              {entry.resources && entry.resources.length > 0 ? (
                <>
                  <h3 style={{ fontFamily: 'Inter,sans-serif', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem' }}>
                    Related
                  </h3>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {entry.resources.map((r) => (
                      <li key={r.href}>
                        {r.external ? (
                          <a
                            href={r.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontFamily: 'Inter,sans-serif', fontSize: '0.85rem', color: 'var(--color-brand-navy)', textDecoration: 'none' }}
                          >
                            {r.label} ↗
                          </a>
                        ) : (
                          <Link
                            href={r.href}
                            onClick={onClose}
                            style={{ fontFamily: 'Inter,sans-serif', fontSize: '0.85rem', color: 'var(--color-brand-navy)', textDecoration: 'none' }}
                          >
                            {r.label} →
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : source === 'loading' ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-text-tertiary)' }}>
              <Sparkles size={28} style={{ marginBottom: '0.6rem', opacity: 0.5 }} />
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '0.85rem', margin: 0 }}>Writing help for this page…</p>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-text-tertiary)' }}>
              <Sparkles size={32} style={{ marginBottom: '0.75rem', opacity: 0.6 }} />
              <p style={{ fontFamily: 'Sora,sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 0.35rem' }}>
                No help written for this page yet
              </p>
              {/* The old copy named `lib/admin/help-catalog.ts`. That is a true sentence about this
                  repository and a useless one to a survey crew chief looking for help. */}
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '0.82rem', lineHeight: 1.5, margin: 0 }}>
                Nobody has written help for this page, and it could not be generated right now. The workspace landing covers the basics — or ask the assistant.
              </p>
            </div>
          )}

          {/* Always offered, curated or not: a written entry answers "what is this page", and a
              person is usually stuck on "what do I do with MY job on it", which only the assistant
              can answer because only it can see their data. */}
          <button
            type="button"
            onClick={askAssistant}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              width: '100%',
              marginTop: '1.1rem',
              padding: '0.55rem 0.75rem',
              borderRadius: '9px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-brand-navy)',
              fontFamily: 'Inter,sans-serif',
              fontSize: '0.83rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Bot size={15} aria-hidden="true" /> Ask the assistant about this page
          </button>
        </div>
      </aside>
      <style jsx global>{`
        @keyframes help-drawer-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes help-drawer-slide {
          from { transform: translateX(8%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
