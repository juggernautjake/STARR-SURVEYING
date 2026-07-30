// scripts/lib/overflow.mjs — the ONE definition of "this element escapes the viewport".
//
// Extracted because two scripts were asking the same question and getting different answers.
// `audit-mobile.mjs` and `contact-sheet.mjs` each carried their own copy, and only one of them had
// learned the lessons in `docs/planning/qa-evidence/contrast-sweep.md`. Same failure mode as the two
// token derivations in `skin-tokens.ts`: a rule fixed in one copy and not the other is a rule that
// still ships broken.
//
// FOUR THINGS THAT ARE NOT OVERFLOW, every one of which this detector reported as overflow at some point:
//
//  1. Anything inside a horizontal SCROLL CONTAINER. A wide data table that scrolls is doing its job. The
//     first version without this reported 152 offenders on the rules library — every cell of five healthy
//     `overflow-x: auto` tables.
//  2. `position: fixed`. A dock or FAB anchored to the viewport is not a layout defect.
//  3. Anything NOT RENDERED — including everything inside a CLOSED `<details>`, which still yields layout
//     boxes. This is lie #6 in the method doc, and it cost a full investigation: `/dnd/library/intuitive-
//     games` reported a 521px span at 390px, inside a closed "Calm — Enchantment" disclosure that no
//     reader can see.
//  4. THE UNION RECT OF AN INLINE ELEMENT. `getBoundingClientRect()` on an inline spanning several lines
//     returns the union of its line boxes, which is not a box anything paints into. That same span
//     reported 521px wide inside a 297px paragraph while its ELEVEN individual line rects all sat within
//     39..336 — comfortably inside the parent. Measuring `getClientRects()` one at a time is the fix, and
//     it is the difference between "the IG library overflows" and "the IG library is fine".
//
// Both of the last two applied to the same element, and either alone would have produced a confident
// wrong answer. Exported as a plain function so `page.evaluate(detectOverflow)` serialises it — it must
// therefore close over nothing.

/** Runs IN THE PAGE. Returns real, non-scrollable, actually-visible overflow only. */
export function detectOverflow() {
  const inScroller = (el) => {
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) return true;
      p = p.parentElement;
    }
    return false;
  };
  // Ancestors, `content-visibility` and zero-size boxes in one predicate.
  const isRendered = (el) => (typeof el.checkVisibility === 'function' ? el.checkVisibility() : true)
    && el.getClientRects().length > 0;
  const inClosedDetails = (el) => {
    let n = el.parentElement;
    while (n && n !== document.documentElement) {
      if (n.tagName === 'DETAILS' && !n.hasAttribute('open') && !el.closest('summary')) return true;
      n = n.parentElement;
    }
    return false;
  };

  const bad = [];
  document.querySelectorAll('*').forEach((el) => {
    if (getComputedStyle(el).position === 'fixed') return;
    if (!isRendered(el) || inClosedDetails(el) || inScroller(el)) return;
    // Per LINE BOX, never the union. An element overflows only if something it actually paints does.
    let worst = 0;
    for (const r of el.getClientRects()) {
      if (r.width > 0 && r.height > 0 && r.right > worst) worst = r.right;
    }
    if (worst > window.innerWidth + 2) {
      bad.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').slice(0, 40),
        right: Math.round(worst),
        width: Math.round(el.getBoundingClientRect().width),
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30),
      });
    }
  });

  // Deduplicated by selector+edge: one 500px-wide row otherwise reports its every descendant, and a
  // hundred lines of the same defect is a list nobody reads.
  const seen = new Set();
  const unique = bad.filter((b) => {
    const k = `${b.tag}.${b.cls}@${b.right}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return {
    docScrollWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    count: bad.length,
    offenders: unique.sort((a, b) => b.right - a.right).slice(0, 6),
  };
}

// ── vertical clipping (D7-3) ────────────────────────────────────────────────────────────────────
//
// A DIFFERENT QUESTION FROM `detectOverflow`, which is why it is a separate function rather than a flag.
// That one asks "does this element paint outside the VIEWPORT" — a horizontal, page-level question, and
// it deliberately EXCLUDES scroll containers and `position: fixed` because a scrolling table and a docked
// FAB are both doing their job.
//
// This asks "is content hidden INSIDE this box, such that the reader must scroll to see it" — and for the
// roller window every one of those exclusions is inverted. The roller IS `position: fixed`. The thing that
// makes it a defect IS that it became a scroll container. The owner's requirement is verbatim: *"the modal
// for the roller is always the right size to fully contain all of the content of the rollers at all times
// and that there is never a need for a scrolling bar to appear or be used to see everything"* — so a
// scrollbar here is the bug, not the accommodation.
//
// WHAT COUNTS AS PERMITTED. Roll history is unbounded by nature and the plan (D7-2) allows exactly one
// opt-in scroller for it. So a subtree may declare itself legitimate with `data-scrollable="true"`, and
// this reports everything else. An allowlist that lives in the markup — rather than a selector list in
// this file — keeps the permission next to the thing being permitted, which is the only version that
// stays true when the markup moves.
//
// Runs IN THE PAGE, so it closes over nothing (same constraint as `detectOverflow`).

/** Runs IN THE PAGE. Vertically clipped content inside `rootSelector`, ignoring opted-in scrollers. */
export function detectClipped(rootSelector) {
  const root = document.querySelector(rootSelector);
  if (!root) return { found: false, rootSelector, count: 0, offenders: [] };

  // A box scrolls if its content is taller than its padding box AND its overflow actually clips.
  // `visible` never scrolls however tall the content — it spills, which `detectOverflow` catches instead.
  const SCROLLS = /(auto|scroll|hidden|overlay)/;

  const permitted = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      if (n.dataset && n.dataset.scrollable === 'true') return true;
      n = n.parentElement;
    }
    return false;
  };

  const offenders = [];
  const all = [root, ...root.querySelectorAll('*')];
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (!SCROLLS.test(cs.overflowY)) continue;
    // 2px of slack: sub-pixel layout rounding routinely yields scrollHeight one greater than clientHeight
    // on a box that visibly clips nothing, and a detector that cries wolf gets switched off.
    const hidden = el.scrollHeight - el.clientHeight;
    if (hidden <= 2) continue;
    if (permitted(el)) continue;
    offenders.push({
      tag: el.tagName.toLowerCase(),
      cls: String(el.className || '').slice(0, 48),
      hidden: Math.round(hidden),
      clientHeight: Math.round(el.clientHeight),
      scrollHeight: Math.round(el.scrollHeight),
      overflowY: cs.overflowY,
    });
  }

  return {
    found: true,
    rootSelector,
    count: offenders.length,
    // Worst first — the box hiding the most is the one to size for.
    offenders: offenders.sort((a, b) => b.hidden - a.hidden).slice(0, 6),
  };
}

/**
 * Does the window fit the viewport at all? Separate from clipping because they fail independently and the
 * fixes differ: a window taller than the viewport is a SIZING bug (the constant is too big, or the viewport
 * is a phone), while a clipped child is a CONTENT bug (something inside grew past its box).
 *
 * Runs IN THE PAGE.
 */
export function detectOversized(rootSelector) {
  const el = document.querySelector(rootSelector);
  if (!el) return { found: false, rootSelector };
  const r = el.getBoundingClientRect();
  return {
    found: true,
    rootSelector,
    width: Math.round(r.width),
    height: Math.round(r.height),
    viewportW: window.innerWidth,
    viewportH: window.innerHeight,
    // `> 1` rather than `> 0`: a window sized with calc(100vh - Npx) lands a fraction over on some zoom levels.
    tooWide: r.width > window.innerWidth + 1,
    tooTall: r.height > window.innerHeight + 1,
    offTop: r.top < -1,
    offLeft: r.left < -1,
  };
}
