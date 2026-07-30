// lib/dnd/dice/materials.ts — what the dice are MADE of, per sheet style.
//
// OWNER: *"Please make it so that the dice change appearance and style and theme along with the style and theme
// selected. Make the dice be a bit fancier and have more flare to them."*
//
// TWO SEPARATE AXES, and keeping them separate is the whole design. **Style** (the sheet skin — hextech, streamer,
// donata, jack, lazzuh) decides the MATERIAL: brushed metal, neon plastic, candy resin, printed bone, cut gem.
// **Theme** (the character's chosen palette) decides the COLOUR. So a streamer sheet in aqua and a streamer sheet
// in crimson are the same plastic dice in two colours, while a rulebook sheet in aqua is bone dice — which is what
// "change with the style AND theme" actually means, and what a single combined table could not express.
//
// A MATERIAL IS A HANDFUL OF NUMBERS, NOT A PALETTE. It sets how sharply light falls across the facets, how strong
// the specular is, how visible the seams are, how bright the edge reads. The COLOURS all come from the sheet's own
// custom properties, so a material never fights a theme it has never heard of — the trap that made the Impact
// roller ignore the player's palette on PF2 and IG, where the 5e variables simply do not exist.
//
// Everything here is data. Adding a skin is one entry; adding a theme is nothing at all.

/** The physical character of a die's surface. */
export interface DieMaterial {
  /** Machine name, for the class the renderer puts on the die. */
  id: string
  /** Human label, for a picker. */
  label: string
  /**
   * How hard the light falls across the faces (`contrast` in `projectSolid`). Metal and gem separate their facets
   * sharply; bone and resin are soft and diffuse.
   */
  contrast: number
  /** Strength of the screen-space sheen, 0…1. Plastic and gem are glossy; bone is nearly matte. */
  specular: number
  /** Alpha of the hairline between facets. High on cut materials, low on moulded ones. */
  seam: number
  /** Width of the silhouette stroke, in viewBox units. */
  edge: number
  /** Extra glow around the edge — the flare, kept per material so neon dice can bloom and bone dice cannot. */
  bloom: number
}

export const DIE_MATERIALS: Record<string, DieMaterial> = {
  /** Cut gem — the default. Crisp facets, strong sheen: the most "dice-like" of the set. */
  gem: { id: 'gem', label: 'Cut gem', contrast: 0.4, specular: 0.34, seam: 0.1, edge: 2.6, bloom: 0.18 },
  /** Brushed metal, for the hextech look. Hard facet separation, tight highlight, bright rim. */
  metal: { id: 'metal', label: 'Brushed metal', contrast: 0.52, specular: 0.42, seam: 0.16, edge: 2.9, bloom: 0.1 },
  /** Neon plastic, for the streamer skin. Glossy, glowing edge, soft seams — an injection-moulded die. */
  neon: { id: 'neon', label: 'Neon plastic', contrast: 0.34, specular: 0.5, seam: 0.05, edge: 3.2, bloom: 0.55 },
  /** Candy resin, for Donata's skin. Translucent-looking, gentle shading, wide soft highlight. */
  resin: { id: 'resin', label: 'Candy resin', contrast: 0.28, specular: 0.46, seam: 0.04, edge: 2.4, bloom: 0.3 },
  /** Printed bone, for the rulebook skin. Matte, chalky, almost no highlight — a die out of an old boxed set. */
  bone: { id: 'bone', label: 'Printed bone', contrast: 0.3, specular: 0.12, seam: 0.13, edge: 2.2, bloom: 0 },
}

/**
 * Which material a sheet style rolls.
 *
 * Keyed on `sheet_type`, the same identifier `SHEET_STYLES` uses, so this cannot drift into its own vocabulary of
 * skin names. An unknown skin falls through to gem rather than to nothing — a new skin gets handsome dice on the
 * day it is added, and hand-tuning it later is an improvement rather than a repair.
 */
const BY_SKIN: Record<string, string> = {
  default: 'gem',
  hextech: 'metal',
  streamer: 'neon',
  donata: 'resin',
  jack: 'bone',
  rulebook: 'bone',
  lazzuh: 'neon',
  generic: 'gem',
}

export function materialForSkin(sheetType: string | null | undefined): DieMaterial {
  return DIE_MATERIALS[BY_SKIN[sheetType ?? 'default'] ?? 'gem'] ?? DIE_MATERIALS.gem
}

/** Every material, for a picker or a contact sheet. */
export const MATERIAL_LIST = Object.values(DIE_MATERIALS)
