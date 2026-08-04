// lib/hub/widgets/_shared/WidgetGoToLink.tsx
//
// Slice 1 of hub-widget-excellence-02-shared-infra. A single,
// consistently-styled "Go to {label} →" link for the WidgetFrame
// footer. Every widget that owns a domain page (jobs, finances,
// schedule, messages, …) drops this in its `footer` slot so the
// affordance looks identical everywhere and routing stays centralized
// (the href comes from the Slice-2 widget-links registry).
//
// Renders a real `next/link` anchor (keyboard-reachable, right-click /
// open-in-new-tab work) with an aria-label, so it satisfies the
// checklist's Correct-links + Accessibility criteria in one place.

import React from 'react';
import Link from 'next/link';

export interface WidgetGoToLinkProps {
  /** Destination route, e.g. "/admin/jobs". */
  href: string;
  /** Human label for the destination, e.g. "jobs". Rendered as
   *  "Go to {label} →" and used in the aria-label. */
  label: string;
  /** Optional leading glyph (emoji or short symbol). Decorative only. */
  icon?: string;
}

export default function WidgetGoToLink({ href, label, icon }: WidgetGoToLinkProps) {
  return (
    <Link
      href={href}
      className="widget-go-to-link"
      aria-label={`Go to ${label}`}
      data-widget-go-to=""
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        // PWA W6e — 19px tall was below the 24px floor `audit-voice-mobile.mjs` holds LINKS to
        // (WCAG 2.5.8 AA). Deliberately 24 and not the 40 that file applies to buttons: 40 is the
        // comfort figure for something being aimed at, and the auditor's own comment warns that
        // padding a list of links to 40 each builds a wall of whitespace worse than the problem.
        //
        // That warning does not apply here, which is why this one is safe to raise: this is a SINGLE
        // footer affordance per widget card, not a list. The cost is ~5px per card, and the benefit
        // is the primary action of every hub widget becoming reliably tappable on a phone — which is
        // the screen a field crew opens the hub on.
        minHeight: '24px',
        gap: '0.3rem',
        fontSize: 'var(--hub-font-xs, 0.75rem)',
        fontWeight: 600,
        color: 'var(--theme-accent, #1e3a8a)',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {icon ? (
        <span aria-hidden style={{ fontSize: '0.95em' }}>
          {icon}
        </span>
      ) : null}
      <span>Go to {label}</span>
      <span aria-hidden>→</span>
    </Link>
  );
}
