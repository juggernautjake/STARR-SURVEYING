// custom-sections — the player-authored EXTRA sections model (D-13).
//
// A character can build brand-new sections on their sheet — a title plus ordered content blocks — and have
// them show as tabs/panes in EVERY template (Classic/Codex/Dashboard/Play) across EVERY system (5e/PF2/IG).
// They are deliberately OUTSIDE the typed mechanics: a custom section can never collide with a real stat, so
// the same data renders identically on every system's bespoke sheet. This module is the single source of
// truth for the shape + all the mutations, kept pure (no React, no DOM) so it is exhaustively unit-testable.

/** One content block inside a custom section. Three kinds cover "format + populate" without a rich editor:
 *  - `text`  — an optional heading + a prose body (multi-paragraph; blank lines split paragraphs).
 *  - `stats` — a key/value grid (label → value), e.g. a homebrew resource tracker's fields.
 *  - `list`  — an optional heading + bullet items. */
export type CustomBlock =
  | { id: string; kind: 'text'; heading?: string; body: string }
  | { id: string; kind: 'stats'; heading?: string; rows: { label: string; value: string }[] }
  | { id: string; kind: 'list'; heading?: string; items: string[] };

export type CustomBlockKind = CustomBlock['kind'];

export interface CustomSection {
  id: string;
  /** Tab/pane label. */
  title: string;
  /** Optional emoji/glyph shown on the tab (purely decorative). */
  icon?: string;
  /** Ordered content. An empty section is valid (a freshly-added, not-yet-populated one). */
  blocks: CustomBlock[];
}

// ── ID generation ───────────────────────────────────────────────────────────────────────────────────────
// No Math.random / Date.now here (they're banned in some run contexts and hurt determinism). IDs are derived
// from a monotonic counter seeded off the EXISTING ids, so a new id is always unique within the section set
// and stable to reproduce in tests.

const idNum = (id: string, prefix: string): number => {
  const m = id.startsWith(prefix) ? Number(id.slice(prefix.length)) : NaN;
  return Number.isFinite(m) ? m : 0;
};

/** Next free `${prefix}${n}` id given the ids already in use. */
export function nextId(prefix: string, existing: readonly string[]): string {
  const max = existing.reduce((hi, id) => Math.max(hi, idNum(id, prefix)), 0);
  return `${prefix}${max + 1}`;
}

// ── Normalization ───────────────────────────────────────────────────────────────────────────────────────
// `data.customSections` is untyped JSON from the DB / AI / an older schema, so every read runs through here.
// Anything malformed is dropped or coerced rather than throwing, so a bad blob never breaks a sheet render.

const asString = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

function normalizeBlock(raw: unknown, i: number, usedIds: Set<string>): CustomBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kind = r.kind;
  let id = typeof r.id === 'string' && r.id ? r.id : `b${i + 1}`;
  while (usedIds.has(id)) id = nextId('b', [...usedIds]);
  usedIds.add(id);

  if (kind === 'text') {
    const body = asString(r.body);
    const heading = asString(r.heading).trim();
    if (!body.trim() && !heading) return { id, kind: 'text', body: '' };
    return { id, kind: 'text', ...(heading ? { heading } : {}), body };
  }
  if (kind === 'stats') {
    const rows = Array.isArray(r.rows)
      ? r.rows
          .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
          .map((row) => ({ label: asString(row.label), value: asString(row.value) }))
          .filter((row) => row.label.trim() || row.value.trim())
      : [];
    const heading = asString(r.heading).trim();
    return { id, kind: 'stats', ...(heading ? { heading } : {}), rows };
  }
  if (kind === 'list') {
    const items = Array.isArray(r.items) ? r.items.map(asString).filter((s) => s.trim()) : [];
    const heading = asString(r.heading).trim();
    return { id, kind: 'list', ...(heading ? { heading } : {}), items };
  }
  return null;
}

/** Defensive parse of `character.customSections` into a clean, id-unique array (never throws). */
export function normalizeCustomSections(raw: unknown): CustomSection[] {
  if (!Array.isArray(raw)) return [];
  const usedSectionIds = new Set<string>();
  const out: CustomSection[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    if (!s || typeof s !== 'object') continue;
    const rec = s as Record<string, unknown>;
    let id = typeof rec.id === 'string' && rec.id ? rec.id : `s${i + 1}`;
    while (usedSectionIds.has(id)) id = nextId('s', [...usedSectionIds]);
    usedSectionIds.add(id);
    const title = asString(rec.title).trim() || 'Untitled section';
    const icon = asString(rec.icon).trim();
    const usedBlockIds = new Set<string>();
    const blocks = Array.isArray(rec.blocks)
      ? rec.blocks.map((b, j) => normalizeBlock(b, j, usedBlockIds)).filter((b): b is CustomBlock => b != null)
      : [];
    out.push({ id, title, ...(icon ? { icon } : {}), blocks });
  }
  return out;
}

// ── Construction + mutation (immutable; return new arrays/objects) ──────────────────────────────────────

/** A fresh empty block of the given kind. */
export function blankBlock(kind: CustomBlockKind, existingIds: readonly string[]): CustomBlock {
  const id = nextId('b', existingIds);
  switch (kind) {
    case 'text':
      return { id, kind: 'text', body: '' };
    case 'stats':
      return { id, kind: 'stats', rows: [{ label: '', value: '' }] };
    case 'list':
      return { id, kind: 'list', items: [''] };
  }
}

/** A fresh empty section (no blocks), with an id unique among the current sections. */
export function blankSection(existing: readonly CustomSection[], title = 'New section'): CustomSection {
  return { id: nextId('s', existing.map((s) => s.id)), title, blocks: [] };
}

/** Append a new section; returns the new array. */
export function addSection(sections: readonly CustomSection[], title?: string): CustomSection[] {
  return [...sections, blankSection(sections, title || undefined)];
}

/** Remove a section by id. */
export function removeSection(sections: readonly CustomSection[], id: string): CustomSection[] {
  return sections.filter((s) => s.id !== id);
}

/** Patch a section's own fields (title/icon) by id. */
export function updateSection(
  sections: readonly CustomSection[],
  id: string,
  patch: Partial<Pick<CustomSection, 'title' | 'icon'>>,
): CustomSection[] {
  return sections.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

/** Move a section one step earlier (dir -1) or later (dir +1); clamped, no-op at the ends. */
export function moveSection(sections: readonly CustomSection[], id: string, dir: -1 | 1): CustomSection[] {
  const i = sections.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sections.length) return sections.slice();
  const next = sections.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Add a block of `kind` to a section. */
export function addBlock(sections: readonly CustomSection[], sectionId: string, kind: CustomBlockKind): CustomSection[] {
  return sections.map((s) =>
    s.id === sectionId ? { ...s, blocks: [...s.blocks, blankBlock(kind, s.blocks.map((b) => b.id))] } : s,
  );
}

/** Remove a block by id from a section. */
export function removeBlock(sections: readonly CustomSection[], sectionId: string, blockId: string): CustomSection[] {
  return sections.map((s) => (s.id === sectionId ? { ...s, blocks: s.blocks.filter((b) => b.id !== blockId) } : s));
}

/** Replace a block wholesale (the editor produces the whole new block). Kind may change. */
export function updateBlock(sections: readonly CustomSection[], sectionId: string, block: CustomBlock): CustomSection[] {
  return sections.map((s) =>
    s.id === sectionId ? { ...s, blocks: s.blocks.map((b) => (b.id === block.id ? block : b)) } : s,
  );
}

/** True when a block has NOTHING a viewer would see — used to hide empty blocks in read-only render. */
export function blockIsEmpty(b: CustomBlock): boolean {
  switch (b.kind) {
    case 'text':
      return !b.body.trim() && !(b.heading ?? '').trim();
    case 'stats':
      return b.rows.every((r) => !r.label.trim() && !r.value.trim()) && !(b.heading ?? '').trim();
    case 'list':
      return b.items.every((i) => !i.trim()) && !(b.heading ?? '').trim();
  }
}

/** True when a whole section has no visible content (all blocks empty) — a not-yet-populated section. */
export function sectionIsEmpty(s: CustomSection): boolean {
  return s.blocks.every(blockIsEmpty);
}
