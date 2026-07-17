// __tests__/dnd/campaign-create.test.ts — creating a campaign never 500s on a stale session (Slice 36).
//
// The edge the doc named: "Creating a campaign from a session whose user row was deleted throws a raw
// FK error (dm_user_id_fkey). Catch it and return a clean 'please sign in again' (and clear the dead
// cookie)." Both DB writes reference the (possibly stale) user by FK — the campaign insert
// (dm_user_id) and the membership insert (user_id) — so BOTH must degrade to a clean 401 + a cleared
// cookie, not a 500. Source-anchored (as with quick-npc), since driving the real route needs a live DB.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const ROUTE = read('app/api/dnd/campaigns/route.ts');

describe('campaign creation handles a stale session cleanly (Slice 36)', () => {
  it('classifies the Postgres FK violation (23503 / "foreign key") as an expired session', () => {
    expect(ROUTE).toContain('isStaleUserFk');
    expect(ROUTE).toContain("'23503'");
    expect(ROUTE).toContain('/foreign key/i');
  });

  it('returns a clean 401 (not a 500) and clears the dead cookie', () => {
    expect(ROUTE).toContain('clearDndSession');
    expect(ROUTE).toContain('Your session has expired');
    expect(ROUTE).toContain('status: 401');
  });

  it('applies the same handling to BOTH inserts — the campaign AND the membership', () => {
    // isStaleUserFk is checked against the campaign insert error and the membership insert error.
    const checks = ROUTE.match(/isStaleUserFk\(/g) ?? [];
    expect(checks.length).toBeGreaterThanOrEqual(2);
    expect(ROUTE).toContain('isStaleUserFk(memErr)');
  });
});
