'use client';
// BackToTop — a floating "back to the search box" button for the long library pages.
//
// A system library page is very long: every class, condition, feat, weapon and species as its own
// expandable row, plus a spell browser. Once a reader has scrolled into the middle of it, the
// search box is a long way up, and searching again is the single most common next action.
//
// Appears only after the reader has scrolled far enough to have lost sight of the top, so it never
// covers content on a short page or on first load.
import { useEffect, useState } from 'react';

/** How far down the page the reader must be before the button is worth showing. */
const SHOW_AFTER_PX = 600;

export default function BackToTop({ label = 'Back to top' }: { label?: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // `passive: true` — this listener never calls preventDefault, and saying so lets the browser
    // keep scrolling on the compositor instead of waiting on JS. On a page this long that is the
    // difference between smooth and janky.
    const onScroll = () => setShow(window.scrollY > SHOW_AFTER_PX);
    onScroll(); // a reader restoring a scrolled position should see it immediately
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    // Move FOCUS to the search field, not just the viewport. A keyboard user sent to the top whose
    // focus stayed at the bottom would have to tab through the whole page again — which would make
    // this button actively worse than no button for them.
    const search = document.querySelector<HTMLInputElement>('input[aria-label="Search the rules library"]');
    search?.focus({ preventScroll: true });
  };

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label={label}
      title={label}
      // `hidden` rather than unmounting: the element keeps its place in the a11y tree's order and
      // does not cause a layout shift as it appears and disappears during scrolling.
      hidden={!show}
      style={{
        position: 'fixed',
        right: 18,
        bottom: 18,
        zIndex: 50,
        display: show ? 'inline-flex' : 'none',
        alignItems: 'center',
        gap: 7,
        padding: '9px 14px',
        borderRadius: 999,
        border: '1px solid var(--hx-gold-1, #c8aa6e)',
        background: 'var(--hx-bg-2, #0b1622)',
        color: 'var(--hx-gold-2, #f0e6d2)',
        fontSize: 12.5,
        letterSpacing: '0.04em',
        cursor: 'pointer',
        boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
      }}
    >
      <span aria-hidden>↑</span>
      {label}
    </button>
  );
}
