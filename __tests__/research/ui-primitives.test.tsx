// __tests__/research/ui-primitives.test.tsx
//
// Phase A2 primitives. Rendered with react-dom/server under `environment: 'node'`, matching the
// hub suite's convention — this repo has no @testing-library dependency and does not need one to
// assert markup.
//
// ── WHAT IS WORTH ASSERTING HERE ────────────────────────────────────────────────────────────────
//
// Not "does it render" — everything renders. The things that break silently:
//
//   · the ARIA that makes state audible (aria-expanded, aria-selected). A div with onClick looks
//     identical in a screenshot and is unusable without a mouse.
//   · `hidden` rather than unmount on the Accordion, so form state survives a collapse. Losing what
//     somebody typed because they folded a section is the modal-overlay bug wearing a new hat.
//   · every class the components render being DEFINED in the stylesheet beside them. A class the
//     sheet has never heard of renders as unstyled text in the middle of a form — visible to a
//     test, invisible as a control. This repo has shipped that three times.

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';

import {
  Accordion,
  EmptyState,
  SectionHeader,
  SegmentedTabs,
  StatPill,
  Toggle,
} from '@/app/admin/research/components/ui';

const html = (el: React.ReactElement) => ReactDOMServer.renderToStaticMarkup(el);

describe('Accordion', () => {
  it('is a real button carrying its own state', () => {
    const out = html(<Accordion title="Optional details">inner</Accordion>);
    expect(out).toContain('<button');
    expect(out).toContain('aria-expanded="false"');
    // aria-controls must point at the panel, or the state is announced about nothing.
    expect(out).toMatch(/aria-controls="([^"]+)"[\s\S]*id="\1"/);
  });

  it('opens when asked', () => {
    expect(html(<Accordion title="t" defaultOpen>inner</Accordion>)).toContain('aria-expanded="true"');
  });

  it('HIDES the panel rather than unmounting it', () => {
    // The whole reason: an input inside a collapsed section keeps its value. Unmounting would
    // silently discard what somebody typed.
    const closed = html(<Accordion title="t"><input defaultValue="typed" /></Accordion>);
    expect(closed).toContain('hidden');
    expect(closed, 'children must still be in the markup when collapsed').toContain('typed');
  });

  it('shows a summary while collapsed, so a closed section still informs', () => {
    expect(html(<Accordion title="t" summary="3 set">x</Accordion>)).toContain('3 set');
  });
});

describe('Toggle', () => {
  it('renders a native checkbox inside its label', () => {
    const out = html(<Toggle checked onChange={() => {}} label="Allow paid documents" />);
    expect(out).toContain('type="checkbox"');
    expect(out).toContain('checked');
    expect(out).toContain('<label');
  });

  it('renders help text describing the current state', () => {
    expect(html(<Toggle checked={false} onChange={() => {}} label="l" help="Free sources only." />))
      .toContain('Free sources only.');
  });

  it('marks itself disabled on both the input and the wrapper', () => {
    const out = html(<Toggle checked={false} onChange={() => {}} label="l" disabled />);
    expect(out).toContain('rui-toggle--disabled');
    expect(out).toContain('disabled');
  });
});

describe('SegmentedTabs', () => {
  const tabs = [{ id: 'a', label: 'Overview' }, { id: 'b', label: 'Documents', count: 0 }];

  it('announces itself as a tablist with a selected tab', () => {
    const out = html(<SegmentedTabs tabs={tabs} activeId="a" onChange={() => {}} aria-label="Sections" />);
    expect(out).toContain('role="tablist"');
    expect(out).toContain('aria-label="Sections"');
    expect(out).toContain('aria-selected="true"');
    expect(out).toContain('aria-selected="false"');
  });

  it('renders a count of ZERO rather than hiding it', () => {
    // "0 documents" is information. Hiding it makes an empty tab look like a broken one.
    expect(html(<SegmentedTabs tabs={tabs} activeId="a" onChange={() => {}} aria-label="s" />))
      .toContain('>0<');
  });
});

describe('SectionHeader and StatPill', () => {
  it('renders a heading, an optional count and an optional action', () => {
    const out = html(<SectionHeader title="Documents" count={5} action={<button>Add</button>} />);
    expect(out).toContain('<h3');
    expect(out).toContain('5');
    expect(out).toContain('Add');
  });

  it('omits the count when there is none, rather than printing undefined', () => {
    expect(html(<SectionHeader title="T" />)).not.toContain('undefined');
  });

  it('StatPill carries its meaning as a named tone AND as text', () => {
    const out = html(<StatPill tone="bad">failed</StatPill>);
    expect(out).toContain('rui-stat-pill--bad');
    // Colour must never be the only carrier of the signal.
    expect(out).toContain('failed');
  });
});

describe('EmptyState', () => {
  it('says what to do, not just that there is nothing', () => {
    const out = html(<EmptyState title="No documents yet" body="Start a run to collect them." action={<button>Start</button>} />);
    expect(out).toContain('No documents yet');
    expect(out).toContain('Start a run to collect them.');
    expect(out).toContain('Start');
  });

  it('hides a decorative icon from assistive tech', () => {
    expect(html(<EmptyState title="t" icon="📄" />)).toContain('aria-hidden="true"');
  });
});

describe('every class these render is defined beside them', () => {
  const ROOT = process.cwd();
  const UI = path.join(ROOT, 'app/admin/research/components/ui');
  const css = fs.readFileSync(path.join(UI, 'primitives.css'), 'utf8');
  const tsx = fs.readFileSync(path.join(UI, 'index.tsx'), 'utf8');

  it('finds a plausible number of rendered classes — a broken scan passes everything', () => {
    const rendered = [...tsx.matchAll(/rui-[a-z-]+(?:__[a-z-]+)?(?:--[a-z-]+)?/g)].map((m) => m[0]);
    expect(new Set(rendered).size).toBeGreaterThan(10);
  });

  it('has no rendered class missing from the stylesheet', () => {
    // Per the A1 audit: assert on the STEM for composed names. `rui-stat-pill--${tone}` never
    // appears literally, so the tone variants are checked separately below.
    const rendered = [...new Set(
      [...tsx.matchAll(/rui-[a-z-]+(?:__[a-z-]+)?(?:--[a-z-]+)?/g)].map((m) => m[0]),
    )];
    const missing = rendered.filter((c) => !css.includes(`.${c}`));
    expect(missing, `rendered but never styled:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('defines every StatPill tone the type allows', () => {
    // The one composed class name in the set: `rui-stat-pill--${tone}`. A tone in the union with no
    // rule renders an unstyled pill, which reads as a bug in the data rather than in the CSS.
    for (const tone of ['neutral', 'good', 'warn', 'bad', 'info']) {
      expect(css, `tone "${tone}" has no rule`).toContain(`.rui-stat-pill--${tone}`);
    }
  });

  it('imports its own stylesheet — the trap this component set exists to avoid', () => {
    // AdminResearch.css is route-scoped to /admin/research/**. A shared primitive relying on it
    // renders unstyled anywhere else, silently. Third instance in this repo.
    expect(tsx).toContain("import './primitives.css'");
  });
});
