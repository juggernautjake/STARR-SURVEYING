// __tests__/dnd/rsvp.test.ts — who is coming to the next session (P3-5).
//
// Builds on P1-5's scheduling. The design decision worth defending is that **"hasn't answered" is not
// "no"**: a player who has not replied and a player who has said they cannot come are different facts, and
// collapsing them lets the banner claim a decision nobody made. Most of this file exists to keep that
// distinction intact.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeRsvp, tallyRsvps, summarizeRsvps, RSVP_STATUSES } from '@/lib/dnd/rsvp';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const MEMBERS = ['u1', 'u2', 'u3', 'u4'];

describe('normalizing an answer', () => {
  it('accepts the three statuses, case- and space-insensitively', () => {
    expect(normalizeRsvp('yes')).toBe('yes');
    expect(normalizeRsvp(' MAYBE ')).toBe('maybe');
    expect(normalizeRsvp('No')).toBe('no');
  });

  it('and anything else is NULL, which means "clear my answer"', () => {
    // Null is a real action, not a rejection — it is how a player goes back to undecided.
    expect(normalizeRsvp(null)).toBeNull();
    expect(normalizeRsvp('probably')).toBeNull();
    expect(normalizeRsvp(42)).toBeNull();
  });

  it('there are exactly three', () => {
    expect([...RSVP_STATUSES]).toEqual(['yes', 'no', 'maybe']);
  });
});

describe('the tally', () => {
  it('counts each answer', () => {
    const t = tallyRsvps(
      [{ user_id: 'u1', status: 'yes' }, { user_id: 'u2', status: 'yes' }, { user_id: 'u3', status: 'no' }],
      MEMBERS,
    );
    expect(t).toMatchObject({ yes: 2, no: 1, maybe: 0, members: 4 });
  });

  it('and reports who has NOT answered — the number the rows cannot contain', () => {
    // This is why membership is passed in rather than derived from the rows. A tally built only from RSVPs
    // can never say "two people haven't answered", which is the single most useful thing here.
    const t = tallyRsvps([{ user_id: 'u1', status: 'yes' }, { user_id: 'u2', status: 'no' }], MEMBERS);
    expect(t.awaiting).toBe(2);
  });

  it('nobody answering is 4 awaiting, not 4 no', () => {
    const t = tallyRsvps([], MEMBERS);
    expect(t).toMatchObject({ yes: 0, no: 0, maybe: 0, awaiting: 4 });
  });

  it('ignores an answer from someone who has left the campaign', () => {
    // Their old "yes" should not keep inflating the count after they are gone.
    const t = tallyRsvps([{ user_id: 'ghost', status: 'yes' }, { user_id: 'u1', status: 'yes' }], MEMBERS);
    expect(t.yes).toBe(1);
    expect(t.awaiting).toBe(3);
  });

  it('counts a member once even if the table somehow holds two rows for them', () => {
    // The unique constraint should prevent this, but a tally that double-counts on bad data would drift
    // silently upward and nobody would question a number that only ever grows.
    const t = tallyRsvps([{ user_id: 'u1', status: 'yes' }, { user_id: 'u1', status: 'no' }], MEMBERS);
    expect(t.yes + t.no + t.maybe).toBe(1);
    expect(t.awaiting).toBe(3);
  });

  it('skips an unrecognised status rather than counting it', () => {
    const t = tallyRsvps([{ user_id: 'u1', status: 'probably' }], MEMBERS);
    expect(t.yes + t.no + t.maybe).toBe(0);
    // They have a row but no valid answer, so they still count as not having answered.
    expect(t.awaiting).toBe(4);
  });

  it('and an empty campaign does not divide by anything', () => {
    expect(tallyRsvps([], [])).toMatchObject({ members: 0, awaiting: 0 });
  });
});

describe('the summary line', () => {
  it('omits zero counts rather than printing "0 no"', () => {
    const s = summarizeRsvps(tallyRsvps([{ user_id: 'u1', status: 'yes' }], MEMBERS));
    expect(s).toContain('1 yes');
    expect(s).not.toContain('0 no');
    expect(s).toMatch(/3 haven/);
  });

  it('but always shows who is outstanding, since that is the number that prompts a nudge', () => {
    const all = MEMBERS.map((u) => ({ user_id: u, status: 'yes' }));
    expect(summarizeRsvps(tallyRsvps(all, MEMBERS))).toBe('4 yes');
  });

  it('and says something sensible when nothing has happened', () => {
    expect(summarizeRsvps(tallyRsvps([], []))).toBe('No members yet.');
  });
});

describe('the route answers for the CALLER only', () => {
  const route = read('app/api/dnd/sessions/[id]/rsvp/route.ts');

  it('takes no user id from the body', () => {
    // The reason no extra permission logic is needed: the route physically cannot RSVP on someone else's
    // behalf, so membership is a sufficient gate.
    expect(route).toContain('user_id: session.userId');
    expect(route, 'a userId in the body would let anyone answer for anyone').not.toMatch(/body\?\.userId/);
  });

  it('requires campaign membership', () => {
    expect(route).toMatch(/getCampaignRole\(campaignId\)\) === null/);
  });

  it('upserts on the member+session pair, so changing an answer does not append', () => {
    // Otherwise a player who reconsiders twice is counted three times and the tally only ever grows.
    expect(route).toContain("{ onConflict: 'session_id,user_id' }");
    expect(read('seeds/460_dnd_session_rsvps.sql')).toMatch(/unique \(session_id, user_id\)/);
  });

  it('and a null status DELETES the row rather than storing "no"', () => {
    // Clearing an answer must return you to undecided, not silently decline for you.
    expect(route).toMatch(/if \(status === null\) \{[\s\S]{0,400}\.delete\(\)/);
  });
});

describe('the control is where the question gets asked', () => {
  const hub = read('app/dnd/_ui/CampaignPageClient.tsx');

  it('sits on the next-session banner, not in the DM-only console', () => {
    // A player who has just read WHEN the session is, is exactly the person who can answer.
    expect(hub).toContain('<SessionRsvp sessionId={next.id} />');
  });

  it('and the banner is no longer a button wrapping buttons', () => {
    // Nesting interactive elements is invalid HTML, and a click on "Going" would also navigate. The
    // heading is the link; the RSVP row is its sibling.
    const banner = hub.slice(hub.indexOf('Next session'), hub.indexOf('<SessionRsvp'));
    // Count JSX TAGS — lines whose first non-space character opens a button — rather than any occurrence of
    // the word. The comment above the banner explains why the nesting was removed and mentions `<button>`,
    // which a naive `/<button[\s\S]*<button/` reads as a second element.
    const openTags = banner.split(/\r?\n/).filter((l) => /^\s*<button\b/.test(l));
    expect(openTags, 'the banner should contain exactly one interactive element').toHaveLength(1);
  });

  it('pressing your current answer again clears it', () => {
    // Without this there is no way to un-answer, and "maybe" becomes a one-way door.
    expect(read('app/dnd/_ui/SessionRsvp.tsx')).toContain('mine === status ? null : status');
  });
});
