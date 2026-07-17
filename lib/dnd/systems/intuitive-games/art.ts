// lib/dnd/systems/intuitive-games/art.ts — manifest of the Intuitive Games ARTWORK. These are Brendan's
// hand-drawn illustrations from intuitivegames.net (the system's creator), downloaded into the app's public
// assets and shown WITH ATTRIBUTION to him. Pure + Expo/React-free so the mapping is unit-testable and the
// sheet/library read one source. Add a mapping here as more art is scrubbed from the site.

/** Credit line shown wherever Intuitive Games art appears. */
export const IG_ART_CREDIT = 'Art by Brendan · Intuitive Games (intuitivegames.net)';

// Ancestry ("race") portraits — the 8 the site publishes (Human + Sprite have no portrait on the site yet).
// Keyed by the lowercase ancestry name so it lines up with IG_ANCESTRIES.
const ANCESTRY_ART: Record<string, string> = {
  dwarf: '/dnd/intuitive-games/ancestries/dwarf.png',
  elf: '/dnd/intuitive-games/ancestries/elf.png',
  gnome: '/dnd/intuitive-games/ancestries/gnome.png',
  halfling: '/dnd/intuitive-games/ancestries/halfling.png',
  leshonki: '/dnd/intuitive-games/ancestries/leshonki.png',
  migoi: '/dnd/intuitive-games/ancestries/migoi.png', // the site's "Yeti" race art
  naga: '/dnd/intuitive-games/ancestries/naga.png',
  ogre: '/dnd/intuitive-games/ancestries/ogre.png',
};

/** The portrait path for an ancestry, or null if the site publishes no art for it. */
export function igAncestryArt(name: string | null | undefined): string | null {
  if (!name) return null;
  return ANCESTRY_ART[name.trim().toLowerCase()] ?? null;
}

/** The ancestry names that have art (for coverage checks / galleries). */
export function igAncestriesWithArt(): string[] {
  return Object.keys(ANCESTRY_ART);
}
