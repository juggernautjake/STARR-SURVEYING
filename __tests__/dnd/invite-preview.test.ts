// __tests__/dnd/invite-preview.test.ts — an invite link says what it is for (P14-10b).
//
// The join page was the only campaign surface in the app that identified the campaign in NO way, and it
// is the first screen a new player ever sees. The tests worth having are about the boundaries, because
// this endpoint is reachable by anyone holding a guessable string:
//
//   · what it returns (public identity only — never the DM's notes, the roster, or a credential);
//   · what an unknown code does (null, and the page still renders — not an oracle, not a second gate);
//   · that `used`/`expired` mirror `auth/register`'s own refusals rather than inventing new rules;
//   · that the page is a SERVER component, since a client fetch would flash the unlabelled form first —
//     the exact state this slice removes.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const LIB = read('lib/dnd/invite-preview.ts');
const PAGE = read('app/dnd/join/[code]/page.tsx');
const FORM = read('app/dnd/join/[code]/JoinForm.tsx');
const REGISTER = read('app/api/dnd/auth/register/route.ts');

describe('what the preview may expose', () => {
  it('selects only the invite fields it needs to describe — not other people’s identifiers', () => {
    expect(LIB).toContain("select('campaign_id, role, expires_at, used_by')");
    // `register` selects `*` because it CONSUMES the row. This only describes it, so `character_id`
    // and `created_by` are somebody else's ids and stay out.
    expect(LIB).not.toContain("from('dnd_invites')\n      .select('*')");
  });

  it('returns the campaign’s PUBLIC identity only', () => {
    expect(LIB).toContain("select('id, name, blurb, thumbnail_url')");
    for (const secret of ['dm_notes', 'discord_webhook_url', 'theme', 'dnd_campaign_members']) {
      expect(LIB).not.toContain(secret);
    }
  });

  it('exposes the ROLE, because a DM invite is a different thing to accept than a seat', () => {
    expect(LIB).toContain("role: invite.role === 'dm' ? 'dm' : 'player'");
    expect(PAGE).toContain('Dungeon Master');
  });
});

describe('an unknown code is null, not an error', () => {
  it('an empty code short-circuits without touching the database', () => {
    expect(LIB).toMatch(/if \(!trimmed\) return null;/);
  });

  it('never throws — the page it decorates must render regardless', () => {
    expect(LIB).toContain('} catch {');
    expect(LIB).toContain('return null;');
  });

  it('the page still renders the form when there is no preview', () => {
    // Refusing here would be a SECOND gate that can disagree with `register`, and an oracle for
    // guessing codes.
    expect(PAGE).toContain('<JoinForm />');
    const at = PAGE.indexOf('<JoinForm />');
    // Not nested inside the `invite ?` branch — it sits after the conditional block.
    expect(PAGE.slice(at - 400, at)).not.toContain('invite ? (');
  });
});

describe('used / expired mirror the route that actually decides', () => {
  it('the two states the preview reports are exactly the two `register` refuses', () => {
    expect(REGISTER).toContain('This invite has already been used.');
    expect(REGISTER).toContain('This invite has expired.');
    expect(LIB).toContain('used: !!invite.used_by');
    expect(LIB).toContain("expired: !!invite.expires_at && new Date(invite.expires_at) < new Date()");
  });

  it('the page REPORTS them and does not block on them', () => {
    expect(PAGE).toContain('This invite has already been used.');
    expect(PAGE).toContain('This invite has expired.');
    // The form is rendered unconditionally — `register` remains the only judge.
    expect(PAGE).not.toMatch(/dead\s*\?\s*null\s*:\s*<JoinForm/);
    expect(PAGE).not.toMatch(/!dead && <JoinForm/);
  });
});

describe('the page is a server component', () => {
  it('resolves the invite before first paint rather than fetching from the client', () => {
    expect(PAGE).not.toContain("'use client'");
    expect(PAGE).toContain('await loadInvitePreview(params.code)');
  });

  it('and the form kept its own client directive', () => {
    expect(FORM).toContain("'use client'");
    expect(FORM).toContain('auth/register');
  });

  it('the form no longer owns the heading — one place names the campaign', () => {
    expect(FORM).not.toContain('<h1');
    expect(PAGE).toContain('invite.campaignName');
  });

  it('shows the campaign’s picture, using the same component every other listing uses', () => {
    expect(PAGE).toContain('<CampaignThumb');
  });
});
