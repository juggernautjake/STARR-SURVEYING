// lib/files/sort.ts — the order files and folders are listed in (owner, 2026-11-11).
//
// "files and folders are able to be sorted alphabetically or by time uploaded. The automatic
// sorting should be alphabetically." … "It should be alphabetical and numerical sorting."
//
// Folders always come before files, the way every file explorer does it. Inside each group:
//   - 'name'     A–Z, with numbers read as numbers: "Lot 2" before "Lot 10", "2024-01" before
//                "2024-12". Upper and lower case sort together. This is the default.
//   - 'uploaded' newest upload first. Where a row has no upload time its last change stands in;
//                a row with neither goes to the bottom. Ties fall back to the name order.
//
// Pure, so both explorers sort the same way and the tests can pin it.

export type FileSort = 'name' | 'uploaded';

export const DEFAULT_FILE_SORT: FileSort = 'name';

interface Sortable {
  node_type: 'folder' | 'file';
  name: string;
  uploaded_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function uploadedTime(n: Sortable): number {
  const raw = n.uploaded_at ?? n.created_at ?? n.updated_at;
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(t) ? t : -Infinity;
}

/** A sorted copy of `nodes`; the input is left alone. */
export function sortFileNodes<T extends Sortable>(nodes: readonly T[], sort: FileSort = DEFAULT_FILE_SORT): T[] {
  return [...nodes].sort((a, b) => {
    if (a.node_type !== b.node_type) return a.node_type === 'folder' ? -1 : 1;
    if (sort === 'uploaded') {
      const ta = uploadedTime(a);
      const tb = uploadedTime(b);
      if (ta !== tb) return tb > ta ? 1 : -1;
    }
    return collator.compare(a.name, b.name);
  });
}
