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
- **Slice 1 — Hover targeting.** Hovering any body/sector (2D and, where feasible, the 3D pick) shows
  that thing's **name/title** in the panel as a lightweight "targeting" readout, without selecting or
  zooming. Leaving the hover restores the current selection (or idle). Verify headless: hovering a body
  updates the readout name; unhovering restores.
- **Slice 2 — Click to focus.** Clicking a thing flies/zooms the view to it (`flyTo`), draws a
  **selection ring/boundary** on it, and populates the panel with its full info. Verify headless: a click
  sets the selection, moves the view, and the panel shows the object's fields.
- **Slice 3 — Holographic mini-render (left).** A left sub-screen renders the selected thing's likeness
  (reuse `art()` / the 3D thumbnail) with a **holographic** treatment — cyan tint, scanlines, soft glow,
  a slow rotate/bob — so it reads as a projected hologram. Verify headless: selecting a body mounts a
  render in the mini-screen with the holo styling applied.
- **Slice 4 — Centre info screen.** A wide, **scrollable**, well-formatted info pane: name, type,
  faction/sector, description, POIs, sub-systems, and any stats, in a clean spaceship-terminal style.
  Gracefully handles **name-only** objects (no info → just the title + a subtle "no further data" line).
  Verify headless: long content scrolls within the pane; a name-only object shows just its title.
- **Slice 5 — Close / blank / idle.** Clicking empty space (or a close control) deselects → the panel
  blanks to a **default idle animation** (e.g. a slow sweeping scan). Verify headless: deselect clears
  the readout and shows the idle state.
- **Slice 6 — Minimize + spaceship-vibe polish.** A **minimize** control slides the whole deck down to a
  thin tab at the bottom; clicking the tab slides it back up. Final styling pass for the spaceship vibe
  (fonts, chrome, glow, transitions). Verify headless: minimize hides the deck to a tab and restore
  brings it back.
- **Slice 7 — Interactive console controls (functional + flavour).** Populate the deck's side banks with
  clickable **buttons, dials, knobs and sliders** that make little **beeps/boops** and animate on use, a
  mix of real utility and pure flavour: a **zoom dial**, a **lighting** dial (nudges the scene/3D light),
  **up/down/left/right pan buttons** + a **pan-rate slider**, and **screen-tint dials** that shift the
  info-panel screens toward green/blue/red/amber. Plus ambient **blinking status lights** and **wiring**
  detail for the spaceship vibe. Sounds are tiny WebAudio blips (respect a mute). Verify headless: the
  functional controls change their target (zoom/tint/pan), and the flavour lights animate. Then move this
  doc to `completed/`.

## Considerations
- **Player + DM parity:** the panel lives in the Console, which the DM also uses in Player mode, so both
  audiences get it automatically.
- **Reuse:** `select()`, `flyTo()`, `playReadout()`/`.scr-*` and `art()` already exist — build on them
  rather than replacing, to keep DB-loaded and sample maps working.
- **No-info objects:** every body already has a name; info fields are optional, so the panel must never
  look broken when they're absent.
- **Perf:** the holo mini-render is one small `art()`/thumbnail; the idle animation is CSS. Cheap.

### Status: IN PROGRESS (Slice 0 shipped; 1–7 pending)
