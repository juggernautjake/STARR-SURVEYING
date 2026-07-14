# Rich text labels + POI descriptions for the Stardust galaxy map

**Goal (per the user):** on the campaign maps, be able to add lots of text with **different
fonts, sizes, and effects**, and **wrap / curve / rotate** it. Every map object — **planets,
systems, locations, and POIs** — must be **labelable and fully formattable**. POIs also need
**descriptions that appear in the little description info viewer at the bottom** (the play-mode
readout in the editor and the CRT `.scr-desc` viewer in the player Console).

This extends the already-integrated Stardust suite (see `completed/DND_GALAXY_MAP_2026-07-09.md`).
The tools are same-origin static assets under `public/dnd/maps/` (`map-studio.html`, `console.html`)
mounted via iframe; the vanilla engine is edited in place.

---

## 1. What exists today (engine map)

**map-studio.html**
- **Instance (body) label:** rendered as a plain HTML `<div class="nm">${name}</div>` under the body
  (`renderInstances`, L972–992; CSS L77). No formatting — one font, 11px, white, no-wrap.
- **Sector/system label:** a single SVG `<text>` at the polygon centroid (`renderSectors`, L959),
  `Cinzel`, fixed size 15/20, colored by the sector color. No formatting, no wrap/curve/rotate.
- **POI:** an icon anchored on the body via `ax/ay ∈ [-0.95,0.95]` (`poiLayerHTML`, L1004–1012);
  has `title` + `desc`. Icon shows a `title=` tooltip.
- **Descriptions:** instances, sectors, and POIs each already carry a `desc` string, edited via
  inspector `<textarea>`s (`renderInstanceInspector` L1202, `renderSectorInspector` L1170,
  `renderPoiInspector` L1148). In **play mode**, `playReadout()` (L1236) renders name + creed +
  desc + POI list into `#inspBody` — this is the editor's "info viewer".
- **Object kinds / library tabs** (`TABS`, L542): planet, planet3d, star, moon, station, debris,
  system, galaxy, spingalaxy, svg, background. **There is no text/label object kind.**
- **Coordinate system:** `#canvas` holds `<svg id="svg">` (sectors) + `<div id="bodyLayer">`
  (instances, HTML) + `<canvas id="fxCanvas">`. `applyView()` (L933) applies the **same**
  `translate()+scale()` transform to both `#svg` and `#bodyLayer`, so they share world coords exactly.
- **Persistence:** `mapData()` (L1375) serializes `instances` and `assets` **whole** (so any new
  field on an instance or POI survives automatically), but serializes `sectors` with an **explicit
  field list** (L1376) — new sector fields must be added there **and** in `cleanState()` (L1417).

**console.html** — mirrors the schema; `loadMap()`/`normalizeMap()` render the published map; a CRT
readout (`.scr-desc`/`.scr-stats`) shows a clicked object's info. Renders sector `<text>` labels and
instance name labels the same way. (Detailed line map from the engine survey folded into slices 6–7.)

---

## 2. Design — one shared label engine, one label layer

**Decision A — a shared `public/dnd/maps/labels.js`** included by both tools (`<script src>` in
`<head>`), exposing `window.labelSVG(text, style)` → an SVG `<g>` string centered on the origin,
plus `LABEL_FONTS`, `DEFAULT_LABEL_STYLE`, `mergeLabelStyle`, and `labelControlsHTML/​wireLabelControls`
(the inspector UI, shared so studio + console stay in lockstep). One implementation, zero drift.

**The `LabelStyle` object** (stored on the object as `.label`, or as a text object's `look`):
```
{ show, text?,                         // text on a body defaults to the object name
  font, size, weight, italic, color,
  tracking (letter-spacing), uppercase, align ('start'|'middle'|'end'),
  opacity, lineHeight,
  wrap,                                // max width in world px (0 = no wrap; \n always breaks)
  curve,                               // -100..100 arc amount (0 = straight)
  rotate,                              // degrees
  outline, outlineColor,              // stroke halo (paint-order:stroke)
  glow, glowColor,                    // SVG blur filter
  shadow,                             // drop-shadow
  plate, plateColor, plateOpacity,    // optional rounded background plate
  dx, dy }                            // offset from the object's anchor
```

**Rendering (`labelSVG`)** — SVG so every effect is achievable:
- fonts/size/weight/italic/color/tracking/uppercase/opacity/align → text attributes.
- **wrap:** offscreen `canvas.measureText` to break into lines at the `wrap` width; `\n` forces
  breaks; multiple lines via `<tspan dy>`.
- **curve:** build an arc `<path>` (radius from `curve`) + `<textPath>` so text follows the arc
  (concave up for +, down for −). Curve implies single line.
- **rotate:** wrap the group in `transform="rotate(deg)"`.
- **effects:** outline via a duplicate `<text>` stroke behind (paint-order), `glow`/`shadow` via a
  per-label `<filter>` (feGaussianBlur / feDropShadow) with a unique id.
- returns `{ g, w, h }` so callers can place a hit-target/plate.

**Decision B — a dedicated `#labelLayer` SVG overlay** inside `#canvas`, above `#bodyLayer`, given
the same transform in `applyView()`. **All** rich labels (instance names, sector names, free text
objects) render here, on top of bodies, with full SVG power. `pointer-events` are enabled only for
free **text objects** (so they can be selected/moved); body/sector labels stay `none` and are
selected via their body/polygon as today.

**Decision C — a new `text` object kind** (a "Text / Label" tab) for **locations** and free
annotations not tied to a body: a placeable instance with `kind:'text'` whose `look` is a
`LabelStyle` + `text`. Drag to place, drag to move, rotate handle, full formatting inspector. It
serializes with instances (whole) for free.

**Decision D — POI descriptions in the bottom viewer.** POIs already store `desc`; wire the Console
CRT readout and the studio `playReadout` so **clicking a POI** shows its title + description in the
bottom info viewer (today only bodies/sectors populate it). POI `title` also gets optional label
formatting via the same `LabelStyle` (shown as a small on-map caption when enabled).

**Decision E — fonts.** Curate a themed set loaded once (Google Fonts link, matching the tools'
existing import): display (Cinzel, Orbitron, Rajdhani), sci-fi (Audiowide, Michroma), serif
(Cormorant Garamond), hand (Caveat), mono (Share Tech Mono), plus system stacks. Offline/proxy may
block the web fonts (as today) — the tool degrades to the system fallback; formatting still applies.

**Non-goals / risk control:** the vanilla engine stays otherwise verbatim; labels persist through the
existing save/publish → DB path (no schema/API change — `dnd_maps.data` already holds the whole
`stardust-map`). New sector fields are the only serialization edit needed.

---

## 3. Implementation slices (commit plan)

- **Slice 0 — Planning doc** *(this file)*.
- **Slice 1 — `labels.js` shared engine:** `labelSVG`, fonts, defaults, merge, and the shared
  `labelControlsHTML`/`wireLabelControls` inspector UI. Included in both tools' `<head>`. Headless
  unit-render check (straight, wrapped, curved, rotated, glow/outline).
- **Slice 2 — Instance labels (Studio):** add `#labelLayer`; route body names through `labelSVG`
  (retire `.nm`); add a **"Label"** formatting section to the instance inspector (font/size/effects/
  wrap/curve/rotate/offset/plate). Persists via whole-instance serialization.
- **Slice 3 — Sector/system labels (Studio):** sector name via `labelSVG` in the label layer; a
  **"Label"** section in the sector inspector; add label fields to `mapData()` + `cleanState()`.
- **Slice 4 — Text/Label object kind (Studio):** new "Text" tab + `kind:'text'` placeable for
  **locations**/annotations; place/move/rotate; full formatting inspector; select/delete/duplicate.
- **Slice 5 — POI descriptions + labels (Studio):** POI click → description in the play-mode
  readout; optional formatted POI caption on the map; POI title/desc formatting controls.
- **Slice 6 — Console parity:** include `labels.js`; render instance/sector/text labels identically
  for players; POI click populates the CRT `.scr-desc` viewer with the POI's title + description.
- **Slice 7 — Verify + polish:** tsc + eslint + `vitest run __tests__/dnd`; headless renders of a
  map exercising every label feature in both Studio and Console; move this doc to `completed/`.

Each slice: typecheck + lint (the HTML/JS isn't typechecked — verify TS unaffected), commit, push,
annotate this doc. No DB migration needed; the existing `seeds/421_dnd_maps.sql` already stores it.

---

## 4. Build notes / ship log

- **Slice 0 — Planning doc** ✅.
- **Slice 1 — `labels.js` shared engine** ✅ — `public/dnd/maps/labels.js`: `LABEL_FONTS` (10 themed
  fonts), `DEFAULT_LABEL_STYLE`, `mergeLabelStyle`, `labelSVG(text, style)` → `{g,w,h}` SVG group,
  and the shared `labelControlsHTML`/`wireLabelControls` inspector UI. Included via `<script src>`
  in both tools' `<head>` and the Google-Fonts link expanded (Audiowide, Michroma, Cormorant
  Garamond, Caveat) in both. `labelSVG` handles fonts/size/weight/italic/color/tracking/uppercase/
  align/opacity, multi-line **wrap** (canvas `measureText` + `\n`), **curve** (arc `<path>` +
  `<textPath>`), **rotate**, **outline** (paint-order stroke), **glow**/**shadow** (SVG filter), and
  an optional background **plate**. Verified headless in-browser: straight→text+tspan, wrap→4 lines,
  curve→textPath+path, rotate→transform, glow→feGaussianBlur filter, outline→paint-order, plate→rect,
  `show:false`→empty, and mounts into a live SVG with no parse errors.
