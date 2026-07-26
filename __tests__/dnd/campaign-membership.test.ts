// __tests__/dnd/campaign-membership.test.ts — taking a character into and out of a campaign (S11).
//
// Owner, 2026-07-26: "make sure there is a clear and easy way to take character into and out of a campaign".
//
// Both halves already existed server-side and neither was reachable from the character:
//   · `DELETE /api/dnd/campaigns/[id]/characters/[characterId]` already allows the character's OWNER as well
//     as the DM — but its only caller was `CampaignHub`, the DM's roster.
//   · `POST .../join-character` had exactly one caller, `AddToDemoButton`, hard-wired to the demo campaign.
// And nothing listed which campaigns a character was in: `campaignsForCharacter` was used for permission
// checks only. So the capability was there and the affordance wasn't.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  membershipView, canLeaveCampaign, canJoinCampaign, membershipSummary, type CampaignRef,
} from '@/lib/dnd/campaign-membership';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const C = (id: string, name: string, role: 'dm' | 'player' | null = 'player'): CampaignRef => ({ id, name, role });

describe('splitting the caller\'s campaigns', () => {
  it('separates the ones it is in from the ones it could join', () => {
    const view = membershipView([C('a', 'Ashfall'), C('b', 'Bleak Harbour')], ['a']);
    expect(view.member.map((c) => c.id)).toEqual(['a']);
    expect(view.joinable.map((c) => c.id)).toEqual(['b']);
  });

  it('sorts by name so the list is stable between renders', () => {
    const view = membershipView([C('z', 'Zephyr'), C('a', 'Ashfall'), C('m', 'Mire')], []);
    expect(view.joinable.map((c) => c.name)).toEqual(['Ashfall', 'Mire', 'Zephyr']);
  });

  it('keeps a membership the CALLER cannot see, rather than hiding it', () => {
    // A DM added the character, then the player left that table. The character is still on the roster, and
    // a panel that omitted it would be telling the player something untrue about their own character.
    const view = membershipView([C('a', 'Ashfall')], ['a', 'secret']);
    expect(view.member.map((c) => c.id).sort()).toEqual(['a', 'secret']);
    expect(view.member.find((c) => c.id === 'secret')?.role).toBeNull();
  });

  it('names an unseen campaign when a name is known', () => {
    const view = membershipView([], ['x'], { x: 'The Long Dark' });
    expect(view.member[0].name).toBe('The Long Dark');
  });

  it('never duplicates a campaign, however the rows arrive', () => {
    const view = membershipView([C('a', 'Ashfall'), C('a', 'Ashfall')], ['a']);
    expect(view.member).toHaveLength(1);
    expect(view.joinable).toHaveLength(0);
  });

  it('handles a character in nothing and a caller in nothing', () => {
    expect(membershipView([], [])).toEqual({ member: [], joinable: [] });
  });
});

describe('who may take it out', () => {
  it('the owner may, from any campaign — matching the DELETE route', () => {
    expect(canLeaveCampaign({ isOwner: true, role: 'player' })).toBe(true);
    expect(canLeaveCampaign({ isOwner: true, role: null })).toBe(true);
  });

  it('a DM may, from their own campaign', () => {
    expect(canLeaveCampaign({ isOwner: false, role: 'dm' })).toBe(true);
  });

  it('another player may not', () => {
    expect(canLeaveCampaign({ isOwner: false, role: 'player' })).toBe(false);
    expect(canLeaveCampaign({ isOwner: false, role: null })).toBe(false);
  });
});

describe('who may take it in', () => {
  it('the owner may, into a campaign they belong to', () => {
    expect(canJoinCampaign({ isOwner: true, role: 'player' })).toBe(true);
  });

  it('nobody may add a character to a campaign they are not in', () => {
    // Otherwise the button would offer something the join route refuses.
    expect(canJoinCampaign({ isOwner: true, role: null })).toBe(false);
  });

  it('a DM may bring one to their own table; a player may not add someone else\'s', () => {
    expect(canJoinCampaign({ isOwner: false, role: 'dm' })).toBe(true);
    expect(canJoinCampaign({ isOwner: false, role: 'player' })).toBe(false);
  });
});

describe('the summary line says the state plainly', () => {
  it('distinguishes "no campaigns yet" from "you have none either"', () => {
    expect(membershipSummary({ member: [], joinable: [C('a', 'Ashfall')] })).toMatch(/yours alone/);
    expect(membershipSummary({ member: [], joinable: [] })).toMatch(/Join or create a campaign/);
  });

  it('names one campaign, and counts several', () => {
    expect(membershipSummary({ member: [C('a', 'Ashfall')], joinable: [] })).toBe('In Ashfall.');
    expect(membershipSummary({ member: [C('a', 'Ashfall'), C('b', 'Bleak Harbour')], joinable: [] }))
      .toBe('In 2 campaigns: Ashfall, Bleak Harbour.');
  });
});

describe('the rule lives in ONE place', () => {
  it('the DELETE route still allows the owner as well as the DM', () => {
    // `canLeaveCampaign` mirrors this. If the route ever narrows, the UI would offer a button the server
    // refuses — which reads as a broken app rather than a permission.
    const route = read('app/api/dnd/campaigns/[id]/characters/[characterId]/route.ts');
    expect(route).toContain("if (!isOwner && role !== 'dm')");
  });

  it('joining is no longer demo-only, but still requires membership', () => {
    // The asymmetry S11 closed: "take out" already worked for any campaign while "take in" was restricted to
    // the open demo, so the panel's Join button would have 403'd everywhere else — the exact "button the
    // server refuses" failure. The protection it was there for is now stated directly: a NON-member still
    // cannot push a character into someone else's game.
    const route = read('app/api/dnd/campaigns/[id]/join-character/route.ts');
    expect(route).toContain('getCampaignRole(params.id)');
    expect(route).toContain('if (role === null)');
    expect(route).not.toMatch(/if \(params\.id !== DEMO_CAMPAIGN_ID\) \{\s*return NextResponse/);
    // …and you still may only add your OWN character.
    expect(route).toContain('ch.owner_user_id !== session.userId');
  });

  it('the panel and the route decide with the same module', () => {
    const ui = read('app/dnd/_ui/CharacterCampaigns.tsx');
    const route = read('app/api/dnd/characters/[id]/campaigns/route.ts');
    expect(ui).toContain("from '@/lib/dnd/campaign-membership'");
    expect(route).toContain("from '@/lib/dnd/campaign-membership'");
    // The panel adds no new write path — it calls the two endpoints that already carry the authorization.
    expect(ui).toContain('/join-character');
    expect(ui).toContain(`/characters/\${characterId}`);
  });

  it('the panel is mounted on the character page', () => {
    expect(read('app/dnd/characters/[id]/page.tsx')).toContain('<CharacterCampaigns characterId={character.id} />');
  });
});

describe('joining as a separate variant (S12)', () => {
  // Owner: "when we are taking a character into a campaign, there is an option to take the exact same
  // character, or to make a variant to keep separate from the original build." Both pieces already existed —
  // `fork` (git-like lineage) and `set-campaign` (the Campaign tag on a slot) — and nothing joined them up.
  const ui = read('app/dnd/_ui/CharacterCampaigns.tsx');

  it('offers both intentions, not just one', () => {
    expect(ui).toContain('Take in as a variant');
    expect(ui).toContain('joinAsVariant');
  });

  it('reuses fork + set-campaign rather than inventing a copy path', () => {
    expect(ui).toContain("action: 'fork'");
    expect(ui).toContain("action: 'set-campaign'");
    expect(ui).toContain('slotId: fb.slotId');
  });

  it('joins FIRST, so a fork failure cannot lose the thing the player asked for', () => {
    // The realistic failure is the 20-version cap. Join-then-fork leaves them in the campaign and says the
    // variant was not made; fork-first would risk a stray variant for a campaign they never joined.
    const body = ui.slice(ui.indexOf('const joinAsVariant'), ui.indexOf('if (!view)'));
    expect(body.indexOf('join-character')).toBeLessThan(body.indexOf("action: 'fork'"));
    expect(body).toContain('but the separate variant could not be made');
  });

  it('names the variant after the campaign, so the versions list is legible', () => {
    expect(ui).toContain("action: 'fork', name: c.name");
  });
});
