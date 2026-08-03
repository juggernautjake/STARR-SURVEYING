// __tests__/dnd/campaign-thumbnail.test.tsx — the campaign's picture, everywhere (P14-10).
//
// The owner's request has two halves and only one of them is a feature: *"the dm can add a main image"*
// and *"this should show up EVERYWHERE the campaign shows up to be opened"*. The doc's own warning about
// it is what these tests are shaped around — *"a thumbnail added in one place and rendered in one place
// is the 'authored but not wired' shape again."*
//
// So the tests that matter are: every listing surface renders it, the placeholder exists at all (because
// no-picture is the COMMON case), the write path lands in the column rather than the old jsonb key, and
// the two copies can never disagree.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import CampaignThumb from '@/app/dnd/_ui/CampaignThumb';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const SEED = read('seeds/571_dnd_campaign_thumbnail.sql');
const SUMMARY = read('lib/dnd/campaign-summary.ts');
const PATCH = read('app/api/dnd/campaigns/[id]/route.ts');

describe('the picture is stored as a COLUMN, promoted from the theme jsonb', () => {
  it('seed 571 adds the column idempotently', () => {
    expect(SEED).toContain('ADD COLUMN IF NOT EXISTS thumbnail_url text');
  });

  it('and BACKFILLS from the key it replaces, so nobody loses art they already set', () => {
    expect(SEED).toMatch(/UPDATE dnd_campaigns[\s\S]*theme->>'artUrl'/);
  });

  it('the backfill only fills NULLs, so a re-run cannot overwrite a newer upload with a stale value', () => {
    expect(SEED).toContain('WHERE thumbnail_url IS NULL');
  });

  it('and it does NOT delete the old key — a seed that drops the only copy of user data has no undo', () => {
    expect(SEED).not.toMatch(/theme\s*=\s*theme\s*-\s*'artUrl'/);
    expect(SEED).not.toMatch(/DROP COLUMN/i);
  });
});

describe('one picture, not two — the write path', () => {
  it('PATCH lands `artUrl` in the COLUMN, keeping the client contract unchanged', () => {
    expect(PATCH).toContain("if ('artUrl' in body) patch.thumbnail_url = body.artUrl ? String(body.artUrl) : null;");
  });

  it('and CLEARS the jsonb key on write, so the two copies cannot disagree', () => {
    // The reader prefers the column. A jsonb copy left behind would silently become a lie the moment a
    // DM changed their art — a second answer to "what is this campaign's picture".
    expect(PATCH).toContain("if ('artUrl' in body) theme.artUrl = null;");
  });

  it('is still DM-only', () => {
    expect(PATCH).toContain("Only the DM can edit the campaign.");
  });
});

describe('the read path prefers the column but survives a pre-seed row', () => {
  it('the hub resolves thumbnail_url first, theme.artUrl second', () => {
    const at = SUMMARY.indexOf('artUrl: (typeof');
    expect(at).toBeGreaterThan(-1);
    const block = SUMMARY.slice(at, at + 320);
    expect(block.indexOf('thumbnail_url')).toBeLessThan(block.indexOf('theme?.artUrl'));
  });

  it('every campaign loader selects the column — a narrow select is how a field silently stays null', () => {
    expect(SUMMARY).toContain("'id, name, blurb, dm_user_id, visibility, archived_at, thumbnail_url'");
    expect(SUMMARY).toContain("select('id, name, blurb, thumbnail_url')");           // lobby
    expect(SUMMARY).toContain("select('id, name, thumbnail_url')");                  // profile / MyTable
  });

  it('and the card + user-campaign shapes carry it, so a surface cannot forget to be given it', () => {
    expect(SUMMARY).toMatch(/export interface CampaignCard[\s\S]{0,400}thumbnailUrl: string \| null;/);
    expect(SUMMARY).toMatch(/export interface UserCampaign[\s\S]{0,300}thumbnailUrl: string \| null;/);
  });
});

describe('EVERYWHERE — every listing surface renders the shared component', () => {
  // Named individually rather than as a loop over a glob, so adding a listing and forgetting the
  // thumbnail fails with the name of the surface that forgot.
  const surfaces: [string, string][] = [
    ['the public campaign grid', 'app/dnd/_ui/CampaignsHome.tsx'],
    ['the "campaigns you run / you are in" rows', 'app/dnd/_ui/MyTable.tsx'],
    ['the DM dashboard cards (a SECOND, separate listing)', 'app/dnd/_ui/CampaignDashboard.tsx'],
    ['the DM campaign header', 'app/dnd/_ui/CampaignPageClient.tsx'],
    ['the profile’s "Your tables" panel', 'app/dnd/profile/ProfileSections.tsx'],
  ];

  for (const [what, file] of surfaces) {
    it(`${what} renders CampaignThumb`, () => {
      const src = read(file);
      expect(src).toContain('CampaignThumb');
      expect(src).toMatch(/<CampaignThumb/);
    });
  }

  it('the player hub keeps its banner reading from the same resolved value', () => {
    // Deliberately still conditional — a monogram slab across a whole hub page would be worse than no
    // banner, and the name is the page heading right above it.
    expect(read('app/dnd/_ui/CampaignHub.tsx')).toContain('data.artUrl');
  });

  it('the DM control no longer claims the picture is only the hub banner', () => {
    const src = read('app/dnd/_ui/CampaignArtControl.tsx');
    expect(src).not.toContain('Players see this banner at the top of the campaign hub.');
    expect(src).toMatch(/thumbnail everywhere/i);
  });
});

describe('the placeholder, which is the common case', () => {
  it('renders a monogram tile when there is no picture, rather than nothing', () => {
    const html = renderToStaticMarkup(<CampaignThumb campaignId="c1" name="The Hollow Crown" url={null} />);
    expect(html).toContain('TH');
    expect(html).not.toContain('<img');
  });

  it('the tile is STABLE for a campaign — same colour on every surface and across reloads', () => {
    const a = renderToStaticMarkup(<CampaignThumb campaignId="c1" name="The Hollow Crown" />);
    const b = renderToStaticMarkup(<CampaignThumb campaignId="c1" name="The Hollow Crown" size="card" />);
    const hue = (h: string) => h.match(/hsl\((\d+)/)?.[1];
    expect(hue(a)).toBe(hue(b));
    // …and different campaigns are distinguishable, which is the point of colouring it at all.
    expect(hue(a)).not.toBe(hue(renderToStaticMarkup(<CampaignThumb campaignId="c2" name="Other" />)));
  });

  it('a one-word name still gets a letter, and an emoji name still gets a tile', () => {
    expect(renderToStaticMarkup(<CampaignThumb campaignId="x" name="Waterdeep" />)).toContain('W');
    expect(renderToStaticMarkup(<CampaignThumb campaignId="x" name="🐉" />)).toMatch(/🐉|🎲/);
  });

  it('renders the image when there is one, named by the campaign', () => {
    const html = renderToStaticMarkup(<CampaignThumb campaignId="c1" name="Neon Odyssey" url="https://example.test/a.png" />);
    expect(html).toContain('<img');
    expect(html).toContain('alt="Neon Odyssey"');
    expect(html).toContain('loading="lazy"');
  });

  it('the placeholder is aria-hidden — the link text already names the campaign', () => {
    expect(renderToStaticMarkup(<CampaignThumb campaignId="c1" name="A B" />)).toContain('aria-hidden');
  });
});
