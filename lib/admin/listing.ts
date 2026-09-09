// lib/admin/listing.ts — sorting, paging and formatting shared by the stacked listing pages.
//
// Owner, 2026-09-09 ("Projects Listing Page.pdf", "Research Page.pdf"): the Projects list and the
// Research Projects list are the same shape — a search bar, a Filter dropdown, cards stacked
// vertically, "‹ 1 of 16 ›" underneath — "fairly similar, but different enough to recognize them
// as different pages". The parts that are the SAME live here, pure and unit-tested, so the two
// pages cannot drift in how they sort or page.
//
// Sorting happens in the browser on the full list (the APIs cap a page at 200 rows and the firm
// has a few dozen projects); a deadline derived from jobs cannot be sorted in SQL anyway.

export type SortKey = 'newest' | 'oldest' | 'due_soonest' | 'name_asc' | 'name_desc' | 'updated';

export const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'due_soonest', label: 'Due soonest' },
  { key: 'name_asc', label: 'A → Z' },
  { key: 'name_desc', label: 'Z → A' },
  { key: 'updated', label: 'Recently updated' },
];

export interface SortableRow {
  name: string;
  created_at: string;
  updated_at?: string | null;
  /** ISO date or null — rows without one sort LAST under "Due soonest". */
  due?: string | null;
}

/** A stable sort — equal keys keep the incoming (newest-first) order. */
export function sortRows<T extends SortableRow>(rows: T[], key: SortKey): T[] {
  const cmpName = (a: T, b: T) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const cmpIso = (a?: string | null, b?: string | null) => String(a ?? '').localeCompare(String(b ?? ''));
  const out = [...rows];
  switch (key) {
    case 'newest': out.sort((a, b) => cmpIso(b.created_at, a.created_at)); break;
    case 'oldest': out.sort((a, b) => cmpIso(a.created_at, b.created_at)); break;
    case 'updated': out.sort((a, b) => cmpIso(b.updated_at ?? b.created_at, a.updated_at ?? a.created_at)); break;
    case 'name_asc': out.sort(cmpName); break;
    case 'name_desc': out.sort((a, b) => cmpName(b, a)); break;
    case 'due_soonest':
      out.sort((a, b) => {
        if (!a.due && !b.due) return 0;
        if (!a.due) return 1;
        if (!b.due) return -1;
        return cmpIso(a.due, b.due);
      });
      break;
  }
  return out;
}

export const PAGE_SIZE = 10;

export interface Page<T> {
  rows: T[];
  page: number;
  pages: number;
  total: number;
}

/** One-based paging. An out-of-range page clamps rather than returning nothing — a filter that
 *  shrinks the list must not strand the reader on an empty page 4. */
export function paginate<T>(rows: T[], page: number, size = PAGE_SIZE): Page<T> {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return { rows: rows.slice((p - 1) * size, p * size), page: p, pages, total };
}

/** "Sep 9, 2026" — or an em dash for nothing, never "Invalid Date". */
export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "$1,000" — whole dollars; "$0" stays "$0" because "0 of 1,000 paid" is the point of the line. */
export function money(n: number | null | undefined): string {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/** Whether a deadline is already behind us (date-only compare, local time). */
export function isOverdue(iso?: string | null, now = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return d.getTime() < today.getTime();
}
