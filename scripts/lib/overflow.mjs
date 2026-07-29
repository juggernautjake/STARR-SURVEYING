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
