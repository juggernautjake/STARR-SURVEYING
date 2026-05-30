'use client';
// lib/hub/components/WidgetFrame.tsx
//
// Shared chrome every widget renders inside. Title bar + body slot +
// optional footer. Slice 6 of employee-hub-overhaul-2026-05-30 ripped
// out the legacy customization style fields
// (colorMode/statusTint/customBg/customFg/borderRadius/shadowDepth);
// the only customizable visual now is the opt-in `headerColor` from
// Slice 5. The frame body uses theme variables directly — fixed
// rounded corners + a subtle shadow — so every widget reads as a
// sibling of the rest of the dashboard. The legacy fields stay on
// `WidgetCustomization.style` for one more cycle (the still-living
// SettingsPanel/StyleTab will go in Slice 4 after HB5 lands the
// per-widget options inside the modal).
//
// Slice 91 of customizable-hub-and-work-mode-2026-05-28.md (original).

import React, { type ReactNode } from 'react';
import WidgetGoToLink from '@/lib/hub/widgets/_shared/WidgetGoToLink';

export interface WidgetFrameProps {
  /** Accessible title for the widget. Always renders as a visible
   *  heading post-Slice-5 (the surveyor can't hide the header); also
   *  present as an `aria-labelledby` target. */
  title: string;
  /** Right-aligned slot in the title bar — typically a "see all" link
   *  or a config gear. */
  headerAction?: ReactNode;
  /** Optional bottom strip — used by widgets that need a "see all"
   *  link or a primary action. */
  footer?: ReactNode;
  /** hub-widget-excellence-02 Slice 5 — one-line "Go to {label} →"
   *  footer link. When set, renders a shared `WidgetGoToLink` in the
   *  footer (right-aligned; composes with any `footer` content on the
   *  left). The href/label come from the widget-links registry. */
  goTo?: { href: string; label: string; icon?: string };
  /** Slice 5 — opt-in header background color (any valid CSS color).
   *  When set, paints the header bar so each widget reads
   *  distinctively against the canvas. When absent, the header sits
   *  on the theme surface. */
  headerColor?: string;
  /** When true the frame gets an editing-affordance border. The
   *  WidgetGrid passes this through from its edit-mode state. */
  editMode?: boolean;
  children: ReactNode;
}

const FRAME_RADIUS_PX = '8px';
const FRAME_SHADOW = '0 1px 2px rgba(0,0,0,0.06)';

export default function WidgetFrame({
  title,
  headerAction,
  footer,
  goTo,
  headerColor,
  editMode = false,
  children,
}: WidgetFrameProps) {
  const titleId = useTitleId(title);

  return (
    <section
      aria-labelledby={titleId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--theme-bg-surface)',
        color: 'var(--theme-fg-primary)',
        border: editMode
          ? `2px solid var(--theme-border-strong)`
          : `1px solid var(--theme-border)`,
        borderRadius: FRAME_RADIUS_PX,
        boxShadow: FRAME_SHADOW,
        overflow: 'hidden',
        transition: 'border-color 0.15s ease-out',
      }}
    >
      {/* Slice 5 — header (title + optional action) always renders.
          Per the user ask "The label header title for the widget
          should always be visible." `headerColor`, when set, paints
          the header background; otherwise the header sits on the
          resolved frame chrome. */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--hub-spc-3, 12px) var(--hub-spc-4, 16px)',
          borderBottom: `1px solid var(--theme-border)`,
          background: headerColor ?? 'transparent',
          // Slice 206 — `min-width: 0` lets the title's flex slot
          // shrink below its content's intrinsic width so the
          // ellipsis applies + the drag handle / config gear in
          // `headerAction` can never get pushed out of the header
          // at narrow viewports.
          minWidth: 0,
          gap: 'var(--hub-spc-2, 8px)',
        }}
      >
        <h2
          id={titleId}
          style={{
            margin: 0,
            fontSize: 'var(--hub-font-sm, 0.875rem)',
            fontWeight: 600,
            color: 'inherit',
            // Slice 206 — clip + ellipsis instead of wrap so a long
            // surveyor-typed custom title doesn't push the
            // headerAction out or make the title bar grow into a
            // 2-line block at narrow widths.
            minWidth: 0,
            flex: '1 1 auto',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
          title={title}
        >
          {title}
        </h2>
        {headerAction && (
          <div style={{
            display: 'flex',
            gap: 'var(--hub-spc-2, 8px)',
            flexShrink: 0,
          }}>
            {headerAction}
          </div>
        )}
      </header>
      <div
        style={{
          flex: 1,
          padding: 'var(--hub-spc-4, 16px)',
          // Slice 206 — `min-width: 0` lets a widget body shrink
          // below its content's intrinsic width so the body's own
          // `overflow: auto` actually engages instead of the body
          // expanding the cell. Each widget is responsible for
          // its own row-level truncation (long job names, etc.)
          // via `text-overflow: ellipsis` + `min-width: 0` on the
          // flex children that hold long strings.
          minWidth: 0,
          overflow: 'auto',
        }}
      >
        {children}
      </div>
      {(footer || goTo) && (
        <footer
          style={{
            padding: 'var(--hub-spc-3, 12px) var(--hub-spc-4, 16px)',
            borderTop: `1px solid var(--theme-border)`,
            fontSize: 'var(--hub-font-xs, 0.75rem)',
          }}
        >
          {goTo ? (
            // Slice 5 — footer content (if any) on the left, the shared
            // "Go to…" link pinned right. A lone footer (no goTo) keeps
            // its original inline rendering below.
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--hub-spc-3, 12px)',
                width: '100%',
              }}
            >
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {footer}
              </span>
              <WidgetGoToLink href={goTo.href} label={goTo.label} icon={goTo.icon} />
            </div>
          ) : (
            footer
          )}
        </footer>
      )}
    </section>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

/** Deterministic id derived from the widget title — stable across
 *  renders so aria-labelledby keeps resolving even if React rebuilds. */
function useTitleId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `widget-${slug || 'untitled'}`;
}
