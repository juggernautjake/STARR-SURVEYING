// scripts/lib/design-observe.mjs — the walk that reads what a page IS, not what it looks like.
//
// Phase D1 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// The tracer (`scripts/lib/design-capture.mjs`) records GEOMETRY: what is where, at what size, so a
// default design can be 1:1 with the served page. This records MEANING: what a person can operate,
// what the page holds, what it calls. Two walks rather than one, because they keep different things
// and merging them would produce a payload that is bad at both — the tracer drops a `<form>` that
// paints nothing, and this one does not care that it is 640px wide.
//
// Runs inside the page via Playwright, so it may not close over anything in this module.

/**
 * Everything one route walk sees.
 *
 * The shell is excluded the same way and for the same reason as in the tracer: the sidebar is
 * identical on 176 routes, so counting its seventeen links as functions of `/admin/jobs` would make
 * every dossier say the same thing.
 */
export const OBSERVE = () => {
  const root = document.querySelector('.admin-layout__content') ?? document.body;

  const cleanClasses = (el) => (typeof el.className === 'string' ? el.className : '')
    .split(/\s+/)
    .filter(Boolean)
    .filter((c) => !/^jsx-([0-9a-f]{8,}|undefined)$/i.test(c));

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  };

  const words = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);

  // ── Headings ────────────────────────────────────────────────────────────────────────────────
  const headings = [...root.querySelectorAll('h1, h2, h3')]
    .filter(visible)
    .map((el) => words(el))
    .filter(Boolean)
    .slice(0, 30);

  // ── Controls: what a person can operate ─────────────────────────────────────────────────────
  const controls = [];
  const seenControl = new Set();
  for (const el of root.querySelectorAll('button, a[href], input, select, textarea, [role="tab"]')) {
    if (!visible(el)) continue;
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const type = (el.getAttribute('type') || '').toLowerCase();
    let kind = 'button';
    if (role === 'tab') kind = 'tab';
    else if (tag === 'a') kind = 'link';
    else if (tag === 'select') kind = 'select';
    else if (tag === 'textarea') kind = 'textarea';
    else if (tag === 'input') kind = (type === 'checkbox' || type === 'radio') ? 'checkbox' : 'input';

    const text = words(el)
      || el.getAttribute('aria-label')
      || el.getAttribute('placeholder')
      || el.getAttribute('title')
      || '';
    const classes = cleanClasses(el);

    // One row per (signature + words). A table with forty "Open" links is one control repeated,
    // and forty rows of it would bury the twelve controls that are actually different.
    const key = `${kind}|${classes.slice(0, 2).join('.')}|${text.slice(0, 24)}`;
    if (seenControl.has(key)) continue;
    seenControl.add(key);

    controls.push({
      tag,
      classes,
      text,
      kind,
      detail: tag === 'a' ? (el.getAttribute('href') || '') : type,
      disabled: !!el.disabled,
    });
    if (controls.length >= 400) break;
  }

  // ── Regions: what the page holds ────────────────────────────────────────────────────────────
  const regions = [];
  const pushRegion = (el, kind, count) => {
    if (!visible(el)) return;
    regions.push({
      tag: el.tagName.toLowerCase(),
      classes: cleanClasses(el),
      kind,
      label: (el.getAttribute('aria-label')
        || el.querySelector('h1, h2, h3, caption, legend')?.textContent?.replace(/\s+/g, ' ').trim()
        || '').slice(0, 60),
      count,
    });
  };

  for (const el of root.querySelectorAll('table')) pushRegion(el, 'table', el.querySelectorAll('tbody tr').length);
  for (const el of root.querySelectorAll('form')) pushRegion(el, 'form', el.querySelectorAll('input, select, textarea').length);
  for (const el of root.querySelectorAll('ul, ol')) {
    // A nav is a list of links; a list is a list of records. Told apart by what is inside, because
    // the markup is the same and the difference is the whole point of the distinction.
    const items = el.querySelectorAll(':scope > li');
    if (items.length < 2) continue;
    const linky = [...items].filter((li) => li.querySelector('a')).length;
    pushRegion(el, linky === items.length ? 'nav' : 'list', items.length);
  }
  for (const el of root.querySelectorAll('[role="dialog"], dialog')) pushRegion(el, 'dialog', 0);
  for (const el of root.querySelectorAll('.admin-empty, [data-empty]')) pushRegion(el, 'empty', 0);

  // Card grids and toolbars have no element of their own — they are a class convention. Matched on
  // the app's own vocabulary rather than on layout, because a `display:grid` div could be anything.
  for (const el of root.querySelectorAll('[class*="-card"], [class*="__card"]')) {
    if (regions.length > 180) break;
    pushRegion(el, 'card', 0);
  }
  for (const el of root.querySelectorAll('[class*="toolbar"], [class*="__actions"], [class*="__filters"]')) {
    if (regions.length > 190) break;
    pushRegion(el, 'toolbar', el.querySelectorAll('button, select, input').length);
  }

  // ── THE STATES THIS PAGE CAN BE IN ───────────────────────────────────────────────────────────
  //
  // V2 of DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md. Owner: *"each page that has tabs and things
  // that close elements and reveals different info and stuff has its own like, sub page listed."*
  //
  // A page with three tabs is three things to look at, and the design system recorded it as one.
  // Found here rather than declared in a config because a hand-maintained list of tabs is wrong
  // the first time somebody adds one — and because half of what the owner is describing is not a
  // tab bar at all. Three shapes, in the order they are worth trusting:
  //
  //   1. a real tablist — `[role="tab"]`, which carries `aria-selected` and so says which state
  //      is showing without anybody guessing;
  //   2. a <details> disclosure, whose `open` attribute is the same fact in HTML's own vocabulary;
  //   3. this app's own tab convention — a class ending `__tab`/`-tab` with an `--active`/`is-on`
  //      sibling. Matched on the vocabulary the codebase actually uses, because a `<button>` in a
  //      row of buttons could be anything.
  //
  // THE KEY IS THE URL WHERE THERE IS ONE. `?tab=invoices` is what makes a state addressable, and
  // addressable is the whole point — a design of a state nobody can link to cannot be reviewed.
  //
  // `addressable` is 'yes' or 'unknown', NEVER 'no', and the distinction is the honest one. A tab
  // rendered as `<a href="?tab=x">` proves itself. A tab rendered as a `<button>` that calls
  // `router.replace` — which is what /admin/billing does, correctly — looks identical from here
  // and cannot be told apart from one holding its state in a variable. Reporting those as "not
  // addressable" said something false about a page that had just been given `?tab=` on purpose.
  //
  // Proving 'unknown' either way needs a second navigation, which belongs to the walk that is
  // already navigating — V4, when it traces a state.
  const states = [];
  const seenState = new Set();
  const slug = (t) => (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const paramNames = ['tab', 'view', 'section', 'panel', 'mode'];
  const url = new URL(window.location.href);
  const activeParam = paramNames.find((n) => url.searchParams.has(n)) ?? null;

  const pushState = (key, label, kind, selected, addressable) => {
    if (!key || seenState.has(key)) return;
    seenState.add(key);
    states.push({ key, label: (label || '').slice(0, 60), kind, selected: !!selected, addressable: addressable ? 'yes' : 'unknown' });
  };

  // 1 — a real tablist.
  for (const el of root.querySelectorAll('[role="tab"]')) {
    if (!visible(el)) continue;
    const label = words(el).replace(/\s*\d+$/, '').trim();
    // An <a href="?tab=x"> tab hands over its own key; a <button> has to be slugged.
    const href = el.getAttribute('href') || '';
    let key = null;
    let addressable = false;
    if (href.includes('=')) {
      try {
        const u = new URL(href, window.location.origin);
        const name = paramNames.find((n) => u.searchParams.has(n));
        if (name) { key = u.searchParams.get(name); addressable = true; }
      } catch { /* a relative or malformed href is not evidence of anything */ }
    }
    if (!key) key = slug(label);
    pushState(key, label, 'tab', el.getAttribute('aria-selected') === 'true', addressable || !!activeParam);
  }

  // 2 — HTML's own disclosure.
  for (const el of root.querySelectorAll('details')) {
    if (!visible(el)) continue;
    const label = words(el.querySelector('summary') || el);
    pushState(slug(label), label, 'disclosure', el.hasAttribute('open'), false);
  }

  // 3 — the app's own tab convention, for the strips that never say `role="tab"`.
  //
  // ── ONLY WHEN THERE IS NO REAL TABLIST (V7) ──────────────────────────────────────────────────
  //
  // A page can have a tab bar INSIDE a tab. /admin/hours has six portal tabs, and its Approvals
  // panel has four more of its own — Pending, All Entries, Advances, Bonuses, class `tl-tabs__btn`.
  // Rule 3 matched those and the route was recorded as having ten states. Four of them were not
  // states of the route at all, and they could never be reached: `?tab=pending` means nothing to
  // the outer strip, and after clicking one the selected tab is still Approvals — so the tracer
  // reported "could not reach it" four times for a page that was behaving correctly.
  //
  // The verify step catching that is the system working: without it the route would have four
  // identical Approvals captures filed under four names, which looks like a finished job.
  //
  // A state of a state is not a state of the route, so when rule 1 found a genuine tablist, that
  // tablist IS the page's states and rule 3 has nothing to add. Pages whose strip is CSS-only —
  // `/admin/learn/manage` and its twelve — have no rule-1 states and are untouched by this.
  const hasRealTablist = states.length > 1;
  //
  // The CSS attribute selector is a substring match, so `[class*="-tab"]` also matches `-table`.
  // On /admin/marketing that turned four table headers and a paragraph of prose into "states",
  // with keys like `campaign-spend-impr-clicks-ctr-cpc-conv-`. The selector still does the coarse
  // filtering because it is fast; the boundary check below is what decides.
  // Only the TRAILING boundary matters. `__tab` always follows a block name — `job-detail__tab` —
  // so requiring a non-letter before it matched nothing and silently dropped every tab on
  // /admin/settings, taking six states to zero. What has to be excluded is `-table`, and that is a
  // letter AFTER the stem, not before it.
  // Three conventions in this codebase, found one at a time by running it:
  //   job-detail__tab          the stem itself
  //   payroll-tabs__btn        an item inside a tabs CONTAINER — `tabs__` is the tell
  //   mkt-tab--active         a modifier
  // and one that must NOT match: anything-table. `-tab` followed by a letter is a different word.
  const TAB_CLASS = /(__tab|-tab)([^a-z]|$)|tabs?__/;
  for (const el of hasRealTablist ? [] : root.querySelectorAll('[class*="__tab"], [class*="-tab"], [class*="tabs__"]')) {
    if (!visible(el)) continue;
    const classes = cleanClasses(el);
    if (!classes.some((c) => TAB_CLASS.test(c))) continue;
    // A state you can switch TO is something you can click. `tabs__` matches every child of a tab
    // strip, and /admin/marketing has a hint paragraph in there — "Funnel, cost per stage,
    // attribution coverage." was being recorded as a tab. The class says where an element lives;
    // the tag says whether it is a control.
    const tag = el.tagName.toLowerCase();
    if (tag !== 'button' && tag !== 'a' && el.getAttribute('role') !== 'tab') continue;
    // The CONTAINER of a tab strip usually carries the same stem; only the items are states.
    if (classes.some((c) => /tabs?$/.test(c) && !/--/.test(c)) && el.children.length > 1) continue;
    const label = words(el).replace(/\s*\d+$/, '').trim();
    if (!label) continue;
    const on = classes.some((c) => /--active|--on|is-on|is-active/.test(c)) || el.getAttribute('aria-pressed') === 'true';
    pushState(slug(label), label, 'tab', on, !!activeParam);
  }

  return {
    title: document.title || '',
    headings,
    controls,
    // ── ONE STATE IS NOT A STATE ────────────────────────────────────────────────────────────
    //
    // A tab strip has at least two tabs; a lone <details> is a collapsible paragraph. /admin/audit
    // reported a single state called `1-field` (a filter count in a <summary>) and /admin/support/new
    // reported `auto-attach-browser-context-recommended` (a form option). Both are real disclosures
    // and neither is a view of the page worth designing separately.
    //
    // Counted PER KIND, so a page with one tab and one <details> reports neither, while a page with
    // four tabs and one stray <details> keeps its tabs.
    // Capped like the others. A page reporting eighty states has found a list, not a tab bar.
    states: (() => {
      const byKind = {};
      for (const st of states) byKind[st.kind] = (byKind[st.kind] ?? 0) + 1;
      return states.filter((st) => byKind[st.kind] > 1).slice(0, 24);
    })(),
    stateParam: activeParam,
    regions: regions.slice(0, 200),
  };
};

/**
 * Wait until the page is actually a page.
 *
 * Found by measurement: `/admin/audit` and `/admin/billing` both derived to an empty inventory, and
 * neither is an empty page — they render `⏳ Loading...` for 4 and 11 seconds respectively while the
 * dev server compiles the route. A fixed settle time measures the SERVER's mood, not the page, and
 * what it produced was a dossier saying those pages have nothing on them.
 *
 * So the walks wait for the content root to exist and to hold something operable, and give up
 * loudly rather than quietly recording the spinner. The caller decides what to do with `false` —
 * for the deriver and the tracer alike, the answer is "report it and store nothing".
 */
/**
 * Is this a DEV ERROR rather than a page? — V7.
 *
 * `waitForPageReady` asks whether something rendered. A Next.js dev error overlay renders: it has a
 * heading, buttons and links, so it answers yes, and the capture that follows stores the OVERLAY as
 * a page's locked default. Nothing in this walk would notice — the element count is plausible, the
 * page "loaded", and the record would say `/admin/x` while holding a screenshot of a stack trace.
 *
 * That is not a hypothetical. Editing any file under `app/` or `lib/` while a sweep is running makes
 * the dev server recompile, and this repo already carries a note earned the hard way: never edit
 * files mid-run, because the recompiles show up as 500s and 404s. The note treats the sweep as
 * fragile. The honest fix is for the sweep to KNOW a compile error when it sees one, rather than
 * asking a person to keep still for an hour.
 *
 * Detected three ways, because any one of them alone is brittle:
 *   · `<nextjs-portal>` — the custom element the 14.x overlay mounts itself into
 *   · `[data-nextjs-dialog]` / `[data-nextjs-error]` — its inner scaffolding
 *   · the words a compile failure puts on screen, for when the markup changes under us
 *
 * Returns the reason it is broken, or null. A reason rather than a boolean so the caller can say
 * WHICH page failed and why, which is the difference between a fixable report and a mystery.
 */
export async function devErrorOn(page) {
  return page.evaluate(() => {
    if (document.querySelector('nextjs-portal')) return 'next dev error overlay (nextjs-portal)';
    if (document.querySelector('[data-nextjs-dialog], [data-nextjs-error], [data-nextjs-error-overlay]')) {
      return 'next dev error overlay (dialog)';
    }
    // Text is the fallback, and is deliberately narrow: "error" alone appears on healthy pages all
    // over this app — an error column, an empty state, a validation hint. These four phrases are
    // the build's own, and none of them is something a working admin screen says about itself.
    const t = (document.body.innerText || '').slice(0, 4000);
    for (const phrase of ['Failed to compile', 'Unhandled Runtime Error', 'Module not found', 'Build Error']) {
      if (t.includes(phrase)) return `dev build failure: "${phrase}"`;
    }
    return null;
  }).catch(() => null);
}

export async function waitForPageReady(page, { timeout = 25_000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => {
      // `?? document.body` matches what the tracer and the observer use as their root, and it is
      // not a convenience: `/admin/cad` renders a full-screen shell of its own and never mounts
      // `.admin-layout__content` at all. Requiring that wrapper meant this returned false for the
      // full 25s on a page that was finished in under three, and the tracer filed it as "never
      // finished loading" — the fifth time an instrument in this system reported its own blind
      // spot as a property of the app.
      const root = document.querySelector('.admin-layout__content') ?? document.body;
      if (!root) return false;
      const text = (root.innerText || '').trim();
      // A root containing only a loading indicator is not a rendered page. Checked by CONTENT
      // rather than by the absence of a spinner class, because every page spells its spinner
      // differently and a class list is a thing that goes stale.
      if (/^(⏳\s*)?loading[.…]*$/i.test(text)) return false;
      return root.querySelectorAll('h1, h2, button, a[href], table, form, input').length > 0;
    }).catch(() => false);
    if (ready) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

/**
 * Which state is showing right now — V4.
 *
 * Exported so the TRACER can ask the same question the OBSERVER answered when it listed the
 * states. The first version of this lived in `trace-defaults.mjs` with its own rules, and it
 * returned "settings" on every page of /admin/settings — because the first element in the content
 * with `--active` in its class is the BREADCRUMB, not a tab. Every state was reported unreachable
 * and none was stored.
 *
 * That is the fourth time in this session that two ends of one pair used different rules for the
 * same question. It is one function now, and the tracer imports it.
 *
 * Runs inside the page via Playwright, so it may not close over anything in this module.
 */
export const SELECTED_STATE = () => {
  const root = document.querySelector('.admin-layout__content') ?? document.body;
  const slug = (t) => (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const label = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, '').length === 0
    ? ''
    : (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().replace(/\s*\d+$/, '').slice(0, 80);
  // The same class rule the observer uses to FIND states. Duplicated as a literal rather than
  // shared because this function is serialised into the browser and cannot close over anything.
  const TAB_CLASS = /(__tab|-tab)([^a-z]|$)|tabs?__/;

  // A real tablist says so itself.
  const aria = root.querySelector('[role="tab"][aria-selected="true"]');
  if (aria) {
    const href = aria.getAttribute('href') || '';
    if (href.includes('=')) {
      try {
        const u = new URL(href, window.location.origin);
        for (const n of ['tab', 'view', 'section', 'panel', 'mode']) if (u.searchParams.has(n)) return u.searchParams.get(n);
      } catch { /* not a URL we can read */ }
    }
    return slug(label(aria));
  }

  // Otherwise: an element that is BOTH a tab by class AND marked active. Requiring both is the
  // whole fix — a breadcrumb is marked active and is not a tab.
  for (const el of root.querySelectorAll('button, a, [role="tab"]')) {
    const cls = typeof el.className === 'string' ? el.className : '';
    const classes = cls.split(/\s+/).filter(Boolean);
    if (!classes.some((c) => TAB_CLASS.test(c))) continue;
    const on = classes.some((c) => /--active|--on|is-on|is-active/.test(c)) || el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true';
    if (on) return slug(label(el));
  }
  return null;
};
// ── OPENING A STATE, ONCE, FOR EVERYTHING THAT NEEDS TO ─────────────────────────────────────────
//
// V6. Three tools now have to put a page into one of its tabs before they look at it: the tracer
// (capture the tab's default), the conformance sweep (compare the tab against that default), and
// the deriver (inventory what is on the tab). All three were about to hold their own copy of "try
// the URL, fall back to clicking the label, check where you landed".
//
// That is precisely the shape that has cost this session four separate bugs: two ends answering the
// same question with two slightly different rules, and the disagreement showing up as an EMPTY
// rather than an error. `selectedStateKey` already exists because the tracer and the observer had
// drifted on "which tab is showing" and every tab came back as the breadcrumb.
//
// So it is one function, here, and the three callers import it.
//
// ── AND WHY IT RETURNS false RATHER THAN THROWING ───────────────────────────────────────────────
//
// Not reaching a tab is a normal outcome, not a fault. `/admin/my-pay` has three states nested
// INSIDE another tab, and no amount of URL guessing will reach them from the outside. The caller
// decides what that means: the tracer skips and says so, the sweep treats it as a failed check.
// What none of them may do is proceed as though it worked — a capture of the wrong tab compared
// against the right tab's record reports a page that has changed beyond recognition.

/** Which state is showing right now, by the observer's own rule. Null if it cannot tell. */
export async function selectedStateKey(page) {
  return page.evaluate(SELECTED_STATE).catch(() => null);
}

/**
 * Click the control that opens this state. Used when the URL was not read.
 *
 * Matches on the label when the caller has one, and on the SLUG of the label otherwise — because
 * the two callers know different things. The tracer and the deriver hold a full state record
 * (`{ key, label }`); the conformance sweep starts from a stored design and only has the key. Both
 * end at the same element, since `SELECTED_STATE` derives a key by slugging exactly this text.
 *
 * The tracer and the sweep each had their own copy of this and they matched on different fields —
 * `label.toLowerCase()` in one, `slug(text)` in the other. They happened to agree. Two rules that
 * happen to agree is the setup for the bug, not the absence of it.
 */
export async function clickState(page, state) {
  return page.evaluate(({ key, label }) => {
    const root = document.querySelector('.admin-layout__content') ?? document.body;
    const slug = (t) => (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const text = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().replace(/\s*\d+$/, '');
    for (const el of root.querySelectorAll('button, a, [role="tab"]')) {
      const t = text(el);
      if (label && t.toLowerCase() === String(label).toLowerCase()) { el.click(); return true; }
      if (slug(t) === key) { el.click(); return true; }
    }
    return false;
  }, { key: state.key, label: state.label ?? null }).catch(() => false);
}

/**
 * Put the page into one of its states and CONFIRM it got there.
 *
 * `?tab=` first, because a page that reads the URL lands in one navigation and starts clean. Then
 * the label click, because plenty of tab strips hold their state in a variable and are perfectly
 * correct to — `/admin/billing` uses `router.replace`, which is right, and is indistinguishable
 * from a variable when you are only reading the DOM.
 *
 * Returns true only when the observer agrees the requested state is the one showing.
 *
 * ── WHY IT POLLS, AND DOES NOT SLEEP (V7) ───────────────────────────────────────────────────────
 *
 * It used to wait a flat 1200ms after the click and then judge. Three tabs — `equipment ·
 * cleanup-queue`, `jobs · activity`, `marketing · connection-uploads` — came back "could not reach
 * it" from a full sweep and then opened FIRST TRY when probed one at a time. Nothing was wrong with
 * any of them. They were cold: a dev server compiling a panel on demand does not answer in 1200ms,
 * and the check read the tab that was still showing.
 *
 * That is the same fixed-wait trap that once made the route walk store 4 of 51 pages instead of 26.
 * A sleep encodes a guess about how slow the slowest machine is on its worst run; the failure is
 * silent and looks exactly like a genuinely unreachable tab, which is the dangerous part — three of
 * them were about to be written down as a structural finding.
 *
 * So: poll for the state we asked for until a deadline, and settle only once it is there.
 */
export async function openState(page, base, route, state, { param = 'tab', settle = 1200 } = {}) {
  /** Read the selected key until it is `want`, or the deadline passes. Returns the last reading. */
  const until = async (want, ms) => {
    const deadline = Date.now() + ms;
    let on = await selectedStateKey(page);
    while (on !== want && Date.now() < deadline) {
      await page.waitForTimeout(250);
      on = await selectedStateKey(page);
    }
    return on;
  };

  await page.goto(`${base}${route}?${param}=${encodeURIComponent(state.key)}`, {
    waitUntil: 'domcontentloaded', timeout: 60_000,
  });
  await waitForPageReady(page);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

  // The URL may be read, ignored, or read slowly. Only the third case needs the wait, and only the
  // first iteration pays for it — `until` returns the moment the key matches.
  let on = await until(state.key, settle * 4);
  if (on !== state.key && await clickState(page, state)) {
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    on = await until(state.key, settle * 10);
  }
  if (on === state.key) {
    // Reached. Give the panel its own moment to finish drawing before anyone captures it.
    await page.waitForTimeout(settle);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    return true;
  }
  return false;
}
