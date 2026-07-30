// lib/dnd/bestiary/query.ts — reading the creature catalogue.
//
// SLICE B1-1. The bestiary's model, import transform, taxonomy, variant rules and roll parsing were all built and
// tested weeks ago; `dnd_creatures` exists in the live database with **zero rows** and there is no page anywhere
// that lists a creature. So the plan deliberately puts THE PAGE FIRST: a surface with a handful of rows tells you
// whether the taxonomy, the filters and the stat block are right, whereas 900 rows behind no surface tell you
// nothing — which is exactly how these tables spent the last few weeks.
//
// "MAKE SURE WE CAN ACTUALLY FIND THEM" is the owner's requirement, so filtering is the point of this module
// rather than an afterthought: system, category tag, creature type, challenge band, alignment, and free text.
// Every filter is applied IN THE DATABASE, not by fetching everything and filtering in the page — the catalogue is
// meant to reach four figures, and a page that loads all of it to show twelve is a page that gets slower every
// time someone adds a creature.
import { supabaseAdmin } from '@/lib/supabase';
import { CREATURE_TAGS, type CreatureTag } from './taxonomy';
import { planeByKey } from './planes';
import type { Statblock } from '@/lib/dnd/homebrew/statblock';

/** One catalogued creature, as the pages consume it. */
export interface CatalogueCreature {
  id: string;
  slug: string;
  name: string;
  system: string;
  type: string | null;
  size: string | null;
  alignment: string | null;
  cr: string | null;
  crSort: number | null;
  statblock: Statblock;
  description: string | null;
  imageUrl: string | null;
  /**
   * The PICTURE's licence and credit, which are not the stat block's.
   *
   * Read and carried because CC-BY and CC-BY-SA make attribution a CONDITION of use, not a courtesy — and
   * for the first 477 creatures to get art these columns were written by the fetcher, enforced by seed
   * 467's CHECK constraint, and then selected by nothing and rendered nowhere. The obligation was met in
   * the database and unmet on the page, which is the only place it counts.
   */
  imageLicence: string | null;
  imageAttribution: string | null;
  imageSourceUrl: string | null;
  tags: string[];
  environments: string[];
  source: string;
  licence: string;
  attribution: string;
  sourceUrl: string | null;
  variantEligible: boolean;
  /**
   * N7 — what this ENTRY stands for, which is not always one row.
   *
   * The list reads `dnd_creatures_canonical` (seed 468): one entry per creature identity, chosen from
   * every row that spells its name the same way. A card showing the Badger stands for ten rows across
   * four systems, and these three fields are how it can SAY so rather than quietly implying it is the
   * only Badger in the catalogue.
   *
   * `systems` is every system a row exists in; `publishedSystems` is the subset a PUBLISHER wrote —
   * different lists, and the difference is exactly the "published versus derived" claim the lens makes on
   * the page. Both are empty on a single-row read (`loadCreature`), where the question does not arise.
   */
  rowCount: number;
  systems: string[];
  publishedSystems: string[];
}

/**
 * Challenge bands, because "all difficulty levels" is a browsing need rather than a number.
 *
 * The boundaries are the ones the game itself uses for encounter design — fractional CRs are the "anyone can fight
 * this" tier, 1–4 is early play, 5–10 mid, 11–16 high, 17+ is the end of the road. A raw CR dropdown with 34
 * entries is technically complete and useless to browse.
 */
export const CR_BANDS = [
  { id: 'trivial', label: 'CR 0–½', min: 0, max: 0.5 },
  { id: 'low', label: 'CR 1–4', min: 1, max: 4 },
  { id: 'mid', label: 'CR 5–10', min: 5, max: 10 },
  { id: 'high', label: 'CR 11–16', min: 11, max: 16 },
  { id: 'deadly', label: 'CR 17+', min: 17, max: 1000 },
] as const;
export type CrBandId = (typeof CR_BANDS)[number]['id'];

export function crBand(id: string | null | undefined) {
  return CR_BANDS.find((b) => b.id === id) ?? null;
}

export interface BestiaryFilters {
  system?: string | null;
  tag?: string | null;
  type?: string | null;
  band?: string | null;
  alignment?: string | null;
  /** A plane of origin — see `planes.ts`. Resolved to the creature TYPE it is the origin of, so this
   *  filters in the database like every other one rather than in the page. */
  plane?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
}

export interface BestiaryPage {
  creatures: CatalogueCreature[];
  /** Total matching the filters, so the page can say "48 of 312" rather than implying it showed everything. */
  total: number;
  /** Every value present in the catalogue for each facet, so the filter UI offers only what exists. */
  facets: {
    systems: string[];
    types: string[];
    alignments: string[];
    tags: CreatureTag[];
  };
}

/** Rows → the shape the pages want. Kept in one place so no page reads a snake_case column directly. */
function toCreature(r: Record<string, unknown>): CatalogueCreature {
  return {
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    system: String(r.system),
    type: (r.type as string) ?? null,
    size: (r.size as string) ?? null,
    alignment: (r.alignment as string) ?? null,
    cr: (r.cr as string) ?? null,
    crSort: r.cr_sort === null || r.cr_sort === undefined ? null : Number(r.cr_sort),
    statblock: (r.statblock ?? {}) as Statblock,
    description: (r.description as string) ?? null,
    imageUrl: (r.image_url as string) ?? null,
    imageLicence: (r.image_licence as string) ?? null,
    imageAttribution: (r.image_attribution as string) ?? null,
    imageSourceUrl: (r.image_source_url as string) ?? null,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    environments: Array.isArray(r.environments) ? (r.environments as string[]) : [],
    source: String(r.source ?? ''),
    licence: String(r.licence ?? ''),
    attribution: String(r.attribution ?? ''),
    sourceUrl: (r.source_url as string) ?? null,
    variantEligible: Boolean(r.variant_eligible),
    // Present only when the row came from the canonical view. A single-row read defaults to "stands for
    // itself, in its own system", which is true and keeps every caller from having to check.
    rowCount: r.row_count === undefined || r.row_count === null ? 1 : Number(r.row_count),
    systems: Array.isArray(r.systems) ? (r.systems as string[]) : [String(r.system)],
    publishedSystems: Array.isArray(r.published_systems) ? (r.published_systems as string[]) : [],
  };
}

const COLUMNS =
  'id, slug, name, system, type, size, alignment, cr, cr_sort, statblock, description, image_url, '
  + 'image_licence, image_attribution, image_source_url, tags, environments, source, licence, attribution, '
  + 'source_url, variant_eligible';

/**
 * ONE CREATURE, ONE ENTRY (N7). The list reads a view, not the table.
 *
 * `dnd_creatures` holds 5,025 rows for 3,659 creatures — five books' Badgers plus the 600 rows
 * `generate-transposed-bestiary.mjs` wrote, so browsing meant scrolling past the Badger ten times. Seed
 * 468 carries the full reasoning; the short version is that **the LIST is a list of creatures while the
 * ROWS are storage**, and no row is deleted to achieve it. The creature PAGE still reads the table
 * directly, because the system lens needs every row.
 *
 * The extra columns are what lets an entry admit it stands for more than itself.
 */
const CANONICAL_VIEW = 'dnd_creatures_canonical';
const CANONICAL_COLUMNS =
  `${COLUMNS}, identity, row_count, systems, published_systems, types, alignments, all_tags`;

/**
 * One page of the catalogue, plus the facet values that exist in it.
 *
 * ERRORS ARE READ, NOT DISCARDED. A `{ data, error }` whose error goes unchecked is this repo's most repeated
 * defect — it made a profile page report "0 pieces" for a table that did not exist, and it hid a CHECK-constraint
 * rejection that silently dropped every DM grant's audit row for months. An empty bestiary and a broken bestiary
 * must not look the same, so a failure throws rather than returning zero creatures.
 */
export async function loadBestiary(filters: BestiaryFilters = {}): Promise<BestiaryPage> {
  const limit = Math.min(200, Math.max(1, filters.limit ?? 60));
  const offset = Math.max(0, filters.offset ?? 0);

  let q = supabaseAdmin.from(CANONICAL_VIEW).select(CANONICAL_COLUMNS, { count: 'exact' });

  // EVERY FILTER IS NOW ARRAY CONTAINMENT, and that is a consequence of N7 rather than a style choice.
  // One row represents the creature, so `eq('system', …)` would ask "which system won the ranking?" —
  // and the Pathfinder Badger would disappear from the Pathfinder filter because its 5e row was picked.
  // The view unions each facet across all of a creature's rows so the question stays "is this creature in
  // Pathfinder at all?", which is what a reader means.
  if (filters.system) q = q.contains('systems', [filters.system]);
  if (filters.type) q = q.contains('types', [filters.type]);
  if (filters.alignment) q = q.contains('alignments', [filters.alignment]);
  if (filters.tag) q = q.contains('all_tags', [filters.tag]);
  // A plane resolves to the creature type it is the origin of, so this stays a database filter. An
  // unrecognised plane key is IGNORED rather than matching nothing — a bad URL should show the catalogue,
  // not an empty page that reads as "there are no fiends".
  const plane = planeByKey(filters.plane);
  if (plane) q = q.contains('all_tags', [plane.tag]);
  const band = crBand(filters.band);
  if (band) q = q.gte('cr_sort', band.min).lte('cr_sort', band.max);
  if (filters.q?.trim()) {
    const needle = filters.q.trim().replace(/[%,]/g, ' ');
    // Name OR description, so searching "stench" finds a creature by what it does and not only by what it is.
    q = q.or(`name.ilike.%${needle}%,description.ilike.%${needle}%`);
  }

  const { data, error, count } = await q
    // Weakest first within a search, which is the order a DM building an encounter reads in. Nulls last so
    // un-rated creatures do not head the list.
    .order('cr_sort', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`bestiary query failed: ${error.message}`);

  return {
    creatures: (data ?? []).map((r: unknown) => toCreature(r as Record<string, unknown>)),
    total: count ?? 0,
    facets: await loadFacets(filters.system),
  };
}

/** Facet reads scan rows rather than aggregate, so the ceiling is stated instead of discovered. See below. */
const FACET_SCAN_CEILING = 20000;

/**
 * The values that actually exist in the catalogue, for the filter UI.
 *
 * Offering a filter that matches nothing is worse than offering none: it reads as "the bestiary has no dragons"
 * when it means "no dragons have been imported yet". So the facets come from the data, and tags are intersected
 * with `CREATURE_TAGS` so a stale tag left in a row cannot invent a category the taxonomy no longer has.
 *
 * SCOPED TO THE CHOSEN SYSTEM, which the first version was not — and B4-2 is what exposed it. The four
 * catalogues have genuinely different vocabularies: Pathfinder names `astral`, `monitor`, `spirit` and
 * `fungus` creatures that no other system has. Reading facets from the whole table therefore offered a DM
 * browsing Intuitive Games five categories and a dozen types that return nothing at all — precisely the
 * "no dragons" versus "no dragons imported yet" confusion this function exists to prevent, arrived at from
 * the other direction.
 *
 * Only `system` narrows the facets, deliberately. Type, alignment, tag and CR band are co-filters WITHIN a
 * catalogue, and cross-filtering them would make the chips a DM is using disappear as they narrow — pick
 * "dragon" and every other type vanishes, so there is no way back without clearing. System is different in
 * kind: a creature belongs to exactly one, so its catalogue is a partition rather than a narrowing.
 *
 * READ FROM THE SAME VIEW THE FILTERS QUERY (N7). This scanned `dnd_creatures` until the canonical view
 * arrived, and leaving it there would have quietly desynchronised the chips from the results: the filter
 * asks `systems @> ['pathfinder2e']` — every system a creature has a row in — while a table scan scoped by
 * `system = 'pathfinder2e'` sees only the rows that ARE Pathfinder. A creature published in both would
 * then be matched by a chip that was never offered. Facets and filters have to read the same shape or the
 * UI is describing a catalogue the query does not have.
 */
async function loadFacets(system?: string | null): Promise<BestiaryPage['facets']> {
  // The system list must span the WHOLE catalogue even when the view is scoped — otherwise choosing a
  // system would hide every other system's chip and strand the reader inside it.
  const all = supabaseAdmin.from(CANONICAL_VIEW).select('systems').range(0, FACET_SCAN_CEILING);
  let scoped = supabaseAdmin.from(CANONICAL_VIEW).select('types, alignments, all_tags').range(0, FACET_SCAN_CEILING);
  if (system) scoped = scoped.contains('systems', [system]);

  const [{ data: allData, error: allErr }, { data, error }] = await Promise.all([all, scoped]);
  if (allErr) throw new Error(`bestiary system facet failed: ${allErr.message}`);
  if (error) throw new Error(`bestiary facets failed: ${error.message}`);
  const rows = (data ?? []) as Array<{ types: string[] | null; alignments: string[] | null; all_tags: string[] | null }>;

  // G6, "nothing silently truncates". A facet read that hits its own ceiling would quietly stop offering
  // the categories in the rows it never saw, and the page would look complete. The catalogue is ~1k rows
  // today, so this is a tripwire rather than a limit — but an unstated row cap is how a filter list starts
  // lying after an import.
  if (rows.length > FACET_SCAN_CEILING || (allData ?? []).length > FACET_SCAN_CEILING) {
    throw new Error('bestiary facets: catalogue exceeds the facet scan ceiling; aggregate them in the database instead');
  }

  const systems = new Set<string>();
  const types = new Set<string>();
  const alignments = new Set<string>();
  const tags = new Set<string>();
  for (const r of (allData ?? []) as Array<{ systems: string[] | null }>) {
    for (const s of r.systems ?? []) if (s) systems.add(s);
  }
  for (const r of rows) {
    for (const t of r.types ?? []) if (t) types.add(t);
    for (const a of r.alignments ?? []) if (a) alignments.add(a);
    for (const t of r.all_tags ?? []) tags.add(t);
  }
  return {
    systems: [...systems].sort(),
    types: [...types].sort(),
    alignments: [...alignments].sort(),
    // In taxonomy order rather than alphabetical — the taxonomy's order is deliberate (bosses first).
    tags: CREATURE_TAGS.filter((t) => tags.has(t)),
  };
}

/** One creature by slug, with its saved variants. `null` when there is no such creature. */
export async function loadCreature(slug: string): Promise<{
  creature: CatalogueCreature;
  variants: Array<{ id: string; tier: string; name: string; cr: string | null; statblock: Statblock; derivation: string | null }>;
} | null> {
  const { data, error } = await supabaseAdmin.from('dnd_creatures').select(COLUMNS).eq('slug', slug).maybeSingle();
  if (error) throw new Error(`creature lookup failed: ${error.message}`);
  if (!data) return null;
  const creature = toCreature(data as Record<string, unknown>);

  const { data: vs, error: vErr } = await supabaseAdmin
    .from('dnd_creature_variants')
    .select('id, tier, name, cr, statblock, derivation')
    .eq('creature_id', creature.id)
    // Weak before elite: the tier is the reading order, and alphabetical would put elite first by accident.
    .order('cr_sort', { ascending: true, nullsFirst: true });
  if (vErr) throw new Error(`creature variants failed: ${vErr.message}`);

  return {
    creature,
    variants: (vs ?? []).map((v: unknown) => {
      const r = v as Record<string, unknown>;
      return {
        id: String(r.id),
        tier: String(r.tier),
        name: String(r.name),
        cr: (r.cr as string) ?? null,
        statblock: (r.statblock ?? {}) as Statblock,
        derivation: (r.derivation as string) ?? null,
      };
    }),
  };
}

/** Every slug in the catalogue, for static generation of the detail pages. */
export async function allCreatureSlugs(): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from('dnd_creatures').select('slug');
  if (error) throw new Error(`creature slugs failed: ${error.message}`);
  return (data ?? []).map((r: unknown) => String((r as { slug: string }).slug));
}

/**
 * The same creature as OTHER systems already publish it (N7).
 *
 * The owner's rule — *"the user will just see one version of the creature… it will default to the 2024
 * edition, but the user can switch it to any of the other ones"* — needs the lens to know which of a
 * creature's four systems are real rows and which have to be derived. A designer's numbers always beat a
 * measurement of ours, so this is what the lens consults first.
 *
 * ── IDENTITY IS THE NAME, AND ONLY DELIBERATELY ─────────────────────────────────────────────────────
 *
 * The plan calls identity "the hard part, and it is not the name" — which is true of GROUPING the whole
 * catalogue, where "Skunk" in Bestiary 3 and "Skunk" in Monstrous Menagerie may be different creatures. It
 * is a much smaller question here: this is one creature's page asking "is there a Pathfinder row for THIS
 * thing?", and being wrong shows a reader a stat block plainly labelled as another book's published one,
 * beside the name it is filed under. That is a visible, correctable mistake rather than a silent one.
 *
 * So: an EXACT, case-insensitive name match, never a fuzzy one. "Badger" must never pick up "Giant
 * Badger", and a prefix or similarity match is precisely how it would.
 *
 * One row per system, and where a system has several (five books' Badgers) the FIRST by slug wins, so the
 * choice is stable across page loads rather than whatever Postgres returned that time.
 *
 * ── ROWS WE GENERATED ARE NOT SIBLINGS, AND THIS WAS A LIVE BUG ─────────────────────────────────────
 *
 * Found by opening the Badger rather than by any test: the page announced **"D&D 5e (2024) ◆ Published"**
 * for a creature no publisher has ever printed in 2024. `generate-transposed-bestiary.mjs` wrote 600
 * `Transposed from …` rows, three of them 2024 Badgers, and this query happily returned one as a sibling —
 * so the lens's top rank, the one reserved for *a designer wrote these numbers*, was being handed our own
 * conversion.
 *
 * It was invisible in every way that matters: the numbers looked right (transposition CARRIES the source's
 * AC and HP, so the block was identical to the 2014 one), the badge looked authoritative, and 8,427 tests
 * passed. The lens's own suite asserted the trustworthiness ORDER correctly and could not catch this,
 * because the defect was never in the ordering — it was in what got called published on the way in.
 *
 * So: a sibling must be a PUBLISHER's row. Everything else is what `deriveNativeStatblock` is for, and it
 * does the job better than the stored transposition anyway (the target system's own measured table rather
 * than carried figures).
 */
export async function loadSiblings(
  name: string,
  ownSystem: string,
): Promise<Partial<Record<string, { name: string; system: string; type: string | null; size: string | null; cr: string | null; statblock: Statblock }>>> {
  const { data, error } = await supabaseAdmin
    .from('dnd_creatures')
    .select('slug, name, system, type, size, cr, source, statblock')
    .ilike('name', name)
    .neq('system', ownSystem)
    // Never a row we generated — see above. `source` is NOT NULL, so this cannot drop a real row for
    // being null.
    .not('source', 'like', 'Transposed from %')
    .order('slug', { ascending: true });
  // A failed sibling lookup must not take the page down: the lens simply derives instead, which is what it
  // would do for a creature with no siblings anyway.
  if (error) return {};

  const out: Record<string, { name: string; system: string; type: string | null; size: string | null; cr: string | null; statblock: Statblock }> = {};
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    // `ilike` without wildcards is an exact case-insensitive match, but assert it rather than trust it —
    // a later edit adding `%` would silently turn this into the fuzzy match the doc above forbids.
    if (String(r.name).toLowerCase() !== name.toLowerCase()) continue;
    // Belt and braces on the filter above, for the same reason the name is re-checked: this one decides
    // whether a block is labelled as a designer's work, and a `.not()` clause is one careless edit from
    // being dropped.
    if (String(r.source ?? '').startsWith('Transposed from ')) continue;
    const sys = String(r.system);
    if (out[sys]) continue; // first by slug wins
    out[sys] = {
      name: String(r.name),
      system: sys,
      type: (r.type as string) ?? null,
      size: (r.size as string) ?? null,
      cr: (r.cr as string) ?? null,
      statblock: (r.statblock ?? {}) as Statblock,
    };
  }
  return out;
}
