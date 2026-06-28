// lib/files/tree.ts
//
// F2 of FILE_EXPLORER_2026-06-25 — pure tree/name helpers for the file explorer.
// Kept pure so vitest can lock them; the API + DB I/O live in server.ts/routes.

export interface BreadcrumbItem {
  id: string;
  name: string;
}

/** Pure — clean a user-supplied node name: path separators become dashes,
 *  whitespace runs (incl. tabs/newlines) collapse to a single space, trimmed
 *  and length-capped. Returns '' when nothing usable remains. */
export function sanitizeName(raw: string | null | undefined): string {
  return String(raw ?? '')
    .replace(/[/\\]/g, '-') // path separators -> dash
    .replace(/\s+/g, ' ') // collapse whitespace (neutralizes tabs/newlines)
    .trim()
    .slice(0, 200);
}

/** Pure — breadcrumb items from a root-first node chain. */
export function buildBreadcrumb(chain: ReadonlyArray<{ id: string; name: string }>): BreadcrumbItem[] {
  return chain.map((n) => ({ id: n.id, name: n.name }));
}

/** Pure — given a desired name and the existing sibling names (case-insensitive),
 *  return a non-colliding name, suffixing " (copy)", " (copy 2)", … and keeping
 *  any file extension at the end. */
export function nextAvailableName(base: string, siblingNames: ReadonlyArray<string>): string {
  const taken = new Set(siblingNames.map((s) => s.trim().toLowerCase()));
  if (!taken.has(base.trim().toLowerCase())) return base;

  const dot = base.lastIndexOf('.');
  const hasExt = dot > 0; // not a dotfile
  const stem = hasExt ? base.slice(0, dot) : base;
  const ext = hasExt ? base.slice(dot) : '';

  let candidate = `${stem} (copy)${ext}`;
  if (!taken.has(candidate.trim().toLowerCase())) return candidate;
  for (let i = 2; i < 1000; i += 1) {
    candidate = `${stem} (copy ${i})${ext}`;
    if (!taken.has(candidate.trim().toLowerCase())) return candidate;
  }
  return `${stem} (copy ${Date.now()})${ext}`;
}

/** Pure — would moving `nodeId` into a destination whose ancestor-chain ids are
 *  `destChainIds` (root..destination, inclusive) create a cycle? True when the
 *  destination is the node itself or one of its descendants. */
export function wouldCreateCycle(nodeId: string, destChainIds: ReadonlyArray<string>): boolean {
  return destChainIds.includes(nodeId);
}
