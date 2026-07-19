// __tests__/dnd/campaign-override-routes.test.ts — the isolated in-campaign edit + promote route contracts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const override = readFileSync(join(process.cwd(), 'app/api/dnd/campaigns/[id]/characters/[characterId]/override/route.ts'), 'utf8');
const promote = readFileSync(join(process.cwd(), 'app/api/dnd/campaigns/[id]/characters/[characterId]/promote/route.ts'), 'utf8');

describe('override route (DM edits the isolated campaign copy)', () => {
  it('is DM-only for the campaign', () => {
    expect(override).toContain("getCampaignRole(params.id)");
    expect(override).toMatch(/role !== 'dm'/);
  });
  it('writes the campaign override and never touches dnd_characters.data', () => {
    expect(override).toContain('data_override');
    expect(override).toContain("from('dnd_campaign_characters')");
    expect(override).not.toContain("from('dnd_characters')"); // the original is untouched by a campaign edit
  });
  it('records who forked the copy and when', () => {
    expect(override).toContain('override_updated_by');
    expect(override).toContain('override_updated_at');
  });
  it('supports discarding the override back to the original (DELETE)', () => {
    expect(override).toContain('export async function DELETE');
    expect(override).toContain('data_override: null');
  });
});

describe('promote route (creator replaces the original with the campaign version)', () => {
  it('is creator-only via the visibility gate', () => {
    expect(promote).toContain('canPromoteCampaignToOriginal');
    expect(promote).toContain('owner_user_id === session.userId');
  });
  it('writes the promoted copy over the original then clears the override', () => {
    expect(promote).toContain('promoteOverrideToOriginal');
    expect(promote).toContain("from('dnd_characters')");
    expect(promote).toContain('data_override: null');
  });
  it('refuses when there is nothing to promote', () => {
    expect(promote).toMatch(/no changes to promote/i);
  });
});
