// __tests__/dnd/join-name-only.test.ts — Slice 38b follow-up: the invite JOIN flow uses the same
// name+password-only identity as the rest of the platform (Slice 36), not a real email. Source-anchored
// like campaign-create/quick-npc, since driving the real route needs a live DB + invite row.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const ROUTE = read('app/api/dnd/auth/register/route.ts');
const PAGE = read('app/dnd/join/[code]/page.tsx');

describe('the invite register route is name+password-only (Slice 36 convention)', () => {
  it('stores the identity as name:<normalized> via nameToKey — no real email', () => {
    expect(ROUTE).toContain('nameToKey');
    expect(ROUTE).toContain('email: key'); // the synthetic name key goes in the email column, like signup
    expect(ROUTE).not.toContain('emailNorm'); // the old real-email path is gone
  });
  it('requires only code + name + password (email no longer required)', () => {
    expect(ROUTE).toContain("body?.name ?? body?.displayName"); // name primary, displayName alias
    expect(ROUTE).toContain('An invite code is required.');
    expect(ROUTE).not.toContain("!email");
  });
  it('applies the platform 4-char minimum, matching signup', () => {
    expect(ROUTE).toContain('const MIN = 4');
    expect(ROUTE).not.toContain('at least 8 characters');
  });
  it('still validates + consumes the invite and attaches the member', () => {
    expect(ROUTE).toContain("from('dnd_invites')");
    expect(ROUTE).toContain("from('dnd_campaign_members')");
    expect(ROUTE).toContain('used_by');
  });
  it('reuses a taken name with a 409, like signup', () => {
    expect(ROUTE).toContain('That name is taken');
    expect(ROUTE).toContain('status: 409');
  });
});

describe('the join form no longer collects an email', () => {
  it('has no email field and posts name + password', () => {
    expect(PAGE).not.toContain('type="email"');
    expect(PAGE).not.toContain('setEmail');
    expect(PAGE).toContain('name: displayName');
  });
  it('aligns the password minimum to 4', () => {
    expect(PAGE).not.toContain('minLength={8}');
    expect(PAGE).toContain('minLength={4}');
  });
});
