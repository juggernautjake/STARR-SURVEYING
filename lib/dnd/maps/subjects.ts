// lib/dnd/maps/subjects.ts — what the thing a token stands for LOOKS LIKE (M5-1b).
//
// Owner, 2026-07-30: *"We should be able to place the actual round token images from the character sheets
// and they should be adjusted in size to match the grid size."*
//
// ── THE PORTRAIT IS RESOLVED, NEVER STORED ───────────────────────────────────────────────────────────
//
// `dnd_map_objects` has an `asset_url`, and copying the character's token art into it at placement time
// would have been one line in `PlaceToken`. It is the wrong line, for the same reason `tokens.ts` refuses
// to store HP: **a copied number is a number that goes stale.** A player who changes their portrait would
// keep the old face on the board for as long as that token existed, with nothing on either surface saying
// the two disagree — and the DM's only fix would be to delete the token and place it again.
//
// So a token stores WHO it is (M5-1's rule, unchanged) and this module answers WHAT THAT LOOKS LIKE, at
// read time, every time. `asset_url` stays for objects that genuinely ARE an image — a rug, a crate, a
// prop the DM uploaded — which is a picture with no subject behind it to ask.
//
// ── AND THE SIZE COMES FROM THE SAME PLACE ───────────────────────────────────────────────────────────
//
// `PlaceToken` used to write `size: 'medium'` for everything, so an Ogre stood on one square while its own
// stat block said Large. A creature knows how big it is; the map asks. The DM's explicit override still
// wins where they have set one — footprint is the map's business (M5-1) — but "not stated" now means "ask"
// rather than "medium".
//
// ── G3 IS NOT AT STAKE HERE, AND THAT IS WORTH SAYING OUT LOUD ───────────────────────────────────────
//
// This is only ever called with subjects taken from tokens the viewer's own `loadMapObjects` query already
// returned. A player's query cannot return a `dm`-visibility token, so a player can never reach this with a
// hidden creature's id: the filtering has already happened upstream, in the query, which is where G3 says
// it belongs. Names and portraits are exactly what a token is FOR — a marker nobody can identify is a
// marker a DM has to narrate.
import { supabaseAdmin } from '@/lib/supabase';
import { speciesView } from '@/lib/dnd/species/view';
import { parseTokenSize, subjectKey, type TokenSize, type TokenSubject } from './tokens';

export interface TokenSubjectView {
  /** The subject's own name — what the token is called when the DM has not nicknamed it. */
  name: string;
  /** Round token art. `token_url` before `art_url`: one is cropped to a circle for exactly this use. */
  portrait: string | null;
  /** The subject's OWN size. Null when nothing states one — the renderer then falls back to medium. */
  size: TokenSize | null;
  /**
   * M7-2 — what this creature can see, in the sheet's own words ("Darkvision 60 ft").
   *
   * Read here rather than parsed here, and read from `speciesView` for the same reason `size` is: a PF2
   * ancestry's senses are PF2's business. `fog.visionFt` turns the strings into a radius, so the map
   * holds no opinion about how far a dwarf sees — it asks, exactly as it asks for speed and for a
   * spell's area.
   */
  senses: string[];
  /**
   * M5-4 — the conditions the SHEET is tracking right now, read at the same moment as the portrait and
   * for the same reason: a condition copied onto the token is a condition that stays after it ends. The
   * DM would clear "poisoned" on the sheet and the board would keep showing it, with nothing saying the
   * two disagree — which on a battle map is worse than not showing it at all.
   *
   * Empty for a creature: `dnd_creatures` has no per-instance state, and a bestiary row is a template
   * rather than a thing standing on the board. Inventing one would attach a status to every copy of that
   * monster at once.
   */
  conditions: string[];
  /**
   * 0–6, and NOT folded into `conditions`. Exhaustion is a LEVEL — "exhaustion 3" and "exhaustion 1" are
   * different situations, and a badge that said only "exhausted" would hide the one number that decides
   * whether the character can still act.
   */
  exhaustion: number;
}

/** `character:<id>` → view. Keyed by `subjectKey` so a caller matches without re-deriving the shape. */
export type SubjectViews = Map<string, TokenSubjectView>;

/**
 * Look up every subject in one round trip per table, rather than per token.
 *
 * A battle map with twenty goblins is twenty tokens pointing at ONE creature row. Querying per token
 * would be twenty identical reads; de-duplicating first makes it one, and it is the `in(...)` list that
 * does it rather than a cache with a lifetime to reason about.
 */
export async function loadTokenSubjects(subjects: readonly TokenSubject[]): Promise<SubjectViews> {
  const views: SubjectViews = new Map();
  if (!subjects.length) return views;

  const characterIds = new Set<string>();
  const creatureIds = new Set<string>();
  const variantIds = new Set<string>();
  for (const s of subjects) {
    if ('characterId' in s) characterIds.add(s.characterId);
    else if ('creatureVariantId' in s) variantIds.add(s.creatureVariantId);
    else creatureIds.add(s.creatureId);
  }

  await Promise.all([
    loadCharacters(characterIds, views),
    loadCreatures(creatureIds, views),
    loadVariants(variantIds, views),
  ]);

  return views;
}

async function loadCharacters(ids: Set<string>, views: SubjectViews): Promise<void> {
  if (!ids.size) return;
  // `data->meta` and `data->combat` rather than the whole `data` blob: that column is the ENTIRE sheet
  // state, and pulling twenty of them to read one species name would move megabytes to render a row of
  // circles. `combat` is added for M5-4's conditions — it is the small block with HP and status in it,
  // not the inventory, spell list and feature text that make the column large.
  const { data, error } = await supabaseAdmin
    .from('dnd_characters')
    .select('id, name, token_url, art_url, system, data->meta, data->combat')
    .in('id', [...ids]);
  // Errors are read, never discarded — the repeated defect this codebase keeps rediscovering. A token
  // with no portrait and a token whose lookup FAILED must not look the same to the page.
  if (error) throw new Error(`token subjects (characters) query failed: ${error.message}`);

  for (const row of (data ?? []) as CharacterRow[]) {
    const species = typeof row.meta?.species === 'string' ? row.meta.species : null;
    views.set(subjectKey({ characterId: row.id }), {
      name: row.name,
      portrait: row.token_url ?? row.art_url ?? null,
      // Through `speciesView`, which is the system-keyed dispatcher for lineage data — so a PF2 ancestry's
      // size is read by PF2's rules and a 2014 race's by 2014's, rather than by a table living here.
      size: parseTokenSize(speciesView(row.system, species)?.size),
      senses: speciesView(row.system, species)?.senses ?? [],
      // Filtered to non-empty strings: a sheet with a stray '' in the array would otherwise render a
      // badge with no word in it, which reads as a rendering bug rather than as empty data.
      conditions: Array.isArray(row.combat?.conditions)
        ? (row.combat!.conditions as unknown[]).filter((c): c is string => typeof c === 'string' && c.trim() !== '')
        : [],
      exhaustion: typeof row.combat?.exhaustion === 'number' && row.combat.exhaustion > 0
        ? Math.min(6, Math.round(row.combat.exhaustion))
        : 0,
    });
  }
}

interface CharacterRow {
  id: string;
  name: string;
  token_url: string | null;
  art_url: string | null;
  system: string | null;
  /** `data->meta`, so the sheet's identity block without the sheet. */
  meta: { species?: unknown } | null;
  /** `data->combat` — the status block. M5-4 reads conditions and exhaustion from it. */
  combat: { conditions?: unknown; exhaustion?: unknown } | null;
}

async function loadCreatures(ids: Set<string>, views: SubjectViews): Promise<void> {
  if (!ids.size) return;
  const { data, error } = await supabaseAdmin
    .from('dnd_creatures')
    .select('id, name, image_url, size')
    .in('id', [...ids]);
  if (error) throw new Error(`token subjects (creatures) query failed: ${error.message}`);

  for (const row of (data ?? []) as CreatureRow[]) {
    views.set(subjectKey({ creatureId: row.id }), {
      name: row.name,
      portrait: row.image_url ?? null,
      size: parseTokenSize(row.size),
      // A bestiary row states senses in its own shape and nothing parses them yet. Empty is the honest
      // answer: a creature then gets the default sight radius rather than an invented darkvision.
      senses: [],
      // A bestiary row is a TEMPLATE, not a thing standing on the board — there is nowhere per-instance
      // for a condition to live, and inventing one would poison every copy of that monster at once.
      conditions: [],
      exhaustion: 0,
    });
  }
}

interface CreatureRow {
  id: string;
  name: string;
  image_url: string | null;
  size: string | null;
}

/**
 * A variant carries its own NAME and stat block, and nothing else — `dnd_creature_variants` has no
 * `image_url` and no `size` column.
 *
 * That is the schema stating the right thing rather than a gap to fill: "Elite Ogre" is a different stat
 * block for the same ogre, so it looks like an ogre and takes an ogre's space. Both come from the parent
 * through the join, which also means new art on the creature reaches every variant of it at once.
 */
async function loadVariants(ids: Set<string>, views: SubjectViews): Promise<void> {
  if (!ids.size) return;
  const { data, error } = await supabaseAdmin
    .from('dnd_creature_variants')
    .select('id, name, creature:dnd_creatures(name, image_url, size)')
    .in('id', [...ids]);
  if (error) throw new Error(`token subjects (variants) query failed: ${error.message}`);

  for (const row of (data ?? []) as unknown as VariantRow[]) {
    // PostgREST types an embedded to-one as an array in some versions — normalised once here rather than
    // at each of the three reads below.
    const parent = Array.isArray(row.creature) ? row.creature[0] : row.creature;
    views.set(subjectKey({ creatureVariantId: row.id }), {
      // The variant's own name wins: a DM who placed "Elite Ogre" should read "Elite Ogre" on the board.
      name: row.name || parent?.name || 'Creature',
      portrait: parent?.image_url ?? null,
      size: parseTokenSize(parent?.size),
      senses: [],
      // Same as the base creature: a variant is still a template. See above.
      conditions: [],
      exhaustion: 0,
    });
  }
}

interface ParentCreature { name: string; image_url: string | null; size: string | null }
interface VariantRow {
  id: string;
  name: string | null;
  creature: ParentCreature | ParentCreature[] | null;
}
