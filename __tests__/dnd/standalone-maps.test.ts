// Standalone maps — a map exists without a campaign, and the nav link reaches the builder.
//
// Owner report 2026-08-01: the header's "＋ Map" button did not take you to the map builder. The cause
// was not a broken builder; it was a link to `/dnd?new=map`, a query string **nothing in the codebase
// has ever read**. It rendered, it was clickable, it navigated — to the campaigns hub, which then
// ignored the parameter. That is this repo's signature defect (audit §1.4, "authored but not wired")
// on the tabletop side.
//
// So the first test here is not about maps at all. It asserts that every `href` the tabletop header
// offers resolves to a real route file, because "the link goes somewhere that exists" is the property
// that was actually missing, and a test that only checked the map link would let the next one through.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const HEADER = path.join(ROOT, 'app/dnd/_ui/DndHeader.tsx');

function read(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

/** Every `href="/dnd…"` literal in the header. Template hrefs are skipped — they are parameterised and
 *  cannot be resolved statically; there are none in this file today. */
function headerHrefs(): string[] {
  const src = read(HEADER);
  return [...src.matchAll(/href="(\/dnd[^"]*)"/g)].map((m) => m[1]);
}

/** Does an App Router page exist for this pathname? Static segments only — enough for the header. */
function routeExists(pathname: string): boolean {
  const clean = pathname.split('?')[0].replace(/^\//, '');
  const dir = path.join(ROOT, 'app', clean);
  return ['page.tsx', 'page.ts', 'page.jsx'].some((f) => fs.existsSync(path.join(dir, f)));
}

describe('tabletop header navigation', () => {
  it('every link points at a route that exists', () => {
    const broken = headerHrefs().filter((h) => !routeExists(h));
    expect(broken, `header links with no page.tsx: ${broken.join(', ')}`).toEqual([]);
  });

  it('no link carries a query parameter nothing reads', () => {
    // `?new=campaign` IS read — NewCampaignButton/CampaignDashboard open a form on arrival. `?new=map`
    // was not, and that is exactly how the map button came to be a no-op. Any future `?new=<x>` in the
    // header must have a consumer, or this fails and names it.
    const params = headerHrefs()
      .map((h) => h.split('?')[1])
      .filter((q): q is string => !!q);

    const appSrc = [...walk(path.join(ROOT, 'app/dnd')), ...walk(path.join(ROOT, 'app/api/dnd'))]
      .filter((f) => /\.tsx?$/.test(f))
      .map(read)
      .join('\n');

    const unread = params.filter((q) => {
      const [key, value] = q.split('=');
      // A consumer either reads the value literally (`new=campaign` in a comment/href pair is not
      // enough) or reads the key through searchParams and compares to the value.
      return !(appSrc.includes(`'${value}'`) || appSrc.includes(`"${value}"`)) || !appSrc.includes(key);
    });
    expect(unread, `header query params with no consumer: ${unread.join(', ')}`).toEqual([]);
  });

  it('the ＋ Map button goes to the map builder, not the campaigns hub', () => {
    const src = read(HEADER);
    // The label is the user-visible contract; assert the href on the same element rather than merely
    // that the string appears somewhere in the file.
    // `[^>]*` will not do: the JSX carries `onClick={() => setOpen(false)}`, and the arrow contains a
    // `>`. Matching lazily to the label instead is what actually ties this href to this button.
    const link = /href="([^"]+)"[^<]*?>＋ Map</.exec(src);
    expect(link, 'no "＋ Map" link found in the header').not.toBeNull();
    expect(link![1]).toBe('/dnd/maps/studio');
  });

  it('offers the map library as well as the builder', () => {
    expect(read(HEADER)).toContain('href="/dnd/maps"');
  });
});

describe('the standalone map surfaces exist', () => {
  it.each([
    ['app/dnd/maps/page.tsx', 'the personal map library'],
    ['app/dnd/maps/studio/page.tsx', 'the campaign-free Map Studio'],
    ['app/api/dnd/maps/route.ts', 'the personal maps API'],
    ['app/api/dnd/maps/asset/route.ts', 'the direct-to-Storage upload handshake'],
    ['seeds/518_dnd_standalone_maps.sql', 'the schema that lets campaign_id be null'],
  ])('%s — %s', (file) => {
    expect(fs.existsSync(path.join(ROOT, file)), `${file} is missing`).toBe(true);
  });
});

describe('personal map authorization', () => {
  const api = read(path.join(ROOT, 'app/api/dnd/maps/route.ts'));

  it('bounds every personal-map query by owner AND by having no campaign', () => {
    // Both, not either. Owner alone would let the personal endpoint reach a campaign map the user
    // happened to create, bypassing that campaign's publish gate; `campaign_id IS NULL` alone would
    // expose every orphan map in the table. Counted so a new handler cannot add a third query that
    // remembers only one half.
    // Comments stripped first — the header of that file quotes both bounds while explaining them, and
    // counting prose as enforcement is how a test starts passing for the wrong reason.
    const code = api.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    const ownerBounds = code.match(/\.eq\('owner_id', session\.userId\)/g) ?? [];
    const campaignBounds = code.match(/\.is\('campaign_id', null\)/g) ?? [];
    expect(ownerBounds.length).toBeGreaterThan(0);
    // The shared `myMaps()` helper carries both, but expresses the owner bound through its parameter,
    // so the campaign bound is legitimately one ahead of the literal owner count.
    expect(campaignBounds.length).toBe(ownerBounds.length + 1);
    expect(code).toContain(".eq('owner_id', userId).is('campaign_id', null)");
  });

  it('never writes `published` — publishing is a campaign fact', () => {
    // A standalone map has no table to be published to. If this ever changes, it must be a decision,
    // not a copy-paste from the campaign route.
    expect(api).not.toMatch(/published:\s*(true|false)/);
  });

  it('re-checks DM on the destination when copying into a campaign', () => {
    // Owning the source and being allowed to add to the destination are different permissions.
    expect(api).toContain("getCampaignRole(copyTo)) !== 'dm'");
  });

  it('builds the upload key from the session, never from the request body', () => {
    const asset = read(path.join(ROOT, 'app/api/dnd/maps/asset/route.ts'));
    expect(asset).toContain('`user/${session.userId}/maps/embedded`');
    // The client supplies a content hash and a MIME type; neither may steer the directory.
    expect(asset).not.toMatch(/dir\s*=\s*[`'"].*body\./);
  });
});

describe('the Map Studio bridge serves both modes from one implementation', () => {
  const studio = read(path.join(ROOT, 'public/dnd/maps/map-studio.html'));

  it('routes saves to the personal API when ?personal=1', () => {
    expect(studio).toContain('qs.get("personal") === "1"');
    expect(studio).toContain('"/api/dnd/maps"');
  });

  it('still routes saves to the campaign API when ?campaign=<id>', () => {
    expect(studio).toContain('"/api/dnd/campaigns/"+encodeURIComponent(campaign)+"/maps"');
  });

  it('shows no Publish button in personal mode', () => {
    // An inert Publish button is worse than a missing one: it promises players will see the map.
    expect(studio).toContain('const pubBtn = campaign ? mkBtn("dbPublishBtn"');
  });

  it('leaves the file export/import flow alone in both modes', () => {
    // The bridge redirects the *persistence* seam only. Losing Save-file would strand every map a
    // person built before this shipped.
    expect(studio).toContain('if(!campaign && !personal) return;');
  });
});

/** Recursively list files under a directory, tolerating a missing one. */
function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
