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
      expect(fn, `${verb} must return the gate's refusal`).toMatch(/if \('error' in gate\) return gate\.error/);
      expect(fn, `${verb} must require a session`).toMatch(/getDndSession\(\)/);
    }
  });

  it('PATCH and DELETE find the node through the object row rather than trusting a nodeId in the body', () => {
    // Otherwise a DM of their own campaign could patch someone else's object by naming their own node.
    const after = src.slice(src.indexOf('export async function PATCH'));
    expect(after).toMatch(/from\('dnd_map_objects'\)\.select\('id, map_node_id'\)/);
    expect(after).toMatch(/nodeGate\(\(row as \{ map_node_id: string \}\)\.map_node_id\)/);
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
