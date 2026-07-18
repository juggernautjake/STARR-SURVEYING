// __tests__/dnd/realtime-sync.test.ts — C11b realtime sync guard: a DM equip (or any sheet write) must
// propagate to every other open viewer of that character. The mechanism is a per-character BROADCAST channel
// that carries only a ping — the receiver refetches through the AUTHED API, so sheet data never rides the
// public channel (the /dnd cookie auth isn't a Supabase-auth session, so table-level Realtime RLS wouldn't
// gate it). This locks that wiring + its security property against regression. Source-anchored: the store is a
// client hook whose realtime behavior can't be driven without a live channel.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/state/store.tsx'), 'utf8');

describe('C11b realtime sync — a sheet change propagates to other viewers', () => {
  it('subscribes to ONE broadcast channel per character, ignoring its own pings', () => {
    expect(SRC).toContain('supabase.channel(`dnd:character:${characterId}`');
    expect(SRC).toContain('broadcast: { self: false }'); // don't echo our own writes back to ourselves
    expect(SRC).toMatch(/\.on\('broadcast',\s*\{\s*event:\s*'changed'\s*\}/);
  });

  it('ignores a ping from THIS client (senderId guard) so a self-write does not double-refetch', () => {
    expect(SRC).toMatch(/\?\.senderId === clientIdRef\.current\) return/);
  });

  it('on a peer ping, REFETCHES through the authed API — sheet data never rides the public channel', () => {
    // The security property: the broadcast is a bare ping; the real sheet comes from the C4-authed endpoint,
    // which enforces the actual /dnd authorization. A regression that shipped `data` in the payload would
    // leak a private sheet to anyone who can subscribe.
    expect(SRC).toMatch(/\.on\('broadcast'[\s\S]{0,400}fetch\(`\/api\/dnd\/characters\/\$\{characterId\}`\)/);
  });

  it('after a save, pings the channel with this client\'s id so peers refetch', () => {
    expect(SRC).toMatch(/channelRef\.current\?\.send\(\{[\s\S]{0,120}event:\s*'changed'[\s\S]{0,120}senderId:\s*clientIdRef\.current/);
  });

  it('tears the channel down on unmount (no leaked subscriptions)', () => {
    expect(SRC).toContain('supabase.removeChannel(channel)');
  });
});
