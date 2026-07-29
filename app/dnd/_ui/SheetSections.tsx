'use client';
// SheetSections — group the character page's surrounding panels into tabs (P4-3, audit D-4).
//
// THE FINDING: one 470-line page stacked ~20 always-mounted panels vertically — approval, build kit,
// designers, adopt, chrome, variants, history, grants, house rules, campaigns, export, visibility, chat,
// the AI edit box — with the sheet somewhere in the middle. The sheet *itself* is tabbed; the page around
// it was not, so the further down a control lived the less likely it was ever found. That is the same
// "buried control" defect already recorded for the stance class.
//
// WHAT THIS DOES **NOT** DO, deliberately: it does not tab the sheet. The sheet is why the page exists and
// it stays exactly where it is, always visible. Only the surrounding panels are grouped, which is where
// the twenty were.
//
// Sections arrive as already-rendered server nodes. That is the point of taking `ReactNode` rather than
// component references: every panel keeps its own server-side data fetching, and this adds a tab strip
// without any of them becoming client components.
import { useState, type ReactNode } from 'react';

export interface SheetSection {
  id: string;
  label: string;
  /** Rendered on the server and handed in. Falsy → the tab is not offered at all. */
  node: ReactNode;
  /** A short line under the tab strip saying what lives here, so the grouping teaches itself. */
  blurb?: string;
}

export default function SheetSections({ sections }: { sections: SheetSection[] }) {
  // An empty section is not an empty tab. A viewer who cannot write the sheet has no Build or Manage
  // content at all, and offering them a tab that opens onto nothing is worse than not offering it.
  const live = sections.filter((s) => !!s.node);
  const [active, setActive] = useState(live[0]?.id ?? '');

  if (live.length === 0) return null;
  // One section needs no tab strip — a single tab is furniture pretending to be a choice.
  const current = live.find((s) => s.id === active) ?? live[0];

  return (
    <div style={{ maxWidth: 960, margin: '18px auto 0', padding: '0 12px' }}>
      {live.length > 1 && (
        <div role="tablist" aria-label="Character tools" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {live.map((s) => {
            const on = s.id === current.id;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActive(s.id)}
                style={{
                  padding: '6px 15px', borderRadius: 3, fontSize: 13, cursor: 'pointer',
                  fontFamily: 'var(--hx-font-display, inherit)', letterSpacing: '0.04em',
                  border: on ? '1px solid var(--hx-teal-1)' : '1px solid var(--hx-line)',
                  background: on ? 'rgba(10,200,185,0.14)' : 'rgba(1,10,19,0.4)',
                  color: on ? 'var(--hx-teal-1)' : 'var(--hx-text)',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      {current.blurb && (
        <p style={{ margin: '0 0 10px', fontSize: 11.5, color: 'var(--hx-muted)', lineHeight: 1.5 }}>{current.blurb}</p>
      )}

      {/* Only the active section is MOUNTED, which is the point — twenty always-mounted panels is also
          twenty panels' worth of effects and fetches on every visit to a sheet. */}
      <div role="tabpanel">{current.node}</div>
    </div>
  );
}
