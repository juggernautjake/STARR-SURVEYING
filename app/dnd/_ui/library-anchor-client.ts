// app/dnd/_ui/library-anchor-client.ts — noticing that the reader followed an in-page link, and
// knowing where to put them if the link turns out to point at nothing.
//
// Two components need both facts and neither should own them: `DeepLinkOpener` expands `<details>`,
// `GlossaryList` opens an article held in React state, and a single hash can be for either.

/**
 * Run `handler` every time the current page's fragment becomes relevant: on arrival, on back/forward,
 * and when the reader clicks a link into this same page.
 *
 * THAT LAST CASE IS WHY THIS EXISTS. Listening for `hashchange` is the obvious way to do this and it
 * is not enough: a Next `<Link>` navigates with `history.pushState`, and pushState does not fire
 * `hashchange`. So clicking a search result on the library page — the single commonest way anyone
 * reaches an anchor here — changed the URL, scrolled nowhere, and left every `<details>` shut. The
 * anchor was correct and the page still looked broken, which is indistinguishable to the reader from
 * the dead-id bug this all started with.
 *
 * The click is caught on the document rather than wired through each link so it covers every route
 * into an anchor — search hits, glossary "see also", term popups, and anything added later.
 *
 * Returns an unsubscribe function.
 */
export function watchLibraryAnchor(handler: (hash: string) => void): () => void {
  // Deferred a tick on arrival: the sections render server-side, but hydration may not have attached
  // everything yet on a slow client.
  const initial = window.location.hash ? setTimeout(() => handler(window.location.hash), 60) : undefined;

  const onHash = () => handler(window.location.hash);

  const onClick = (ev: MouseEvent) => {
    // A modified click opens a tab or downloads — the reader is not navigating this page.
    //
    // NOT `ev.defaultPrevented`, which is the obvious guard and is precisely wrong here: a Next
    // `<Link>` calls preventDefault on EVERY in-app navigation so it can route on the client, and
    // React's handler (attached at the root container) has already run by the time a document-level
    // listener sees the event. Treating "handled" as "not for us" therefore skipped every search
    // result — the one link this whole mechanism exists for. Whether the URL really changed is
    // confirmed below instead, which is the fact we actually care about.
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const target = ev.target as Element | null;
    const a = target?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || (a.target && a.target !== '_self')) return;
    const url = new URL(a.href, window.location.href);
    if (!url.hash || url.pathname !== window.location.pathname) return;
    // Wait for the URL to actually become this anchor before revealing it.
    //
    // Two reasons, and the second is not obvious: React's onClick (which records the fallback
    // section) must have run first, AND the Next router updates `window.location` ASYNCHRONOUSLY —
    // measured at ~50ms here, so a single `setTimeout(…, 0)` check reads the OLD hash and concludes
    // the navigation never happened. Hence a short poll rather than one tick.
    //
    // Confirming the URL, rather than trusting the click, is what keeps a link whose handler
    // cancelled the navigation outright from scrolling the page anyway.
    const deadline = Date.now() + 600;
    const poll = () => {
      if (window.location.hash === url.hash) handler(url.hash);
      else if (Date.now() < deadline) setTimeout(poll, 40);
    };
    setTimeout(poll, 0);
  };

  window.addEventListener('hashchange', onHash);
  // Back/forward between two anchors on this page: pushState-based navigation replays as popstate,
  // and again without a hashchange.
  window.addEventListener('popstate', onHash);
  document.addEventListener('click', onClick);
  return () => {
    if (initial) clearTimeout(initial);
    window.removeEventListener('hashchange', onHash);
    window.removeEventListener('popstate', onHash);
    document.removeEventListener('click', onClick);
  };
}

// ── the fallback section ────────────────────────────────────────────────────────────────────────
//
// A search hit knows the one fact the opener cannot work out from a hash alone: the KIND, and so the
// section the reader was heading for. Carrying it in the URL would mean a query string
// (`?in=conditions#entry-grappled`), which turns an in-page jump into a full route transition and
// leaves an uglier link to copy or bookmark. So the hint is handed over out of band.
//
// `sessionStorage` rather than a module variable because it has to survive a navigation to a
// DIFFERENT system's page — searching every system at once from /dnd/library is exactly where a link
// is most likely to outrun what the target page renders.
//
// It is a HINT, not state: written on click, read once, cleared. If anything goes wrong (storage
// disabled, a stale value) the worst outcome is landing on a section header, which is where the
// server-side `resolveLibraryHref` would have sent the reader anyway. Nothing here may throw — a
// private-mode browser must not break a link.
const KEY = 'dnd.library.fallbackSection';

/** Remember which section this result belongs to, in case its entry anchor resolves to nothing. */
export function rememberFallbackSection(sectionId: string | null): void {
  try {
    if (sectionId) sessionStorage.setItem(KEY, sectionId);
    else sessionStorage.removeItem(KEY);
  } catch { /* storage unavailable — the fallback is optional, the link still works */ }
}

/** The pending hint, consumed. Reading clears it so a later, unrelated hash cannot reuse it. */
export function takeFallbackSection(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}
