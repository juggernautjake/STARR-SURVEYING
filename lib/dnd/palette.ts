// lib/dnd/palette.ts — the command palette's ranking (P4-4, audit D-6).
//
// "The library has excellent search; nothing else does." Finding a character meant remembering which
// campaign it was in; finding a campaign meant scrolling the lobby. This is the index across all of it.
//
// PURE, so the ranking — the part that decides whether the palette feels good or useless — is testable
// without a database or a keystroke. The route does the fetching and the permission scoping; everything
// about *what wins* lives here.
//
// WHY NOT REUSE `searchLibrary`'S SCORER FOR EVERYTHING. The slice suggested it, and it is the wrong shape
// for entities: that engine scores long prose by keyword coverage, which is right for a rules article and
// wrong for a name. Typing "vex" should put the character Vex first, not a rules paragraph that happens to
// say "vexing" three times. Library hits still come from `searchLibrary` — they are prose — and entities
// are ranked by how well the QUERY MATCHES A NAME. Two kinds of thing, two kinds of match.

export type PaletteKind = 'character' | 'campaign' | 'content' | 'library' | 'action';

export interface PaletteItem {
  id: string;
  kind: PaletteKind;
  title: string;
  /** The line under the title — a class/level, a system, a campaign role. */
  subtitle?: string;
  href: string;
  /** Extra words that should match but are not shown, e.g. a character's class. */
  keywords?: string;
}

export interface ScoredItem extends PaletteItem {
  score: number;
}

/**
 * How well does `query` match this item? Higher is better; 0 means "do not show".
 *
 * The tiers are deliberately coarse — exact, prefix, word-prefix, substring — because a fuzzy scorer that
 * ranks by edit distance surfaces confident nonsense for short queries, and every query here starts short.
 */
export function scoreItem(item: PaletteItem, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const title = item.title.toLowerCase();

  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  // A word inside the title starting with the query — "sallow" finding "Orin Sallowmere".
  if (title.split(/\s+/).some((w) => w.startsWith(q))) return 60;
  if (title.includes(q)) return 40;

  // Only now consider the hidden keywords and subtitle, and score them BELOW every title match, so a
  // character named "Rogue" always beats every rogue.
  const rest = `${item.subtitle ?? ''} ${item.keywords ?? ''}`.toLowerCase();
  if (rest.includes(q)) return 20;
  return 0;
}

/**
 * Order: score first, then KIND, then alphabetically.
 *
 * The kind ordering is the opinionated part. Characters and campaigns are things you are trying to GO to;
 * library articles are things you are trying to read; actions are always available and would otherwise
 * crowd out real results for short queries. A tie between a character and a rules article should open the
 * character — you can always keep typing to reach the article.
 */
const KIND_RANK: Record<PaletteKind, number> = {
  character: 0,
  campaign: 1,
  content: 2,
  library: 3,
  action: 4,
};

export function rankPalette(items: readonly PaletteItem[], query: string, limit = 20): ScoredItem[] {
  const scored: ScoredItem[] = [];
  for (const item of items ?? []) {
    const score = scoreItem(item, query);
    if (score > 0) scored.push({ ...item, score });
  }
  scored.sort((a, b) =>
    b.score - a.score
    || KIND_RANK[a.kind] - KIND_RANK[b.kind]
    || a.title.localeCompare(b.title));
  return scored.slice(0, Math.max(0, limit));
}

/** Group ranked results under their kind, preserving rank order within each group. */
export function groupPalette(items: readonly ScoredItem[]): { kind: PaletteKind; items: ScoredItem[] }[] {
  const order: PaletteKind[] = ['character', 'campaign', 'content', 'library', 'action'];
  return order
    .map((kind) => ({ kind, items: items.filter((i) => i.kind === kind) }))
    .filter((g) => g.items.length > 0);
}

/** The heading each group gets. Plural because a group only exists when it has members. */
export const PALETTE_GROUP_LABELS: Record<PaletteKind, string> = {
  character: 'Characters',
  campaign: 'Campaigns',
  content: 'Custom content',
  library: 'Rules library',
  action: 'Actions',
};

/**
 * The always-available destinations, offered when the query matches them.
 *
 * These are the same places the header and lobby link to. Duplicating the list would be a maintenance trap,
 * but the palette needs them as *searchable* items rather than as navigation, so they are defined once here
 * and the palette is the only consumer.
 */
export const PALETTE_ACTIONS: PaletteItem[] = [
  { id: 'a:new-character', kind: 'action', title: 'New character', href: '/dnd/characters/new', keywords: 'create make build add' },
  { id: 'a:my-characters', kind: 'action', title: 'My characters', href: '/dnd/characters', keywords: 'list index all' },
  { id: 'a:content-builder', kind: 'action', title: 'Content Builder', href: '/dnd/content/new', keywords: 'homebrew create class feat item studio' },
  { id: 'a:my-content', kind: 'action', title: 'My custom content', href: '/dnd/content?tab=mine', keywords: 'homebrew mine' },
  { id: 'a:library', kind: 'action', title: 'Rules library', href: '/dnd/library', keywords: 'rules reference spells conditions' },
  { id: 'a:profile', kind: 'action', title: 'Profile', href: '/dnd/profile', keywords: 'account password avatar recovery' },
  { id: 'a:requests', kind: 'action', title: 'Requests', href: '/dnd/suggestions', keywords: 'suggestions feedback board' },
];
