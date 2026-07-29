// The adopt route wires the three gates that were never connected (P6-8).
//
// `lib/dnd/homebrew/policy.ts` sat in the orphan-exemption list from the day it was written: a campaign-level
// DM gate that nothing invoked, which is indistinguishable from no gate — the same shape as the PF2
// rules-gate bug this repo already fixed once. This slice gives it its only intended caller.
//
// Source-level assertions, deliberately. The gates' BEHAVIOUR is already covered exhaustively by
// `homebrew-policy.test.ts` and `homebrew-adopt.test.ts`; what has never been tested is that a route
// actually calls them, in the right order, with the right fallbacks. That is precisely the class of defect
// the 2026-07-28 audit kept finding.
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { canAdoptHomebrew, readHomebrewPolicy, CAMPAIGN_HOMEBREW_THEME_KEY } from '@/lib/dnd/homebrew/policy';
import type { HomebrewContent } from '@/lib/dnd/homebrew/model';

const ROUTE = 'app/api/dnd/homebrew/[id]/adopt/route.ts';
const src = readFileSync(join(process.cwd(), ROUTE), 'utf8');

const piece = (over: Partial<HomebrewContent> = {}): HomebrewContent => ({
  id: 'hb-1', kind: 'item', name: 'Belt', system: 'dnd5e-2024',
  creator: { name: 'Jacob' }, status: 'approved', ...over,
});

describe('the route exists and is reachable', () => {
  it('is mounted at the expected path', () => {
    expect(existsSync(join(process.cwd(), ROUTE))).toBe(true);
  });

  it('and a UI actually calls it — the half that A-3 taught us to check', () => {
    const panel = readFileSync(join(process.cwd(), 'app/dnd/_ui/AdoptContentPanel.tsx'), 'utf8');
    expect(panel).toMatch(/\/adopt/);
    const page = readFileSync(join(process.cwd(), 'app/dnd/characters/[id]/page.tsx'), 'utf8');
    expect(page, 'the panel must be rendered, not merely written').toMatch(/<AdoptContentPanel/);
  });
});

describe('all three gates are called', () => {
  it('1 — character write access', () => {
    expect(src).toContain('getCharacterAccess');
    expect(src).toMatch(/canWrite/);
  });

  it('2 — the DM allowlist, which is what policy.ts was written for', () => {
    expect(src).toContain('canAdoptHomebrew');
    expect(src).toContain('readHomebrewPolicy');
  });

  it('3 — the engine, via the adopt converters that refuse an invalid payload', () => {
    expect(src).toContain('adoptHomebrew');
  });

  it('and the system match is checked BEFORE the DM gate', () => {
    // Ordering matters for the error a player sees: "this is Pathfinder content on a 5e character" tells
    // them what is wrong, where "your DM hasn't allowed this" would send them to ask for something that
    // could never have worked.
    //
    // Compare CALL SITES, not the whole file — the first version of this compared raw `indexOf` and was
    // really measuring the order of the two import statements, which says nothing about execution.
    const body = src.slice(src.indexOf('export async function POST'));
    const sysAt = body.indexOf('homebrewInSystem');
    const dmAt = body.indexOf('canAdoptHomebrew');
    expect(sysAt, 'system check missing from the handler').toBeGreaterThan(-1);
    expect(dmAt, 'DM gate missing from the handler').toBeGreaterThan(-1);
    expect(sysAt).toBeLessThan(dmAt);
  });
});

describe('the gate behaves at the edges the route relies on', () => {
  it('a campaign with no stored policy allows nothing — closed by default', () => {
    const policy = readHomebrewPolicy(undefined);
    expect(canAdoptHomebrew(piece(), policy)).toBe(false);
  });

  it('the DM can always use their own campaign’s content', () => {
    expect(canAdoptHomebrew(piece(), readHomebrewPolicy(undefined), { isDM: true })).toBe(true);
  });

  it('an allowlisted piece passes; an unlisted one does not', () => {
    const policy = readHomebrewPolicy({ allowedIds: ['hb-1'] });
    expect(canAdoptHomebrew(piece(), policy)).toBe(true);
    expect(canAdoptHomebrew(piece({ id: 'hb-2' }), policy)).toBe(false);
  });

  it('and an unpublished piece is refused even when allowlisted', () => {
    const policy = readHomebrewPolicy({ allowAll: true });
    expect(canAdoptHomebrew(piece({ status: 'draft' }), policy)).toBe(false);
  });
});

describe('a character with no campaign has no DM to gate it', () => {
  it('the route only reads a policy when there IS a campaign', () => {
    // A personal sheet has no table and therefore no allowlist. Applying the closed-by-default policy
    // there would make the Studio unusable outside a campaign, which is where most authoring happens.
    expect(src).toMatch(/if \(campaignId\) \{/);
  });
});

describe('the allowlist key is shared, not spelled twice', () => {
  it('lives in policy.ts and is imported by the route', () => {
    expect(CAMPAIGN_HOMEBREW_THEME_KEY).toBe('homebrew');
    expect(src).toContain('CAMPAIGN_HOMEBREW_THEME_KEY');
  });

  it('and the route exports NO helper of its own', () => {
    // A route module may only export recognised handlers: an extra export typechecks and then fails
    // `next build`. This repo has been bitten by it before, which is why the constant moved to lib.
    const exports = [...src.matchAll(/^export (?:const|function|async function) (\w+)/gm)].map((m) => m[1]);
    expect(exports).toEqual(['POST']);
  });
});

describe('adoption is auditable and reversible', () => {
  it('writes a sheet-edit row under a batch id, so it undoes like any other change', () => {
    expect(src).toContain('dnd_sheet_edits');
    expect(src).toContain('batch_id');
    expect(src).toContain("source: 'homebrew-adopt'");
  });
});
