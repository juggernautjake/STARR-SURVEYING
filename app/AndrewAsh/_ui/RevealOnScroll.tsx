'use client';
// app/AndrewAsh/_ui/RevealOnScroll.tsx — the scroll animation, done so it cannot hide content.
//
// Sections fade and rise as they enter the viewport. That effect is worth having on a portfolio and
// is responsible for an enormous number of blank pages on the web, always for the same reason: the
// hidden state is written in CSS, so anything that stops the reveal from running — JavaScript
// disabled, a failed hydration, an IntersectionObserver that never fires because the element was
// already on screen — leaves the content permanently invisible.
//
// Here the hidden state is applied BY THIS SCRIPT. If the script does not run, nothing is ever
// hidden, and the page renders as plain HTML with no animation. The failure mode of the animation is
// "no animation", which is the only acceptable one.
//
// A MutationObserver picks up nodes added after the first pass, so widgets rendered by a client
// component (and the studio's live preview) animate too rather than sitting invisible.

import { useEffect } from 'react';

export default function RevealOnScroll(): null {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    // No observer at all when motion is unwelcome or unsupported: leave every element in its natural,
    // fully visible state.
    if (prefersReduced || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('vaRevealed');
          // One-shot. Re-hiding on scroll-up makes a long page flicker every time it is traversed.
          observer.unobserve(entry.target);
        }
      },
      // A negative bottom margin means the reveal fires slightly BEFORE the element is fully on
      // screen, so it has finished by the time the visitor is looking at it. rootMargin measured from
      // the bottom, because everything here scrolls up into view.
      { threshold: 0.05, rootMargin: '0px 0px -8% 0px' },
    );

    const arm = (el: Element): void => {
      if (el.classList.contains('vaRevealReady') || el.classList.contains('vaRevealed')) return;
      el.classList.add('vaRevealReady');
      observer.observe(el);
      // Safety net: anything still un-revealed after 1.6s is shown regardless. Covers the case where
      // an element is inside a scroll container the observer cannot see into — an edge case that,
      // untreated, is indistinguishable from a broken page.
      window.setTimeout(() => {
        if (!el.classList.contains('vaRevealed')) el.classList.add('vaRevealed');
      }, 1600);
    };

    document.querySelectorAll('[data-reveal]').forEach(arm);

    const mutation = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches('[data-reveal]')) arm(node);
          node.querySelectorAll?.('[data-reveal]').forEach(arm);
        });
      }
    });
    mutation.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutation.disconnect();
    };
  }, []);

  return null;
}
