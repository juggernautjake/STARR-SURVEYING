// __tests__/dnd/campaign-approval-route.test.ts — guards the DM approval route wiring (DM-only, rejection needs
// a reason, writes the approval to the roster row). Source-assertion (the DB call can't run in a unit test).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'app/api/dnd/campaigns/[id]/characters/[characterId]/approval/route.ts'), 'utf8');

describe('DM campaign-approval route', () => {
  it('is DM-only', () => {
    expect(SRC).toContain('getDndSession()');
    expect(SRC).toContain('getCampaignRole(params.id)');
    expect(SRC).toContain("role !== 'dm'");
  });

  it('accepts approved/rejected and requires a reason on rejection', () => {
    expect(SRC).toContain("status !== 'approved' && status !== 'rejected'");
    expect(SRC).toContain("status === 'rejected' && !reason");
    expect(SRC).toMatch(/needs a reason so the player knows what to fix/);
  });

  it('writes the normalized approval onto the roster join row', () => {
    expect(SRC).toContain('normalizeApproval(');
    expect(SRC).toContain(".from('dnd_campaign_characters')");
    expect(SRC).toContain('.update({ approval })');
    expect(SRC).toContain("reviewedByUserId: session.userId");
  });

  it('refuses a character not on the campaign roster', () => {
    expect(SRC).toContain('is not in this campaign');
  });
});
