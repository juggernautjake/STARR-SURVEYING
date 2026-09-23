// __tests__/twilio/blocked-page.test.ts — the block list as a page someone has to use.
//
// Owner, 2026-09-23: "build the admin page for this and make sure the styling and css and
// formatting and functionality all works very well."
//
// The block CHECK is covered by blocklist.test.ts. What is left here are the ways this page can be
// wrong while every underlying function still passes: it can fetch the wrong slice and show an
// empty history, it can be unreachable, it can render classes nothing styles. Each of those looks
// fine in isolation and is only visible from the page.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

const PAGE = read('app/admin/calls/blocked/page.tsx');
const CALLS = read('app/admin/calls/page.tsx');
const REGISTRY = read('lib/admin/route-registry.ts');
const CSS = read('app/admin/styles/AdminCalls.css') + read('app/admin/styles/AdminBlockedCalls.css');

describe('it asks for the whole list, not just the part still in force', () => {
  it('fetches with ?all=1', () => {
    // Unblocking deactivates rather than deletes, so the default GET — active rules only — would
    // leave the "Unblocked" section permanently empty. The section would still render, still look
    // correct, and never once show the history it exists to show.
    expect(PAGE).toContain("'/api/admin/calls/blocked?all=1'");
  });

  it('splits the list on `active`, so a deactivated rule is shown as unblocked rather than dropped', () => {
    expect(PAGE).toMatch(/rules\.filter\(\(r\) => r\.active\)/);
    expect(PAGE).toMatch(/rules\.filter\(\(r\) => !r\.active\)/);
  });
});

describe('unblocking is an undo, not a delete', () => {
  it('unblock goes to DELETE, which the route implements as active=false', () => {
    expect(PAGE).toContain("method: 'DELETE'");
    // And the route it calls must not actually delete the row — that is where the reason, the
    // notes and the hit count live, and they are the answer to "didn't we block this?" later.
    const route = read('app/api/admin/calls/blocked/route.ts');
    expect(route).toContain('active: false');
    expect(route).not.toMatch(/\.delete\(\)/);
  });

  it('a re-block reuses the existing row rather than making a second one', () => {
    // Two rules for one number means two hit counts, and neither tells the truth.
    const route = read('app/api/admin/calls/blocked/route.ts');
    expect(route).toContain('reactivated: true');
  });
});

describe('what a person can see about a caller they refused', () => {
  it('shows the area code, the tally, and the last thing the caller said', () => {
    // Owner: "It should register the area code and show whatever info can be garnered from the
    // call even if a call is blocked." A list of bare numbers cannot show that a block is WRONG —
    // the customer just stops getting through and nothing on screen ever says so.
    expect(PAGE).toContain('rule.areaCode');
    expect(PAGE).toContain('rule.hit_count');
    expect(PAGE).toContain('rule.lastSummary');
  });

  it('says so plainly when there is nothing recorded, instead of rendering a blank', () => {
    expect(PAGE).toContain('No call from this number has been recorded yet.');
  });

  it('every field it reads is one the API actually returns', () => {
    const route = read('app/api/admin/calls/blocked/route.ts');
    for (const field of ['areaCode', 'callsSeen', 'lastSummary', 'lastCallAt', 'hit_count']) {
      expect(route, `API must return ${field}`).toContain(field);
    }
  });
});

describe('the prefix form', () => {
  it('a trailing dot means prefix, and the page says so where it is typed', () => {
    // One field for both, because nobody arrives here already knowing the difference between a
    // number and a pattern — they arrive knowing a phone keeps ringing.
    expect(PAGE).toContain("number.endsWith('.')");
    expect(PAGE).toContain('pattern:');
    expect(PAGE).toMatch(/End with a dot/);
  });

  it('the API still refuses a prefix short enough to block most of the country', () => {
    const route = read('app/api/admin/calls/blocked/route.ts');
    expect(route).toContain('< 4');
  });
});

describe('the page can be found and is not a second phone row on the rail', () => {
  it('is registered', () => {
    expect(REGISTRY).toContain("href: '/admin/calls/blocked'");
  });

  it('is palette-only, like the Caller Registry — it is a settings surface for the Calls log', () => {
    const entry = REGISTRY.split('\n').find((l) => l.includes("'/admin/calls/blocked'")) ?? '';
    expect(entry).toContain('showInRail: false');
  });

  it('is linked from the Calls header, which is the only place anyone would look for it', () => {
    // showInRail: false with no link anywhere is a page that exists and cannot be reached.
    expect(CALLS).toContain('/admin/calls/blocked');
  });

  it('uses an icon the admin icon map actually has', () => {
    const entry = REGISTRY.split('\n').find((l) => l.includes("'/admin/calls/blocked'")) ?? '';
    const icon = entry.match(/iconName: '([^']+)'/)?.[1];
    expect(icon).toBeTruthy();
    // A name absent from the map renders nothing at all — silently, in the palette only.
    expect(read('lib/admin/route-icons.tsx')).toContain(icon as string);
  });
});

describe('every class it renders has a rule somewhere', () => {
  it('no unstyled class', () => {
    const used = new Set<string>();
    for (const m of PAGE.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      for (const c of (m[1] || m[2] || '').split(/[\s`${}'?:+()]+/)) {
        if (/^[a-z][\w-]*$/.test(c)) used.add(c);
      }
    }
    expect(used.size).toBeGreaterThan(20);
    expect([...used].filter((c) => !CSS.includes(`.${c}`))).toEqual([]);
  });
});
