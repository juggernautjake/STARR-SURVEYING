// lib/dnd/dm-grant.ts — DM-granted custom content (IG builder Slice 6).
//
// A DM may hand a specific character a custom element (feat / ability / item / spell / weapon / …) with
// DM-authored mechanics. Anything so granted is flagged `dm-granted` (see provenance.ts) and is ALWAYS
// allowed — even in a vanilla-only campaign — because the DM authored it on purpose. This module is the
// pure core: it validates + normalizes a grant and adds/removes it from a character's `dm_granted` list.
// No services — the route (auth + DB) and UI build on top.
import type { ElementKind } from './provenance';

/** The element kinds a DM can grant (a practical subset of ElementKind the grant UI offers). */
export const GRANTABLE_KINDS: ElementKind[] = ['feat', 'ability', 'action', 'power', 'spell', 'weapon', 'other'];

export interface DmGrant {
  /** Stable id so a grant can be revoked precisely. */
  id: string;
  kind: ElementKind;
  name: string;
  /** DM-authored mechanics describing what the granted element does. */
  mechanics: string;
  /** Who granted it — a DM display name (or 'DM'). */
  grantedBy: string;
  /** ISO timestamp the grant was created (caller-supplied so this stays pure). */
  grantedAt?: string | null;
}

export interface GrantInput {
  kind?: string;
  name?: string;
  mechanics?: string;
}

const clampKind = (k: unknown): ElementKind => {
  const s = String(k ?? '').trim().toLowerCase() as ElementKind;
  return (GRANTABLE_KINDS as string[]).includes(s) ? s : 'other';
};

export interface GrantValidation {
  ok: boolean;
  error?: string;
  grant?: Omit<DmGrant, 'id' | 'grantedBy' | 'grantedAt'>;
}

/** Validate + normalize a grant form. A grant needs a name and mechanics (so the player knows what it does). */
export function validateGrant(input: GrantInput): GrantValidation {
  const name = String(input?.name ?? '').trim();
  const mechanics = String(input?.mechanics ?? '').trim();
  if (!name) return { ok: false, error: 'Give the granted element a name.' };
  if (name.length > 120) return { ok: false, error: 'Name is too long (120 characters max).' };
  if (!mechanics) return { ok: false, error: 'Describe what the granted element does (its mechanics).' };
  if (mechanics.length > 2000) return { ok: false, error: 'Mechanics text is too long (2000 characters max).' };
  return { ok: true, grant: { kind: clampKind(input?.kind), name, mechanics } };
}

/** Read a character's `dm_granted` column into a typed list, tolerating an un-migrated / malformed value. */
export function readGrants(raw: unknown): DmGrant[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
    .map((g) => ({
      id: String(g.id ?? ''),
      kind: clampKind(g.kind),
      name: String(g.name ?? '').trim(),
      mechanics: String(g.mechanics ?? '').trim(),
      grantedBy: String(g.grantedBy ?? 'DM').trim() || 'DM',
      grantedAt: g.grantedAt ? String(g.grantedAt) : null,
    }))
    .filter((g) => g.id && g.name);
}

/** Add a validated grant to the list (returns a new array). `id`/`grantedAt` are caller-supplied for purity. */
export function addGrant(
  existing: DmGrant[],
  grant: NonNullable<GrantValidation['grant']>,
  meta: { id: string; grantedBy: string; grantedAt?: string | null },
): DmGrant[] {
  return [
    ...existing,
    { id: meta.id, kind: grant.kind, name: grant.name, mechanics: grant.mechanics, grantedBy: meta.grantedBy || 'DM', grantedAt: meta.grantedAt ?? null },
  ];
}

/** Remove a grant by id (returns a new array). */
export function removeGrant(existing: DmGrant[], id: string): DmGrant[] {
  return existing.filter((g) => g.id !== id);
}
