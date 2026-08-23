// scripts/lib/design-capture.mjs — the walk that turns a live page into candidate elements.
//
// Shared by scripts/design-import-page.mjs (trace ONE page into a design) and
// scripts/design-coverage-sweep.mjs (trace EVERY page and report what the catalogue cannot name).
//
// It lives here because the two callers must walk the page identically. If the sweep kept nodes the
// importer drops, its coverage report would name gaps that never reach a design — a report nobody
// could act on, and one that would slowly diverge without anything failing.
//
// The function is serialised into the browser by Playwright, so it may not close over anything in
// this module: everything it needs is passed as its argument.

/**
 * Runs INSIDE the page.
 *
 * Keeps a node if the catalogue might know it (it wears one of the catalogue's classes) or if it is
 * a leaf that carries text or takes input. Everything else is layout scaffolding, which is the part
 * a mockup is redrawing anyway — see the note at the top of lib/design/import.ts about why this
 * walk is deliberately lossy.
 */
export const CAPTURE = (known) => {
  const knownClasses = new Set(known);
  const LEAF = new Set(['button', 'a', 'input', 'select', 'textarea', 'label', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'td', 'th', 'li', 'strong', 'code']);
  const out = [];
  const scrollY = window.scrollY;

  const depthOf = (el) => { let d = 0; for (let p = el.parentElement; p; p = p.parentElement) d += 1; return d; };

  // ── Only the PAGE, not the shell it sits in ───────────────────────────────────────────────────
  //
  // The first run of this imported 17 sidebar links, the topbar title and the XP pill into a mockup
  // of /admin/jobs. The sidebar is identical on all 147 admin routes and is not what anybody is
  // redesigning when they redesign the jobs page — and 30 nodes of chrome buries the 34 that are
  // actually the page. `.admin-layout__content` is the app's own name for "the page part", the
  // same boundary `forms.css` is scoped to.
  const root = document.querySelector('.admin-layout__content') ?? document.body;
  const origin = root.getBoundingClientRect();

  for (const el of root.querySelectorAll('*')) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    // Off-screen furniture — a closed drawer, a print block — is not what the page looks like.
    if (r.bottom + scrollY < 0 || r.right < 0) continue;

    // styled-jsx stamps every element it styles with a generated `jsx-244ffbc8b9e395f9`. Those are
    // build output, not names: they change whenever the component's CSS changes, they cannot be
    // curated, and left in they dominated the coverage report with rows nobody could ever act on.
    // The element's REAL classes sit alongside them and are what this is about.
    const classes = (typeof el.className === 'string' ? el.className : '')
      .split(/\s+/)
      .filter(Boolean)
      // `jsx-undefined` too: styled-jsx emits it when a component's style block is conditional, and
      // seven routes reported `h1.jsx-undefined` as a coverage gap on the first full sweep.
      .filter((c) => !/^jsx-([0-9a-f]{8,}|undefined)$/i.test(c));
    const tag = el.tagName.toLowerCase();
    const ownText = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    // A visible surface — a card, a panel, a toolbar — is an element even when it is a bare div.
    const transparent = /^(transparent|rgba\(0,\s*0,\s*0,\s*0\))$/i;
    const paints = !transparent.test(style.backgroundColor)
      || (parseFloat(style.borderTopWidth) > 0 && !transparent.test(style.borderTopColor));

    const catalogueMightKnowIt = classes.some((c) => knownClasses.has(c));
    const isContentLeaf = LEAF.has(tag) && (ownText.length > 0 || ['input', 'select', 'textarea'].includes(tag));
    if (!catalogueMightKnowIt && !isContentLeaf && !paints) continue;

    out.push({
      tag,
      classes,
      // A placeholder is what an empty field SAYS, and an imported field with no words in it is a
      // grey box that tells the next reader nothing.
      text: ownText || el.getAttribute('placeholder') || '',
      // Relative to the content root, not the window: with the sidebar included in the origin,
      // every imported element would land 240px to the right of where it belongs, and the mobile
      // and desktop views would not even share a coordinate space.
      rect: {
        x: Math.round(r.left - origin.left),
        y: Math.round(r.top - origin.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
      },
      styles: {
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        color: style.color,
        background: style.backgroundColor,
        radius: style.borderTopLeftRadius,
      },
      paints,
      depth: depthOf(el),
      // Every class worn by an ancestor, so the matcher can tell "nothing knows this element" from
      // "this is a PART of an element something already knows". `.admin-page-header__crumb` is a
      // child of the catalogued `.admin-page-header__crumbs`; reporting it as a coverage gap sends
      // somebody to curate a piece of an entry that already exists. That distinction is the
      // difference between a gap list you can work through and one you argue with.
      ancestorClasses: (() => {
        const seen = [];
        for (let p = el.parentElement; p && p !== root.parentElement; p = p.parentElement) {
          const cls = typeof p.className === 'string' ? p.className : '';
          for (const c of cls.split(/\s+/)) if (c && !/^jsx-[0-9a-f]{8,}$/i.test(c)) seen.push(c);
        }
        return seen;
      })(),
    });
    // A hard ceiling. A page with 900 kept nodes is a page this tool cannot help with anyway, and
    // silently truncating would be worse than saying so — the caller reports the cap.
    if (out.length >= 600) break;
  }
  return out;
};
