// __tests__/dnd/map-objects-route.test.ts — M4-2's write path, read as source.
//
// The route talks to Supabase and to the session cookie, so an execution test would be a test of two
// mocks. What is worth pinning here is the set of decisions that are easy to undo by accident and
// invisible when you do:
//
//   1. the gate resolves the campaign from the NODE, never from the URL id;
//   2. every verb is gated, not just POST;
//   3. a token with nothing bound to it is refused rather than written;
//   4. position is snapped and clamped server-side;
//   5. a new object is DM-only unless the caller says otherwise.
//
// Each of those has a failure mode that a passing suite would not otherwise notice — (1) is a
// cross-campaign write, (3) is a token the DM places and never sees, (5) is a spoiler on the party's
// screen the moment it is created.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { snapToGrid, clampToMap, readToken } from '@/lib/dnd/maps/tokens';

const ROUTE = join(process.cwd(), 'app/api/dnd/campaigns/[id]/map-objects/route.ts');
const src = readFileSync(ROUTE, 'utf8');
const PAGE = join(process.cwd(), 'app/dnd/campaigns/[id]/world/page.tsx');
const page = readFileSync(PAGE, 'utf8');
const UI = join(process.cwd(), 'app/dnd/_ui/maps/PlaceToken.tsx');
const ui = readFileSync(UI, 'utf8');

describe('map-objects route — the gate', () => {
  it('resolves the campaign from the node row, not from the URL parameter', () => {
    // The whole point of `nodeGate`: `getCampaignRole` is called with the node's own campaign_id.
    expect(src).toMatch(/getCampaignRole\(node\.campaign_id\)/);
    // And the URL's id is never fed to the role check — that would be the vulnerability, not the fix.
    expect(src).not.toMatch(/getCampaignRole\(\s*params\.id/);
  });

  it('gates all three verbs, so PATCH and DELETE are not a back door into POST-only protection', () => {
    for (const verb of ['POST', 'PATCH', 'DELETE']) {
      const body = src.slice(src.indexOf(`export async function ${verb}`));
      const end = body.indexOf('\nexport async function', 1);
      const fn = end === -1 ? body : body.slice(0, end);
      expect(fn, `${verb} must call nodeGate`).toMatch(/await nodeGate\(/);
      expect(fn, `${verb} must require a session`).toMatch(/getDndSession\(\)/);
      // POST and DELETE return the DM gate's refusal outright. PATCH has ONE narrow exception — M7-1's
      // "own-token movable" — so it must still return `gate.error` on the path where that exception does
      // not apply, and the exception itself must be checked against the CHARACTER's owner rather than
      // against anything the client said.
      if (verb === 'PATCH') {
        expect(fn, 'PATCH must still refuse when the player exception does not apply').toMatch(/if \(!mine\) return gate\.error/);
        expect(fn, 'the exception must be gated on owning the token').toMatch(/await ownsToken\(user\.id, before\[0\]\)/);
        expect(fn, 'and on the request changing nothing but position').toMatch(/onlyMoves/);
      } else {
        expect(fn, `${verb} must return the gate's refusal`).toMatch(/if \('error' in gate\) return gate\.error/);
      }
    }
  });

  it('PATCH and DELETE find the node through the object row rather than trusting a nodeId in the body', () => {
    // Otherwise a DM of their own campaign could patch someone else's object by naming their own node.
    //
    // Asserted as the PROPERTY rather than as one spelling of it: this test first pinned the exact
    // `.select('id, map_node_id')` call, and went red when M4-2's bulk verbs replaced it with
    // `readObjects(ids)` — a rewrite that kept the rule intact. A guard that fails on a refactor it
    // approves of gets weakened by whoever is holding the refactor.
    //
    // The property has two halves, and the second is the one with teeth: the node comes from the ROWS,
    // and the request body's `nodeId` is never consulted by either verb.
    for (const verb of ['PATCH', 'DELETE']) {
      const from = src.indexOf(`export async function ${verb}`);
      const rest = src.slice(from);
      const end = rest.indexOf('\nexport async function', 1);
      const fn = end === -1 ? rest : rest.slice(0, end);
      expect(fn, `${verb} must gate on the node the OBJECT belongs to`)
        .toMatch(/nodeGate\((before\[0\]\.map_node_id|\(row as \{ map_node_id: string \}\)\.map_node_id)\)/);
      expect(fn, `${verb} must not take the node from the request body`).not.toMatch(/body\.nodeId/);
    }
  });

  it('refuses a bulk change that spans two maps rather than gating on one of them', () => {
    // A selection is made on the map the DM is looking at, so a mixed set is not a real interaction —
    // but a route that accepted one would gate on `before[0]`'s campaign and write to all of them.
    const after = src.slice(src.indexOf('export async function PATCH'));
    expect(after).toMatch(/different maps/);
  });
});

describe('map-objects route — what it refuses', () => {
  it('refuses a token that stands for nothing', () => {
    expect(src).toMatch(/kind === 'token' && !readToken\(data\)/);
    // The same predicate the renderer uses to DROP a token, so the two cannot drift apart: anything the
    // map would silently skip is refused at the door instead.
    expect(readToken({})).toBeNull();
    expect(readToken({ characterId: 'c1' })).not.toBeNull();
  });

  it('refuses a non-numeric position instead of writing NaN', () => {
    expect(src).toMatch(/if \(!at\) return NextResponse\.json\(\s*\{ error: 'x and y must be numbers\.' \}/);
    expect(src).toMatch(/!Number\.isFinite\(nx\) \|\| !Number\.isFinite\(ny\)/);
  });

  it('constrains kind and visibility to known sets rather than storing whatever arrives', () => {
    expect(src).toMatch(/const KINDS = new Set\(/);
    expect(src).toMatch(/const VISIBILITIES = new Set\(\['dm', 'players', 'discovered'\]\)/);
  });
});

describe('map-objects route — position is the server’s answer', () => {
  it('snaps then clamps, in that order, from the node’s own grid and bounds', () => {
    const fn = src.slice(src.indexOf('function place('), src.indexOf('export async function POST'));
    expect(fn).toMatch(/snapToGrid\(nx, ny, node\.grid/);
    expect(fn).toMatch(/clampToMap\(snapped\.x, snapped\.y, node\.bounds/);
    // Clamping BEFORE snapping could snap a boundary point back outside the map.
    expect(fn.indexOf('snapToGrid')).toBeLessThan(fn.indexOf('clampToMap'));
  });

  it('the composition it performs cannot land outside the map', () => {
    // The property the ordering exists to guarantee, exercised directly.
    for (const [x, y] of [[-40, 130], [0, 0], [99.6, 100.4], [50.2, 3.7]]) {
      const s = snapToGrid(x, y, { size: 5 });
      const c = clampToMap(s.x, s.y, { maxX: 100, maxY: 100 });
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThanOrEqual(100);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThanOrEqual(100);
    }
  });

  it('the client sends a raw coordinate and does not snap for itself', () => {
    expect(ui).not.toMatch(/snapToGrid|clampToMap/);
  });
});

describe('map-objects route — the default is secret', () => {
  it('a placed object is DM-only unless the caller asks otherwise', () => {
    expect(src).toMatch(/VISIBILITIES\.has\(String\(body\.visibility\)\) \? String\(body\.visibility\) : 'dm'/);
  });

  it('but a token placed from the world page is asked to be visible — that is its whole job', () => {
    expect(ui).toMatch(/visibility: 'players'/);
  });
});

describe('M4-2 — move and remove, not just place', () => {
  it('moving PATCHes the existing object rather than deleting and recreating it', () => {
    // Recreating would reset the object's layer, visibility and dm_notes to defaults — a "move" that
    // silently un-hides a token or drops the DM's note about it.
    expect(ui).toMatch(/send\('PATCH', \{ id: armed\.token\.id, x, y \}\)/);
    expect(ui).not.toMatch(/DELETE[\s\S]{0,200}then[\s\S]{0,80}POST/);
  });

  it('removing sends the id as a query parameter, which is what DELETE reads', () => {
    expect(ui).toMatch(/send\('DELETE', null, `\?id=\$\{encodeURIComponent\(t\.id\)\}`\)/);
    expect(src).toMatch(/req\.nextUrl\.searchParams\.get\('id'\)/);
  });

  it('DELETE sends no JSON body, because the route never parses one', () => {
    // `send` branches on the verb; a body here would be silently ignored, and reading one there would hang
    // on a bodyless request in some runtimes.
    expect(ui).toMatch(/method === 'DELETE'\s*\?\s*\{ method \}/);
    const del = src.slice(src.indexOf('export async function DELETE'));
    expect(del).not.toMatch(/req\.json\(\)/);
  });

  it('the two armed modes are distinguishable, so a click cannot do the wrong one', () => {
    expect(ui).toMatch(/mode: 'place'/);
    expect(ui).toMatch(/mode: 'move'/);
    expect(ui).toMatch(/armed\.mode === 'move'/);
  });

  it('the world page offers exactly the tokens the map actually drew', () => {
    // `nodeTokens` is the post-`readToken` list — the same filter the renderer applies. Feeding the raw
    // rows would list tokens that are not on screen and offer to move them.
    expect(page).toMatch(/placed=\{nodeTokens\.map\(/);
  });
});

describe('M4-2 is wired, not just written', () => {
  it('the world page mounts the placing control for the DM', () => {
    expect(page).toMatch(/import PlaceToken/);
    expect(page).toMatch(/<PlaceToken\s+campaignId=\{campaignId\}\s+nodeId=\{current\.id\}/);
  });

  it('and never for a player', () => {
    const at = page.indexOf('<PlaceToken');
    const gate = page.lastIndexOf('{isDm && (', at);
    expect(gate).toBeGreaterThan(-1);
    // The gate is still OPEN where the control is mounted — no `)}` closes it in between.
    //
    // This used to assert `{isDm && (` within 400 characters above, which was a proximity heuristic
    // standing in for containment. M4-1 mounting `GridDesigner` as a legitimate sibling in the same
    // DM-only section pushed the distance past 400 and failed a test whose subject had not changed. A
    // guard that breaks when you add a sibling is measuring the wrong thing.
    expect(page.slice(gate, at)).not.toMatch(/^\s*\)\}\s*$/m);
  });

  it('the party it offers excludes library templates', () => {
    expect(page).toMatch(/\.eq\('is_library', false\)/);
  });

  it('the control posts to the route that exists', () => {
    expect(ui).toMatch(/\/api\/dnd\/campaigns\/\$\{encodeURIComponent\(campaignId\)\}\/map-objects/);
  });
});

describe('M7-1 — a player may move their own token, and only move it', () => {
  it('checks ownership against the CHARACTER row, not against anything the client sent', () => {
    // A token's `data.characterId` is the DM's claim about what the piece stands for.
    // `dnd_characters.owner_user_id` is the database's claim about whose it is, and only the second one
    // is a permission.
    expect(src).toMatch(/from\('dnd_characters'\)[\s\S]{0,120}eq\('owner_user_id', userId\)/);
  });

  it('allows position fields only — a body carrying `visibility` is a reveal wearing a move\'s clothes', () => {
    const list = src.match(/PLAYER_MOVE_FIELDS = new Set\(\[([^\]]*)\]/)![1];
    for (const allowed of ['x', 'y', 'dx', 'dy']) expect(list).toContain(`'${allowed}'`);
    for (const forbidden of ['visibility', 'label', 'z', 'data', 'dmNotes', 'assetUrl']) {
      expect(list, `${forbidden} must not be player-writable`).not.toContain(`'${forbidden}'`);
    }
  });

  it('refuses a bulk move, so the exception cannot be widened by passing an array', () => {
    expect(src).toMatch(/before\.length === 1/);
  });

  it('still requires campaign membership — owning a character is not being at the table', () => {
    // A character can outlive the campaign it was made in.
    expect(src).toMatch(/Not a member of this campaign/);
  });
});
