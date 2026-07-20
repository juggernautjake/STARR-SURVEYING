// __tests__/dnd/media-delete.test.ts — deleting a gallery image actually deletes it.
//
// Owner 2026-07-19: deleting from a CHARACTER gallery did nothing — the tile stayed and
// the image survived. The DELETE handler required a campaign_id and DM role, so a character
// image answered 404 ("not found", when it had no campaign) or 403 ("DM only", for the
// character's own player). The gallery only removes a tile when the response is ok, so the
// button looked dead. These pin the fix.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { storageKeyFromUrl } from '@/lib/dnd/media-storage';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('storageKeyFromUrl', () => {
  const pub = (key: string) => `https://xyz.supabase.co/storage/v1/object/public/dnd-media/${key}`;

  it('extracts the in-bucket key from a public URL', () => {
    expect(storageKeyFromUrl(pub('character/abc/def.png'))).toBe('character/abc/def.png');
  });

  it('ignores a cache-busting query string', () => {
    expect(storageKeyFromUrl(pub('character/abc/def.png?v=2'))).toBe('character/abc/def.png');
  });

  it('decodes escaped characters so the delete targets the real object', () => {
    expect(storageKeyFromUrl(pub('character/abc/my%20art.png'))).toBe('character/abc/my art.png');
  });

  it('returns null for anything that is not one of our bucket URLs', () => {
    expect(storageKeyFromUrl(null)).toBeNull();
    expect(storageKeyFromUrl('')).toBeNull();
    expect(storageKeyFromUrl('https://example.com/some/image.png')).toBeNull();
    // A different bucket must not be touched.
    expect(storageKeyFromUrl('https://xyz.supabase.co/storage/v1/object/public/other-bucket/a.png')).toBeNull();
  });
});

describe('the media DELETE route authorizes both ownerships', () => {
  const src = read('app/api/dnd/media/route.ts');
  const del = src.slice(src.indexOf('export async function DELETE'));

  it('routes CHARACTER media through the character write chokepoint', () => {
    expect(del).toContain('if (media.character_id)');
    expect(del).toContain('requireCharacterWrite(media.character_id)');
  });

  it('keeps CAMPAIGN media DM-only', () => {
    expect(del).toContain("getCampaignRole(media.campaign_id)) !== 'dm'");
  });

  it('no longer rejects a row just for lacking a campaign_id', () => {
    // The old guard — a character image with no campaign died here with a 404.
    expect(del).not.toContain('!media.campaign_id) return NextResponse.json({ error: \'Not found.\' }');
  });

  it('removes the stored object as well as the row', () => {
    expect(del).toContain('storageKeyFromUrl(media.url)');
    expect(del).toContain('storage.from(BUCKET).remove');
  });

  it('selects the columns the authorization actually needs', () => {
    expect(del).toContain("select('id, campaign_id, character_id, url')");
  });
});

describe('the character gallery reflects a delete immediately', () => {
  const src = read('app/dnd/_sheet/components/CharacterGallery.tsx');

  it('drops the tile from local state rather than waiting for a refetch', () => {
    expect(src).toContain('setItems((prev) => prev.filter((m) => m.id !== row.id))');
  });

  it('surfaces a failed delete instead of silently doing nothing', () => {
    expect(src).toContain('Could not delete:');
  });

  it('closes the lightbox if the deleted image was open in it', () => {
    expect(src).toContain('setLightbox((cur) => (cur === row.url ? null : cur))');
  });
});

// A route module may export ONLY recognised handlers. Exporting a helper alongside them
// (storageKeyFromUrl once was) compiles fine under `tsc --noEmit` but FAILS `next build`
// in Next's generated route types — which is how it reached main unnoticed. This catches it
// in the unit suite instead of in the deploy.
describe('the media route exports only route handlers', () => {
  const ALLOWED = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'runtime', 'dynamic', 'revalidate', 'maxDuration', 'fetchCache', 'preferredRegion', 'config', 'generateStaticParams']);

  it('exports nothing a Next.js route module disallows', () => {
    const src = read('app/api/dnd/media/route.ts');
    const names = [...src.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var)\s+([A-Za-z0-9_]+)/gm)].map((m) => m[1]);
    const bad = names.filter((n) => !ALLOWED.has(n));
    expect(bad, `illegal route exports (move them to lib/): ${bad.join(', ')}`).toEqual([]);
  });
});

// Owner 2026-07-20: character art must not auto-publish to the campaign gallery, and deleting
// it must truly delete it. S1 of DND_2024_COMPLETE_LIBRARY_2026-07-20.
describe('character art does not auto-publish to the campaign gallery', () => {
  const route = read('app/api/dnd/media/route.ts');
  const seed = read('seeds/454_dnd_media_publish_flag.sql');

  it('the campaign gallery reads only published rows', () => {
    // Previously it read every row with the campaign_id, and character uploads stamp that id
    // for scoping — so scoping and publishing were accidentally the same thing.
    expect(route).toContain("eq('published_to_campaign', true)");
  });

  it('a DM uploading to the campaign gallery publishes on creation', () => {
    expect(route).toContain('published_to_campaign: true');
  });

  it('publishing authorizes through the character write gate, not DM-only', () => {
    // Sharing your OWN character's art shouldn't require asking the DM.
    const patch = route.slice(route.indexOf('export async function PATCH'));
    expect(patch).toContain('requireCharacterWrite(media.character_id)');
  });

  it('refuses to publish something that is not character art', () => {
    const patch = route.slice(route.indexOf('export async function PATCH'));
    expect(patch).toContain('Only character art is published this way');
  });

  it('defaults the column to FALSE so new character art starts private', () => {
    expect(seed).toMatch(/published_to_campaign BOOLEAN NOT NULL DEFAULT FALSE/i);
  });

  it('backfills only campaign-level media as published, never character art', () => {
    // The safe direction: un-publishing something visible is one click; leaving art shared that
    // the player never chose to share is the complaint being fixed.
    expect(seed).toContain('WHERE character_id IS NULL');
  });

  it('the gallery offers a share toggle and shows shared state', () => {
    const ui = read('app/dnd/_sheet/components/CharacterGallery.tsx');
    expect(ui).toContain('togglePublish');
    expect(ui).toContain('Share to campaign');
    expect(ui).toContain('SHARED');
    // Optimistic update must roll back if the server refuses, or the tile lies.
    expect(ui).toContain('published_to_campaign: !next');
  });

  it('still confirms before deleting, and deletes for real', () => {
    const ui = read('app/dnd/_sheet/components/CharacterGallery.tsx');
    expect(ui).toContain('window.confirm');
    const del = route.slice(route.indexOf('export async function DELETE'));
    expect(del).toContain("from('dnd_media').delete()");
    expect(del).toContain('storage.from(BUCKET).remove'); // the object, not just the row
  });
});
