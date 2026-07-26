// __tests__/dnd/join-character-gate.test.ts — self-join security gates. The route lets a signed-in user
// attach one of THEIR OWN characters to the open demo campaign. Two gates keep that safe: (1) it's restricted
// to the DEMO campaign — you can't push into someone else's campaign; (2) an OWNERSHIP check — you can only
// add your own character. Since 2026-07-18 the route NO LONGER mutates visibility on join (characters are
// public by default and a deliberately-private sheet stays private — the DM always sees it, only fellow players
// are gated), so there's no private→campaign bump to guard anymore. Source-anchored: driving the route needs a
// live DB + session, so we lock the gates against a silent regression.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(process.cwd(), 'app/api/dnd/campaigns/[id]/join-character/route.ts'), 'utf8');

describe('join-character self-join gates', () => {
  it('requires a signed-in session', () => {
    expect(SRC).toContain('getDndSession()');
    expect(SRC).toMatch(/if \(!session\)[\s\S]{0,80}status: 401/);
  });

  it('cannot self-join a campaign you do not belong to', () => {
    // THE PROPERTY IS UNCHANGED; the implementation moved (2026-07-26, S11). This used to be enforced as
    // "demo campaign only", which also made "take a character IN" demo-only while "take it out" already
    // worked anywhere — the asymmetry the owner asked to close. The protection is now stated directly:
    // a caller with no role in the target campaign is refused, so nobody can push a character into a
    // stranger's game. The demo remains self-joinable because it is open-access by design.
    expect(SRC).toContain('getCampaignRole(params.id)');
    expect(SRC).toMatch(/role === null[\s\S]{0,220}status: 403/);
    expect(SRC).toContain('DEMO_CAMPAIGN_ID'); // still special-cased, as the one open-access table
  });

  it('enforces OWNERSHIP — only the caller’s own character can be joined (403 otherwise)', () => {
    // The gate that stops the private→campaign visibility bump from exposing another user's sheet.
    expect(SRC).toMatch(/ch\.owner_user_id !== session\.userId/);
    expect(SRC).toMatch(/owner_user_id !== session\.userId[\s\S]{0,120}status: 403/);
  });

  it('no longer mutates visibility on join — a deliberately-private sheet stays private (public-by-default model)', () => {
    // The old force-promote (private → campaign) was removed: characters are public by default, and if an owner
    // made one private that choice is respected on join (the DM still always sees it). Guard the removal so a
    // future edit doesn't quietly reintroduce a visibility mutation that would override the owner's privacy.
    expect(SRC).not.toContain("patch.visibility");
    expect(SRC).not.toContain("visibility === 'private'");
  });
});
