// __tests__/dnd/campaign-remove-character.test.ts — taking a character OUT of a campaign, from both sides
// (owner 2026-07-25: "a clear and easy way to remove characters from a campaign" on the player and DM pages).
//
// The DM page had a remove behind a browser confirm(); the PLAYER page had none at all, while the add
// control's own copy promised "you can remove it again anytime". Source-level guards, in the idiom this repo
// already uses for route/UI wiring, because the behaviour spans a route + two client components.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const route = read('app/api/dnd/campaigns/[id]/characters/[characterId]/route.ts');
const hub = read('app/dnd/_ui/CampaignHub.tsx');
const dm = read('app/dnd/_ui/CampaignPageClient.tsx');

describe('the DELETE route clears BOTH places membership is stored', () => {
  // characterIdsInCampaign() unions dnd_campaign_characters with dnd_characters.campaign_id, so dropping
  // only the join row would leave the character still listed on the roster.
  it('deletes the join row', () => {
    expect(route).toContain("from('dnd_campaign_characters')");
    expect(route).toContain('.delete()');
  });
  it('and repoints the character’s home campaign', () => {
    expect(route).toContain("from('dnd_characters')");
    expect(route).toMatch(/campaign_id:\s*nextHome/);
  });
  it('authorises the character’s OWNER as well as the DM — which is what lets a player leave', () => {
    expect(route).toMatch(/!isOwner\s*&&\s*role !== 'dm'/);
  });
});

describe('the PLAYER hub can now remove its own characters', () => {
  it('calls DELETE on the campaign-character route', () => {
    expect(hub).toMatch(/fetch\(`\/api\/dnd\/campaigns\/\$\{data\.id\}\/characters\/\$\{id\}`, \{ method: 'DELETE' \}\)/);
  });
  it('offers the control only on the player’s OWN characters', () => {
    expect(hub).toContain('{c.mine && (');
    expect(hub).toContain('leave this table');
  });
  it('confirms first, in-app rather than via window.confirm', () => {
    expect(hub).toContain('setConfirmRemove({ id: c.id, name: c.name })');
    expect(hub).toContain('role="dialog"');
    expect(hub).not.toContain('window.confirm');
  });
  it('says the character itself is kept — the fear this dialog has to answer', () => {
    expect(hub).toContain('keep the character');
  });
  it('surfaces a failure instead of silently doing nothing', () => {
    expect(hub).toContain('setRemoveErr');
  });
});

describe('the DM page’s removal was upgraded to match', () => {
  it('no longer uses the browser confirm for CHARACTER removal', () => {
    // Scoped to this handler on purpose: removing a PLAYER from the campaign is a separate feature that
    // still uses window.confirm, and is not what this change touched.
    expect(dm).not.toMatch(/async function removeFromCampaign[\s\S]{0,300}window\.confirm/);
  });
  it('confirms in-app', () => {
    expect(dm).toContain('setConfirmRemove({ id: c.id, name: c.name })');
    expect(dm).toMatch(/role="dialog" aria-label=\{`Remove \$\{confirmRemove\.name\}/);
  });
  it('SHOWS a failed removal — previously a failure looked identical to nothing happening', () => {
    expect(dm).toContain('setRemoveErr');
    expect(dm).toContain('Could not remove that character from the campaign.');
  });
});
