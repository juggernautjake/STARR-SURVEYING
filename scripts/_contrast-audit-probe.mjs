// scripts/_contrast-audit-probe.mjs — the function that measures contrast INSIDE the page.
//
// Extracted 2026-08-31 (F2, the browser half). It was inline in `check-portal-themes.mjs`, which
// walks ROUTES. The research portal's Review tabs are state, not routes: nothing route-based ever
// renders the Easements, Survey Data or coherence panels, which is where thirteen extractions and
// four contrast fixes live. `e2e/research-responsive.spec.ts` drives those tabs and runs this same
// probe over each one.
//
// Shared rather than copied for the reason G12 records: four hand-written copies of one list is a
// defect this repository has already shipped, and a probe carrying five hard-won corrections — the
// gradient case below among them — is the worst possible thing to have two of.
//
// It is a page function: it is serialised and evaluated in the browser, so it may close over
// NOTHING from this module. Everything it needs arrives in `limits`.
// The measuring function runs in the page: it needs getComputedStyle and the real stacking order.
export const AUDIT = (limits) => {
  const parse = (css) => {
    const m = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(css || '');
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  };
  const lum = (c) => {
    const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const la = lum(a); const lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  /** What is actually painted behind this element — walk up until something is not transparent. */
  const behind = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0.5) return bg;
      // ── A GRADIENT IS NOT A COLOUR, AND GUESSING ONE MANUFACTURES A FINDING ──────────────────
      //
      // The hub greeting is a brand hero: white text on `linear-gradient(135deg, …)`, with no
      // background-COLOR anywhere in its ancestry. This walk read `backgroundColor` only, found
      // `rgba(0,0,0,0)` all the way to the root, fell back to the page, and reported white text
      // at 1.05:1 — on all eleven themes, light and dark alike, which is the tell: a real contrast
      // defect does not have the same ratio on a white page and a black one.
      //
      // Four findings per run, about a banner that is perfectly legible. This is the fifth time an
      // instrument in this system has reported its own blind spot as a property of the app, and
      // the cost is always the same — a confidently wrong measurement is indistinguishable from a
      // discovery, and it buries the real ones.
      //
      // Answering "unknown" rather than a number is the honest result. What is behind the text is
      // a ramp of colours, and no single ratio describes it.
      if (getComputedStyle(node).backgroundImage !== 'none') return null;
      node = node.parentElement;
    }
    const root = parse(getComputedStyle(document.documentElement).backgroundColor);
    return root && root.a > 0.5 ? root : { r: 255, g: 255, b: 255, a: 1 };
  };

  const pageBg = behind(document.body) ?? { r: 255, g: 255, b: 255, a: 1 };
  const pageIsDark = lum(pageBg) < 0.4;

  const islands = [];
  const unreadable = [];
  // Counted and reported, never silently dropped: "we did not look at 4 things" and "we looked at
  // 4 things and they were fine" are different statements, and a check that cannot tell them apart
  // is one you can quietly narrow to nothing.
  const unmeasurable = [];
  const seen = new Set();

  const scope = document.querySelector('.admin-layout__content') ?? document.body;
  scope.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 12) return;             // too small to read as a surface
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return;

    const cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    const key = `${el.tagName}.${cls}`;

    // ── Unthemed island: a big pale surface sitting in a dark app ────────────────────────────────
    const bg = parse(s.backgroundColor);
    if (pageIsDark && bg && bg.a > 0.5 && lum(bg) > 0.7 && r.width * r.height > 12000) {
      if (!seen.has(`i:${key}`)) { seen.add(`i:${key}`); islands.push({ what: key, bg: s.backgroundColor, area: Math.round(r.width * r.height) }); }
    }

    // ── Unreadable text: only elements that actually own visible text ───────────────────────────
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || '').trim().length > 1);
    if (!ownText) return;

    // ── AN EMOJI IS NOT PAINTED IN `color` ──────────────────────────────────────────────────────
    //
    // `.pipeline-stepper__stage-icon` renders 📋 on the brand navy `#1d3095`, and the element's
    // computed `color` is `#0f172a` — inherited, unused, and irrelevant: a colour emoji is a glyph
    // with its own palette, and the CSS colour never reaches a pixel. Measuring it reported 1.62:1
    // on the review screen, on every one of the eight tabs, about an icon that is perfectly clear.
    //
    // Sixth time an instrument in this system has reported its own blind spot as a property of the
    // app. The tell is the same one the gradient case above records: the number does not move when
    // the theme does, because nothing being measured is on the screen.
    //
    // Only text that is ENTIRELY pictographs is skipped. "⚠ Warnings" is a real label with a real
    // colour and is measured — dropping anything that merely CONTAINS an emoji would have hidden
    // the warning filter chip at 3.19:1, which was a genuine finding in the same run.
    const own = [...el.childNodes].filter((n) => n.nodeType === 3)
      .map((n) => n.textContent).join('').trim();
    if (own && !/[\p{L}\p{N}]/u.test(own) && /\p{Extended_Pictographic}/u.test(own)) return;
    const fg = parse(s.color);
    if (!fg || fg.a < 0.5) return;
    const size = parseFloat(s.fontSize) || 16;
    const bold = (parseInt(s.fontWeight, 10) || 400) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? limits.large : limits.normal;
    const paper = behind(el);
    if (!paper) {
      if (!seen.has(`u:${key}`)) { seen.add(`u:${key}`); unmeasurable.push({ what: key, why: 'sits on a gradient' }); }
      return;
    }
    const got = ratio(fg, paper);
    if (got < need && !seen.has(`t:${key}`)) {
      seen.add(`t:${key}`);
      unreadable.push({ what: key, ratio: Math.round(got * 100) / 100, need, size: Math.round(size * 10) / 10, color: s.color });
    }
  });

  return { pageIsDark, pageBg: `rgb(${pageBg.r}, ${pageBg.g}, ${pageBg.b})`, islands, unreadable, unmeasurable };
};
