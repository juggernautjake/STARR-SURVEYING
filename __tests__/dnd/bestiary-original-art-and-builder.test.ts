// __tests__/dnd/bestiary-original-art-and-builder.test.ts — two owner rules for the bestiary, 2026-07-31.
//
// Owner: *"there needs to be a way to create one's own creatures. There needs to be a button or something
// that takes the user to the creature stat block builder. Also, only my account for jacob should be able to
// change images for creatures in the bestiary for the original creatures. If users create a variant or
// something, they can change whatever they want, but I am the only one that should be able to change the
// images of the original art for the creatures."*
//
// Both halves are properties of SOURCE rather than of a pure function, so they are pinned by reading the
// files. That is a weaker test than exercising the handler, and it is the right one here: the alternative
// is a live Supabase round trip in unit tests, and what actually breaks these two rules is somebody
// editing a page or a route — which a source scan catches and a mocked handler test would not.
//
// The asymmetry is the whole design and is asserted in both directions:
//   · a CATALOGUE creature's picture is what every reader sees, so it is owner-only;
//   · a FORK is the author's own piece, so its image route gates on authorship, never on being the owner.
// A change that made forks owner-gated would satisfy "only Jacob changes original art" while breaking the
// sentence right after it, so the fork side is tested as explicitly as the catalogue side.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

/** Just one exported handler's body — a gate in a sibling handler does not protect this one. */
function handlerBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`);
  if (start === -1) return '';
  const rest = src.slice(start + 1);
  const next = rest.indexOf('\nexport async function ');
  return next === -1 ? rest : rest.slice(0, next);
}

describe('only the owner account can change ORIGINAL creature art', () => {
  const src = read('app/api/dnd/bestiary/[id]/art/route.ts');

  it('both the upload and the removal are owner-gated, each in its own body', () => {
    for (const name of ['POST', 'DELETE']) {
      const body = handlerBody(src, name);
      expect(body, `${name} handler must exist`).not.toBe('');
      expect(body, `${name} must check isDndOwner`).toMatch(/isDndOwner\(/);
      // Signed-in is not the gate. Both checks must be present: an anonymous caller gets 401, a
      // signed-in non-owner gets 403 — and collapsing them would let any visitor repaint the catalogue.
      expect(body, `${name} must reject anonymous callers`).toMatch(/getDndSession\(\)/);
      expect(body, `${name} must return 403 for a non-owner`).toMatch(/status: 403/);
    }
  });

  it('the owner gate resolves to Jacob by default and is overridable by env, not hardcoded to one string', () => {
    const auth = read('lib/dnd/auth.ts');
    expect(auth).toMatch(/DND_OWNER_KEYS/);
    // The default matters: with no env set — which is how this runs locally and on any fresh deploy —
    // the owner must still be Jacob rather than nobody (which would lock the owner out of their own
    // catalogue) or everybody.
    expect(auth).toMatch(/'quick:jacob', 'name:jacob'/);
  });

  it('the upload control is not even rendered for a non-owner', () => {
    // Server-side gating is what makes it safe; hiding the control is what stops a reader clicking a
    // button that can only refuse them. Both, not either.
    const page = read('app/dnd/bestiary/[slug]/page.tsx');
    expect(page).toMatch(/isDndOwner\(getDndSession\(\)\)/);
    expect(page).toMatch(/canEditArt && \(/);
  });
});

describe('a fork is the author\'s own, so its art is NOT owner-gated', () => {
  it('the homebrew image route gates on authorship rather than on being the catalogue owner', () => {
    const src = read('app/api/dnd/homebrew/[id]/image/route.ts');
    // If this ever starts calling isDndOwner, the second half of the owner's instruction — "if users
    // create a variant, they can change whatever they want" — has been broken by a change aimed at
    // the first half.
    expect(src, 'a fork\'s image must not require the catalogue owner').not.toMatch(/isDndOwner/);
    expect(src, 'it must still check who owns the piece').toMatch(/author|owner_user_id|user_id/);
  });
});

describe('the creature builder is reachable from the bestiary', () => {
  const list = read('app/dnd/bestiary/page.tsx');
  const detail = read('app/dnd/bestiary/[slug]/page.tsx');

  it('the catalogue page offers a build door', () => {
    expect(list).toMatch(/\/dnd\/content\/new\?kind=creature/);
    expect(list).toMatch(/Build a creature/);
  });

  it('offers it again where a reader has just been told the catalogue has nothing', () => {
    // The empty-filter state is the moment somebody most wants to make the thing themselves.
    const emptyState = list.slice(list.indexOf('Nothing in the catalogue matches'));
    expect(emptyState.slice(0, 600)).toMatch(/kind=creature/);
  });

  it('a creature\'s own page offers building from scratch alongside forking', () => {
    expect(detail).toMatch(/\/dnd\/content\/new\?kind=creature/);
    expect(detail).toMatch(/ForkCreature/);
  });

  it('points at a kind the Studio actually builds — not a URL that renders the picker', () => {
    // `/dnd/content/new?kind=<x>` falls back to the KIND PICKER when x is not a real kind, so a typo
    // here degrades silently into "the button goes to a menu" rather than failing.
    const kinds = read('lib/dnd/homebrew/kinds.ts');
    expect(kinds).toMatch(/kind: 'creature'/);
    expect(kinds, 'the creature kind must carry a statblock field').toMatch(/type: 'statblock'/);
  });
});
