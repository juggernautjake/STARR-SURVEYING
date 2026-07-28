// lib/dnd/homebrew/store.ts — the boundary between `dnd_homebrew` rows and the pure `HomebrewContent` model.
//
// Everything here is PURE. No Supabase client, no React: the route does the I/O and calls these to map and
// to decide. That split is why the visibility rules below can be unit-tested exhaustively instead of being
// asserted once against a live table — and visibility is exactly the kind of rule that is quietly wrong in
// one direction for months.
//
// THE ONE THING TO UNDERSTAND HERE: `visibility` and `status` are different questions and both must pass.
//   · `visibility` — who the CREATOR chose to show it to (private / unlisted / public).
//   · `status`     — whether the PIECE is ready (draft / submitted / approved / rejected).
// A piece is browsable only when it is public AND approved. But a piece is *readable by link* far more
// often, and the owner reads their own work in any combination of the two. Conflating them produces either
// a Studio where your own drafts are invisible to you, or a browse list full of half-finished work.
import { normalizeHomebrew, type HomebrewContent, type HomebrewStatus } from './model';

/** Who the creator chose to show a piece to. Orthogonal to `HomebrewStatus`. */
export type HomebrewVisibility = 'private' | 'unlisted' | 'public';

const VISIBILITIES: readonly HomebrewVisibility[] = ['private', 'unlisted', 'public'];

export function normalizeVisibility(v: unknown): HomebrewVisibility {
  return typeof v === 'string' && (VISIBILITIES as readonly string[]).includes(v)
    ? (v as HomebrewVisibility)
    // Unknown → the CLOSED default. A row whose visibility we cannot read must never be assumed public;
    // failing toward exposure is the one direction this must not fail in.
    : 'private';
}

/** The row shape as it comes back from `dnd_homebrew`. */
export interface HomebrewRow {
  id: string;
  owner_user_id: string;
  kind: string;
  system: string;
  name: string;
  summary?: string | null;
  description?: string | null;
  tags?: string[] | null;
  payload?: unknown;
  status?: string | null;
  visibility?: string | null;
  image_url?: string | null;
  assessment?: unknown;
  based_on?: string | null;
  partial_to_level?: number | null;
  origin_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** The model plus the fields that live only on the row (the Studio needs them; the pure model does not). */
export interface StoredHomebrew extends HomebrewContent {
  ownerUserId: string;
  visibility: HomebrewVisibility;
  imageUrl?: string;
  assessment?: unknown;
  basedOn?: string;
  partialToLevel?: number;
  originId?: string;
}

/**
 * A DB row → the model. Returns null when the row cannot be a valid piece, deferring to
 * `normalizeHomebrew` for that judgement so the Studio and the library agree on what a valid piece is.
 *
 * `creatorName` is passed in rather than joined here: the row stores `owner_user_id`, and attribution is
 * REQUIRED by the model (content is never anonymous). The route resolves names in one batched lookup — the
 * same pattern `edits/route.ts` uses — so this stays pure and a missing name is a caller bug, not a silent
 * "Unknown".
 */
export function rowToHomebrew(row: HomebrewRow, creatorName: string): StoredHomebrew | null {
  const base = normalizeHomebrew({
    id: row.id,
    kind: row.kind,
    name: row.name,
    system: row.system,
    creator: { id: row.owner_user_id, name: creatorName },
    status: row.status ?? 'draft',
    summary: row.summary ?? undefined,
    description: row.description ?? undefined,
    tags: row.tags ?? undefined,
    payload: row.payload ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  });
  if (!base) return null;
  return {
    ...base,
    ownerUserId: row.owner_user_id,
    visibility: normalizeVisibility(row.visibility),
    ...(row.image_url ? { imageUrl: row.image_url } : {}),
    ...(row.assessment != null ? { assessment: row.assessment } : {}),
    ...(row.based_on ? { basedOn: row.based_on } : {}),
    ...(typeof row.partial_to_level === 'number' ? { partialToLevel: row.partial_to_level } : {}),
    ...(row.origin_id ? { originId: row.origin_id } : {}),
  };
}

/** The model → the columns an INSERT/UPDATE writes. Only ever the writable set: `id`, `owner_user_id` and
 *  the timestamps are the server's to decide, so they are absent here by construction rather than by the
 *  caller remembering to strip them. */
export function homebrewToRow(c: Partial<StoredHomebrew>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (c.kind !== undefined) out.kind = c.kind;
  if (c.system !== undefined) out.system = c.system;
  if (c.name !== undefined) out.name = c.name.trim();
  if (c.summary !== undefined) out.summary = c.summary || null;
  if (c.description !== undefined) out.description = c.description || null;
  if (c.tags !== undefined) out.tags = c.tags ?? [];
  if (c.payload !== undefined) out.payload = c.payload ?? null;
  if (c.status !== undefined) out.status = c.status;
  if (c.visibility !== undefined) out.visibility = c.visibility;
  if (c.imageUrl !== undefined) out.image_url = c.imageUrl || null;
  if (c.assessment !== undefined) out.assessment = c.assessment ?? null;
  if (c.basedOn !== undefined) out.based_on = c.basedOn || null;
  if (c.partialToLevel !== undefined) out.partial_to_level = c.partialToLevel ?? null;
  if (c.originId !== undefined) out.origin_id = c.originId || null;
  return out;
}

// ── who may see and do what ─────────────────────────────────────────────────────────────────────────

/** The viewer, as far as these rules care. `null` = signed out. */
export interface HomebrewViewer {
  userId: string | null;
}

/** May this viewer OPEN this piece (by link or by id)? The creator always can, whatever its state. */
export function canReadHomebrew(piece: StoredHomebrew, viewer: HomebrewViewer): boolean {
  if (viewer.userId && viewer.userId === piece.ownerUserId) return true;
  // `unlisted` is the share-a-link case and is NOT weaker than public for reads — that is its whole point.
  // `status` deliberately does not gate reads: a creator sharing a draft for feedback is the ordinary use
  // of a link, and refusing it would make the link feature useless.
  return piece.visibility === 'public' || piece.visibility === 'unlisted';
}

/** May this viewer EDIT or DELETE it? Only its creator. A DM's authority is over what is legal in THEIR
 *  campaign (`policy.ts`), never over someone else's authored work. */
export function canWriteHomebrew(piece: StoredHomebrew, viewer: HomebrewViewer): boolean {
  return !!viewer.userId && viewer.userId === piece.ownerUserId;
}

/**
 * May this piece appear in a BROWSE list, the library, or the AI grounding?
 *
 * **Read the next paragraph before changing this — the obvious version is wrong.** The tempting rule is
 * `visibility === 'public' && status === 'approved'`. That is what this function said when first written,
 * and it is unshippable: with public self-serve (the recorded assumption), nothing ever *sets* `approved`,
 * so every piece would be permanently unbrowsable. Two plausible-looking rules multiplied into an
 * always-false one.
 *
 * The coherent model: **`visibility` is the creator's publish action** — choosing `public` IS publishing —
 * and `status` exists for a curator flow that does not exist yet. So browse requires public, and `status`
 * only ever *excludes*, on `rejected`. `statusForVisibility` below keeps `isHomebrewPublished` (which the
 * library projection and AI grounding read) agreeing with this without either side special-casing.
 *
 * Stricter than `canReadHomebrew` on purpose: an unlisted piece is reachable by anyone holding the link but
 * is never *listed*, which is exactly the difference a creator asked for by choosing it.
 */
export function isBrowsable(piece: StoredHomebrew): boolean {
  return piece.visibility === 'public' && piece.status !== 'rejected';
}

/**
 * The `status` a piece takes when its visibility changes, so the two axes cannot drift apart.
 *
 * `model.ts`'s `isHomebrewPublished` — which `browseHomebrew`, the library section and the AI grounding all
 * read — tests `status === 'approved'`. Going public therefore has to carry the status with it, or a
 * creator would publish something that appears in the Studio and nowhere else. Coming back from public
 * returns it to `draft`, so un-publishing genuinely removes it from the library rather than leaving an
 * approved-but-private row that a future surface might resurface.
 *
 * A `rejected` piece is left alone: that is a moderation verdict, and a creator flipping visibility must not
 * launder it away.
 */
export function statusForVisibility(next: HomebrewVisibility, current: HomebrewStatus): HomebrewStatus {
  if (current === 'rejected') return 'rejected';
  return next === 'public' ? 'approved' : 'draft';
}

/** Filter a batch for a browse surface, plus the viewer's own pieces when asked (the "Mine" tab shows
 *  drafts; the "Public" tab must not). */
export function visibleHomebrew(
  list: readonly StoredHomebrew[],
  viewer: HomebrewViewer,
  opts: { includeOwn?: boolean } = {},
): StoredHomebrew[] {
  return list.filter((p) => isBrowsable(p) || (!!opts.includeOwn && !!viewer.userId && p.ownerUserId === viewer.userId));
}

/**
 * The fields a creator may set directly on their own piece.
 *
 * `status` is NOT among them, and that is the whole point: it is derived from `visibility` via
 * `statusForVisibility`, so there is exactly one way a piece becomes published. Letting a route accept a
 * raw `status` would re-open the drift this module exists to close — and would let a creator clear a
 * `rejected` verdict by PATCHing over it.
 */
export const CREATOR_WRITABLE_FIELDS = [
  'kind', 'system', 'name', 'summary', 'description', 'tags',
  'payload', 'visibility', 'imageUrl', 'basedOn', 'partialToLevel',
] as const;

/** Strip a PATCH body down to what its author is allowed to change. Unknown and server-owned keys are
 *  dropped silently rather than rejected — a client sending `id` or `status` is not an attack, it is a
 *  client sending back what it was given. */
export function pickCreatorWritable(body: Record<string, unknown>): Partial<StoredHomebrew> {
  const out: Record<string, unknown> = {};
  for (const k of CREATOR_WRITABLE_FIELDS) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  if (out.visibility !== undefined) out.visibility = normalizeVisibility(out.visibility);
  return out as Partial<StoredHomebrew>;
}
