// The battle map has a way in.
//
// `/dnd/campaigns/[id]/world` renders `LiveMap` — fog, tokens, terrain, twenty UI components under
// `app/dnd/_ui/maps/`, and a `map-objects` API behind it. Nothing linked to it.
//
// The only navigation to `/world` in the whole app was inside `WorldAuthor`, which renders ON the
// world page: a link from a page to itself. And the DM's campaign panel — the screen belonging to
// the one person who builds and runs a map — contained exactly one link, "← Lobby".
//
// The player hub does link to `/console`, but only once a map is PUBLISHED, and only the DM can
// publish one. The entry point sat behind the thing it was the entry point for.
//
// This is the same defect the research plan recorded eleven times in a different subsystem: work
// that is finished, correct and unreachable. It is worth a test because a link is the easiest thing
// in a codebase to delete by accident and the hardest to miss the absence of — nothing fails, the
// feature simply becomes invisible.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const dmPanel = read('app/dnd/_ui/CampaignPageClient.tsx');

/** Every campaign sub-route that exists as a page. */
const ROUTES = ['world', 'map-studio', 'planet-forge', 'console'];

describe('the DM can reach every map surface from the campaign panel', () => {
  for (const slug of ROUTES) {
    it(`links to /${slug}`, () => {
      expect(dmPanel).toContain(`'${slug}'`);
    });

    it(`/${slug} is a real page`, () => {
      // A link to a route that does not exist is worse than no link: it looks like a feature.
      const p = path.join(process.cwd(), 'app/dnd/campaigns/[id]', slug, 'page.tsx');
      expect(fs.existsSync(p), `${slug}/page.tsx is missing`).toBe(true);
    });
  }

  it('builds the href from the campaign id, not a hardcoded one', () => {
    expect(dmPanel).toContain('href={`/dnd/campaigns/${campaignId}/${slug}`}');
  });

  it('gives each one a description, because four bare nouns are not navigation', () => {
    expect(dmPanel).toContain('the map you run a session on');
  });
});

describe('the world page is no longer reachable only from itself', () => {
  it('something outside the world page links to it', () => {
    // The original state: `WorldAuthor.tsx` pushed to `/world`, and WorldAuthor renders on `/world`.
    const linkers = ['app/dnd/_ui/CampaignPageClient.tsx']
      .filter((f) => /\bworld\b/.test(read(f)));
    expect(linkers.length).toBeGreaterThan(0);
  });

  it('the world page really does render the battle map', () => {
    // If this ever stops being true, the link above points somewhere that is no longer the map and
    // this whole test is guarding a name rather than a feature.
    expect(read('app/dnd/campaigns/[id]/world/page.tsx')).toContain('<LiveMap');
  });
});
