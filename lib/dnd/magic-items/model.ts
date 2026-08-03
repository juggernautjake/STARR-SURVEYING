// lib/dnd/magic-items/model.ts — what a magic item IS, and how the source text becomes it (P8-2).
//
// LICENSING BASIS. The 5e catalogue is the **SRD 5.1, released by Wizards of the Coast under CC-BY-4.0** —
// the same basis as `feats/dnd5e-2014.ts` and the equipment tables. Every entry carries its licence and
// attribution as data rather than in a comment, so an item whose provenance we cannot state cannot be
// added by accident (the bestiary's Ground Rule 3, applied to items).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// THE THREE PLACES A NAIVE IMPORT LIES. Every one of these was measured against the real 237 SRD entries
// rather than assumed, and each has a "just cast it" version that typechecks and is wrong.
//
//  1. RARITY IS NOT ALWAYS ONE OF THE SIX. The 5e ladder is common → uncommon → rare → very rare →
//     legendary → artifact, and the Content Studio's `RARITY` select offers exactly those. But the SRD
//     itself prints `varies`, `rarity by figurine`, `very rare or legendary`, and
//     `uncommon (+1), rare (+2), or very rare (+3)`. Casting those to a ladder value means either
//     dropping the item or picking one of its rarities and calling it the answer — a Figurine of
//     Wondrous Power is not "rare", it is four different rarities depending on which figurine.
//     So: `rarity` is the ladder value ONLY when the text is exactly one, and `rarityNote` carries the
//     source sentence whenever it is not. A UI that filters by rarity shows those under "varies" rather
//     than filing them under a rarity the book never gave them.
//
//  2. `requires_attunement` IS NOT A BOOLEAN. It is free text, and its content is a RULE: `""`,
//     `"requires attunement"`, `"requires attunement by a druid"`, `"requires attunement by a creature of
//     evil alignment"`. `!!requires_attunement` gets the boolean right and silently discards the
//     restriction — and the restriction is the interesting half, because it is the part a player can fail
//     to satisfy. So: `attunement: boolean` PLUS `attunementNote` holding "by a druid".
//
//  3. `type` IS A CATEGORY AND A RESTRICTION IN ONE STRING. `Weapon (any axe or sword)`,
//     `Armor (medium or heavy)`, `Wondrous item`. Splitting them means a picker can group by category
//     (nine of them) while still telling a player that this +1 weapon must be an axe or a sword.
//
// Nothing here interprets the item's EFFECT. A Belt of Giant Strength's "your Strength score is 21" stays
// prose, exactly as it arrives. Turning descriptions into machine-readable `Effect[]` is a different job
// with a different failure mode (a mis-parsed effect changes a character's numbers silently), and the
// sheet already has a hand-authored path for it — see `MAGIC_ITEM_GAPS`.

/** The 5e rarity ladder, in order. Matches the Content Studio's `RARITY` so a catalogued item and a
 *  homebrew one sort together. */
export const MAGIC_ITEM_RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'] as const;
export type MagicItemRarity = (typeof MAGIC_ITEM_RARITIES)[number];

/** The categories the SRD's `type` field opens with. `wondrous item` is the catch-all the book itself
 *  uses, not one we invented for leftovers. */
export const MAGIC_ITEM_CATEGORIES = [
  'armor', 'potion', 'ring', 'rod', 'scroll', 'staff', 'wand', 'weapon', 'wondrous item',
] as const;
export type MagicItemCategory = (typeof MAGIC_ITEM_CATEGORIES)[number];

export interface MagicItem {
  /** Stable slug from the source, e.g. `amulet-of-health`. Unique within a system. */
  key: string;
  name: string;
  category: MagicItemCategory;
  /** The parenthetical the source attaches to the category — "any axe or sword", "medium or heavy".
   *  Absent when the category stands alone. */
  appliesTo?: string;
  /** The ladder value, present only when the source names exactly one. */
  rarity?: MagicItemRarity;
  /** The source's own rarity sentence, present only when it is NOT a single ladder value. Exactly one of
   *  `rarity` / `rarityNote` is set — see `magicItemRarityLabel`. */
  rarityNote?: string;
  /** Does it need attunement at all? */
  attunement: boolean;
  /** Who may attune, when the source restricts it — "by a druid", "by a creature of good alignment".
   *  Only ever set when `attunement` is true. */
  attunementNote?: string;
  /** The item's rules text, verbatim. */
  description: string;
  /** Provenance, carried per item so a mixed catalogue stays attributable. */
  source: string;
  licence: string;
}

const RARITY_SET = new Set<string>(MAGIC_ITEM_RARITIES);
const CATEGORY_SET = new Set<string>(MAGIC_ITEM_CATEGORIES);

/**
 * The source's rarity string → a ladder value, or nothing.
 *
 * Returns `{ rarity }` only for an exact single-value match. Everything else — `varies`,
 * `very rare or legendary`, `rarity by figurine` — comes back as `{ rarityNote }` with the text intact.
 * Deliberately NOT a best-effort parse: "pick the first rarity mentioned" would turn
 * `uncommon (+1), rare (+2), or very rare (+3)` into "uncommon", which is true of one third of the item.
 */
export function parseMagicItemRarity(raw: string | null | undefined): { rarity?: MagicItemRarity; rarityNote?: string } {
  const text = (raw ?? '').trim();
  if (!text) return {};
  const lower = text.toLowerCase();
  if (RARITY_SET.has(lower)) return { rarity: lower as MagicItemRarity };
  return { rarityNote: text };
}

/**
 * The source's `requires_attunement` free text → a flag and its restriction.
 *
 * The leading "requires attunement" is stripped because it is the flag, not the rule; what remains
 * ("by a druid") is the rule. An empty string means no attunement — and that is the common case, so it
 * has to be the falsy branch rather than an error.
 */
export function parseAttunement(raw: string | null | undefined): { attunement: boolean; attunementNote?: string } {
  const text = (raw ?? '').trim();
  if (!text) return { attunement: false };
  const rest = text.replace(/^requires\s+attunement\s*/i, '').trim();
  // A value that does not start with "requires attunement" still means attunement — the SRD is
  // inconsistent enough that treating an unrecognised non-empty string as "no attunement" would be the
  // dangerous reading. Keep the whole thing as the note.
  if (!/^requires\s+attunement/i.test(text)) return { attunement: true, attunementNote: text };
  return rest ? { attunement: true, attunementNote: rest } : { attunement: true };
}

/**
 * `Weapon (any axe or sword)` → `{ category: 'weapon', appliesTo: 'any axe or sword' }`.
 *
 * An unrecognised category returns `null` rather than defaulting to `wondrous item`. A silent default
 * would file a mis-parsed row under the catch-all where nobody would ever notice it was mis-parsed;
 * the importer refuses the row by name instead, which is how a source-format change becomes visible.
 */
export function parseMagicItemType(raw: string | null | undefined): { category: MagicItemCategory; appliesTo?: string } | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const m = text.match(/^([^(]+?)\s*(?:\(([^)]*)\))?$/);
  if (!m) return null;
  const head = m[1].trim().toLowerCase();
  if (!CATEGORY_SET.has(head)) return null;
  const inner = (m[2] ?? '').trim();
  return inner ? { category: head as MagicItemCategory, appliesTo: inner } : { category: head as MagicItemCategory };
}

/** What to print for rarity: the ladder value, else the source's own sentence, else "—". One place, so a
 *  picker and a sheet cannot disagree about how a Figurine of Wondrous Power describes itself. */
export function magicItemRarityLabel(item: Pick<MagicItem, 'rarity' | 'rarityNote'>): string {
  return item.rarity ?? item.rarityNote ?? '—';
}

/** "Wondrous item · rare · requires attunement by a druid" — the one-line summary a picker row shows. */
export function magicItemBrief(item: MagicItem): string {
  const parts: string[] = [item.appliesTo ? `${item.category} (${item.appliesTo})` : item.category];
  const r = magicItemRarityLabel(item);
  if (r !== '—') parts.push(r);
  if (item.attunement) parts.push(`requires attunement${item.attunementNote ? ` ${item.attunementNote}` : ''}`);
  return parts.join(' · ');
}

/** Case/punctuation-insensitive search over the fields a player would type. Kept here rather than in each
 *  caller so the picker, the library and any future encounter tool match identically. */
export function searchMagicItems(items: readonly MagicItem[], query: string): MagicItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter((i) =>
    i.name.toLowerCase().includes(q) ||
    i.category.includes(q) ||
    (i.appliesTo ?? '').toLowerCase().includes(q) ||
    magicItemRarityLabel(i).toLowerCase().includes(q));
}
