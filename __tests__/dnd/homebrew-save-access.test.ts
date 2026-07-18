// __tests__/dnd/homebrew-save-access.test.ts — the homebrew SAVE routes persist a custom class/feat/
// subclass into a character's data, so they must be write-gated: signed in AND holding write access to
// that character. Source-anchored (driving them needs a live DB + session) so a future edit can't
// silently drop the gate and let anyone write homebrew onto someone else's sheet.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROUTES = ['homebrew-class', 'homebrew-feat', 'homebrew-subclass'] as const;
const read = (kind: string) =>
  fs.readFileSync(path.join(process.cwd(), `app/api/dnd/characters/[id]/${kind}/save/route.ts`), 'utf8');

describe('every homebrew save route is write-gated', () => {
  it.each(ROUTES)('%s/save requires a session (401) and character write access', (kind) => {
    const src = read(kind);
    expect(src, `${kind}: must check the session`).toContain('getDndSession()');
    expect(src, `${kind}: must 401 when signed out`).toContain('status: 401');
    expect(src, `${kind}: must gate on write access`).toContain('requireCharacterWrite(params.id)');
    expect(src, `${kind}: must honor the access denial status`).toContain('status: access.status');
  });

  it.each(ROUTES)('%s/save reconstructs from PARSED input (never trusts a client-built definition)', (kind) => {
    const src = read(kind);
    // The object is parsed/validated from the request then re-BUILT server-side, so a client can't POST
    // an arbitrary already-built definition and have it persisted verbatim.
    expect(src, `${kind}: must parse/validate the input`).toMatch(/parseCustom\w+/);
    expect(src, `${kind}: must rebuild server-side`).toMatch(/build(Custom)?(Class|Feat|Subclass)/i);
  });
});
