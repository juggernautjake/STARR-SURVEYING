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

  return {
    title: document.title || '',
    headings,
    controls,
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
export async function waitForPageReady(page, { timeout = 25_000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => {
      const root = document.querySelector('.admin-layout__content');
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
