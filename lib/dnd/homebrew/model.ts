// lib/dnd/homebrew/model.ts — the pure model for SHAREABLE homebrew content (Area H1).
//
// This is the "create-and-share" catalog: a creator authors a piece of content (a weapon, spell, feat,
// class, …), attributes it to themselves, scopes it to a game system, and it flows into that system's
// library + AI grounding + (if the DM allows it) onto characters. It is DISTINCT from the character-embedded
// homebrew store (`lib/dnd/classes/homebrew-store.ts`), which keeps a homebrew class ON one character.
//
// Everything here is PURE (no DB / React) so it can be unit-tested and reused by the browse UI, the creation
// forms, the AI grounding projection, and the DM allowlist gate alike. The mechanical PAYLOAD rides along as
// the existing engine shapes (WeaponStats / Spell / Effect[] / …) — those are validated by their own builders
// at authoring time; this model owns identity, attribution, scope, visibility/approval, search, and gating.
import { normalizeSystem } from '@/lib/dnd/systems';

/** Every content kind a creator can author + share. */
export const HOMEBREW_KINDS = [
  'weapon', 'item', 'potion', 'armor', 'spell', 'stance', 'effect',
  'ability', 'skill', 'feat', 'race', 'class', 'subclass',
] as const;
export type HomebrewKind = (typeof HOMEBREW_KINDS)[number];

/** The moderation/visibility lifecycle. `draft` = the creator's private WIP; `submitted` = awaiting a
 *  DM/curator; `approved` = usable + shown in the library; `rejected` = hidden with (optionally) a reason. */
export type HomebrewStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface HomebrewCreator {
  /** Stable user id when known (attribution survives a display-name change). */
  id?: string;
  /** The credited display name — always present so content is never anonymous. */
  name: string;
}

export interface HomebrewContent {
  id: string;
  kind: HomebrewKind;
  name: string;
  /** The system this content belongs to (a normalized system key), or 'any' for system-agnostic pieces. */
  system: string;
  creator: HomebrewCreator;
  status: HomebrewStatus;
  /** A one-line summary for the library card + search. */
  summary?: string;
  /** The full rules text. */
  description?: string;
  tags?: string[];
  /** The mechanical shape for this kind (WeaponStats, Spell, Effect[], attack, …) — opaque here; validated by
   *  the kind's own builder when authored. Kept so a catalog entry round-trips to a REAL effect on a sheet. */
  payload?: unknown;
  createdAt?: string;
  updatedAt?: string;
}

const KIND_LABELS: Record<HomebrewKind, string> = {
  weapon: 'Weapon', item: 'Item', potion: 'Potion', armor: 'Armor', spell: 'Spell', stance: 'Stance',
  effect: 'Effect', ability: 'Ability', skill: 'Skill', feat: 'Feat', race: 'Race', class: 'Class',
  subclass: 'Subclass',
};

/** A human label for a kind ('subclass' → 'Subclass'). */
export function homebrewKindLabel(kind: HomebrewKind): string {
  return KIND_LABELS[kind] ?? kind;
}

export function isHomebrewKind(v: unknown): v is HomebrewKind {
  return typeof v === 'string' && (HOMEBREW_KINDS as readonly string[]).includes(v);
}

const STATUSES: readonly HomebrewStatus[] = ['draft', 'submitted', 'approved', 'rejected'];
function normalizeStatus(v: unknown): HomebrewStatus {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v) ? (v as HomebrewStatus) : 'draft';
}

/** Defensively parse a raw (DB/JSON) row into a HomebrewContent. Returns null when the row can't be a valid
 *  entry (no id, unknown kind, no name, or no creator) — a bad row is dropped, never coerced into a fake. */
export function normalizeHomebrew(raw: unknown): HomebrewContent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : '';
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!id || !name || !isHomebrewKind(r.kind)) return null;
  const creatorRaw = (r.creator && typeof r.creator === 'object') ? (r.creator as Record<string, unknown>) : null;
  const creatorName = creatorRaw && typeof creatorRaw.name === 'string' ? creatorRaw.name.trim() : '';
  if (!creatorName) return null; // attribution is required — content is never anonymous
  const systemRaw = typeof r.system === 'string' ? r.system : '';
  return {
    id,
    kind: r.kind,
    name,
    system: systemRaw === 'any' ? 'any' : normalizeSystem(systemRaw),
    creator: { name: creatorName, ...(typeof creatorRaw!.id === 'string' ? { id: creatorRaw!.id } : {}) },
    status: normalizeStatus(r.status),
    ...(typeof r.summary === 'string' ? { summary: r.summary.trim() } : {}),
    ...(typeof r.description === 'string' ? { description: r.description } : {}),
    ...(Array.isArray(r.tags) ? { tags: r.tags.filter((t): t is string => typeof t === 'string') } : {}),
    ...(r.payload !== undefined ? { payload: r.payload } : {}),
    ...(typeof r.createdAt === 'string' ? { createdAt: r.createdAt } : {}),
    ...(typeof r.updatedAt === 'string' ? { updatedAt: r.updatedAt } : {}),
  };
}

/** Author-time validation — the list of problems that must be fixed before content can be shared. Empty = ok. */
export function validateHomebrew(c: Partial<HomebrewContent>): string[] {
  const errs: string[] = [];
  if (!c.name || !c.name.trim()) errs.push('A name is required.');
  if (!isHomebrewKind(c.kind)) errs.push('A valid content kind is required.');
  if (!c.creator || !c.creator.name?.trim()) errs.push('Attribution (a creator name) is required.');
  if (!c.system) errs.push('A system scope is required (or "any").');
  return errs;
}

/** True when a piece is published — approved AND not a private draft/rejected — so a browse/grounding surface
 *  can show only real, curated content. */
export function isHomebrewPublished(c: HomebrewContent): boolean {
  return c.status === 'approved';
}

/** Whether a piece applies to a given system: an exact (normalized) match, or a system-agnostic 'any' piece. */
export function homebrewInSystem(c: HomebrewContent, system: string): boolean {
  return c.system === 'any' || c.system === normalizeSystem(system);
}

/** Case-insensitive search over the fields a browser would scan: name, summary, description, kind label,
 *  tags and creator. Empty query matches everything. */
export function homebrewMatchesSearch(c: HomebrewContent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    c.name, c.summary, c.description, homebrewKindLabel(c.kind), c.creator.name, ...(c.tags ?? []),
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

/**
 * The DM allowlist gate (Area H4 core): may THIS character use this homebrew piece? A piece is usable only
 * when it's published AND permitted for the campaign:
 *  · a DM may always use/preview their own campaign's content;
 *  · `allowAll` opens the whole approved catalog for the campaign;
 *  · otherwise the piece's id must be on the campaign's `allowedIds` allowlist.
 * Pure — the route/UI supplies the campaign's allow policy; this decides.
 */
export function canUseHomebrew(
  c: HomebrewContent,
  opts: { isDM?: boolean; allowAll?: boolean; allowedIds?: readonly string[] } = {},
): boolean {
  if (!isHomebrewPublished(c) && !opts.isDM) return false; // players only ever see approved content
  if (opts.isDM) return true;
  if (opts.allowAll) return true;
  return !!opts.allowedIds && opts.allowedIds.includes(c.id);
}

/** Browse helper: the published pieces for a system, matching a query, newest first when timestamps exist. */
export function browseHomebrew(
  list: readonly HomebrewContent[],
  opts: { system?: string; query?: string; includeUnpublished?: boolean } = {},
): HomebrewContent[] {
  return list
    .filter((c) => (opts.includeUnpublished ? true : isHomebrewPublished(c)))
    .filter((c) => (opts.system ? homebrewInSystem(c, opts.system) : true))
    .filter((c) => homebrewMatchesSearch(c, opts.query ?? ''))
    .sort((a, b) => (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? ''));
}
