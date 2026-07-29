// __tests__/dnd/feats-2014-copy.test.ts — the 2014 feat slot explains itself (P1-3, audit C-8).
//
// `FEATS_2014` holds exactly one feat and can never hold more: SRD 5.1 contains only Grappler, and the free
// Basic Rules describe feats as an optional rule without reprinting the list. Everything else is PHB-only
// content outside CC-BY.
//
// `FEATS_2014_STATUS` has recorded all of that carefully for a long time — `completeForSources: true`,
// `completeForEdition: false`, a paragraph of explanation — and **nothing ever rendered it**. A 2014 player
// opened the ASI step, saw one feat, and had no way to tell a licence constraint from a broken catalogue.
// That is the gap; the data was never the gap.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FEATS_2014, FEATS_2014_STATUS } from '@/lib/dnd/feats/dnd5e-2014';

const builder = readFileSync(join(process.cwd(), 'app/dnd/_ui/LevelBuilder.tsx'), 'utf8');

describe('the catalogue is still exactly what the note claims', () => {
  it('holds one feat, and the status object agrees', () => {
    // The note's wording is only honest while this holds. If a legitimately-licensed 2014 feat is ever
    // added, this fails and the copy must be revisited — which is the point.
    expect(FEATS_2014).toHaveLength(1);
    expect(FEATS_2014[0].name).toBe('Grappler');
    expect(FEATS_2014_STATUS.totalFeats).toBe(1);
  });

  it('and is complete for its sources but not for the edition', () => {
    expect(FEATS_2014_STATUS.completeForSources).toBe(true);
    expect(FEATS_2014_STATUS.completeForEdition).toBe(false);
  });
});

describe('the ASI picker explains the constraint', () => {
  it('renders a note gated to 2014', () => {
    expect(builder).toContain("system === 'dnd5e-2014' && (");
  });

  it('says it is deliberate rather than missing, and points at the route that works', () => {
    // The two things a player needs: this is not a bug, and here is what to do instead.
    expect(builder).toMatch(/deliberately absent rather than\s*\n?\s*missing/);
    expect(builder).toMatch(/Custom feat/);
  });

  it('and says custom picks are flagged, not blocked', () => {
    // Otherwise "use custom" reads as a dead end for anyone on a vanilla-only table.
    expect(builder).toMatch(/flagged for DM review, not blocked/);
  });

  it('the picker receives the system it gates on', () => {
    // Without this prop the note can never render — the exact "authored but not wired" shape this audit
    // keeps finding, and it would have looked done from the component alone.
    expect(builder).toMatch(/<AsiFeatPicker[\s\S]{0,400}?system=\{system\}/);
  });

  it('and 2024 / PF2 / IG do NOT get it', () => {
    // The note would be false on all three: 2024 has a full catalogue, and PF2/IG have their own feat
    // tracks and no ASI slot at all. A single equality check is what keeps it that way.
    expect(builder).not.toMatch(/system !== 'dnd5e-2014' && \([\s\S]{0,200}open licence/);
    const noteBlock = builder.slice(builder.indexOf("system === 'dnd5e-2014' && ("));
    expect(noteBlock.slice(0, 800)).not.toMatch(/dnd5e-2024|pathfinder2e|intuitive-games/);
  });
});
