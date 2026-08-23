# Page Designer — themes, palettes, and versions of a page

**Status:** DONE · 2026-08-23 · follows `completed/DESIGN_STUDIO_QUALITY_2026-08-23.md`

> **How to run a slice.** Pick the top unchecked `- [ ]`. Ship it, verify it in a browser, tick it
> with what you actually did — including what you decided *not* to do and why.

---

## §0. What was asked for

1. *"create multiple versions of each page and preview them all"*
2. *"make different themes and stuff to really get any look I want"*
3. *"create color palettes and stuff that we can set as the default for a theme and that will
   automatically be applied to the elements"*
4. *"outfit all of the design features and elements to be able to work with this"*
5. *"resolve any conflicts or anything in the code/html/css"*
6. *"continue building anything that was left over from before"*

---

## §1. The architecture already exists, and that decides everything

Before designing anything, the app was measured:

- `app/styles/tokens.css` declares **47 `--color-*` custom properties**.
- `app/styles/themes.css` ships **ten skins**, and each is *exactly fourteen `--theme-*` variables*:
  `bg-page`, `bg-surface`, `bg-elevated`, `fg-primary`, `fg-secondary`, `fg-muted`, `accent`,
  `accent-fg`, `border`, `border-strong`, `success`, `warning`, `danger`, `info`.
- Every catalogued element renders the app's **real classes**, and those classes consume those
  variables.

So a theme is not a new rendering path. **A theme is a set of CSS custom property values applied to
the artboard element**, and because every element inside already reads them, the entire catalogue
becomes theme-aware without touching a single entry. That is the whole of requirement (4), free.

The same map is emitted into `:root` of the exported HTML, so the file looks like the canvas — which
is the property the whole export rests on.

**This is why the theme model is a token map and not a stylesheet.** A stylesheet per theme would
mean the studio and the export could disagree, and it would not survive a class the catalogue adds
later. A token map is the app's own mechanism, used the way the app uses it.

---

## §2. Phases

### Phase T — Themes

- [x] **T1 — The theme model.** A theme is `{ id, name, tokens: Record<TokenName, string> }` over a
      fixed, documented token list: the fourteen `--theme-*` roles plus the `--color-*` tokens the
      catalogue actually references. Pure, in `lib/design/theme.ts`, with the app's ten skins
      available as starting points rather than reinvented.
- [x] **T2 — Applied to the artboard.** The token map becomes inline custom properties on
      `.dsx__artboard`. Nothing else changes; every element re-paints because it already reads them.
- [x] **T3 — Carried into every export.** `:root` in the standalone HTML, the linked stylesheet, and
      the SVG/PNG capture (which reads *computed* styles, so it follows automatically — assert it).
- [x] **T4 — A theme picker in the studio**, with a live preview and per-token editing.
- [x] **T5 — Themes persist and are shared.** Seed 611. A theme belongs to the workspace, not to one
      design, because the point is applying it to many pages.

### Phase P — Palettes

- [x] **P1 — The palette model**: a named, ordered set of colours. Separate from a theme, because a
      palette is what you *have* and a theme is what you *do with it*.
- [x] **P2 — Build a palette from one colour** — tints, shades, and the standard harmonies
      (complementary, analogous, triadic, split-complementary). Pure and tested: this is colour
      maths, and colour maths that is wrong is wrong in a way screenshots hide.
- [x] **P3 — Assign a palette to a theme automatically.** The owner asked for a palette that
      *"we can set as the default for a theme and that will automatically be applied"*. So: given a
      palette, derive all the token roles from it — darkest to `fg-primary`, lightest to `bg-page`,
      most saturated to `accent`, and so on.
- [x] **P4 — Refuse to produce an unreadable theme.** `lib/design/checks.ts` already computes WCAG
      contrast. An auto-assignment that puts 2:1 text on a background is worse than no automation,
      because it looks deliberate. The generator adjusts lightness until the pairs pass, and says
      what it changed.

### Phase V — Versions of a page

- [x] **V1 — Many designs per route, as a first-class idea.** `variantOf` already records lineage
      and the page list already shows every design for a route. What is missing is creating them
      deliberately and telling them apart.
- [x] **V2 — Preview them all together.** A compare screen: every design for one route, side by
      side, each rendered at a readable size, desktop and mobile.
- [x] **V3 — Compare under a theme.** The reason (1) and (2) are one request: seeing three layouts
      is useful, seeing three layouts under two themes is the actual question.

### Phase X — Conflicts

- [x] **X1 — Find them by measurement, not by reading.** `scripts/design-conflict-report.mjs`, on
      `scripts/lib/css-conflicts.mjs`. Three measurable definitions of "conflict" — see §4 for what
      the instrument got wrong before it got anything right.
- [x] **X2 — Fix what is genuinely broken**, and record what is deliberate. Seventeen redefinitions
      and twenty-one contradictions down to eight and zero; the eight survivors are named with a
      reason in `__tests__/admin-styling/one-design-system.test.ts`, which now gates them.

### Phase L — Leftovers

- [x] **L1 — B3 from the previous doc**: curate from the top of the coverage queue, now that a
      concrete reason to look at more elements exists. The sweep put six classes at the top and all
      six were one component — the workspace landing header, on all five workspace roots. Five
      entries in `lib/design/catalogue/curated/landing.ts`; the drift ratchet caught a source line I
      had guessed and an id already taken by the page-header back control, which is a different
      element that shares a word.

---

## §4. What Phase X actually found

Two bugs, and they are the same bug twice.

**A fix written into a route-scoped stylesheet reaches every route except the ones it was for.**
`/admin/learn` nests inside the admin layout, so `AdminLearn.css` loads *after* `AdminLayout.css`
and wins there. `AdminResearch.css` does the same on research routes. That makes those files the
worst possible place to put a fix and the easiest place to reach for, because it is the file you are
already in.

| | written | landed in | reached | measured 2026-08-23 |
|---|---|---|---|---|
| `.admin-btn` sizing | 2026-08-14 | `AdminLearn.css` | `/admin/learn` only | learn 40px · jobs 43.3px · employees 43.3px · research 43.3px next to a 40px field |
| `.research-tip` portal | 2026-06-20 | `AdminLayout.css` (old copy left in `AdminResearch.css`) | everywhere *but* research | research kept the pre-fix 0.72rem popup, the `inline-flex` wrap, and the arrow nubs the new design cut on purpose |

The button fix's own comment read *"fixing it here fixes it in 45 files at once."* It fixed one.
Both are now single definitions in `AdminLayout.css`; measured after: 40px on all four routes, and
byte-identical tooltip computed styles on `/admin/research` and `/admin/jobs`.

**`__tests__/admin-styling/jobs-button-readability.test.ts` was what held the tooltip drift in
place.** It asserted the tooltip rules against `AdminResearch.css` — the stale copy. So the copy
could not be deleted without going red, and the test stayed green for two months while describing
CSS that never rendered. A test pinned to the wrong file is worse than no test: it converts a
deletion into an apparent regression. It now reads the live rules and asserts nothing redeclares
them.

### What was dead rather than wrong

- `.admin-search` / `.admin-search__input` in `AdminLayout.css` — both pages that use the class are
  under `/admin/learn`, which overrides it. This copy had never rendered a pixel.
- `.admin-empty` in `AdminLearn.css` at line 750 — overridden by that same file's own "IMPROVED
  EMPTY STATES" block further down.
- `.assign__filters` in `AdminLearn.css` — only `/admin/assignments` uses it, and that route never
  loads this stylesheet. It *would* have won in the UX harness, which loads both.

### Recorded as deliberate, not fixed

`/admin/learn` uses a navy primary button where the rest of admin uses brand red, and ships a richer
empty state. Both are real differences that predate this pass. Changing the primary-action colour of
an entire section is a design decision, not a CSS cleanup, so it is left alone — but it is now
*stated* in the stylesheet and in the gate's allow-list instead of being an accident of load order
that you could only uncover by working out the layout nesting. Three lines to delete if the answer
is that learn should match. Same treatment for the two AndrewAsh spacing overrides.

### Where the instrument was wrong first

Consistent with the rest of this project, the report was wrong three times before the code was wrong
once:

1. **749 conflicts.** It matched rules inside `@media`. Nine breakpoints for one class is not nine
   conflicts, it is a media query. Brace-depth tracking → 24.
2. **CSS Modules.** `.panel` in two `*.module.css` files compiles to two different names and can
   never collide. Seven of the remaining findings → 17.
3. **Line numbers forty lines out.** Comments were stripped before counting lines. A report whose
   whole value is pointing at a place, pointing at the wrong place. Comments are blanked now, not
   deleted.
4. **Nineteen of twenty-one "contradictions" were correct CSS.** `height: 100vh` followed by
   `height: 100dvh` is the only way to use a newer unit and still work in a browser that has never
   heard of it. A checker that calls that a bug teaches people to skim it. One real contradiction
   survived: `.research-modal-overlay` set `padding` twice, so its 2rem of top breathing room had
   never once rendered.

**693 "orphaned" classes are reported and deliberately do not gate.** The detector is a substring
search, so it cannot see `admin-btn--${variant}`. A chunk of that list is alive and merely
assembled, and deleting from it on faith is how a status pill loses its colour on one branch of a
conditional.

---

## §3. Decisions taken up front

**A theme is a token map, not a stylesheet.** See §1. It is the app's own mechanism.

**A palette and a theme are separate objects.** A palette is a set of colours; a theme is an
assignment of colours to roles. Merging them would make "use this palette with a darker background"
impossible without duplicating the palette.

**Auto-assignment is checked, not trusted.** Every generated theme is run through the contrast rules
before it is offered. A generator that can produce an unreadable result will produce one.

**Versions are designs, not a new type.** A "version" of a page is another design for the same
route. Adding a parallel concept would mean two things to keep in sync, and the page list already
groups by route.
