// __tests__/dnd/join-character-gate.test.ts — self-join security gates. The route lets a signed-in user
// attach one of THEIR OWN characters to the open demo campaign, and (deliberately) promotes a private sheet to
// campaign-visible so it shows there. Two gates keep that from becoming an exposure hole: (1) it's restricted
// to the DEMO campaign — you can't push into someone else's campaign; (2) an OWNERSHIP check — you can only
// add your own character. Source-anchored: driving the route needs a live DB + session, so we lock the gates
// against a silent regression (dropping either would let a user expose another person's private character).
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

  it('the private→campaign visibility promotion sits AFTER the ownership check (only your own sheet is bumped)', () => {
    const ownerGate = SRC.indexOf('ch.owner_user_id !== session.userId');
    const visBump = SRC.indexOf("visibility === 'private'");
    expect(ownerGate).toBeGreaterThan(-1);
    expect(visBump).toBeGreaterThan(ownerGate); // the bump can only be reached past the 403 ownership guard
  });
});
