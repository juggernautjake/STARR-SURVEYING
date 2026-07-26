# Contrast sweep — how to run it

A paste-into-devtools (or Playwright `evaluate`) version of the measurement used in the final-QA
walkthrough's skin sweep. The maths lives in **`lib/dnd/theme-contrast.ts`** and is unit-tested
(`__tests__/dnd/contrast.test.ts`); this is the DOM half, which can't be.

That module already owned WCAG contrast for the theme-token audit. The sweep needed two things it lacked —
`flattenStack` (it composited a single layer, not a stack) and `aaThresholdForSize` (it had per-ROLE
thresholds, not the per-SIZE rule WCAG states) — so those were added there. A second contrast module was
written first and deleted: the repo's own `no-orphan-modules` guard caught it as unreachable, which was the
right call twice over, since it was also a duplicate.

## Why it isn't just `color` vs `background-color`

A sheet in this app is translucent panels over a skin base. Reading the first non-transparent background
you meet and comparing against it **produces false alarms**: an early version of this sweep read
`rgba(0, 0, 0, 0.08)` as pure black, scored purple text on a light pink page at 1.62:1, and flagged 42
healthy samples. Every translucent layer has to be composited onto the first opaque one beneath before the
ratio means anything.

The other easy mistake is the threshold. WCAG AA wants **4.5:1** for body text but only **3:1** for large
text (≥24px, or ≥18.66px bold) — so a 23px headline at 3.85 is a genuine miss while the same colour at
24px is fine.

## The snippet

```js
(() => {
  const parse = (c) => { const m = (c || '').match(/[\d.]+/g); if (!m || m.length < 3) return null;
    return { r: +m[0], g: +m[1], b: +m[2], a: m[3] != null ? +m[3] : 1 }; };
  const over = (t, b) => ({ r: t.r*t.a + b.r*(1-t.a), g: t.g*t.a + b.g*(1-t.a), b: t.b*t.a + b.b*(1-t.a), a: 1 });
  const bgOf = (el) => {
    const stack = []; let n = el;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; }
      n = n.parentElement;
    }
    const base = parse(getComputedStyle(document.documentElement).backgroundColor) ?? { r:255,g:255,b:255,a:1 };
    let out = stack.length && stack[stack.length-1].a >= 1 ? stack.pop() : { ...base, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) out = over(stack[i], out);
    return out;
  };
  const lum = (c) => { const f = [c.r, c.g, c.b].map(v => { const s = v/255;
    return s <= 0.03928 ? s/12.92 : Math.pow((s+0.055)/1.055, 2.4); });
    return 0.2126*f[0] + 0.7152*f[1] + 0.0722*f[2]; };
  const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg);
    return +(((Math.max(a,b) + 0.05) / (Math.min(a,b) + 0.05)).toFixed(2)); };

  const rows = [...document.querySelectorAll('*')]
    .filter(e => e.children.length === 0 && (e.innerText || '').trim().length > 1)
    .map(e => { const cs = getComputedStyle(e); const fg = parse(cs.color); if (!fg) return null;
      const size = parseFloat(cs.fontSize) || 16;
      const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
      const need = (size >= 24 || (bold && size >= 18.66)) ? 3 : 4.5;
      const r = ratio(fg, bgOf(e));
      return { r, need, pass: r >= need, size, text: (e.innerText || '').trim().slice(0, 30) }; })
    .filter(Boolean)
    .sort((a, b) => a.r - b.r);

  const fails = rows.filter(x => !x.pass);
  console.table(fails.slice(0, 25));
  return { sampled: rows.length, failing: fails.length,
           median: rows[Math.floor(rows.length / 2)]?.r };
})()
```

## Reading the result

- Judge each row against **its own** `need`, not a flat 4.5 — that column is why.
- A handful of failures on decorative glyphs is usually noise; the signal is a real **control** failing, or
  the *same* element failing on every skin (which is what identified the roller tabs as a token problem
  rather than a theme problem).
- Run it once per skin. The light skins (`streamer` / `donata` / `jack`) are the ones `skin-tokens.ts`
  calls out, but the defects found so far were skin-independent.

## ⚠ 2026-07-26 — THE SNIPPET BELOW UNDER-REPORTS BACKGROUNDS. Read this first.

The version of this sweep that walks up through transparent ancestors has **two bugs, both of which invent
failures**, and both bit within a day of each other:

1. **It ignored `background-image`.** `.fld`'s surface is a gradient, so the walk stepped straight past the
   roller dock and composited its labels onto the page behind it.
2. **It took only the FIRST colour of the FIRST background layer.** The `background` shorthand can carry
   several images plus a colour, and `.dnd-sheet` uses exactly that: a 5% pink pinstripe **over an opaque
   light base**. Reading stop one of layer one gave a 5%-alpha pink, so the walk continued up to the dark site
   chrome and reported the section headings at **1.38:1**. A screenshot of the same heading shows dark purple
   text on light pink — **entirely legible**. Those findings were retracted, not fixed.

**The lesson, and it is the third variant of the same lesson in this file:** a contrast number is only as good
as the surface it was computed against. Ignoring gradients invents failures; so does reading one layer of
several. When a number looks alarming, **screenshot the element and look at it** before touching code.

**The corrected logic now lives in the library, not in this snippet.** `lib/dnd/theme-contrast.ts` exports
`backgroundLayers` / `backdropOf` / `measureText`, and `__tests__/dnd/contrast-backdrop.test.ts` pins both
bugs using the real computed values from the two elements that produced them. Prefer importing those over
re-deriving the maths here: a console one-liner has no tests and no reviewer, which is exactly how both
mistakes survived. The snippet below is kept because a live page still needs something to paste, and it now
mirrors the tested implementation.

Corrected `bgOf`, which composites a whole element (colour first, then image layers back-to-front) and only
walks up while the result is still translucent:

```js
const layersOf = (el) => {
  const cs = getComputedStyle(el);
  const out = [];
  const base = parse(cs.backgroundColor);
  if (base && base.a > 0) out.push(base);           // the colour sits UNDER the images
  // Split on top-level commas only — a gradient's own commas are inside parens.
  const imgs = (cs.backgroundImage || 'none').split(/,(?![^()]*\))/).map((s) => s.trim());
  for (const img of imgs.reverse()) {               // last-declared paints lowest
    const stops = allColors(img);                   // approximation: a gradient's first stop
    if (stops.length) out.push(stops[0]);
  }
  return out;                                       // bottom → top
};
const bgOf = (el) => {
  let cur = el, stack = [];
  while (cur) {
    const ls = layersOf(cur);
    stack = [...ls, ...stack];                      // ancestors are below descendants
    if (ls.some((l) => l.a >= 0.999)) break;        // fully opaque somewhere here: stop climbing
    cur = cur.parentElement;
  }
  let base = { r: 255, g: 255, b: 255, a: 1 };
  for (const l of stack) base = over(l, base);
  return base;
};
```

It is still an approximation for gradients (one stop stands in for a ramp), which is why the *active* roller
tab was checked against its own measured pill colour rather than a modelled one.

## RESOLVED 2026-07-26 — measured in a browser, and the previous fix was aimed at the wrong thing

The eyes-on check this file kept asking for finally ran: a dev server on a free port, a minted `dnd_session`
cookie, and the **five real skins that exist on live characters** (streamer, jack, donata, lazzuh, default).
Composited backgrounds read from the DOM, counting `background-image` gradients — the first attempt read only
`backgroundColor`, walked straight past `.fld`'s gradient, and produced numbers that would have been reported
as a regression. **A contrast measurement that ignores gradients is not a measurement.**

**What was actually wrong.** On a real 5e sheet the shell root carries `--panel-rgb: 255, 250, 254` *and*
`--ink: #5a1050` / `--muted: #8a3f7c` (all from `shellVarsFromHx`, all skin-derived and mutually consistent),
while `--hx-panel` is still the default `#0b1a2c`, `--hx-muted` the default `#a09b8c`, and **`--hx-panel-rgb`
— the token slice 23 added — is empty**. So the dock was light from one family and its labels were coloured
from the other. Slice 23 never reached this surface; its "the clamp's precondition now holds" was wrong here.

**The fix is the ink family, not the surface.** `RollerTemplateBar`'s inline styles now take `--muted`/`--ink`
— the family that paints the dock — with the `--hx-*` pair as fallback. `floatingRoller.css` had always used
that family; only the inline styles hadn't.

| skin | before | after (inactive) | after (active) |
|---|---|---|---|
| streamer | **2.59** ❌ | **6.36** ✅ | 10.81 |
| jack | **2.27–2.59** ❌ | **7.69** ✅ | 13.17 |
| donata | **2.78** ❌ | **6.32** ✅ | 12.17 |
| lazzuh (dark) | — | **6.13** ✅ | 11.48 |
| default (dark) | — | **7.54** ✅ | — |

The active tab could not keep the accent as its text colour: neither family's teal clears AA on a near-white
dock (**1.76:1**), so it uses the ink and stays recognisable through its teal border and tint.

**The dark skins were measured too, on purpose** — slice 21's lesson was that checking one dark skin makes a
wrong swap look right, and the inverse holds: a light-skin fix must be shown not to break the dark ones.

## Outstanding

**Resolved in slice 23 — and the debt was pointing at the wrong thing.** Slices 18–21 treated the roller
tab labels as a *token* choice (`--hx-muted` vs `--hx-text`) and recorded a debt to re-measure them in a
browser. Both tokens are clamped against the skin's **panel**, so neither could be right on a surface that
isn't panel-coloured — and `.fld`'s surface wasn't: `theme.css` pinned the 5e sheet's `--panel-rgb` to a
fixed dark purple on every skin, while the bespoke shells derived theirs from the skin. The dock is now
panel-derived in both scopes, so the clamp guarantees contrast against the colour actually behind the text.

Computed with this file's own maths, `--hx-muted` on the tab pill (dock stop at 98% + the pill's 3% white):

| skin | fixed dark dock (before) | panel-derived dock (after) |
|---|---|---|
| lazzuh (dark) | 6.15 | 5.75 ✅ |
| streamer (light) | **3.22** ❌ | 4.73 ✅ |
| donata (light) | **3.72** ❌ | 4.63 ✅ |
| jack (light) | **3.54** ❌ | 4.57 ✅ |

Pinned per skin in `__tests__/dnd/roller-dock-surface.test.ts`, including that the dark skin passed *either*
way — which is why this hid for three slices.

**Still worth a browser pass, for a different reason than before.** These computed before-values (3.2–3.7)
are higher than the 2.78/2.83 measured in place, so the real page stacks at least one more darkening layer
than the model. The *diagnosis* is unaffected (direction, cause and which skins fail all agree) and the fix
is structural rather than a chosen colour, so it doesn't rest on the absolute number. But the after-values
sit only just over AA (4.57 on `jack`), so the eyes-on check now owed is **whether the dock's new light
appearance on the three light skins looks right**, not whether a hand-picked colour cleared a ratio.
