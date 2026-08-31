// e2e/_responsive-probes.ts — the DOM probes both responsive audits run.
//
// Extracted 2026-08-31 when the research portal got its own responsive pass (E3). They were inline
// in `mobile-overflow-audit.spec.ts`, and the obvious move — importing them from that file — is
// wrong in a way worth recording: importing a `.spec` EXECUTES it, so every test it registers runs
// again under the importing file. A shared module with no `test()` in it is the only version that
// shares the code without duplicating the run.
//
// Copying them would have been worse. Four hand-written copies of one list is G12 in the research
// UI doc; two hand-written copies of a DOM probe is the same defect with a longer fuse, because the
// copy that stops being maintained is the one that goes on reporting clean.

import type { Page } from '@playwright/test';
export interface Offender {
  tag: string;
  cls: string;
  id: string;
  width: number;
  text: string;
}

/**
 * Runs in the page. Returns the horizontal overflow of the document plus every element wider than
 * the viewport that no scrollable ancestor rescues.
 */
export const PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const scrollable = (el) => {
    const s = getComputedStyle(el);
    return (s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1;
  };
  const rescued = (el) => {
    let p = el.parentElement;
    while (p && p !== document.body) { if (scrollable(p)) return true; p = p.parentElement; }
    return false;
  };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // > viewport OR sticking out past the right edge. The second catches fixed-width children that
    // are narrow but positioned off-screen, which look identical to the user.
    // WIDTH ONLY. An earlier version also flagged anything whose right edge passed the viewport,
    // which sounded stricter and was simply wrong: it reported a 326px card inside a 360px page as
    // an offender on /admin/team, and a right-aligned 40px avatar on four other routes. A guard
    // that cries wolf is a guard people stop reading, and its noise nearly buried the real
    // headline — that these pages do not overflow at all.
    if (r.width <= vw + 2) continue;
    if (scrollable(el) || rescued(el)) continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 60),
      id: el.id || '',
      width: Math.round(r.width),
      text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40),
    });
  }
  // Only the outermost offenders: a wide container makes every child wide, and listing all of them
  // buries the one element somebody has to edit.
  const outer = out.filter((o, i) => !out.some((p, j) => j !== i && p.width >= o.width && o.cls.startsWith('') && false));
  return {
    docScrollsSideways: document.documentElement.scrollWidth > vw + 1,
    scrollWidth: document.documentElement.scrollWidth,
    viewport: vw,
    offenders: outer.slice(0, 12),
  };
})()`;

/**
 * M5–M8 addition: is anything UNREACHABLE because the floating dock is sitting on it?
 *
 * Width was only half the owner's complaint. The other half — *"I am not able to scroll to see all of
 * the roles and I cannot see the button to actually save"* — is about a control you cannot get to, and
 * a fixed overlay parked over the last button on a page is the same failure with a different cause.
 *
 * This has to be measured at the BOTTOM of the page. A full-page screenshot paints a `position: fixed`
 * element once, at its scroll-0 position, into a stitched image — so a picture shows the dock lying
 * across whatever happened to be at that offset, which is a place it never actually occupies. Reading
 * that picture is how you end up "fixing" an overlap that does not exist; scrolling to the end and
 * asking `elementFromPoint` is how you find the ones that do.
 *
 * `elementFromPoint` is the whole test: an overlapping rectangle is not a defect if the tap still
 * reaches the control, and it IS a defect the moment something else answers at that point.
 */
export const OCCLUSION_PROBE = `(() => {
  const vh = window.innerHeight;
  const bottomFixed = [...document.querySelectorAll('body *')].filter((el) => {
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' || s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none') return false;
    const r = el.getBoundingClientRect();
    // Bottom-anchored and substantial: the dock, a sticky action bar. Not the top bar, which pages
    // already clear with a content margin, and not hairlines.
    return r.width > 20 && r.height > 20 && r.top > vh / 2;
  });
  const hits = [];
  for (const el of document.querySelectorAll('button, a, input, select, textarea, [role="button"]')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > vh) continue;
    if (bottomFixed.some((f) => f.contains(el))) continue;      // the dock's own buttons
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cx > document.documentElement.clientWidth || cy < 0 || cy > vh) continue;
    const top = document.elementFromPoint(cx, cy);
    if (!top || el.contains(top) || top === el) continue;
    // Only report when the thing answering is (inside) one of those fixed overlays. Anything else is
    // an ordinary z-order question — a dropdown over its own trigger, say — and not this test's
    // business.
    const blocker = bottomFixed.find((f) => f === top || f.contains(top));
    if (!blocker) continue;
    hits.push({
      cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 40),
      text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 30),
      by: (blocker.className && blocker.className.toString ? blocker.className.toString() : '').slice(0, 40),
    });
  }
  return hits;
})()`;

/**
 * A single `scrollTo(0, scrollHeight)` does NOT land at the bottom here, and the first version of the
 * occlusion test above was wrong because of it. Measured on /admin/leads: it left `scrollY` at 3370 of
 * a 3931 maximum — 561px short. Two causes, both ordinary: the scroll animates, and the page grows as
 * content below the fold lays out, so the target computed before the jump is already stale.
 *
 * A mid-scroll position is exactly where a floating dock legitimately covers things, so measuring
 * there reports the dock working as designed and calls it a defect. It flagged three — a "Delete" on
 * /admin/leads, a "Timeline" on /admin/team, a "Go to my hours" on /admin/me — every one of which a
 * reader can free by scrolling one notch further.
 *
 * So: scroll until the position stops moving, then measure. The end of the page is the only place the
 * question "can a thumb reach this?" has a fixed answer, because it is the only place with no more
 * scrolling to do.
 */
export async function scrollToTheEnd(page: Page) {
  let last = -1;
  for (let i = 0; i < 25; i++) {
    const y = await page.evaluate(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' as ScrollBehavior });
      return Math.round(window.scrollY);
    });
    if (y === last) break;
    last = y;
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(300);
}

