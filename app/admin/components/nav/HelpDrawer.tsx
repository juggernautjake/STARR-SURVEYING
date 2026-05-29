'use client';
// app/admin/components/nav/HelpDrawer.tsx
//
// Right-side help drawer surfaced by the `?` button in AdminPageHeader
// (ADMIN_NAVIGATION_REDESIGN.md §13.7). Pulls per-page content from
// `lib/admin/help-catalog.ts` with a workspace-level fallback. Renders
// a "No help curated yet" notice when neither exists.
//
// Closes on backdrop click + Escape. Focus traps inside the drawer
// while open — no big focus-trap library, just an effect that pushes
// initial focus to the close button.

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { X, Sparkles } from 'lucide-react';
import { lookupHelp, type HelpEntry } from '@/lib/admin/help-catalog';

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

  const entry: HelpEntry | null = lookupHelp(pathname, workspaceHref);

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
          background: '#FFF',
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
            borderBottom: '1px solid #E5E7EB',
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
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '0.88rem', color: '#374151', lineHeight: 1.6, margin: '0 0 1rem' }}>
                {entry.blurb}
              </p>
              <h3 style={{ fontFamily: 'Inter,sans-serif', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem' }}>
                Tips
              </h3>
              <ul style={{ paddingLeft: '1.1rem', margin: '0 0 1.15rem' }}>
                {entry.tips.map((tip) => (
                  <li key={tip} style={{ fontFamily: 'Inter,sans-serif', fontSize: '0.85rem', color: '#374151', lineHeight: 1.55, marginBottom: '0.45rem' }}>
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
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-text-tertiary)' }}>
              <Sparkles size={32} style={{ marginBottom: '0.75rem', opacity: 0.6 }} />
              <p style={{ fontFamily: 'Sora,sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 0.35rem' }}>
                No help curated for this page yet
              </p>
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '0.82rem', lineHeight: 1.5, margin: 0 }}>
                Help content for this page hasn&apos;t been authored in <code>lib/admin/help-catalog.ts</code> yet. The workspace landing covers the basics for now.
              </p>
            </div>
          )}
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
