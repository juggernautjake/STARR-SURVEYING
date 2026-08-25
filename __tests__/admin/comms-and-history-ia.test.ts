// §2.5 (twelve communication surfaces) and §2.6 (five log surfaces), filed rather than demolished.
//
// The audit's suggestion for §2.5 was "at minimum, merge Discussions into Messages (channels) and
// Notes into Files". Deliberately not done, and the reason is the one item 7 already established:
// each of those pages is authoritative for something the other does not do, and a merge would put
// two surfaces on one table until somebody fixed a bug in only one of them. What was actually
// missing was not fewer pages — it was any way to tell which page answers which question.
//
// So both sections are a grouping plus a sentence per route saying what it is NOT. These tests pin
// the part that rots: the moment a new comms page ships with the description "messaging", the
// distinction is gone again and nothing else would fail.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_ROUTES } from '@/lib/admin/route-registry';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const byHref = (href: string) => ADMIN_ROUTES.find((r) => r.href === href);

describe('§2.5 — twelve communication surfaces, seven mental models', () => {
  const COMMS = [
    '/admin/messages', '/admin/discussions', '/admin/announcements',
    '/admin/notifications', '/admin/support', '/admin/email/new',
  ];

  it('files every one of them under one heading', () => {
    for (const href of COMMS) {
      expect(byHref(href)?.section, `${href} has no section`).toBe('Talking to people');
    }
  });

  it('sends you somewhere else when you are on the wrong one', () => {
    // A person who has used "Messages" for a year does not re-read its label. What changes their
    // mind is being told, on the page they opened, which of its neighbours they actually wanted —
    // so every description here names at least one sibling.
    const SIBLINGS = /messages|discussions|announcements|notifications|email|files|hub|customer/i;
    for (const href of ['/admin/messages', '/admin/discussions', '/admin/announcements', '/admin/notifications', '/admin/support', '/admin/notes']) {
      const d = byHref(href)?.description ?? '';
      expect(d, `${href} does not point anywhere else`).toMatch(SIBLINGS);
    }
  });

  it('keeps the distinction that actually confuses people: a person wrote it vs the app raised it', () => {
    expect(byHref('/admin/notifications')?.description).toContain('not messages a person sent');
  });
});

describe('§2.6 — five places to answer "what happened and who did it"', () => {
  it('groups the two that live in Office', () => {
    expect(byHref('/admin/audit')?.section).toBe('What happened');
    expect(byHref('/admin/error-log')?.section).toBe('What happened');
  });

  it('names the right log for each question instead of merging four different tables', () => {
    expect(byHref('/admin/audit')?.description).toContain('compliance');
    expect(byHref('/admin/error-log')?.description).toContain('software itself');
    // C7 (2026-08-25): the timeline is the Jobs portal's `activity` TAB now, so the sentence moved
    // from a registry description to the tab's hint — which is where a person reads it, above the feed
    // itself rather than in a menu tooltip.
    //
    // The invariant is the whole point of §2.6 and is asserted, not dropped: five places answer "what
    // happened and who did it", and each has to say which question it answers. A consolidation that
    // quietly lost this sentence would put the product back to four logs and no map.
    const portal = read('app/admin/jobs/page.tsx');
    expect(portal, 'the activity tab must still say it is not a compliance record')
      .toContain('not a compliance record: the Audit Log is that');
  });

  it('points at the other three from the one somebody opens first', () => {
    const page = read('app/admin/audit/page.tsx');
    // '/admin/timeline' and '/admin/equipment/overrides' are tabs now; the audit page links straight
    // at them rather than through their redirects, so the hrefs it must contain are the tab URLs.
    for (const href of ['/admin/jobs?tab=activity', '/admin/error-log', '/admin/equipment/overrides']) {
      expect(page, `${href} is not cross-linked from the audit log`).toContain(href);
    }
  });
});

describe('the sections stay honest as the registry grows', () => {
  it('leaves no Office route unfiled', () => {
    // An unsectioned route renders in an unlabelled group above the named ones — which is exactly
    // the "everything else" bucket §2.2 was fixed to remove.
    const unfiled = ADMIN_ROUTES
      .filter((r) => r.workspace === 'office' && r.href !== '/admin/office' && !r.section)
      .map((r) => r.href);
    expect(unfiled, `Office routes with no section:\n  ${unfiled.join('\n  ')}`).toEqual([]);
  });

  it('uses a small, fixed set of headings rather than one per page', () => {
    const sections = new Set(
      ADMIN_ROUTES.filter((r) => r.workspace === 'office').map((r) => r.section).filter(Boolean),
    );
    expect(sections.size).toBeLessThanOrEqual(6);
  });
});
