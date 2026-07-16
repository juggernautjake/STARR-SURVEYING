// __tests__/dnd/quick-npc.test.ts — the campaign quick-NPC generator (Slice 31).
//
// "We should be able to create an npc very quickly by generating it with whatever quick info I give
// it." Lifts the streamer flow's generator into a campaign-scoped endpoint, surfaced as a Quick NPC
// form on the DM manage page. Source-anchored (the endpoint hits Supabase + the AI) + a live check
// that a generated NPC writes through the SAME applySheetEdits vocabulary every other build uses.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const ENDPOINT = read('app/api/dnd/campaigns/[id]/npc/route.ts');
const PAGE = read('app/dnd/_ui/CampaignPageClient.tsx');

describe('the quick-NPC endpoint is DM-gated and campaign-scoped', () => {
  it('gates on the campaign DM and requires a brief', () => {
    expect(ENDPOINT).toContain("getCampaignRole(params.id)) !== 'dm'");
    expect(ENDPOINT).toContain('Describe the NPC in a sentence.');
  });
  it('creates a campaign NPC under a roster role, grounded on the campaign system', () => {
    expect(ENDPOINT).toContain('campaign_id: params.id');
    expect(ENDPOINT).toContain('is_npc: true');
    expect(ENDPOINT).toContain('roster_role: rosterRole');
    expect(ENDPOINT).toContain('normalizeSystem');
  });
  it('builds through the shared edit pipeline (indistinguishable from a hand build), AI-optional', () => {
    expect(ENDPOINT).toContain('applySheetEdits(seed, edits)');
    expect(ENDPOINT).toContain('if (dndAiConfigured())');
    expect(ENDPOINT).toMatch(/keep the plain sheet/); // AI off → the blank NPC still stands
  });
});

describe('the DM manage page surfaces a Quick NPC form', () => {
  it('is DM-only, posts a brief + rosterRole, and refreshes', () => {
    expect(PAGE).toContain('Quick NPC');
    expect(PAGE).toContain('/api/dnd/campaigns/${data.campaign.id}/npc');
    expect(PAGE).toContain('rosterRole: npcRole');
    expect(PAGE).toContain('router.refresh()');
  });
});

describe('a generated NPC is the same shape as any other character', () => {
  it('the edits the AI would emit apply cleanly to a blank NPC', () => {
    const seed = blankCharacter('Dock Guard');
    const edits: SheetEdit[] = [
      { op: 'set_level', value: 2 },
      { op: 'set_ability', ability: 'str', value: 13 },
      { op: 'add_attack', name: 'Spear', ability: 'str', damage: '1d6', damageType: 'piercing' },
      { op: 'add_feature', name: 'In Over His Head', source: 'Role', body: ['Owes money to the wrong people.'] },
    ];
    const out = applySheetEdits(seed, edits);
    expect(out.meta.level).toBe(2);
    expect(out.abilities.str).toBe(13);
    expect(out.attacks.some((a) => a.name === 'Spear')).toBe(true);
  });
});
