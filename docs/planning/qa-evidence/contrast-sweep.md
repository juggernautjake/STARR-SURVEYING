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

## ⚠ 2026-07-26 (3) — AND IT MEASURES THINGS NOBODY CAN SEE. Read this too.

A third bug, found by trying to fix a "defect" it reported. The filter tested `display`, `visibility` and
`opacity` **on the element itself** and never on its ancestors — so anything inside a collapsed container came
through. The PF2 dice pad's `d4…d100` buttons were reported at 2.86:1 while living inside `.fld` with
`display: none`: the roller dock was collapsed. Recolouring them would have been a change nobody could ever
have seen.

Measured share of leaf text nodes that are **not actually rendered**: IG sheet **106 of 314 (34%)**, jack
sheet **51 of 196 (26%)**. Every aggregate failure COUNT reported before this correction is inflated by that
much. (The individual fixes that shipped were each re-measured on the specific element afterwards, and the
custom-sections block was confirmed visible — so those stand.)

The predicate to use, which handles ancestors, `content-visibility` and zero-size boxes in one:

```js
const isRendered = (el) =>
  (typeof el.checkVisibility === 'function' ? el.checkVisibility() : true) &&
  el.getClientRects().length > 0;
```

**Three tool bugs in one day, all of them inventing failures.** The pattern is worth naming: every one came
from testing a *proxy* for what the reader sees — one background property, one layer, one element's own
`display` — instead of the thing itself. When a number looks alarming, screenshot the element; when a whole
list looks alarming, check how much of it is even on screen.

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

## 2026-07-27 — PARTIAL RE-MEASUREMENT, after ~10 contrast-affecting slices

The baseline below was measured before slices 34, 47 and 48 changed contrast-affecting code (IG's
danger-as-text, the `--hx-gold-2` clamp, six undefined `var(--hx-…)` references). **A stale baseline is the
thing this file keeps warning about**, so three of its six sheets were re-measured against current code with
the corrected maths — gradients composited, multi-layer backgrounds, rendered nodes only.

| sheet | then | **now** | notes |
|---|---|---|---|
| donata 5e (Donata Dime) | 20 | **3** | of 164 rendered nodes |
| rulebook 5e (Jack) | — | **1** | of 154; an **82px decorative watermark** at 1.29 — the "decorative glyph is usually noise" case this file names |
| PF2 streamer (Orin) | 8 | **9** | of 115 |

**donata went 20 → 3, and the three that remain are the brand-fill item, confirmed live.** Two of them
measure **exactly** what slice 49 computed from the CSS — `⬇ Export` at **2.62** (white on the candy teal)
and `⟲ Reset` at **3.31** (white on `#f0577a`). That agreement between a static reading and a live one is
worth noting on its own: the A/B options recorded in slice 49 apply to precisely these controls.

**PF2 did not improve** (8 → 9), and its failures are a different family: the unfilled Hero-Point `◇` at
3.23 (it paints `--hx-line`, a hairline colour, which is arguably deliberate for an *empty* pip but is still
information), three 11.5px `E` markers at 3.92, and three 18px modifiers at **4.38** — a hair under.

**Caveats, stated so this is not mistaken for a new baseline:** three of six sheets, one skin each, default
template, no interaction states. The streamer/lazzuh/IG rows are unmeasured since the fixes. What it does
establish is that the largest single bucket (donata's 20) is now 3, and that those 3 are the decision
already written up rather than anything new.

## 2026-07-26 — THE VERIFIED BASELINE (all three tool bugs corrected)

Six live characters, gradients and multi-layer backgrounds composited, and **only nodes that actually render**
counted. This is the first list in this arc that can be acted on.

| sheet | rendered text nodes | failing |
|---|---|---|
| streamer 5e | 158 | 5 |
| **jack 5e** | 144 | **0** |
| donata 5e | 200 | 20 |
| lazzuh 5e (dark) | 131 | 5 |
| IG (default, dark) | 208 | 2 |
| PF2 (streamer) | 82 | 8 |
| **total** | **923** | **40** |

Everything unambiguous has already been fixed (the roller labels, `.btn` on light skins, the CUSTOM chip, the
IG custom-sections block). **All 40 remaining are colour decisions on a skin's own palette, not defects with
an obvious right answer** — which is why they are listed rather than changed:

1. **Brand-filled buttons — 20 on donata, 1 on lazzuh.** White on the teal fill `#17b3a3` = **2.62**; white on
   the danger fill `#f0577a` = **3.31**; `⟲ RESET`'s red text on a dark panel = **2.92**. Fixing means
   darkening a brand fill or abandoning white text.
2. **Section numbers (`sec-num`) — 1 on streamer, 4 on lazzuh.** `#b30060` on the streamer's pink
   (**3.09**) and `#c8323f` on lazzuh's dark (**2.55–3.45**). These are each skin's SIGNATURE accent, set in
   that skin's own block in `theme.css` — not an unclamped token that could simply be added to the clamp
   (`--hotpink` already routes through `ensureContrast` in the shell bridge). Decorative numerals, so the
   trade is legibility against identity.
3. **The gold/amber family on pale panels — 4 on streamer, 8 on PF2.** `#c8aa6e` on near-white = **2.08**;
   `#966c00` at **3.24–4.30** on the PF2 chips and section labels. Several are within 0.2–0.65 of passing.
4. ~~**Two one-offs on IG:** the `🜲` glyph at **1.39** (same inherit-the-page-ink cause as the
   custom-sections block, in a panel that fix did not cover — the one entry here that IS probably a plain
   bug), and `COMBAT SKILLS` at **3.33** using the danger red at a site the `--hx-danger-2` fix did not
   reach.~~ **BOTH FIXED — the IG row of the baseline is now 0 failing.**

**Recommended order if these are picked up:** ~~the IG glyph (a bug),~~ then the gold family (several are a
hair short), then the brand fills and section numbers together — those two are one conversation about how much
of a skin's identity is negotiable.

## 2026-07-26 — item 4 closed, and the IG row is clean

**The glyph was already fixed** (`3367cbc2`) before this list was re-read — worth noting as the same
stale-evidence trap the docs above keep hitting: *check the code before working an item*. It took the
card's own accent instead of inheriting the page ink.

**`COMBAT SKILLS` is fixed** (`d171b8dd`), together with seven sibling sites the same token change had
missed: the condition chips (×2 panels), the CUSTOM badge, the flat-d20 line, the lethal count and the two
remove buttons. All nine danger-coloured TEXT uses in `useIgPanels.tsx` now take `--hx-danger-2`
(**3.19–3.50 → 6.62–7.26**, hue unchanged).

**Two decisions inside that, both deliberate:**

- **Borders keep `--hx-danger`.** A border needs 1.3:1 (`CONTRAST.border`), not 4.5, and the base red is
  what the accent language is built from. So the change was made by CSS *property*, not by replacing the
  token — a find-and-replace would have taken the borders with it.
- **The other 22 files carrying `color: var(--hx-danger)` were NOT swept.** This is the file's own lesson
  applied rather than restated: the roller-dock slice proved a surface can be painted from the
  skin-derived `--panel` family while its text comes from `--hx-*`, and **on a light panel this lighter
  red is worse, not better**. A blind 41-site swap would have been the fourth "measured a proxy instead of
  the thing" mistake in this file. Each needs its own surface measured — a browser pass, not a sweep.

**The model was validated, not trusted:** `lib/dnd/theme-contrast.ts` put `COMBAT SKILLS` at 3.50 where the
browser measured 3.33 — same verdict, model slightly optimistic. That agreement is what justifies fixing
the eight siblings by computation, since they sit on the same surfaces in the same file; the condition
chips in particular were never *measured* in place, because the character sampled held no conditions.

Pinned by `__tests__/dnd/ig-danger-text-contrast.test.ts` (9), which asserts the RULE — text takes the
lighter token, borders keep the base — plus the token values the ratios rest on, so retuning either red
fails loudly instead of leaving a stale number here.

**Revised baseline: 40 → 31 failing** (IG's 2 closed; the 7 unmeasured siblings were never in the count).
The remainder is items 1–3, all colour decisions on a skin's own palette.

## 2026-07-27 — the bespoke PF2 sheet reaches ZERO

Re-measured after slices 62–67 (tint family, accent-on-tint, border-token-as-text, and the clamp backdrop):

| sheet | then | **now** |
|---|---|---|
| PF2 streamer | 9 of 115 | **0 of 115** |
| donata 5e | 3 of 164 | 3 — unchanged |

Every text node on the bespoke Pathfinder sheet clears its own AA threshold, composited through the real
backdrop chain, rendered nodes only.

**donata's three are the brand-fill decision and were never expected to move** — the 5e engine paints from
`theme.css`'s `--gold`/`--hotpink`, not the `--hx-*` set those slices corrected. A change that cleared nine
failures on one sheet moving the other by exactly zero is the cleanest evidence yet that these are two
independent colour systems, and should be reasoned about separately.
