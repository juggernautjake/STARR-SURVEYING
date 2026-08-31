// lib/admin/portal/tab-keyboard.ts — the keyboard half of `role="tablist"`.
//
// ── WHY THIS IS SHARED CODE AND NOT A SNIPPET ───────────────────────────────────────────────────
//
// Measured 2026-08-31: **seventeen admin portals declare `role="tablist"`. Three of them implement
// no keyboard behaviour at all** — `marketing`, `notes`, and `employees/manage/[email]/history`. The
// other fourteen each hand-roll the same eight lines, and not one of them handles Home or End.
//
// Declaring that role is a PROMISE about the keyboard. A screen reader announces "tab 2 of 7", so
// the user reaches for an arrow key, because that is what the role MEANS. On those three portals
// nothing happens, and every tab is its own Tab stop, so reaching the panel behind a seven-tab bar
// takes eight presses. That is worse than plain buttons would have been: the markup states
// something untrue. `SegmentedTabs` had exactly this defect until Phase F1 of the research overhaul,
// which is what prompted the count.
//
// ── FOCUS IS FOUND IN THE DOM, NOT BY AN ID CONVENTION ──────────────────────────────────────────
//
// The obvious implementation focuses `#${prefix}-${tabId}`, which is what the research portal did.
// It requires every caller to agree on an id scheme, and the seventeen portals here do not: some
// have no ids on their tabs at all. So the next tab is found by asking the bar itself — the
// `[role="tab"]` children of the pressed tab's own parent.
//
// That has a second advantage worth stating: it cannot focus the wrong element. An id-based lookup
// silently focuses nothing when a caller's prefix drifts, and focusing nothing looks exactly like
// arrow keys not being wired.

/**
 * Which tab an arrow key should move to — `null` for a key this bar does not handle.
 *
 * Pure, and separated from the DOM, because it is the only part of the contract that can be WRONG
 * in an interesting way: the wrap at both ends, and Home/End on a one-tab bar. Moved here from
 * `app/admin/research/components/ui/index.tsx` (Phase F1) when a second consumer appeared; the
 * research primitive re-exports it so its own tests keep pointing at one implementation.
 */
export function nextTabIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowRight': case 'ArrowDown': return (index + 1 + count) % count;
    case 'ArrowLeft':  case 'ArrowUp':   return (index - 1 + count) % count;
    case 'Home':                         return 0;
    case 'End':                          return count - 1;
    default:                             return null;
  }
}

/**
 * Which tab id a keypress should move to — `null` when this bar does not handle the key.
 *
 * ── WHY THE DECISION IS SEPARATED FROM THE DOM ──────────────────────────────────────────────────
 *
 * This repository has **no DOM test environment** — no jsdom, no happy-dom; components are rendered
 * with `react-dom/server` under `environment: 'node'`, deliberately. So a keydown on a rendered bar
 * cannot be asserted here, and adding a DOM environment to test eight lines would be a poor trade.
 *
 * Everything that can be wrong in an interesting way therefore lives in this function, which takes
 * a plain list of ids: the wrap at both ends, Home/End, an unknown current id, a one-tab bar. What
 * is left in the hook is a query and a `.focus()` — genuinely nothing to get wrong that a source
 * assertion cannot see. Same split as Phase F1 of the research overhaul, for the same reason.
 */
export function tabMoveTarget(key: string, tabIds: string[], currentId: string): string | null {
  const here = tabIds.indexOf(currentId);
  // An id not in the list means the caller and the DOM disagree. Moving from a guessed position
  // would land somewhere arbitrary, which is worse than not moving at all.
  if (here < 0) return null;
  const target = nextTabIndex(key, here, tabIds.length);
  return target === null ? null : tabIds[target];
}

/**
 * The `[role="tab"]` elements of the bar containing `el`, in document order.
 *
 * Scoped to the bar rather than the document: a page may hold more than one tablist — a portal bar
 * and a tab strip inside the panel it shows — and a document-wide query would walk out of one bar
 * and into the other, so End on the portal strip would jump focus into the panel below it.
 */
export function siblingTabs(el: HTMLElement): HTMLElement[] {
  const bar = el.closest('[role="tablist"]') ?? el.parentElement;
  if (!bar) return [el];
  return Array.from(bar.querySelectorAll<HTMLElement>(':scope > [role="tab"]'));
}
