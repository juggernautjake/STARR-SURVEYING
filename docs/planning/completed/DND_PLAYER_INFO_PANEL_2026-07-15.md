# Player info panel — interactive holographic readout (Console)

**Goal (from the DM):** upgrade the player Console's bottom deck into a proper interactive info panel —
for players *and* the DM in Player mode. Hover over a thing → its name shows in the panel. Click it → the
view **zooms in** on it, it gets a **selection ring/boundary**, and the panel fills with all its info.
A thing may have **no info, just a name**. Layout: a **left mini-screen** showing an **animated,
holographic** rendering of the selected thing, and a **wide centre screen** with all the info, nicely
formatted and **scrollable** when long. Strong **spaceship vibe**, well-styled text. Clicking off /
closing blanks the screen (or shows a default idle animation). A **minimize** button slides the whole
deck down to hide at the bottom; clicking the tab reopens it.

## Current state

- The Console (`console.html`) already has a bottom deck (`#console`) with a CRT `.screenframe` →
  `.scr-inner` (head + `.scr-desc` + POI list) that shows a readout when a body/sector is selected, plus
  side banks of decorative buttons/knobs and a `.scr-idle` default. `select({type,id})` drives it and
  `flyTo(x,y,scale)` already exists for zoom-to. So this is an **enhancement**, not a greenfield build.
- Hover currently does nothing; there's no holographic mini-render; the info isn't split into a
  left-render / centre-info two-pane layout; there's no minimize/slide-down.
- `art(look,true)` (2D) and the 3D thumbnail path already exist to render a body's likeness.

## Slices

- **Slice 0 — Planning doc** *(this file)*.
- **Slice 1 — Hover targeting.** ✅ Hovering any body or sector now shows that thing's **name** in the
  Console screen as a lightweight `◈ TARGETING ◈` readout (name + kind + "click to lock on"), without
  selecting or zooming. Bodies/sector paths get `onmouseenter=hoverName`/`onmouseleave=endHover`;
  `select()` records `curSel` and `endHover()` calls `renderCurrent()` to restore the locked-on readout
  (body/core/sector) or idle. Verified headless: from idle, hovering a body shows TARGETING + its name
  and leaving restores idle; after selecting a body, hovering a sector shows the sector name and leaving
  restores the body readout; 0 errors.
- **Slice 2 — Click to focus.** ✅ Clicking a body/sector flies/zooms the view to it (`flyTo`), draws the
  selection boundary (bodies get the spinning `.selring`, sectors a glowing outline), and fills the panel
  with the full readout — verified headless: a click sets `.selected`, the ring reads opacity 0.9, the
  view moves, and the screen shows name/class/description. Added a **soft ring preview on hover**
  (`.body.hovered:not(.selected) .selring` at 0.4) so targeting shows the selection boundary before you
  commit, wired through the mouseenter/leave handlers. 0 errors.
- **Slice 3 — Holographic mini-render (left).** ✅ The readout portrait is now a **holographic
  projector**: `portrait()` wraps the body's `art()` likeness in `.holo-glow / .holo-screen(.holo-art +
  .holo-tint + .holo-scan + .holo-sweep) / .holo-base` — a cyan/blue tint (screen blend), scanlines, a
  sweeping refresh line, a soft outer glow, a projector-base glow and a slow bob (`holobob`). Shared by
  the body/sector/core screens, so every selection reads as a projected hologram. Verified headless: the
  holo layers mount on select and a screenshot shows the cyan holo projection; 0 errors.
- **Slice 4 — Centre info screen.** ✅ The centre pane (`.scr-cols` → scrollable `.scr-desc` + stats
  column) already formats name/type/sector/description/POIs/sub-systems in the spaceship-terminal style;
  this slice made description text `white-space:pre-wrap` (honours the DM's line breaks) and added
  graceful **name-only** handling — when a body/sector has no description (and no POIs/chips) the pane
  shows a subtle `▏ NO FURTHER DATA ON RECORD` line instead of a blank. Verified headless: a name-only
  body shows just its title + the no-data line, and a very long description scrolls within the pane
  (`scrollHeight > clientHeight`); 0 errors.
- **Slice 5 — Close / blank / idle.** ✅ Clicking empty space now deselects: the stage mousedown/up
  tracks whether the pointer moved (so a drag-pan doesn't count), and a genuine click on empty space with
  something selected calls `clearSelect()` — which blanks the panel to the idle screen (the existing
  `#btnClose` / fit buttons already did this). The idle screen gained a **default animation**: a slow
  **radar sweep** (`.idle-radar` with a rotating conic-gradient `.idle-sweep` + range rings). Verified
  headless: after selecting a body, an empty-space click clears the selection, shows `AWAITING INPUT` and
  mounts the radar sweep; 0 errors.
- **Slice 6 — Minimize + spaceship-vibe polish.** ✅ A `#deckMin` control (▾, rotates to ▲) toggles a
  `.min` class on `#console` that height-collapses the deck to a thin ~30px tab (children hidden) with a
  smooth transition, revealing more map; a centred `▲ SENSOR CONSOLE — CLICK TO OPEN` label shows while
  minimized and clicking anywhere on the tab restores it. The deck already carries the spaceship vibe
  (metal banks, status lamps, knobs, CRT), so this slice adds the collapse/restore on top. Verified
  headless: minimizing collapses 246px → ~34px with the label shown, and clicking the tab restores it; 0
  errors.
- **Slice 7 — Interactive console controls (functional + flavour).** ✅ Added a **HELM** bank with real,
  clicky controls (all emitting tiny WebAudio **beeps**, respecting a mute): a **pan D-pad** (▲◀◈▶▼) that
  pans the view scaled by a **THRUST** (pan-rate) slider, a **TINT** dial that steps the info-panel screen
  hue through cyan→green→blue→amber→red (`--tint-hue`), a **TUNE** signal knob with a **sweet spot** at 50
  where distortion is 0 and grows with distance (`--distort` drives scanline warp + jitter + contrast on
  `.scr-inner`/`.screen`, with a faint always-on flicker even near-perfect), a **LIGHT** button that
  nudges scene brightness (3D `setLightLevel` if present, else the 2D stage `brightness()`), and an
  **SFX** mute toggle. The existing **zoom/gain dials** now beep too, and the deck's status **lamps**
  already blink (COMMS) for ambient life. Verified headless: the D-pad pans (thrust-scaled), TINT changes
  the hue var, TUNE distortion goes 0 at the sweet spot → 0.72 stepping away, and SFX toggles; 0 code
  errors. *(Wiring/greeble is carried by the deck's existing metal-bank chrome; explicit SVG wiring was
  left out as low-value polish.)* Doc moved to `completed/`.

## Considerations
- **Player + DM parity:** the panel lives in the Console, which the DM also uses in Player mode, so both
  audiences get it automatically.
- **Reuse:** `select()`, `flyTo()`, `playReadout()`/`.scr-*` and `art()` already exist — build on them
  rather than replacing, to keep DB-loaded and sample maps working.
- **No-info objects:** every body already has a name; info fields are optional, so the panel must never
  look broken when they're absent.
- **Perf:** the holo mini-render is one small `art()`/thumbnail; the idle animation is CSS. Cheap.

### Status: COMPLETE (Slices 0–7 all shipped)
