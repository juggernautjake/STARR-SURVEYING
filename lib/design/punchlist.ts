// lib/design/punchlist.ts — the owner's actual complaint, turned into a work order.
//
// Slice M3 / §14 of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md.
//
// Owner: *"I still find tons of repetitive elements and poorly formatted elements that need to be
// fixed, or are simply non-functional at all."*
//
// ── WHY THIS IS A SEPARATE THING FROM A NOTE ────────────────────────────────────────────────────
//
// A sticky note already exists, and "this button is broken" could go in one. It would also be lost:
// a note is prose in the middle of a design, read by whoever happens to open that design. What the
// owner described is not a comment on one mockup — it is a list of defects spread across 147 pages,
// found while looking at them, that needs to survive as a list.
//
// So a flag is structured: a KIND from a fixed set, an optional note, and — crucially — the element
// it is on, which after an import (§13) carries the class signature it was traced from. That makes
// a flag point at `.jobs-page__search-btn` rather than at "the third button", which is the
// difference between a work order and a memory.
//
// The fixed set is deliberately short. Four kinds people will actually use beats twelve nobody can
// choose between, and every one of them maps to a different KIND of fix:
//
//   broken          it does the wrong thing            → a bug
//   non-functional  it does nothing at all             → unfinished work
//   duplicate       this exists elsewhere, differently → a consolidation
//   ugly            it works, it looks wrong           → a design pass

import type { DesignDocument, DesignElement, ViewId } from './document';

export type FlagKind = 'broken' | 'non-functional' | 'duplicate' | 'ugly';

export interface Flag {
  kind: FlagKind;
  note?: string;
}

/** Order matters: it is the order they appear in the inspector and in the exported list, and it
 *  runs from "this is a defect" to "this is taste". */
export const FLAG_KINDS: Array<{ kind: FlagKind; label: string; means: string }> = [
  { kind: 'broken', label: 'Broken', means: 'does the wrong thing' },
  { kind: 'non-functional', label: 'Does nothing', means: 'no behaviour at all' },
  { kind: 'duplicate', label: 'Duplicate', means: 'exists elsewhere, defined separately' },
  { kind: 'ugly', label: 'Looks wrong', means: 'works, but badly formatted' },
];

export interface PunchListRow {
  view: ViewId;
  route: string | null;
  elementId: string;
  /** What to call it in the list. */
  name: string;
  /** The class signature, when the element was traced from a real page. The findable part. */
  selector?: string;
  kind: FlagKind;
  note?: string;
}

export function flagsOf(element: DesignElement): Flag[] {
  return element.flags ?? [];
}

/** Toggle one kind on an element, keeping any note already written for it. */
export function toggleFlag(element: DesignElement, kind: FlagKind): Flag[] {
  const flags = flagsOf(element);
  return flags.some((f) => f.kind === kind)
    ? flags.filter((f) => f.kind !== kind)
    : [...flags, { kind }];
}

export function setFlagNote(element: DesignElement, kind: FlagKind, note: string): Flag[] {
  const flags = flagsOf(element);
  const trimmed = note.trim();
  return flags.some((f) => f.kind === kind)
    ? flags.map((f) => (f.kind === kind ? { ...f, note: trimmed || undefined } : f))
    : [...flags, { kind, note: trimmed || undefined }];
}

/**
 * Every flag in a document, as rows.
 *
 * Sorted by kind first and not by view: the question a person asks of this list is "what is broken",
 * not "what is wrong on the desktop version". Within a kind, the order elements were placed, so a
 * list read twice reads the same way.
 */
export function punchListFrom(doc: DesignDocument): PunchListRow[] {
  const order = new Map(FLAG_KINDS.map((k, i) => [k.kind, i]));
  const rows: PunchListRow[] = [];

  for (const viewId of ['desktop', 'mobile'] as ViewId[]) {
    for (const el of doc.views[viewId].elements) {
      for (const flag of flagsOf(el)) {
        rows.push({
          view: viewId,
          route: doc.route,
          elementId: el.id,
          name: el.name ?? el.catalogId ?? el.kind,
          selector: el.importedFrom,
          kind: flag.kind,
          note: flag.note,
        });
      }
    }
  }

  return rows.sort((a, b) => (order.get(a.kind)! - order.get(b.kind)!) || a.elementId.localeCompare(b.elementId));
}

/**
 * The punch list as a document somebody can work from.
 *
 * Written as its own file rather than a section of the brief, because it has a different life: the
 * brief is read once when the page is built, and this is worked through and ticked off. It carries
 * checkboxes for that reason.
 */
export function punchListMarkdown(doc: DesignDocument, rows: PunchListRow[]): string {
  if (rows.length === 0) return '';
  const lines: string[] = [];
  const where = doc.route ? `\`${doc.route}\`` : doc.name;

  lines.push(`# Punch list — ${where}`, '');
  lines.push(`${rows.length} thing${rows.length === 1 ? '' : 's'} flagged while looking at this page in the Page Designer.`);
  lines.push('Each one is a defect somebody saw, not a rule a tool inferred.', '');

  for (const { kind, label, means } of FLAG_KINDS) {
    const forKind = rows.filter((r) => r.kind === kind);
    if (forKind.length === 0) continue;
    lines.push(`## ${label} — ${means}`, '');
    for (const row of forKind) {
      const target = row.selector ? ` \`.${row.selector.split(' ').join('.')}\`` : '';
      lines.push(`- [ ] **${row.name}**${target} *(${row.view})*`);
      if (row.note) lines.push(`      ${row.note}`);
    }
    lines.push('');
  }

  lines.push('---', '');
  lines.push('Selectors come from tracing the live page (`scripts/design-import-page.mjs`), so they');
  lines.push('are the classes the element actually wears — searchable, rather than a description.');
  lines.push('');
  return lines.join('\n');
}
