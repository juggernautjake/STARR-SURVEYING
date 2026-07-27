# Contrast sweep — how to run it
### …and, since slice 109, the browser-QA method for this repo generally

> **⚑ THE FILE NAME UNDER-SELLS THIS. Read the index below before running any browser sweep, not just a
> contrast one.** It began as a contrast recipe and accumulated **twelve** ways a browser measurement lies
> — over half of which have nothing to do with colour. Slices 74, 82, 85, 90 and 108 each said the point was
> for the next sweep to *inherit the method*; that only works if the method is findable, and it was filed
> under the name of one specific sweep. Renaming would break the references from ~20 slice entries, so the
> index is here instead.
>
> **Every one of these produced a confident, wrong result before it was written down**, and four of them bit
> a second time *after* being written down — documentation works when it is read, and nothing makes it get
> read.
>
> | # | The lie | The tell |
> |---|---|---|
> | 1 | Backdrop walk ignored `background-image` | gradients composited as transparent |
> | 2 | Took only the first colour of the first background layer | a 5% tint read as the layer |
> | 3 | Elements inside a collapsed `.fld` measured as visible | numbers for things off-screen |
> | 4 | Alpha stacks flattened wrongly | plausible-but-wrong ratios |
> | 5 | `color: rgba(0,0,0,0)` + `background-clip: text` | reports 1.00 on gradient-painted text |
> | 6 | A **closed `<details>`** still yields layout boxes | 1,633 "overflows" with no page scroll |
> | 7 | `rg -r` is `--replace`, not "recursive" | source printed with matches replaced |
> | 8 | The pass/fail **count** is not the finding | a 5px control that passed WCAG |
> | 9 | A **transitioned** property sampled on the same tick | `0.306` vs a `0.3` baseline = "unchanged" |
> | 10 | A client-rendered value sampled **before hydration** | correct at 1800ms, wrong at 900ms |
> | 11 | Regex over whitespace-stripped `innerText` | matches spanning unrelated elements |
> | 12 | A selector that **cannot match** returns the same "clean" as a rule that works | check reachability, not just the result |
>
> **The two habits that caught most of them:** measure the same thing a second way (the browser kept
> catching the static scripts, and vice versa), and make every probe report whether it *could* have failed.

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

### Both bespoke sheets, final

| sheet | baseline | now |
|---|---|---|
| PF2 streamer | 8–9 | **0 of 115** |
| IG (default) | 2 | **0 of 239** |
| donata 5e | 20 | 3 — the brand-fill decision |

354 rendered text nodes across the two bespoke sheets, zero failures.

The IG sheet's last one was *"Currently in"* at 4.31 — `--hx-muted` on the **stance card**, which paints its
own ACCENT gradient rather than the neutral inset the clamp targets. Fixed with the ink, per the roller
dock's rule for accent-tinted surfaces, rather than by adding a fifth clamp surface for one card.

**The line this draws:** everything reachable from the `--hx-*` system is fixed and guarded, because that
system DERIVES its colours — one correction covers every skin. donata's remaining three live in
`theme.css`'s hand-picked brand palette, where the fix is a choice between two measured options, not a
correction to a rule.

### The other half of the palette: the five COLOUR THEMES, measured as text (slice 71)

The line above — "`--hx-*` is derived and fixed; `theme.css` is hand-picked and needs a choice" — was right
about the mechanism and understated the scope. Measuring a live sheet that had never been swept (Perrin
Underbough, the only character on a theme none of the earlier sweeps covered) put four `.sec-num` section
labels at **3.45** and **3.78**. Following that back gave a broader finding than the one page showed.

`.dnd-sheet .sec-num { color: var(--hotpink) }` is the **base** rule — it applies to every skin that does
not override it, and ~15 shared components render one (`SectionHead`, `VariantToggle`, `SkinSwitch`,
`LayoutSwitch`, `DescriptionsPanel`, `CustomizationSummary`, `SheetArtUploader`, `AiSheetEdit`,
`DmOverridePanel`, both galleries). Every section heading on the sheet is this token, at 13px / weight 400.

Computed across all five selectable themes against the panel stops they share (`HEXTECH_GROUNDS`):

| theme | accent | on `panel` | on `panel-2` | on `panel-3` |
|---|---|---|---|---|
| Hextech Gold *(default)* | `#0397ab` | 4.85 | 4.63 | **4.30** |
| Shadow Isles | `#1fb98a` | 6.71 | 6.41 | 5.88 |
| Noxus Crimson | `#c8323f` | **3.45** | **3.19** | **2.84** |
| Freljord Ice | `#38a9e6` | 6.35 | 6.06 | 5.56 |
| Void Prophet | `#9d4edd` | **3.95** | **3.66** | **3.26** |

**Seven of fifteen combinations are under AA**, including one on the theme new characters get by default.

**This is a gap, not a policy.** The CHARACTER themes in the same file were held to a text bar by hand, and
their comments still carry the ratios they were picked to hit — `'#c2185b', // ... ~5.4:1` and `'#35593a',
// ... (7.2:1 on the card, 4.9:1 on its own 12% tint)`. The five colour themes came later and carry no such
annotation. Noxus's *only* contrast note is about a **border**: *"Alpha raised so the crimson border is
perceptible on the dark panel (TR-2) — 0.28 was 1.24:1"*. Borders were checked; the accent as text was not.

**An in-palette fix exists and is asserted in the test.** Every one of these palettes already defines `pink`
as the lighter partner of `hotpink`, and in both failing themes that sibling clears 4.5 on the panel stops
(Noxus `#e0576a`, Void Prophet `#c77dff`). So the correction is a token swap at the TEXT uses of the accent
— the same shape as `--hx-gold-2`, the text-safe sibling of `--hx-gold` on the bespoke side — and needs no
invented colour. The accent keeps its borders, glows and fills, so each theme keeps its identity.

Left for the owner deliberately: Void Prophet is annotated as an owner choice (2026-07-22), and changing
what a theme looks like is not a correction the way a derived clamp is.

Pinned in `__tests__/dnd/colour-theme-accent-text.test.ts` with `it.fails` and the measured ratios, so the
suite stays green, the gap cannot be forgotten, and correcting the palette reports *"expected to fail but
passed"* and names the pin to delete.

#### A sweep-tool note: gradient-clipped text reads as a false positive

The same sweep flagged the `.name` heading at **1.00**. It is not a defect: `.name` sets
`color: rgba(0,0,0,0)` with `background-clip: text` over a `linear-gradient`, so the glyphs are painted by
the gradient and the computed `color` the sweep reads is the transparent placeholder. Fifth distinct
limitation this tool has shown (after ignoring `background-image`, collapsed `.fld` ancestors, alpha stacks,
and expired sessions reading as auth defects). **`color: rgba(0,0,0,0)` + `background-clip: text` should be
skipped, not reported** — recorded here because two of the previous four cost a wrong diagnosis each.

### Slice 72 — the sibling sweep, and two corrections to the slice above

Slice 71 checked `--hotpink` because `--hotpink` was what the live sheet flagged. `clamped-token-surface.
test.ts` already records why that is not enough: *"THE SAME BUG, THREE TIMES … the third only because the
second's write-up said to check the siblings."* So every token used as text was measured across all five
themes — a boundary-correct census of `color: var(--…)` in `theme.css` gives eleven.

**Two probe artifacts were caught before they became claims.** Both are kinds this file has logged before:

| looked like | actually |
|---|---|
| `--violet-2` the worst offender, 2.11–4.29 across every theme | **8 of its 8 text uses are `.skin-donata`** — a LIGHT skin with its own pale panels and explicit `background: #fff`. Measuring it against the dark hextech grounds was the probe's assumption, not a defect. |
| `--teal` and `--line` failing as text | They are only ever `border-color`. The census regex had no left boundary, so `border-color:` matched — the same false positive already fixed once in `/color: var\(--hx-line\)/`. |

**What survived is `--danger`, and it is a different kind of finding from the accent.**

| | on `panel` | on `panel-2` | on `panel-3` |
|---|---|---|---|
| base default `#ff5252` | 5.69 | 5.28 | 4.70 |
| `HEXTECH_GROUNDS` `#c8413f` | **3.71** | **3.44** | **3.06** |

The base value cleared AA everywhere. The grounds override darkened it below AA everywhere, and because
`danger` is set once in `HEXTECH_GROUNDS` rather than per-theme, **all five colour themes inherit it** — one
value, five themes, twelve text sites including `.tp-err` at 12px, which is error text. This is the
live 3.02 measured on the Reset button (that reading composites through the button's own
`rgba(255,82,82,.14)` tint, hence a little under the flat-panel figure).

Unlike the accent, this one is hard to read as a design choice: a red that says *error* is semantically
fixed, there is no brand identity riding on the exact shade, and the value it replaced was legible. It is
the strongest candidate in this whole arc for a fix that is a correction rather than a decision — but it is
still a palette value in a hand-picked file, so it is pinned here rather than changed.

#### Corrections to slice 71

Two things in that write-up were broader than the evidence behind them.

1. **"including one on the theme new characters get by default"** — overstated. Hextech Gold's `#0397ab`
   measures 4.85 and 4.63 on `panel` and `panel-2`; it is only 4.30 on `panel-3`. And `panel-3` is barely a
   background: the only rules painting it are `.dnd-sheet .stage` and two `.skin-donata` ones. **A section
   label never sits there.** Reporting the worst of three stops made a stop that is not in play sound like
   the finding. The default theme is fine where `.sec-num` actually renders.
2. **"its own `pink` … clears 4.5 on the panel stops"** — the assertion behind it only tested `panel-2`. On
   all three, Noxus's `#e0576a` is 4.97 / 4.60 / **4.10**. The recommendation survives, because `panel-3`
   is not a surface a label sits on, but the sentence claimed more than the test did. Slice 51 got a figure
   wrong the same way. Both bounds are now pinned so the prose and the code cannot drift apart again.

The live-measured core of slice 71 is unaffected: Noxus at **3.45 / 3.19** and Void Prophet at **3.95 /
3.66**, on the stops section labels do sit on, remain under AA.

### Two sweep-tool limitations found the hard way (slice 82)

Recorded here beside the contrast-sweep limitations because they are the same genus and cost the same way.

**6. A CLOSED `<details>` yields layout boxes, and they read as viewport overflow.** Sweeping the IG sheet
at 360px reported **1,633 elements overflowing by 31px** — while `document.scrollWidth` was 345 and the
window would not scroll horizontally. Those two cannot both be true of visible content, which is what said
the tool was wrong rather than the page. The offenders were all inside `<details open="false">`: Chromium
still lays the subtree out (`content-visibility: hidden` sizes to CONTENT, not to the container), so a
collapsed accordion's children measure at their natural width. The contrast sweep already hit this genus
once — *"buttons inside a collapsed `.fld`"* — and the lesson did not transfer because it was written as a
fact about `.fld` rather than about collapsed containers.

The corrected sweep skips any element inside a closed `<details>` (except inside its `<summary>`, which is
visible) and any element with `content-visibility: hidden`. With that, the IG sheet is **clean at 360px**:
0 overflowing, 0 clipped, self-check still detecting an injected 600px probe.

**A near miss worth naming:** the self-check PASSED throughout. It proves the sweep can detect a real
overflow; it says nothing about whether the sweep reports unreal ones. A tool check that only tests for
false negatives will happily certify a tool that is drowning in false positives.

**7. `rg -r` is `--replace`, not "recursive".** Chasing the above, `rg -rn "Ancestries"` printed
`if (key === 'intuitive-games') return 'n';` from `lib/dnd/library.ts` — which reads exactly like a botched
find-and-replace having destroyed a user-facing string, and was one step from being reported as a critical
bug. The file actually says `return 'Ancestries';`. Ripgrep is recursive by default; `-r` consumed the `n`
from `-rn` as its replacement string, so every match printed as `n`.

Earlier uses of `-rn` in this session were checked: all but one passed `-l` (file names only, unaffected).
The exception is slice 77's `choice: 'epic-boon'` scan, whose *content* was mangled — but its conclusion
rested on the file LIST, and was independently re-verified with `rg -c` against `dnd5e-2014/`, so it holds.

### The touch-target sweep, and why WCAG 2.5.8 alone is not the whole check (slices 86–90)

Recorded beside the contrast method because it is the same kind of thing: a measurement that is only
trustworthy once its own blind spots are written down.

**The criterion.** WCAG 2.5.8 (AA) requires interactive targets to be 24×24 CSS px, **with an exception**
for a target that has 24px of clear space to its nearest neighbour. Applying the size test alone
overcounts; applying it with the exception is correct, and both halves matter in opposite directions:

| slice | what the exception did |
|---|---|
| 86 | 13 `?` badges at 16×12 measured 33–35px clear → **conformant**. Reporting them as failures would have been a false alarm. |
| 89 | 5 step buttons at 46×**5** measured ~46px clear → **conformant**, and completely unusable. |

**So the exception can hide a defect as easily as it can prevent a false alarm**, and the sweep needs a
second, independent floor: **the smaller dimension, regardless of spacing.** No amount of clearance makes a
5px strip tappable. A threshold of 10px catches that class without flagging the well-spaced small controls
that are genuinely fine.

**Both checks, run together, across every swept surface (360px):**

| surface | WCAG failures | under the 10px thin floor |
|---|---|---|
| 5e sheet (default / expanded) | 0 | 0 |
| PF2 sheet | 0 *(4 fixed, slice 87)* | 0 |
| IG sheet (default / expanded) | 0 *(2 fixed, slice 87)* | 0 |
| 5e / PF2 / IG builders | 0 | 0 *(5 each fixed, slice 89)* |

**8. The pass/fail count is not the finding.** Slice 89's 5px navigation strip was found by *reading the
list of undersized targets*, not by the violation count — which was zero on that page, correctly, by the
criterion. A sweep that only reports its verdict throws away the observation that mattered.

**9. A transitioned property cannot be sampled on the same tick as the state change (slice 93).** Reading
`getComputedStyle` immediately after a `focus`/`hover`/class change returns the value *mid-transition*,
which for a 150ms ease is indistinguishable from "unchanged" at t≈0. This produced a fully-confident false
defect: `.play-ref-toggle`'s focus border read `rgba(252, 31, 153, 0.306)` against a `rgba(255, 30, 156,
0.3)` baseline — 2% of the way to `var(--gold)` — and was reported as having no focus indicator. After
500ms it is `rgb(127, 92, 0)`, exactly as its rule specifies.

**Sample twice, and check `transition-property` before believing a "no change" result.** The
discriminator is not the first reading: eleven IG form controls carry the *same* `border-color 0.15s`
transition and are genuinely static under focus, so t=0 looks identical for a real defect and a false one.

**10. A client-rendered value must be sampled after hydration, not after `domcontentloaded` (slice 97).**
Sibling of limitation 9, and it bit harder. The 5e ability strip renders placeholder `10 / +0` and swaps to
the real scores at **~1.5s** on a dev server:

| sampled at | STR pill |
|---|---|
| 0 / 300 / 900ms | `STR10+0` |
| **1800ms** | **`STR19+4`** |

Three different extractors gave three different answers in one slice, and the cause was **timing, not
selectors** — which is exactly how it burns an hour, because each disagreement looks like a DOM-structure
problem and invites another rewrite of the query. Wait for `networkidle` plus a margin, or poll until the
value stops changing.

**11. Regexing whitespace-stripped `innerText` fabricates matches.** Stripping whitespace from whole-page
text joins numbers belonging to different elements, so a pattern like `(STR|DEX|…)(\d{1,2})([+-]\d{1,2})`
matches across boundaries and reports values that are on no screen. **Scope the query to the element that
renders the value** (`.apill` here) and anchor the pattern with `^…$`.

**12. A selector that cannot match returns the same result as a rule that works (slice 108).** Probing the
`.dnd-sheet .tray-fab` reduced-motion rule from `/dnd` reported `animation: none` in **both** media states —
which reads as "already correct" and would have been recorded as a pass. The hub has no `.dnd-sheet`
ancestor, so the selector could never match and there was nothing to disable. What caught it was the probe
reporting `fabRuleReachable: false` beside the result.

**Make every probe say whether it COULD have failed.** This is the third disguise of the same fault — the
closed-`<details>` phantom (6) and the vacuous `existsSync` in slice 74 were the first two — and it is the
one that recurs most, because a clean result is exactly what you are hoping for.
