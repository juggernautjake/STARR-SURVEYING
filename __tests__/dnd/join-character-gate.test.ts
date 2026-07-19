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

  it('is restricted to the DEMO campaign — cannot self-join someone else’s campaign', () => {
    expect(SRC).toMatch(/params\.id !== DEMO_CAMPAIGN_ID/);
    expect(SRC).toMatch(/DEMO_CAMPAIGN_ID[\s\S]{0,120}status: 403/);
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
