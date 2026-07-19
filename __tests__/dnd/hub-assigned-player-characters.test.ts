// __tests__/dnd/hub-assigned-player-characters.test.ts — a user's hub lists characters they OWN or are the
// assigned PLAYER of (owner 2026-07-18: jgcabtx, assigned to play Jack, must see Jack in their list and reach
// the campaign). Before, both hub queries filtered on owner_user_id only, so an assigned player saw nothing.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const summary = readFileSync(join(process.cwd(), 'lib/dnd/campaign-summary.ts'), 'utf8');
const page = readFileSync(join(process.cwd(), 'app/dnd/page.tsx'), 'utf8');

describe('hub character list includes assigned-player characters', () => {
  it('loadUserProfile matches owner OR played_by (not owner-only)', () => {
    expect(summary).toContain('owner_user_id.eq.${userId},played_by_user_id.eq.${userId}');
    // the old owner-only filter for the list must be gone
    expect(summary).not.toContain(".eq('owner_user_id', userId)");
  });
  it('the single-character auto-redirect also considers assigned-player characters', () => {
    expect(page).toContain('owner_user_id.eq.${user.id},played_by_user_id.eq.${user.id}');
  });
});
