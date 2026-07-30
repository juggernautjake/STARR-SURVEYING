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
  tags: string[];
  environments: string[];
  source: string;
  licence: string;
  attribution: string;
  sourceUrl: string | null;
  variantEligible: boolean;
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
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    environments: Array.isArray(r.environments) ? (r.environments as string[]) : [],
    source: String(r.source ?? ''),
    licence: String(r.licence ?? ''),
    attribution: String(r.attribution ?? ''),
    sourceUrl: (r.source_url as string) ?? null,
    variantEligible: Boolean(r.variant_eligible),
  };
}

const COLUMNS =
  'id, slug, name, system, type, size, alignment, cr, cr_sort, statblock, description, image_url, tags, environments, source, licence, attribution, source_url, variant_eligible';

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

  let q = supabaseAdmin.from('dnd_creatures').select(COLUMNS, { count: 'exact' });

  if (filters.system) q = q.eq('system', filters.system);
  if (filters.type) q = q.eq('type', filters.type);
  if (filters.alignment) q = q.eq('alignment', filters.alignment);
  // `tags` is a text[]; `contains` is the array operator, not a substring match.
  if (filters.tag) q = q.contains('tags', [filters.tag]);
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
 */
async function loadFacets(system?: string | null): Promise<BestiaryPage['facets']> {
  // The system list must span the WHOLE table even when the view is scoped — otherwise choosing a system
  // would hide every other system's chip and strand the reader inside it.
  const all = supabaseAdmin.from('dnd_creatures').select('system').range(0, FACET_SCAN_CEILING);
  let scoped = supabaseAdmin.from('dnd_creatures').select('type, alignment, tags').range(0, FACET_SCAN_CEILING);
  if (system) scoped = scoped.eq('system', system);

  const [{ data: allData, error: allErr }, { data, error }] = await Promise.all([all, scoped]);
  if (allErr) throw new Error(`bestiary system facet failed: ${allErr.message}`);
  if (error) throw new Error(`bestiary facets failed: ${error.message}`);
  const rows = (data ?? []) as Array<{ type: string | null; alignment: string | null; tags: string[] | null }>;

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
  for (const r of (allData ?? []) as Array<{ system: string }>) if (r.system) systems.add(r.system);
  for (const r of rows) {
    if (r.type) types.add(r.type);
    if (r.alignment) alignments.add(r.alignment);
    for (const t of r.tags ?? []) tags.add(t);
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
