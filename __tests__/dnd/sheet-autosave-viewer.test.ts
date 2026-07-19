// __tests__/dnd/sheet-autosave-viewer.test.ts — a read-only viewer must never autosave (owner 2026-07-18: a
// fellow player opening someone else's public character saw a false "Offline — saved on this device" banner).
// Cause: the debounced autosave PATCHed the character on any (even load-normalization) change without checking
// write permission; the server 403'd and the failure was misread as "offline", retrying every 4s. Guard: the
// autosave bails unless the viewer can write (owner / assigned player / DM).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'app/dnd/_sheet/state/store.tsx'), 'utf8');

describe('sheet autosave is gated on write permission', () => {
  it('the debounced autosave effect bails for a read-only viewer', () => {
    // The guard sits in the autosave effect, before it serializes/PATCHes.
    expect(SRC).toContain('if (!(canWrite ?? isDM)) return');
  });
  it('the autosave effect re-runs when write permission changes (canWrite/isDM in deps)', () => {
    expect(SRC).toContain('[char, dbMode, dbPhase, characterId, retryTick, canWrite, isDM]');
  });
  it('the guard precedes the PATCH so a viewer never hits the write endpoint', () => {
    const guardIdx = SRC.indexOf('if (!(canWrite ?? isDM)) return');
    const patchIdx = SRC.indexOf("method: 'PATCH'");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(patchIdx).toBeGreaterThan(guardIdx); // guard comes first
  });
});
