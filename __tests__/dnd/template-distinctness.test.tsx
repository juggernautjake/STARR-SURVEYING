// __tests__/dnd/template-distinctness.test.tsx — the four templates really CHANGE the sheet on PF2/IG (CT-1).
//
// The owner's complaint was that PF2/IG "templates don't change". This renders each bespoke sheet at all four
// layouts and asserts each produces its shell's SIGNATURE — Codex the pane rail (`codex-main`), Dashboard the
// card grid (`dash-grid`), Play the reference drawer (`play-ref`), Classic none of those — proving the
// templates are structurally distinct per system, and locking it so a future change can't silently collapse
// them to one layout.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PF2Sheet from '@/app/dnd/_ui/PF2Sheet';
import IGSheet from '@/app/dnd/_ui/IGSheet';
import { blankPF2Character } from '@/lib/dnd/systems/pathfinder2e/model';
import { blankIGCharacter } from '@/lib/dnd/systems/intuitive-games/model';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

const pf2 = (layout: string) =>
  renderToStaticMarkup(<PF2Sheet pf2={blankPF2Character('T')} characterId="c" canEdit layout={layout} />);
const ig = (layout: string) =>
  renderToStaticMarkup(<IGSheet ig={blankIGCharacter('T')} elements={[]} characterId="c" canEdit layout={layout} />);

const SIGNATURE = { codex: 'codex-main', dashboard: 'dash-grid', play: 'play-ref' } as const;

describe.each([
  ['PF2', pf2],
  ['IG', ig],
])('%s templates are structurally distinct', (_name, render) => {
  it('Codex renders the pane rail, not the dashboard grid or play drawer', () => {
    const html = render('codex');
    expect(html).toContain(SIGNATURE.codex);
    expect(html).not.toContain(SIGNATURE.dashboard);
    expect(html).not.toContain(SIGNATURE.play);
  });

  it('Dashboard renders the card grid, not the pane rail or play drawer', () => {
    const html = render('dashboard');
    expect(html).toContain(SIGNATURE.dashboard);
    expect(html).not.toContain(SIGNATURE.codex);
    expect(html).not.toContain(SIGNATURE.play);
  });

  it('Play renders the reference drawer, not the pane rail or dashboard grid', () => {
    const html = render('play');
    expect(html).toContain(SIGNATURE.play);
    expect(html).not.toContain(SIGNATURE.codex);
    expect(html).not.toContain(SIGNATURE.dashboard);
  });

  it('Classic renders none of the shell signatures (its own stacked form)', () => {
    const html = render('classic');
    expect(html).not.toContain(SIGNATURE.codex);
    expect(html).not.toContain(SIGNATURE.dashboard);
    expect(html).not.toContain(SIGNATURE.play);
    expect(html.length).toBeGreaterThan(200); // it still renders a full sheet
  });
});
