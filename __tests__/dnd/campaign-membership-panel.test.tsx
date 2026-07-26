// __tests__/dnd/campaign-membership-panel.test.tsx — what the Campaigns panel actually RENDERS (S11/S12).
//
// Why a render test and not more source-greps. The rest of this feature's coverage asserts that the panel
// *calls* the right endpoints, which is exactly the kind of proof that has already failed twice here: the 5e
// build gate passed 9 source-anchored tests while refusing every legal build, and a green 15k-test suite
// missed three rendering-condition bugs in one browser pass. A grep proves a call exists; only a render proves
// the right control reaches the screen.
//
// This renders the real component with `renderToStaticMarkup` (the repo's pattern under the node
// environment). The fetching container returns `null` until its request resolves — which is why the markup
// was split into `CampaignsPanel`, so these states are reachable at all.
//
// It does NOT replace driving the page in a browser, which is still owed: no effects run here, no CSS is
// applied, and nothing proves the panel is positioned sensibly on the page.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CampaignsPanel } from '@/app/dnd/_ui/CharacterCampaigns';
import type { CampaignRef, MembershipView } from '@/lib/dnd/campaign-membership';

const C = (id: string, name: string, role: 'dm' | 'player' | null = 'player'): CampaignRef => ({ id, name, role });
const noop = () => {};

const render = (view: MembershipView, isOwner = true, extra: Partial<{ busy: string | null; msg: string | null }> = {}) =>
  renderToStaticMarkup(
    <CampaignsPanel
      view={view} isOwner={isOwner} busy={extra.busy ?? null} msg={extra.msg ?? null}
      onLeave={noop} onJoin={noop} onJoinVariant={noop}
    />,
  );

describe('a character already in a campaign', () => {
  const view: MembershipView = { member: [C('a', 'Ashfall')], joinable: [] };

  it('names the campaign and offers a way out', () => {
    const html = render(view);
    expect(html).toContain('Ashfall');
    expect(html).toContain('Take out');
    expect(html).toContain('In Ashfall.');
  });

  it('does not offer to add it to the campaign it is already in', () => {
    expect(render(view)).not.toContain('Take in');
  });

  it('marks the campaigns the viewer DMs', () => {
    expect(render({ member: [C('a', 'Ashfall', 'dm')], joinable: [] })).toContain('YOU DM');
  });

  it('says out loud when the viewer is not in a roster the character is on', () => {
    // Rather than rendering a nameless row and leaving the player to wonder.
    const html = render({ member: [C('x', 'A campaign you are not in', null)], joinable: [] });
    expect(html).toContain('you are not in this one');
  });
});

describe('permission gating reaches the markup', () => {
  it('a non-owner, non-DM viewer gets no Take out button', () => {
    // The DELETE route refuses them; showing the button would read as a broken app.
    const html = render({ member: [C('a', 'Ashfall', 'player')], joinable: [] }, false);
    expect(html).toContain('Ashfall');
    expect(html).not.toContain('Take out');
  });

  it('a DM keeps it even when they do not own the character', () => {
    expect(render({ member: [C('a', 'Ashfall', 'dm')], joinable: [] }, false)).toContain('Take out');
  });

  it('a joinable campaign the viewer only plays in is not offered for someone else\'s character', () => {
    const html = render({ member: [], joinable: [C('b', 'Bleak Harbour', 'player')] }, false);
    expect(html).not.toContain('Take in');
  });

  it('and does not leave an empty "Add to a campaign" heading behind', () => {
    // Found BY this test file: the section rendered whenever `joinable` was non-empty, but its rows are
    // permission-filtered — so a viewer who may join none of them got a heading with nothing under it. A
    // header promising an action that isn't there is worse than no header.
    const html = render({ member: [], joinable: [C('b', 'Bleak Harbour', 'player')] }, false);
    expect(html).not.toContain('Add to a campaign');
  });
});

describe('both ways in are offered (S12)', () => {
  const view: MembershipView = { member: [], joinable: [C('b', 'Bleak Harbour')] };

  it('offers the character itself AND a separate variant', () => {
    const html = render(view);
    expect(html).toContain('Take in');
    expect(html).toContain('Take in as a variant');
  });

  it('explains the difference where the choice is made, not in a help page', () => {
    const html = render(view);
    expect(html).toContain('one build, shared across every campaign');
    expect(html).toContain('never changes your original build');
  });
});

describe('the states that are easy to render badly', () => {
  it('a character in nothing, with campaigns available, says what to do', () => {
    const html = render({ member: [], joinable: [C('b', 'Bleak Harbour')] });
    expect(html).toContain('yours alone');
    expect(html).toContain('Take in');
  });

  it('a viewer with no campaigns at all is told that, not shown an empty list', () => {
    const html = render({ member: [], joinable: [] });
    expect(html).toContain('Join or create a campaign first');
    expect(html).not.toContain('Take in');
    expect(html).not.toContain('Take out');
  });

  it('renders several campaigns without collapsing them into one', () => {
    const html = render({ member: [C('a', 'Ashfall'), C('b', 'Bleak Harbour')], joinable: [C('c', 'Cinderfall')] });
    for (const n of ['Ashfall', 'Bleak Harbour', 'Cinderfall']) expect(html).toContain(n);
    expect(html).toContain('In 2 campaigns');
  });

  it('shows a pending action as busy on the row being acted on, and only that row', () => {
    const html = render({ member: [C('a', 'Ashfall'), C('b', 'Bleak Harbour')], joinable: [] }, true, { busy: 'leave-a' });
    // The busy row loses its label; the other keeps it.
    expect(html).toContain('…');
    expect(html).toContain('Take out');
  });

  it('surfaces an error message rather than failing silently', () => {
    expect(render({ member: [], joinable: [] }, true, { msg: 'Could not load campaigns.' }))
      .toContain('Could not load campaigns.');
  });

  it('always renders the heading, so the panel is findable even when empty', () => {
    expect(render({ member: [], joinable: [] })).toContain('Campaigns');
  });
});
