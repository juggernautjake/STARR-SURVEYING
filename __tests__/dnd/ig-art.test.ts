// __tests__/dnd/ig-art.test.ts — the Intuitive Games art manifest (Brendan's race illustrations scrubbed
// from intuitivegames.net into public/, shown with attribution). Verifies the mapping + that every
// referenced file actually exists on disk.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { igAncestryArt, igAncestriesWithArt, IG_ART_CREDIT } from '@/lib/dnd/systems/intuitive-games/art';
import { IG_ANCESTRIES } from '@/lib/dnd/systems/intuitive-games/content';

describe('IG ancestry art manifest', () => {
  it('maps a known ancestry to its portrait, case-insensitively; null for art-less / unknown', () => {
    expect(igAncestryArt('Dwarf')).toBe('/dnd/intuitive-games/ancestries/dwarf.png');
    expect(igAncestryArt('  migoi ')).toBe('/dnd/intuitive-games/ancestries/migoi.png');
    expect(igAncestryArt('Human')).toBeNull(); // the site publishes no Human portrait
    expect(igAncestryArt('Nonesuch')).toBeNull();
    expect(igAncestryArt(null)).toBeNull();
  });

  it('every art path points at a real file that was downloaded', () => {
    for (const name of igAncestriesWithArt()) {
      const rel = igAncestryArt(name)!;
      const abs = path.join(process.cwd(), 'public', rel.replace(/^\//, ''));
      expect(fs.existsSync(abs), `${name} art missing at ${rel}`).toBe(true);
      expect(fs.statSync(abs).size).toBeGreaterThan(10_000); // a real image, not an empty/error file
    }
  });

  it('every arted ancestry is a real IG ancestry (no orphan art)', () => {
    const known = new Set(IG_ANCESTRIES.map((a) => a.name.toLowerCase()));
    for (const name of igAncestriesWithArt()) expect(known.has(name)).toBe(true);
  });

  it('credits Brendan / Intuitive Games', () => {
    expect(IG_ART_CREDIT).toMatch(/Brendan/);
    expect(IG_ART_CREDIT).toMatch(/Intuitive Games/);
  });
});
