// lib/dnd/homebrew/migrate-content.ts — move `dnd_content` into the Studio (P6-19).
//
// `dnd_content` is the original homebrew library (Phase C19): campaign-scoped or global rows of
// `{ kind, name, rarity, requires_attunement, data: { stats + effects[] } }`, consumed by
// `app/dnd/_sheet/engine/content.ts`. The Studio (`dnd_homebrew`) is where authored content lives now.
//
// PURE, AND SEPARATE FROM ANY WRITE. The mapping is the part that can be wrong, and it is the part a
// script cannot check for you — so it lives here with tests, and the script that runs it does nothing but
// read rows, call this, and write the results.
//
// THE CUTOVER IS NOT PART OF THIS SLICE, and that is deliberate. The old route still serves live play, and
// seed 455 (`dnd_homebrew`) has not been applied on the owner's deployment — retiring `/api/dnd/content`
// before the table exists and the rows have moved would break the feature it is meant to replace. What
// ships here is the mapping and the script; the switch is a decision to take once the migration has
// actually been run and eyeballed. See `CONTENT_MIGRATION_STATUS`.
import { HOMEBREW_KINDS, type HomebrewKind } from './model';

/** The nine `dnd_content` kinds, from the table's own CHECK constraint. */
export const CONTENT_KINDS = [
  'armor', 'weapon', 'item', 'magic_item', 'feat', 'feature', 'spell', 'ability', 'attack',
] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

/**
 * Content kind → Studio kind.
 *
 * Six map exactly. The other three do not, and each is a decision rather than an oversight:
 *
 * · `magic_item` → `item`. The Studio has no separate magic-item kind; rarity and attunement survive in
 *   the payload, so nothing is lost but the label. Inventing a kind for three rows would be worse.
 * · `feature` → `ability`. A "feature" in the old table is a granted thing a character has, which is what
 *   the Studio calls an ability. `feat` stays `feat` — they are different, and collapsing them would make
 *   a class feature look like something you can choose at an ASI.
 * · `attack` → `action`. An attack is a thing you do on your turn, and `action` is the Studio's name for
 *   that. There is no `attack` kind and adding one to hold old rows would be tail-wagging-dog.
 */
export const CONTENT_KIND_MAP: Record<ContentKind, HomebrewKind> = {
  armor: 'armor',
  weapon: 'weapon',
  item: 'item',
  magic_item: 'item',
  feat: 'feat',
  feature: 'ability',
  spell: 'spell',
  ability: 'ability',
  attack: 'action',
};

/** One `dnd_content` row, as the table stores it. */
export interface ContentRow {
  id: string;
  campaign_id: string | null;
  kind: string;
  name: string;
  rarity: string | null;
  data: unknown;
  requires_attunement: boolean;
  created_by: string | null;
}

export interface MigratedPiece {
  /** The source row, so a script can record what came from where. */
  sourceId: string;
  kind: HomebrewKind;
  name: string;
  system: string;
  owner_user_id: string;
  visibility: string;
  summary: string;
  payload: Record<string, unknown>;
}

export type MigrationOutcome =
  | { ok: true; piece: MigratedPiece }
  | { ok: false; sourceId: string; reason: string };

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Convert one row.
 *
 * Returns a REASON rather than throwing or guessing when it cannot. A migration that silently drops rows is
 * the worst possible version of this: the old table gets retired, the rows are gone, and nobody knows which
 * ones because the script printed a count.
 */
export function migrateContentRow(row: ContentRow): MigrationOutcome {
  const sourceId = str(row?.id) || '(unknown row)';
  const name = str(row?.name);
  if (!name) return { ok: false, sourceId, reason: 'no name' };

  const kind = CONTENT_KIND_MAP[str(row.kind) as ContentKind];
  if (!kind) return { ok: false, sourceId, reason: `unmapped kind "${str(row.kind)}"` };

  // ATTRIBUTION IS THE HARD CONSTRAINT. `dnd_homebrew.owner_user_id` is NOT NULL, and `created_by` is
  // nullable and `ON DELETE SET NULL` — so a row whose author's account was deleted has nobody to own it.
  // Assigning those to whoever runs the migration would silently make one person the author of other
  // people's work. They are refused, and the script reports them for a human decision.
  const owner = str(row.created_by);
  if (!owner) return { ok: false, sourceId, reason: `"${name}" has no creator to attribute it to` };

  const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data)
    ? (row.data as Record<string, unknown>)
    : {};

  return {
    ok: true,
    piece: {
      sourceId,
      kind,
      name,
      // `dnd_content` predates the system column entirely — every row was written when 5e was the only
      // system. `any` is the honest answer: it says "this was not scoped", which is true, rather than
      // asserting a system the row never claimed.
      system: 'any',
      owner_user_id: owner,
      // PRIVATE, always. A campaign-scoped row was visible to that campaign's members; a Studio piece is
      // visible to its owner or to everyone. Mapping "some people could see it" to "everyone can" is a
      // migration that publishes other people's work, so it maps down and the owner re-shares if they want.
      visibility: 'private',
      summary: contentSummary(row),
      // The engine reads `data.stats` and `data.effects` (see engine/content.ts). Carried through verbatim
      // and unwrapped, so a migrated +2 axe changes the same numbers it did before. `rarity` and
      // `requiresAttunement` ride along because the Studio's item kind has nowhere else to put them and
      // dropping them would quietly turn a legendary attuned item into a mundane one.
      payload: {
        ...data,
        ...(row.rarity ? { rarity: row.rarity } : {}),
        ...(row.requires_attunement ? { requiresAttunement: true } : {}),
        migratedFrom: { table: 'dnd_content', id: sourceId, kind: str(row.kind), campaignId: row.campaign_id ?? null },
      },
    },
  };
}

/** A one-line summary, since `dnd_content` has no summary field and the Studio's kinds mostly require one. */
export function contentSummary(row: ContentRow): string {
  const bits = [
    str(row.kind).replace(/_/g, ' '),
    row.rarity ? String(row.rarity) : '',
    row.requires_attunement ? 'requires attunement' : '',
  ].filter(Boolean);
  return bits.length ? `Migrated ${bits.join(', ')}.` : 'Migrated from the campaign content library.';
}

/** Convert a whole table, keeping the failures. */
export function migrateContentRows(rows: readonly ContentRow[]): {
  pieces: MigratedPiece[];
  skipped: { sourceId: string; reason: string }[];
} {
  const pieces: MigratedPiece[] = [];
  const skipped: { sourceId: string; reason: string }[] = [];
  for (const row of rows ?? []) {
    const out = migrateContentRow(row);
    if (out.ok) pieces.push(out.piece);
    else skipped.push({ sourceId: out.sourceId, reason: out.reason });
  }
  return { pieces, skipped };
}

/**
 * Where this stands, honestly.
 *
 * The plan says "move the existing content in and retire the old route". The mapping and the script are
 * done; the retirement is not, and doing it now would break live play on a deployment where `dnd_homebrew`
 * does not yet exist.
 */
export const CONTENT_MIGRATION_STATUS = {
  mappingComplete: true,
  scriptReady: true,
  /** True once someone has actually run it against the live table. */
  migrationRun: false,
  /** True once `/api/dnd/content` stops accepting writes. */
  oldRouteRetired: false,
  note:
    'The mapping and `scripts/migrate-dnd-content.ts` are ready. The migration has NOT been run and '
    + '`/api/dnd/content` still serves live play — seed 455 (dnd_homebrew) is unapplied on the owner\'s '
    + 'deployment, so retiring the old route would break the feature this replaces. Cutover order: apply '
    + 'seed 455 → run the script → check the skipped list → retire the route.',
} as const;

/** Content kinds with no exact Studio equivalent, and what each became. Exported so the fact is reachable
 *  rather than living only in a comment. */
export const CONTENT_KIND_COMPROMISES: { from: ContentKind; to: HomebrewKind; why: string }[] = [
  { from: 'magic_item', to: 'item', why: 'The Studio has no magic-item kind; rarity and attunement survive in the payload.' },
  { from: 'feature', to: 'ability', why: 'A granted thing a character has. Kept distinct from `feat`, which is chosen.' },
  { from: 'attack', to: 'action', why: 'A thing you do on your turn; `action` is the Studio\'s name for that.' },
];

/** Every mapped target is a real Studio kind — the check that catches a typo in the map above. */
export function mappingIsValid(): boolean {
  const known = new Set<string>(HOMEBREW_KINDS);
  return Object.values(CONTENT_KIND_MAP).every((k) => known.has(k));
}
