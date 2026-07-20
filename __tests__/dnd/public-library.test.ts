// __tests__/dnd/public-library.test.ts — the library is readable without an account (S12).
// Owner 2026-07-20: library URLs get shared with people who have no login. Reading is open;
// building a character or campaign still needs a session.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('library routes stay public', () => {
  it('middleware exempts /dnd/library even when login is enforced', () => {
    // /dnd is public by default today, but DND_REQUIRE_LOGIN=1 re-enables the gate — the
    // library must survive that switch, or shared links break the day it is flipped.
    const mw = read('middleware.ts');
    expect(mw).toContain("pathname.startsWith('/dnd/library')");
  });

  it('the library pages do not demand a session themselves', () => {
    for (const p of ['app/dnd/library/page.tsx', 'app/dnd/library/[key]/page.tsx']) {
      const src = read(p);
      expect(src, p).not.toContain('redirect(');
    }
  });
});

describe('the signed-out menu', () => {
  const header = read('app/dnd/_ui/DndHeader.tsx');

  it('offers Library and a way to sign in', () => {
    expect(header).toContain('/dnd/library');
    expect(header).toContain('Log in / Create account');
  });

  it('hides everything that CREATES something when signed out', () => {
    // "＋ Character" used to render signed-out and would dead-end a visitor who tapped it.
    const signedOutBranch = header.slice(header.indexOf(') : ('), header.indexOf('</nav>'));
    expect(signedOutBranch).not.toContain('＋ Character');
    expect(signedOutBranch).not.toContain('＋ Campaign');
    expect(signedOutBranch).not.toContain('＋ Map');
  });

  it('keeps the full menu for a signed-in user', () => {
    expect(header).toContain('＋ Character');
    expect(header).toContain('＋ Campaign');
    expect(header).toContain('Lobby');
  });
});

describe('session-requiring features degrade rather than error', () => {
  it('the give-to-character dialog tells a signed-out reader what to do', () => {
    const dlg = read('app/dnd/_ui/GiveToCharacter.tsx');
    expect(dlg).toContain('log in or create one');
  });
});
