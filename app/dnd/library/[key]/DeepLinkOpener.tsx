'use client';
// DeepLinkOpener — makes `#entry-…` links actually reveal the thing they point at.
//
// THE PROBLEM THIS SOLVES. Every section and every entry on the library page is a native
// `<details>`, default-closed — a deliberate choice, so the page opens as a scannable list of
// headers rather than a wall of text. But that makes a plain anchor link useless: the browser
// happily scrolls to a closed `<details>`, which renders as a one-line collapsed strip. The reader
// clicks a search result, arrives at something that looks nothing like what they clicked, and
// reasonably concludes the link is broken.
//
// So arriving at an anchor has to OPEN it, and open every ancestor that contains it — an entry
// lives inside a section, and both are closed.
//
// Deliberately a no-JS-graceful enhancement: without it the link still navigates to the right
// place, it just does not expand. Nothing here is required for the page to work.
import { useEffect } from 'react';

/** Open the target and every `<details>` above it, then bring it into view. */
function reveal(hash: string) {
  const id = hash.replace(/^#/, '');
  if (!id) return;
  // `getElementById` rather than `querySelector('#'+id)`: an id derived from a content name can
  // contain characters that are not a valid CSS selector, and querySelector would throw on them.
  const el = document.getElementById(id);
  if (!el) return;

  // Walk UP opening every ancestor <details>, then the target itself if it is one. Order matters:
  // a child of a closed parent has no layout, so scrolling before opening measures the wrong place.
  let node: HTMLElement | null = el;
  while (node) {
    if (node instanceof HTMLDetailsElement) node.open = true;
    node = node.parentElement;
  }

  // Let the browser lay out the newly-opened content before scrolling to it, or the position is
  // computed against the collapsed height and lands short.
  requestAnimationFrame(() => {
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    // A brief highlight, so a reader who lands mid-page can see WHICH of several similar rows they
    // were sent to. Skipped for anyone who has asked for reduced motion.
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.animate?.(
        [{ backgroundColor: 'rgba(200,170,110,0.28)' }, { backgroundColor: 'transparent' }],
        { duration: 1400, easing: 'ease-out' },
      );
    }
  });
}

export default function DeepLinkOpener() {
  useEffect(() => {
    // On arrival. Deferred a tick because the sections render server-side but hydration may not
    // have attached everything yet on a slow client.
    const initial = window.location.hash;
    if (!initial) return;
    const t = setTimeout(() => reveal(initial), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // On every subsequent same-page hash change — clicking a second search result, or the back
    // button returning to an earlier anchor. Without this, only the first link of a session works.
    const onHash = () => reveal(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return null;
}
