// __tests__/dnd/character-route-access-classes.test.ts — every character-scoped GET declares its gate.
//
// WHY. Slice 39 found `GET .../edits` handing a character's whole revision history to anyone with a link,
// because it gated on READ access and /dnd is public by direct link. The boundary it violated was not new —
// `uploads`, `levels` and `homebrew-subclass` all had it right — it simply lived in four separate reader's
// heads and one of them slipped. The sweep that followed classified every character-scoped GET; this file
// is that sweep in executable form, so the next route is checked by CI rather than by whoever notices.
//
// THE RULE, as the existing routes actually apply it:
//
//   · CONTENT the sheet already shows → READ access. Exporting or re-deriving what a reader can see anyway
//     leaks nothing. (`route.ts` GET, `export`, `ig-levels`, `pf2-levels`.)
//   · Anything ABOUT the character's construction or history — who changed what, the source files behind
//     the build, the level-up workspace, an unpublished homebrew draft → WRITE access. These describe the
//     player's process, not the character, and a public sheet does not make its process public.
//   · Per-CALLER data (the caller's own campaigns, stream state) → a session, since the answer differs by
//     who is asking.
//
// A new character-scoped GET route fails this suite until it is added below. That is deliberate and is the
// same fail-visible choice `lib/dnd/audit/bespoke-ops.ts` makes: the cost of classifying one more route is
// a line here, and the cost of forgetting is what slice 39 was.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(process.cwd(), 'app/api/dnd/characters/[id]');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Every route.ts under characters/[id] that exports a GET, as a path relative to that folder. */
function getRoutes(dir = ROOT): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...getRoutes(full)); continue; }
    if (entry !== 'route.ts') continue;
    if (!readFileSync(full, 'utf8').includes('export async function GET')) continue;
    out.push(relative(ROOT, full).split('\\').join('/'));
  }
  return out.sort();
}

/** WRITE-gated: returns something about how the character was BUILT or CHANGED, not what it is. */
const WRITE_GATED: Record<string, string> = {
  'edits/route.ts': 'the revision history — who changed what, when, and the DM’s rulings (slice 39)',
  'uploads/route.ts': 'the source files behind the build',
  'levels/route.ts': 'the level-up workspace and its recorded choices',
  'homebrew-subclass/route.ts': 'an unpublished homebrew draft',
};

/** READ-gated: returns the character's own content, which a reader can already see. */
const READ_GATED: Record<string, string> = {
  'route.ts': 'the character itself — this IS the sheet',
  'export/route.ts': 'the same sheet content, as a file',
  'ig-levels/route.ts': 'a plan derived entirely from readable sheet data',
  'pf2-levels/route.ts': 'a plan derived entirely from readable sheet data',
};

/** SESSION-gated: the answer depends on WHO is asking, so it needs a caller, not a permission. */
const SESSION_GATED: Record<string, string> = {
  'campaigns/route.ts': 'the caller’s own campaigns alongside the character’s',
  'stream/route.ts': 'live stream state',
  'stream/messages/route.ts': 'live stream state',
  'stream/replies/route.ts': 'live stream state',
  'stream/polls/route.ts': 'live stream state',
  'stream/tip/route.ts': 'live stream state',
};

describe('every character-scoped GET route is classified', () => {
  it('no route is missing from the tables above', () => {
    const known = new Set([...Object.keys(WRITE_GATED), ...Object.keys(READ_GATED), ...Object.keys(SESSION_GATED)]);
    const unclassified = getRoutes().filter((r) => !known.has(r));
    // If this fails: decide which class the new route belongs to using the rule at the top of this file,
    // add it, and make the route match. Do not delete the assertion.
    expect(unclassified).toEqual([]);
  });

  it('the tables name only routes that exist', () => {
    const actual = new Set(getRoutes());
    const known = [...Object.keys(WRITE_GATED), ...Object.keys(READ_GATED), ...Object.keys(SESSION_GATED)];
    expect(known.filter((r) => !actual.has(r))).toEqual([]);
  });
});

describe('WRITE-gated routes actually check write access', () => {
  for (const [route, why] of Object.entries(WRITE_GATED)) {
    it(`${route} — ${why}`, () => {
      const src = read(route);
      // Either the explicit check or the helper that bundles it. Both are used in the codebase today.
      const gated = /!res\.access\.canWrite|!r\.access\.canWrite|requireCharacterWrite/.test(src);
      expect(gated).toBe(true);
    });
  }

  it('and the one that regressed states its reasoning inline, so it is not silently loosened again', () => {
    expect(read('edits/route.ts')).toContain('public by direct link');
  });
});

describe('READ-gated routes return only what a reader can already see', () => {
  for (const [route, why] of Object.entries(READ_GATED)) {
    it(`${route} — ${why}`, () => {
      const src = read(route);
      expect(src).toContain('getCharacterAccess');
    });
  }

  it('the level plans are derived, not privileged — they read the sheet and nothing else', () => {
    // The claim that justifies leaving these read-gated while 5e's `levels` is write-gated: everything
    // returned comes from `row.data`, which `GET route.ts` already serves to the same caller.
    for (const route of ['ig-levels/route.ts', 'pf2-levels/route.ts']) {
      const get = read(route).split('export async function GET')[1].split('export async function')[0];
      expect(get).toContain('row.data');
      expect(get).not.toContain('dnd_sheet_edits');
      expect(get).not.toContain('dnd_character_uploads');
    }
  });
});

describe('SESSION-gated routes require a caller', () => {
  for (const [route, why] of Object.entries(SESSION_GATED)) {
    it(`${route} — ${why}`, () => {
      expect(read(route)).toContain('getDndSession');
    });
  }
});
