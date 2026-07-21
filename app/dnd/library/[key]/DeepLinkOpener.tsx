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
// AND IT HAS TO FAIL LOUDLY-ENOUGH. The original bug was not that this component misbehaved: it was
// that the id it was handed did not exist, so it returned early and the page sat there looking
// exactly as if nothing had been clicked. `reveal` now walks a chain — the id, then the same slug
// under the glossary's `term-` prefix, then the section the link came from — so a gap between what
// search can name and what the page renders costs the reader a slightly worse landing instead of
// costing them the click. There is no branch left that silently does nothing when it can do
// something.
//
// Deliberately a no-JS-graceful enhancement: without it the link still navigates to the right
// place, it just does not expand. Nothing here is required for the page to work.
import { useEffect } from 'react';
import { anchorAliases } from '@/lib/dnd/library-anchors';
import { takeFallbackSection, watchLibraryAnchor } from '@/app/dnd/_ui/library-anchor-client';

/** Open every `<details>` above (and including) `el`, then bring it into view. */
function open(el: HTMLElement) {
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

/** Reveal the best element this hash can reach, trying each candidate in turn. */
function reveal(hash: string) {
  const id = hash.replace(/^#/, '');
  if (!id) return;
  // A link straight to a SECTION (the jump nav, or a hit that degraded to its shelf) needs no
  // alias walk and must not consume the fallback hint.
  const direct = document.getElementById(id);
  if (direct) { open(direct); return; }

  // Nothing carries this id. Try the same slug under the glossary's prefix (GlossaryList stands
  // down whenever the exact id exists, so only one of the two of us ever scrolls), then the section
  // the reader was heading for, which is known when they arrived by clicking a search result.
  //
  // `getElementById` throughout rather than `querySelector('#'+id)`: an id derived from a content
  // name can contain characters that are not a valid CSS selector, and querySelector would throw.
  for (const candidate of [...anchorAliases(id).slice(1), takeFallbackSection()]) {
    if (!candidate) continue;
    const el = document.getElementById(candidate);
    if (el) { open(el); return; }
  }
}

export default function DeepLinkOpener() {
  // On arrival, on back/forward, and on every click into an anchor on this page — see
  // `watchLibraryAnchor` for why the obvious `hashchange` listener misses the case that matters.
  useEffect(() => watchLibraryAnchor(reveal), []);

  return null;
}
