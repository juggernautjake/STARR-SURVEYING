// lib/dnd/edit-describe.ts — say WHAT changed, for any audit row, whoever wrote it.
//
// The DM's review queue exists to answer one question — "what changed on this sheet?" — and for
// hand-edits it was not answering it. `describeEdit` lived inside `EditReviewPanel` and understood only
// AI-shaped rows, where `new_value` is a `SheetEdit` object carrying an `op`. A MANUAL row is a bare
// before/after pair (`logManualEdit` posts the raw scalars), so it has no `op`, fell through the first
// guard, and rendered as the field path alone:
//
//     spell.Fireball.damage                  ← what it showed
//     spell.Fireball.damage: 8d6 → 10d6      ← what the row actually held
//
// Both values were sitting in the row. Nothing formatted them. So the one surface whose whole purpose is
// reviewing changes showed a DM which field a player touched but never what they did to it — and the plan
// doc's remaining ask ("surface the SPECIFIC per-element diff, '8d6 → 10d6'") was blocked on a formatter
// that already existed and simply had a hole in it.
//
// Pulled out of the component deliberately. The doc's next step is the same diff on the inline ✎ hover, and
// a second formatter written there would drift from this one — which is how the two path vocabularies below
// came to exist in the first place.

/** The columns a description needs. Structural, so both the panel's local row type and a server row fit. */
export interface DescribableEdit {
  field_path?: string | null;
  old_value?: unknown;
  new_value?: unknown;
  /** A sentence written by whoever filed the row, for rows that carry no before/after to diff. The
   *  bespoke-sheet routes (`ig:*` / `pf2:*`) write one because their change lives in a sidecar the 5e
   *  `Character` shape cannot express — there is no scalar pair to format, but there IS a description. */
  summary?: string | null;
}

/** AI rows store a whole `SheetEdit` in `new_value`; a manual row stores the bare value. */
interface SheetEditish { op?: string; to?: string; value?: unknown }

/** Compact, readable, and never a stringified object dumped at a human. */
function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.length ? v.map(show).join(', ') : '—';
  // An object here is a whole element (the AI path's `old_value`), which is not a diff — name it rather
  // than printing a wall of JSON the reader has to parse in their head.
  const name = (v as { name?: unknown }).name;
  return typeof name === 'string' && name ? name : 'a value';
}

/**
 * One line describing an edit.
 *
 * Handles both vocabularies the repo writes:
 *   · AI / grant — `new_value` is a `SheetEdit` (`{op, to, value}`), `field_path` like `spells[fireball]`
 *   · manual     — `new_value` is the new scalar, `old_value` the old, `field_path` like `spell.Fireball.damage`
 */
export function describeEdit(row: DescribableEdit): string {
  const path = row.field_path ?? 'sheet';
  const e = (row.new_value ?? null) as SheetEditish | null;
  const isSheetEdit = !!e && typeof e === 'object' && typeof e.op === 'string';

  if (isSheetEdit) {
    if (e!.op!.startsWith('rename_') && e!.to) return `${path}: renamed → “${e!.to}”`;
    if (e!.op!.startsWith('set_') && e!.value !== undefined) {
      const from = row.old_value === null || row.old_value === undefined ? '' : `${show(row.old_value)} → `;
      return `${path}: ${from}${show(e!.value)}`;
    }
    return `${path}: ${e!.op}`;
  }

  // MANUAL — the case that rendered as a bare path. Both values are right here.
  const before = show(row.old_value);
  const after = show(row.new_value);
  // SUMMARY-ONLY rows — the third vocabulary, and the same hole this file was written to close.
  //
  // A bespoke-sheet row (`ig:add_power`, `pf2:add_feat`) changes a SIDECAR the 5e `Character` shape cannot
  // express, so it stores no before/after pair to diff — but it does store a sentence. Without this the row
  // fell to `return path` below and the DM's queue printed the raw opcode **`ig:add_power`** where it
  // should have said "Gained the power Arcane Spell — off-rules: not a Beastmaster power". Exactly the
  // failure described at the top of this file, on a row shape that did not exist when it was written.
  //
  // Checked HERE rather than first, deliberately: a structured edit or a real before/after pair is a more
  // precise answer than a generic sentence, so the summary is the fallback, not the preference.
  const summary = typeof row.summary === 'string' ? row.summary.trim() : '';
  if (before === after && summary) return summary;
  if (before === after) return path;               // nothing to say; the row should not exist, but be quiet

  // An ELEMENT arriving or leaving reads better as a verb than as a diff against nothing. Once the sheet
  // began auditing adds and deletes, these became common rows, and "item.Rope: — → Rope" is a clumsy way
  // to say "a rope appeared": it repeats the name and spends the arrow on an em-dash.
  //
  // Detected by the path ENDING in the value, not by counting dot-segments — an item legitimately named
  // "Wand of Sparks v1.2" has as many segments as a field path, so counting would misread it.
  const endsWithValue = (v: unknown) => typeof v === 'string' && !!v && path.endsWith(`.${v}`);
  if (row.old_value == null && endsWithValue(row.new_value)) return `${path}: added`;
  if (row.new_value == null && endsWithValue(row.old_value)) return `${path}: removed`;

  return `${path}: ${before} → ${after}`;
}

/** Just the changed element's name from a `field_path`, for matching a row to a row on the sheet.
 *
 *  Both vocabularies, because both are written today:
 *    `spell.Fireball.damage` → "Fireball"   ·   `spells[fireball]` → "fireball"
 *  Returns null for a scalar path (`ability.str`) that names no element.
 */
export function editedElementName(fieldPath: string | null | undefined): string | null {
  const p = (fieldPath ?? '').trim();
  if (!p) return null;
  const bracket = p.match(/^[a-z]+\[([^\]]+)\]/i);
  if (bracket) return bracket[1] || null;
  // `kind.Name.field` — the name is everything between the first and last dot, since a name may contain dots.
  const first = p.indexOf('.');
  const last = p.lastIndexOf('.');
  if (first < 0 || last <= first) return null;
  return p.slice(first + 1, last) || null;
}
