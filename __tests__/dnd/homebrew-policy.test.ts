// __tests__/dnd/homebrew-policy.test.ts — Area H4 (pure DM-gate layer). A campaign's homebrew policy decides
// which shared pieces are legal for its characters: allow-all, an explicit allowlist, or nothing (closed).
import { describe, it, expect } from 'vitest';
import {
  readHomebrewPolicy, homebrewAllowedForCampaign, allowedHomebrewList, toggleHomebrewAllowed,
  describeHomebrewPolicy, canAdoptHomebrew,
} from '@/lib/dnd/homebrew/policy';
import type { HomebrewContent } from '@/lib/dnd/homebrew/model';

const approved: HomebrewContent = { id: 'a', kind: 'feat', name: 'A', system: 'dnd5e-2024', creator: { name: 'J' }, status: 'approved' };
const other: HomebrewContent = { ...approved, id: 'b', name: 'B' };
const draft: HomebrewContent = { ...approved, id: 'd', status: 'draft' };

describe('readHomebrewPolicy — defensive + closed default (H4)', () => {
  it('unknown/missing → nothing allowed (never an accidental open catalog)', () => {
    expect(readHomebrewPolicy(null)).toEqual({ allowAll: false, allowedIds: [] });
    expect(readHomebrewPolicy('junk')).toEqual({ allowAll: false, allowedIds: [] });
    expect(readHomebrewPolicy({ allowAll: true })).toEqual({ allowAll: true, allowedIds: [] });
    expect(readHomebrewPolicy({ allowedIds: ['a', 5, 'b'] }).allowedIds).toEqual(['a', 'b']);
  });
});

describe('the DM gate (H4)', () => {
  it('closed policy allows nothing for a player; allowlist permits only its ids; allowAll permits all approved', () => {
    expect(homebrewAllowedForCampaign(approved, {})).toBe(false);
    expect(homebrewAllowedForCampaign(approved, { allowedIds: ['a'] })).toBe(true);
    expect(homebrewAllowedForCampaign(other, { allowedIds: ['a'] })).toBe(false);
    expect(homebrewAllowedForCampaign(approved, { allowAll: true })).toBe(true);
  });
  it('a DM may use content even when the campaign policy is closed', () => {
    expect(homebrewAllowedForCampaign(draft, {}, { isDM: true })).toBe(true);
  });
  it('allowedHomebrewList returns only the permitted pieces', () => {
    expect(allowedHomebrewList([approved, other, draft], { allowedIds: ['a'] }).map((c) => c.id)).toEqual(['a']);
    expect(allowedHomebrewList([approved, other], { allowAll: true }).map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('DM controls (H4)', () => {
  it('toggleHomebrewAllowed adds/removes an id; no-op under allowAll', () => {
    expect(toggleHomebrewAllowed({}, 'a').allowedIds).toEqual(['a']);
    expect(toggleHomebrewAllowed({ allowedIds: ['a'] }, 'a').allowedIds).toEqual([]);
    expect(toggleHomebrewAllowed({ allowAll: true }, 'a')).toEqual({ allowAll: true }); // whole catalog already open
  });
  it('describeHomebrewPolicy summarises the three states', () => {
    expect(describeHomebrewPolicy({ allowAll: true })).toMatch(/All approved/);
    expect(describeHomebrewPolicy({})).toMatch(/No homebrew is allowed/);
    expect(describeHomebrewPolicy({ allowedIds: ['a'] })).toMatch(/1 homebrew piece is allowed/);
  });
  it('canAdoptHomebrew requires published + allowed (DM previews their drafts)', () => {
    expect(canAdoptHomebrew(approved, { allowedIds: ['a'] })).toBe(true);
    expect(canAdoptHomebrew(draft, { allowedIds: ['d'] })).toBe(false); // not published → a player can't adopt
    expect(canAdoptHomebrew(draft, {}, { isDM: true })).toBe(true);
  });
});
