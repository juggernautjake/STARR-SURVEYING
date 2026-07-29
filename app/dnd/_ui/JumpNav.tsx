'use client';
// JumpNav — the in-page index for the rules library (Slice 37, P11-8).
//
// Two jobs, added in that order:
//
// 1. SCROLL WITHOUT PUSHING HISTORY. A plain `<a href="#section">` pushes a hash entry each time, so Back
//    "jumps up and down" the same page and needs several presses before it leaves. This scrolls the target
//    into view and REPLACES the hash instead, so Back returns to the previous page in one press.
//
// 2. STAY ON SCREEN. Measured on `/dnd/library/pathfinder2e`: the page is **15,204px** — eighteen
//    viewports — and this index was `position: relative`, so it was gone after the first screen. An index
//    reachable only from the top of an eighteen-screen page is a table of contents in a book with the
//    pages glued shut; the one way back to it was the "Back to search" button.
//
// Used ONLY by the library — the bespoke sheets have their own `.pf2Nav` / IG equivalents, which were
// already sticky. This component was the one that was not.
import styles from './hextech.module.css';

export interface JumpItem {
  id: string;
  label: string;
}

export default function JumpNav({ items }: { items: JumpItem[] }) {
  const go = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (!el) return;

    // A sticky bar means a plain `scrollIntoView({ block: 'start' })` parks the heading UNDERNEATH it —
    // you jump to "Spells" and the first thing on screen is the spell list, heading hidden. The fix is
    // `scroll-margin-top`: the one mechanism the browser applies natively when scrolling to a target.
    //
    // SET HERE, FROM THE BAR'S MEASURED GEOMETRY, rather than as a static rule on every section — the
    // bar's height changes with the viewport (it wraps to two rows on a desktop and becomes a single
    // scrolling strip under 640px), so any hardcoded margin would be wrong at most widths. What must
    // clear is the bar's bottom edge once stuck: its sticky `top` plus its height.
    //
    // This replaced hand-rolled `window.scrollTo` arithmetic that was subtly and reproducibly wrong —
    // it landed every target at y=16, behind the bar, while the values it fed on (sticky top 52, height
    // 59) measured correctly at click time. Rather than keep bisecting my own maths, hand the browser
    // the offset in the property it already understands.
    const nav = (e.currentTarget as HTMLElement).closest('nav');
    const cs = nav ? getComputedStyle(nav) : null;
    const stickyTop = cs?.position === 'sticky' ? parseFloat(cs.top) || 0 : 0;
    el.style.scrollMarginTop = `${Math.round(stickyTop + (nav?.getBoundingClientRect().height ?? 0) + 14)}px`;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Update the hash without adding a history entry — the whole point of the original fix.
    if (typeof history !== 'undefined') history.replaceState(null, '', `#${id}`);

    // KEYBOARD PARITY, which the brief asks for by name. Without this the page scrolls but FOCUS stays on
    // the link, so a keyboard or screen-reader user lands nowhere: the next Tab carries on through the
    // index instead of entering the section they just asked for. `tabindex="-1"` makes the heading
    // focusable without adding it to the tab order, and `preventScroll` stops the browser jumping the
    // page itself and undoing the smooth scroll above.
    el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  };

  return (
    <nav className={`${styles.framedPanel} ${styles.jumpNav}`} aria-label="Jump to a section">
      {items.map((i) => (
        // Each item is a distinct ◆-bulleted pill so the index reads as separate items, not a run of text.
        <a key={i.id} href={`#${i.id}`} onClick={(e) => go(e, i.id)} className={styles.jumpNavItem}>
          {i.label}
        </a>
      ))}
    </nav>
  );
}
