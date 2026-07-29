// Sheet rolls reach the table's shared feed (P3-1, audit finding B-2).
//
// THE DEFECT: every roll from every roller went into `commitRoll`, which is a local `setLog` capped at 40.
// Nothing posted to `/api/dnd/rolls`. The only writer to the shared log was the DM's own manual dice box,
// so the "shared roll feed" showed rolls the DM typed in and none the players made — while the route's own
// header claimed *"Every sheet / quick-sheet / quick-action / DM roll posts here"*. Designed, then never
// wired.
//
// The DECISION is tested purely; the SENDING is deliberately unobservable, which is the point.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rollPublishBody, type PublishableRoll } from '@/lib/dnd/roll-publish';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const roll = (over: Partial<PublishableRoll> = {}): PublishableRoll =>
  ({ label: 'Longsword', total: 17, breakdown: '1d20+7 → 10+7', ...over });

const ctx = { characterId: 'c1', campaignId: 'camp1', actorName: 'Lazzuh' };

describe('what gets published', () => {
  it('a normal roll, with everything the feed shows', () => {
    expect(rollPublishBody(roll(), ctx)).toEqual({
      campaignId: 'camp1', characterId: 'c1', actorName: 'Lazzuh',
      label: 'Longsword', formula: '1d20+7 → 10+7', breakdown: '1d20+7 → 10+7',
      result: 17, crit: false, fumble: false,
    });
  });

  it('crit and fumble ride along, because that is what a feed is FOR', () => {
    expect(rollPublishBody(roll({ crit: true }), ctx)!.crit).toBe(true);
    expect(rollPublishBody(roll({ fumble: true }), ctx)!.fumble).toBe(true);
  });

  it('reuses the sheet’s own breakdown as the formula', () => {
    // Inventing a second representation is how the feed starts disagreeing with the sheet about what was
    // rolled — the one thing a shared log must never do.
    const b = rollPublishBody(roll(), ctx)!;
    expect(b.formula).toBe(b.breakdown);
  });

  it('rounds a fractional total rather than sending it', () => {
    expect(rollPublishBody(roll({ total: 17.6 }), ctx)!.result).toBe(18);
  });
});

describe('what does NOT get published', () => {
  it('a roll on a character with no campaign', () => {
    // No table, no shared feed — and a standalone sheet's rolls are nobody else's business.
    expect(rollPublishBody(roll(), { characterId: 'c1', campaignId: null })).toBeNull();
    expect(rollPublishBody(roll(), {})).toBeNull();
  });

  it('an unlabelled roll, which the route would 400 anyway', () => {
    expect(rollPublishBody(roll({ label: '' }), ctx)).toBeNull();
    expect(rollPublishBody(roll({ label: '   ' }), ctx)).toBeNull();
  });
});

describe('optional context is omitted, not sent as null', () => {
  it('no character id', () => {
    const b = rollPublishBody(roll(), { campaignId: 'camp1' })!;
    expect('characterId' in b).toBe(false);
  });

  it('no actor name', () => {
    const b = rollPublishBody(roll(), { campaignId: 'camp1', characterId: 'c1' })!;
    expect('actorName' in b).toBe(false);
  });

  it('no breakdown → no formula either', () => {
    const b = rollPublishBody(roll({ breakdown: undefined }), ctx)!;
    expect('formula' in b).toBe(false);
    expect('breakdown' in b).toBe(false);
  });
});

describe('a roll must never fail because the network did', () => {
  const src = read('lib/dnd/roll-publish.ts');

  it('publishRoll returns void — there is nothing to accidentally await', () => {
    // An `await` here would put a network round trip between pressing a die and seeing it land.
    expect(src).toMatch(/export function publishRoll\([\s\S]{0,200}\): void \{/);
  });

  it('and swallows both failure paths', () => {
    expect(src).toContain('.catch(() => {})');
    expect(src).toMatch(/} catch \{/);
  });

  it('uses keepalive, so a roll made as the tab closes still arrives', () => {
    expect(src).toContain('keepalive: true');
  });

  it('declares its own input type rather than importing the store’s', () => {
    // The store imports this file; pulling `RollEntry` back would be a cycle.
    expect(src).toContain('export interface PublishableRoll');
    expect(src).not.toContain("from '@/app/dnd/_sheet/state/store'");
  });
});

describe('it is wired where EVERY roll goes through', () => {
  const store = read('app/dnd/_sheet/state/store.tsx');

  it('commitRoll publishes', () => {
    // Every roller funnels through `commitRoll`, which is why this is the one line that fixes it.
    //
    // Asserted by SLICING to the function rather than with a distance-bounded regex. The first version used
    // `[\s\S]{0,400}` and failed on a comment growing past the window — a test that breaks when you explain
    // yourself better is a bad test.
    const start = store.indexOf('const commitRoll = useCallback');
    expect(start, 'commitRoll should exist').toBeGreaterThan(-1);
    const body = store.slice(start, store.indexOf('const stage = useCallback', start));
    expect(body).toContain('publishRoll(entry');
  });

  it('with the character and campaign it already knows', () => {
    expect(store).toMatch(/publishRoll\(entry, \{ characterId, campaignId/);
  });

  it('and is not awaited', () => {
    const block = store.slice(store.indexOf('const commitRoll'), store.indexOf('const commitRoll') + 700);
    expect(block).not.toMatch(/await publishRoll/);
  });
});

describe('players can actually see the feed now (P3-2)', () => {
  it('the campaign hub mounts RollFeed', () => {
    // It was previously only inside the DM-facing session console, so players never saw a roll history —
    // which matters rather more now that their own rolls arrive there.
    const hub = read('app/dnd/_ui/CampaignHub.tsx');
    expect(hub).toMatch(/<RollFeed campaignId=/);
  });

  it('and the route comment no longer claims something untrue', () => {
    const route = read('app/api/dnd/rolls/route.ts');
    // The header used to assert every sheet roll posted here, which was false for as long as it existed.
    // Now that it IS true, the claim is fine — this asserts the two stayed in step.
    expect(read('app/dnd/_sheet/state/store.tsx')).toContain('publishRoll');
    expect(route).toContain('dnd_roll_log');
  });
});
