// lib/dnd/homebrew/inline-feats.ts — author a feat from inside an unsaved class draft (P6-12b).
//
// The owner's ask: *"they might even be able to homebrew custom feats while making the class to make those
// feats available at certain levels."*
//
// THE WHOLE SLICE IS ONE DECISION, and the split note named it: this creates a SECOND piece from inside an
// unsaved draft, so what happens to the feat if the class is never saved?
//
// **The feat shares the class's fate.** It is held in the builder's own state — never written — and created
// only after the class row exists. Abandon the draft and the feat never existed.
//
// The alternative (save the feat immediately, so it survives) is the easier implementation and it is wrong
// in a way nobody would report: a Studio that quietly accumulates orphan feats from every class draft
// somebody started and closed. The author would have no idea why their feat list keeps growing, and no
// obvious way to tell an abandoned fragment from something they meant. The `pendingImage` in the same save
// function already works this way — created after the piece exists, for the same reason — so this is the
// house pattern rather than a new invention.
import { fieldsForKind } from './kinds';
import type { HomebrewKind } from './model';

/** A feat being written inside a class draft. `id` is LOCAL — it exists only to key the list in React and
 *  is never sent anywhere. */
export interface PendingFeat {
  id: string;
  name: string;
  /** The class level this feat is meant to be available at. Drives the level row, not the feat itself:
   *  a feat has no level of its own, the class's schedule does. */
  level: number;
  summary: string;
  description: string;
  /**
   * The feat schema's required `category`, chosen by the author.
   *
   * NOT guessed. The first version of this file hardcoded `'class'` on the reasoning that a feat written
   * inside a class studio is obviously a class feat — and the registry's options are
   * origin / general / fighting-style / epic-boon, with no `class` among them. That would have failed the
   * feat's own validation *after* the class row was already written, leaving a saved class referencing a
   * feat that does not exist: precisely the failure `validatePendingFeat` exists to prevent, arriving
   * through the one door the validator could not see. The options come from the registry now, and the
   * author picks.
   */
  category: string;
}

export const PENDING_FEAT_KIND: HomebrewKind = 'feat';

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The feat schema's own category choices, read from the registry so the form and the validator cannot
 *  disagree with the thing they both have to satisfy. */
export function featCategoryOptions(): { value: string; label: string }[] {
  const f = fieldsForKind(PENDING_FEAT_KIND).find((x) => x.key === 'category');
  return (f?.options ?? []).map((o) => ({ value: o.value, label: o.label }));
}

/**
 * What a pending feat must have before the class can be saved.
 *
 * `summary`, `description` and `category` are all required by the feat schema, so a pending feat missing
 * any of them would fail its own POST *after* the class had already been created — leaving a saved class
 * referencing a feat that does not exist. Validating here, before the class is written, is what keeps that
 * from happening.
 */
export function validatePendingFeat(feat: PendingFeat): string[] {
  const problems: string[] = [];
  const label = clean(feat.name) || 'A feat';
  if (!clean(feat.name)) problems.push('A feat written here needs a name.');
  if (!clean(feat.summary)) problems.push(`"${label}" needs a one-line summary.`);
  if (!clean(feat.description)) problems.push(`"${label}" needs its rules text.`);
  const lvl = Number(feat.level);
  if (!Number.isFinite(lvl) || lvl < 1 || lvl > 20) {
    problems.push(`"${label}" needs a level between 1 and 20.`);
  }
  // Checked against the REGISTRY, not against a list written here — the whole reason the hardcoded
  // `'class'` slipped through was that nothing compared it to the schema it had to satisfy.
  const allowed = new Set(featCategoryOptions().map((o) => o.value));
  if (!allowed.has(clean(feat.category))) problems.push(`"${label}" needs a category.`);
  return problems;
}

/** Every problem across the whole pending list, deduplicated. */
export function validatePendingFeats(feats: readonly PendingFeat[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of feats ?? []) {
    for (const p of validatePendingFeat(f)) if (!seen.has(p)) { seen.add(p); out.push(p); }
  }
  // Two feats with the same name would produce two indistinguishable pieces and an ambiguous level row.
  const names = new Map<string, number>();
  for (const f of feats ?? []) {
    const key = clean(f.name).toLowerCase();
    if (!key) continue;
    names.set(key, (names.get(key) ?? 0) + 1);
  }
  for (const [key, n] of names) if (n > 1) out.push(`Two feats here are both called "${key}". Give them different names.`);
  return out;
}

/** The POST body for one pending feat. `system` and `visibility` come from the CLASS: a feat written
 *  inside a private draft must not be born public. */
export function pendingFeatBody(feat: PendingFeat, opts: { system: string; visibility: string }): Record<string, unknown> {
  return {
    kind: PENDING_FEAT_KIND,
    system: opts.system,
    visibility: opts.visibility,
    name: clean(feat.name),
    summary: clean(feat.summary),
    description: clean(feat.description),
    category: clean(feat.category),
  };
}

/**
 * The level row a pending feat implies, in the `levels` field's own shape.
 *
 * Without this the feature is decorative: a feat authored beside a class but never referenced by it is just
 * a feat that happens to have been typed in the same form. The row is what makes it "available at certain
 * levels", which is what was actually asked for.
 */
export function pendingFeatLevelRow(feat: PendingFeat): Record<string, unknown> {
  return {
    level: Number(feat.level),
    name: clean(feat.name),
    body: clean(feat.summary),
    // Not a `choice`: the class GRANTS this feat at this level, it does not ask the player to pick one.
    // Marking it 'asi' or 'other' would make the level walker prompt for something already decided.
    choice: '',
  };
}

/**
 * Fold every pending feat into a `levels` array.
 *
 * `previous` is the pending list as it was BEFORE this edit, and it is not optional decoration — it is the
 * only way a rename can work. A first version matched rows by the current feats' names, so renaming
 * "Riposte" to "Parry" left the Riposte row behind: nothing in the new list claimed it, so the filter kept
 * it as though the author had written it by hand. The class ended up granting a feat that would never be
 * created. Caught by a test rather than by anyone using it, which is roughly what one would expect of a
 * bug that only appears on the second edit of the same feat.
 *
 * The rows themselves stay in the `levels` schema's own shape — no local id is stamped onto them, because
 * these rows are saved into the class payload and a bookkeeping key would be saved with them.
 */
export function mergePendingFeatRows(
  levels: readonly Record<string, unknown>[],
  feats: readonly PendingFeat[],
  previous: readonly PendingFeat[] = [],
): Record<string, unknown>[] {
  const owned = new Set(
    [...(previous ?? []), ...(feats ?? [])].map((f) => clean(f.name).toLowerCase()).filter(Boolean),
  );
  const kept = (levels ?? []).filter((r) => !owned.has(clean(r.name).toLowerCase()));
  const added = (feats ?? []).filter((f) => clean(f.name)).map(pendingFeatLevelRow);
  return [...kept, ...added].sort((a, b) => Number(a.level ?? 0) - Number(b.level ?? 0));
}

/** A blank pending feat at a level. `id` is caller-supplied so this stays pure. */
export function blankPendingFeat(id: string, level = 1): PendingFeat {
  // Defaults to the registry's FIRST option rather than a name chosen here, so this cannot drift from the
  // schema the way the hardcoded category did.
  return { id, name: '', level, summary: '', description: '', category: featCategoryOptions()[0]?.value ?? '' };
}
