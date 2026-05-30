'use client';
// lib/hub/components/WidgetFrame.tsx
//
// Shared chrome every widget renders inside. Title bar + body slot +
// optional footer. Supports the 5 colorMode values from
// WidgetCustomization.style.colorMode by setting CSS custom properties
// on the wrapper:
//   - inherit       → no override, uses --theme-bg-surface etc.
//   - accent        → background = theme accent, fg = accent-fg
//   - subtle-accent → background = color-mix(accent 8%, surface)
//   - status        → tint by statusTint (success / warning / danger / info)
//   - custom        → user-picked bg + auto-derived (or user-overridden) fg
//
// Slice 91 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { type ReactNode } from 'react';
import type {
  WidgetBorderRadius,
  WidgetColorMode,
  WidgetShadowDepth,
  WidgetStatusTint,
} from '@/lib/hub/types';

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
  /** Slice 5 — opt-in header background color (any valid CSS color).
   *  When set, paints the header bar so each widget reads
   *  distinctively against the canvas. When absent, the header sits
   *  on the resolved frame background. */
  headerColor?: string;
  colorMode?: WidgetColorMode;
  statusTint?: WidgetStatusTint;
  customBg?: string;
  customFg?: string;
  borderRadius?: WidgetBorderRadius;
  shadowDepth?: WidgetShadowDepth;
  /** When true the frame gets an editing-affordance border. The
   *  WidgetGrid passes this through from its edit-mode state. */
  editMode?: boolean;
  children: ReactNode;
}

const RADIUS_PX: Record<WidgetBorderRadius, string> = {
  sharp: '0',
  rounded: '8px',
  pill: '9999px',
};

const SHADOWS: Record<WidgetShadowDepth, string> = {
  0: 'none',
  1: '0 1px 2px rgba(0,0,0,0.06)',
  2: '0 2px 8px rgba(0,0,0,0.08)',
  3: '0 8px 24px rgba(0,0,0,0.12)',
};

export default function WidgetFrame({
  title,
  headerAction,
  footer,
  headerColor,
  colorMode = 'inherit',
  statusTint,
  customBg,
  customFg,
  borderRadius = 'rounded',
  shadowDepth = 1,
  editMode = false,
  children,
}: WidgetFrameProps) {
  const titleId = useTitleId(title);
  const { bg, fg, border } = resolveColors(colorMode, statusTint, customBg, customFg);

  return (
    <section
      aria-labelledby={titleId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: bg,
        color: fg,
        border: editMode
          ? `2px solid var(--theme-border-strong)`
          : `1px solid ${border}`,
        borderRadius: RADIUS_PX[borderRadius],
        boxShadow: SHADOWS[shadowDepth],
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
          borderBottom: `1px solid ${border}`,
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
      {footer && (
        <footer
          style={{
            padding: 'var(--hub-spc-3, 12px) var(--hub-spc-4, 16px)',
            borderTop: `1px solid ${border}`,
            fontSize: 'var(--hub-font-xs, 0.75rem)',
          }}
        >
          {footer}
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

interface ColorResult {
  bg: string;
  fg: string;
  border: string;
}

/** Resolve the widget's bg/fg/border CSS values from the customization
 *  fields. Falls back through the theme variable chain so every value
 *  is a valid CSS color string. */
export function resolveColors(
  colorMode: WidgetColorMode,
  statusTint?: WidgetStatusTint,
  customBg?: string,
  customFg?: string,
): ColorResult {
  switch (colorMode) {
    case 'accent':
      return {
        bg: 'var(--theme-accent)',
        fg: 'var(--theme-accent-fg)',
        border: 'var(--theme-accent)',
      };
    case 'subtle-accent':
      return {
        bg: 'color-mix(in srgb, var(--theme-accent) 8%, var(--theme-bg-surface))',
        fg: 'var(--theme-fg-primary)',
        border: 'color-mix(in srgb, var(--theme-accent) 25%, var(--theme-border))',
      };
    case 'status': {
      const tint = statusTint ?? 'info';
      const accent = `var(--theme-${tint})`;
      return {
        bg: `color-mix(in srgb, ${accent} 12%, var(--theme-bg-surface))`,
        fg: accent,
        border: `color-mix(in srgb, ${accent} 35%, var(--theme-border))`,
      };
    }
    case 'custom':
      return {
        bg: customBg ?? 'var(--theme-bg-surface)',
        fg: customFg ?? 'var(--theme-fg-primary)',
        border: 'var(--theme-border)',
      };
    case 'inherit':
    default:
      return {
        bg: 'var(--theme-bg-surface)',
        fg: 'var(--theme-fg-primary)',
        border: 'var(--theme-border)',
      };
  }
}
