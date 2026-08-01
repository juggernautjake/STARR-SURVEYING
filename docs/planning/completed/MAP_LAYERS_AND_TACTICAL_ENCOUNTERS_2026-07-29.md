# Nested map layers & tactical encounters — 2026-07-29

> **This doc supersedes Phase 7 of `TABLETOP_AUDIT_REMEDIATION_AND_CONTENT_STUDIO_2026-07-28.md`**
> (reconciled 2026-07-29). P7 plans the same feature with a flat `dnd_battle_maps` / `dnd_battle_tokens`
> schema, which cannot express the owner's *"up to 7 levels of map layers"*; M1's node tree contains the
> flat case as its leaf. P7 is marked superseded there rather than deleted, because four of its slices are
> better than anything here and should be folded into the M phases:
>
> - **Set the grid by dragging across two known squares**, never by typing a pixel size nobody knows (P7-2)
>   → belongs in **M4-1**.
> - **Pointer Events from the start**, so it works on a tablet on day one (P7-2) → **M3-1**, and it is how
>   G5 gets satisfied rather than retrofitted.
> - **Presence, late-joiner full state, and reconnect-after-sleep** as first-class sync concerns, not
>   polish (P7-4) → **M7-3**. These are the unglamorous parts that decide whether a table feels alive.
> - **Seed tokens from the encounter's initiative entries** so HP, conditions and turn order arrive correct
>   rather than re-entered (P7-3) → **M5-1**, and it is a stronger statement of G4 than M5-1 currently makes.
>
> Also inherited: `seeds/456` is **taken** (`456_dnd_rate_limits.sql`). M1's seeds must claim a free number.

**Owner ask, verbatim:**

> *"Please make the map and the world and stuff all look good on pc and mobile as well. Please make it that for
> now we only display the 2d versions of space maps. We will work on the 3d and hybrid version later, but for
> now just use the 2d version with html to represent all of the worlds and stuff. I want to start working
> towards making the battle maps and mechanics and stuff. Please make it so that we can have a space map with
> worlds, and then we can select a world to zoom in on, and then that world can have locations on it that we
> can click on to load that location's map, and that location could have even more locations in it. There needs
> to be up to 7 levels of map layers, and we need dynamic zooming and rendering. This will make it so that we
> can go to a world, then a continent on that world, then a province in that continent, then a city in that
> province, then a slum in that city, and then a specific street corner in that slum, which would be where the
> battle or encounter might happen. The DM will be able to have full control over all of these mechanics. Then
> the dm can create the grid size and place images and items and things around the map. the characters can also
> be placed on the map, and from there we will integrate their character sheets to determine movement and
> effects and attack radiuses and all of that kind of thing. I even want it where the dm can place hidden items
> on maps that require a certain level of perception or investigation dc to pass to be able to notice. The dm
> can attach descriptions and create triggers when certain things happen, or when certain things are found.
> Please make it so that the dm has full control over the map environment, where they can create really complex
> encounters and puzzles and challenges and stuff, or they can just keep it simple for turn by turn manual
> combat or something like that."*

---

## The one idea this is built on

**A map is a node in a tree, and every node is the same kind of thing.**

The ask describes seven named tiers — space, world, continent, province, city, slum, street corner. It would be
natural to model seven types. **Do not.** Seven types means seven schemas, seven editors, seven renderers, and
seven places to forget something; and the moment a DM wants "a district between city and slum", or a dungeon
three levels deep inside a single building, the model is wrong and the whole thing needs unpicking.

Instead: **one `map_node` type, self-nesting, depth 1–7.** The tier names are a *label* on the node
(`tier: 'world' | 'continent' | …`), used for defaults and vocabulary — not a structural distinction. A world
map and a street corner differ in their content and their grid scale, not in their nature. That is what makes
"a location could have even more locations in it" fall out for free instead of being a special case.

Consequences that follow directly, and are the reason to do it this way:
- **Zoom and drill-down are the same gesture** at every level, so the interaction is learned once.
- **A DM's authoring tools are one toolset**, available at every tier.
- **Tokens, hidden items, triggers and grids** work identically on a continent and in an alley.
- **Depth 7 is a validation rule**, not seven code paths — and it can be raised later by changing a constant.

### Ground rules

- **G1 — One node type, one editor, one renderer.** A tier never gets its own component. If a tier needs
  different behaviour, that behaviour is a *property* of the node.
- **G2 — 2D HTML only, for now.** No 3D, no hybrid, on any display surface. The existing 3D map work is
  *retained but not reachable* — this is a display decision, not a deletion (owner: "we will work on the 3d and
  hybrid version later").
- **G3 — The DM's view and the player's view are different queries, not the same payload with a flag.** A
  hidden item the client receives is a hidden item the client can reveal. Perception DCs are enforced on the
  server or they are decoration.
- **G4 — The sheet is the source of movement and reach.** Speed, reach, spell radii come from the character
  sheet through the existing per-system derivation. The map never hardcodes 30ft or 5ft squares; it asks.
- **G5 — Mobile is a first-class target.** Pan/zoom by touch, 44px minimum targets, no hover-only affordance,
  and the DM tools usable on a tablet. Verified by screenshot at 360px, not asserted.
- **G6 — Nothing silently truncates.** A map with 400 tokens renders 400 or says what it dropped.
- **G7 — Every DM action is undoable.** Map authoring is destructive by nature (drag something, lose its old
  position); it joins the existing edit-history/undo machinery rather than inventing its own.

---

## What already exists (audit first, per the standing lesson)

Before building: `dnd_maps` exists and `loadCampaignHub` reads published maps. `public/dnd/maps/` holds three
vanilla HTML map studio tools (images/backgrounds/spiral/3D round-trip) from the Stardust Map Studio work. The
3D/spiral engines are the thing G2 puts behind the curtain.

**Slice M0 is therefore an audit, not a build:** catalogue what `dnd_maps` stores today, what the map studio
can already do, what routes exist, and what the campaign page links to. Every later slice's premise gets
checked against that. *This is the standing lesson from this project — several "blocked on missing data" items
turned out not to be blocked, and several "authored" features turned out never to have been wired.*

---

## M0 — the audit. DONE 2026-07-29, and it changes three later slices.

### What is actually there

| Thing | Reality |
| --- | --- |
| `dnd_maps` | Exists (seed 421). **1 row live**, `kind='built'`, `published=true`. Columns: `campaign_id, name, kind('image'\|'built'), image_url, storage_path, data jsonb, published, created_by`. |
| `dnd_map_nodes` / `_pins` / `_objects` / `_discoveries` / `_triggers` | **None exist.** All of M1 is greenfield. |
| Maps API | `app/api/dnd/campaigns/[id]/maps/route.ts` — full GET/POST/PATCH/DELETE, plus `maps/asset/route.ts`. |
| React map routes | **Three, and all three are iframes**: `map-studio` → `map-studio.html`, `console` → `console.html`, `planet-forge` → `planet-3d.html`. Each React file is 16–35 lines of chrome around an `<iframe>`. |
| The actual map engine | **7,362 lines of vanilla HTML/JS in `public/dnd/maps/`** — `map-studio.html` (2,888), `console.html` (1,341), `planet-3d.html` (586), `map3d.js` (1,363), `planet3d-model.js` (591), `labels.js` (287), `sky2d.js` (282) — plus a bundled **three.js** in `vendor/three`. |
| Entry points | `CampaignHub.tsx:188`, `CampaignMapsDm.tsx:86/114/121`. |

### Finding 1 — this plan is a rewrite, and it does not say so

Everything M1–M7 describes — a `map_nodes` tree, a React pan/zoom viewport, tokens bound to character sheets
through the per-system derivation, server-filtered hidden objects, a trigger engine — is **React reading
Postgres**. The map that exists is **vanilla JS in an iframe reading a `data jsonb` blob**. The two cannot
share a viewport, a token, an undo stack, or a renderer; an iframe cannot call the sheet's derivation, and the
existing studio has no concept of a node, a pin, or a character.

So M1–M7 does not *extend* the map studio, it **replaces** it — and until that is stated, the slice order
reads as incremental work on top of something that is actually being superseded. The plan is still right (the
node-tree model is the correct answer to "7 levels of map layers", and the iframe tool cannot get there), but
it needs to own the migration: what happens to the 1 live built map, to `dnd_maps.data`, and to the
`planet-forge` → `.planet3d` → Map Studio import handoff, none of which M1–M7 currently mentions.

**Owner question:** is the Stardust Map Studio (the galaxy/planet tool) meant to *become* the tactical map
system, or to stay a separate space-map authoring tool alongside a new React battle-map system? They solve
different problems and the answer decides whether M2 is "route around it" or "port it".

### Finding 2 — M2-1's guard would pass while the thing it guards against is on screen

M2-1 says: *"The 3D/spiral/hybrid engines stay in the repo, unreferenced by the app's display paths. A guard
test asserts no `/dnd` route imports them."*

That guard cannot work here, because **the coupling is not a JS import.** It is (a) an `<iframe src>` pointing
at a static HTML file, and (b) a `>3D<` tab *inside* `map-studio.html`, which carries 148 references to the 3D
machinery and loads three.js. A test asserting "no route imports map3d.js" passes today, unchanged, while a DM
still clicks a 3D tab and `/dnd/campaigns/[id]/planet-forge` still renders a three.js planet baker.

G2 as written ("2D only, retained but not reachable") therefore requires three things the plan does not list:
hide the studio's 3D tab, decide what happens to `/planet-forge` (it is a *creation* tool whose output is
imported as a sprite sheet — arguably already 2D-in-effect), and write the guard against **iframe sources and
tab markup**, not imports.

**Guard shipped:** `__tests__/dnd/map-3d-reachability.test.ts`, written against **iframe sources and script
tags** rather than imports. It is a ratchet, not an end-state assertion — 3D is reachable today, and a test
asserting otherwise would simply be red. It enumerates the current reachability points, forbids new ones, and
starts enforcing the end state by itself the moment the list empties. It also keeps the useless import-based
assertion as a live control case, so the reason it is useless stays visible instead of becoming folklore.

### Finding 2b — the ratchet immediately found two surfaces the manual audit missed

Written to pin four known offenders; it failed on first run with six. The two extra are the point:

- **`public/dnd/maps/console.html` — the PLAYER console.** It loads `vendor/three/three.module.js` and calls
  into `map3d.js` at three sites. G2 is a statement about **what a player sees**, and this is the player's
  map — so this is the *first* thing to fix, not the last. The manual audit walked the React routes and the
  studio and never opened the console's script tags.
- **`public/dnd/maps/_fbxtest.html`** — 24 lines of FBX-loader scratch with **zero references anywhere in the
  repo**, publicly served at `/dnd/maps/_fbxtest.html`, pulling three.js **from a jsdelivr CDN at runtime**.
  That makes it the only external script dependency in the map tree and a live page on a public site. It
  should just be deleted; left in the ratchet rather than removed unilaterally while a second agent is
  working in this tree.

Worth stating plainly: a mechanical guard beat a careful manual read on its first execution. That is the
argument for writing the guard *during* the audit rather than after the migration.

### Finding 3 — the good news

The API layer is real and complete (GET/POST/PATCH/DELETE + asset upload), DM-gating via `getCampaignRole`
works, and `dnd-media` storage plumbing is in place. M1's seeds and the M4-3 asset library have somewhere to
land. Nothing in the audit is a blocker — but two premises were wrong, which is what M0 is for.

---

## Phase M1 — the data model

> ### ✅ M1-1 … M1-5 SHIPPED 2026-07-29 — `seeds/465_dnd_map_nodes.sql`, applied live
>
> All five tables, plus the enforcement. **Applied to production and verified idempotent** (re-running is a
> clean no-op). `dnd_map_nodes` is at 0 rows — the schema is live, the content is M2's job.
>
> **Verification:** `scripts/verify-map-schema.mjs` — **15 invariants, all passing.** It builds the whole
> schema in one transaction, *attacks* it, and rolls back, because the M1 acceptance criterion is "provably
> enforced by tests that attempt violations" and those rules live in Postgres triggers where a vitest unit
> test cannot reach them. What it proves:
>
> | | |
> |---|---|
> | depth | a root is 1 · seven levels nest 1–7 · **a client-supplied depth is ignored** (send `depth: 7` on a child of the root, the DB stores 2) · an 8th level **raises** rather than clamping |
> | cycles | a node cannot be its own parent · cannot be re-parented under its own descendant |
> | re-parent | moving a subtree **cascades depth to every descendant** |
> | G2 | `render_kind: '3d'` is rejected at the constraint |
> | authoring | a pin may point at nothing · a child may exist with no pin — both must not error, and don't |
> | objects | all seven kinds accepted, an unknown kind rejected |
> | discovery | unique per (object, character) |
> | delete | removing a node takes its whole subtree |
>
> **Three decisions worth recording, each of which could have gone wrong quietly:**
>
> 1. **Depth is a trigger, not a column the app sets.** The obvious bug is a route that forgets to compute
>    it. The one that actually bites is **re-parenting**: drag a city under a different province and the
>    depth of the city *and every descendant* changes. An app-side calculation gets the dragged node right
>    and silently leaves its subtree wrong — invisible until someone opens a grandchild. The cascade trigger
>    is why that cannot happen, and it is the invariant most worth the test above.
> 2. **`when` and `then` are SQL reserved words.** The plan spells the trigger columns that way. A table
>    carrying them needs quoting at *every* reference forever, and the first unquoted one is a runtime
>    syntax error rather than a review comment. Named **`fires_when` / `fires_then`**.
> 3. **`child_node_id` is nullable, deliberately.** The plan says a pin pointing at nothing and a child with
>    no pin are both normal authoring states, so the obvious `NOT NULL` would have made the plan's own
>    acceptance criterion impossible. Both cases are asserted.
>
> Also: `dm_notes` sits on `dnd_map_objects` separate from `description`, and there is a partial index on
> `visibility <> 'dm'` — so G3's "different query, not the same payload with a flag" has an index behind it
> and nobody is tempted to fetch everything and filter client-side.

### M1-1 · `map_nodes`
```
dnd_map_nodes
  id uuid pk
  campaign_id uuid not null
  parent_id uuid null            -- null = a root (the space map)
  tier text not null             -- space|world|continent|province|city|district|site  (labels, not types)
  depth int not null             -- 1..7, enforced; derived from parent on write
  name text not null
  blurb text
  image_url text                 -- the map art; null = generated HTML representation (G2)
  render_kind text not null      -- 'image' | 'html'   (never '3d'/'hybrid' while G2 holds)
  grid jsonb                     -- { kind: square|hex|none, size_px, unit_ft, offset, opacity, colour }
  bounds jsonb                   -- logical extent, so zoom is deterministic
  published boolean
  sort_order int
  created_at / updated_at
```
- `depth` derived server-side from `parent_id`; a write that would exceed **7** is rejected with a clear
  message, not clamped (G6).
- Cycle prevention: a node may not be its own ancestor. Enforced in app code *and* by a recursive check.

### M1-2 · `map_pins` — the link between a parent map and a child map
A pin is *where on the parent* a child node lives: `{ map_node_id, child_node_id, x, y, icon, label,
visibility }`. Clicking a pin drills in. A child may exist without a pin (a place not yet located) and a pin may
point at nothing yet (a place marked but not built) — both are normal authoring states and must not error.

### M1-3 · `map_objects` — everything placed on a map
One table, discriminated by `kind`: `image | prop | token | light | area | note | hidden`.
`{ id, map_node_id, kind, x, y, w, h, rotation, z, asset_url, label, description, data jsonb, visibility }`

`data` carries kind-specific fields — and the reason for one table rather than seven is the same as for nodes:
the DM's manipulations (move, resize, rotate, layer, delete, undo) are identical for all of them, so they
should be one code path.

### M1-4 · `map_discoveries` — what has been found
`{ map_object_id, character_id, found_at, found_by_roll }`. Discovery is **per character**, because "the rogue
noticed the loose flagstone and nobody else did" is the point of a Perception DC.

### M1-5 · `map_triggers`
`{ id, map_node_id, when jsonb, then jsonb, once boolean, armed boolean }` — see M6.

*Acceptance for M1:* seeds applied to live Supabase and verified through PostgREST (the established pattern);
RLS on every table with authorization in app code; depth and cycle rules provably enforced by tests that
attempt violations.

---

## Phase M2 — 2D only, now (G2)

### M2-1 · Route every map surface to the 2D renderer

**PLAYER CONSOLE DONE 2026-07-29 — the surface G2 is actually about. Studio + planet-forge remain.**

`console.html` is the player's map, so it is the one the owner's *"for now we only display the 2d
versions"* is really about — and it was the one still shipping 3D: `vendor/three/three.module.js` via
importmap, a `⛶ 3D` toggle button, and `map3d.js` loaded as a static module.

Now behind a single flag, `window.__G2_2D_ONLY = true`:
- the `⛶ 3D` button is **removed, not hidden** — a `display:none` button is still focusable by some
  assistive tech and still in the tab order, so a keyboard player would land on a control that does nothing;
- `map3d.js` is a **gated dynamic import**, because a static `<script type="module" src>` cannot be skipped
  conditionally. With the flag on, a player's browser never fetches a byte of Three.

The importmap is deliberately left in place: it *declares* where the bare specifier `three` resolves and
loads nothing on its own. Lifting G2 later is `__G2_2D_ONLY = false` — one line, nothing deleted, which is
the "retained but not reachable" half of the rule.

**The guard had to get smarter to record this.** Its first version matched any file mentioning
`vendor/three`, which would have kept flagging `console.html` forever and made "finish the 2D-only work"
impossible without deleting files G2 explicitly retains. `loadsThreeD` now distinguishes **declaring** from
**loading**, and it does not simply trust the flag's presence — a page with the gate *and* a leftover static
script tag (the half-migrated case) still counts as 3D. Six tests cover the predicate itself, because if it
is wrong the ratchet passes while 3D ships, which is precisely the failure it exists to prevent.

`__tests__/dnd/map-3d-reachability.test.ts` is now 13 tests, and the ratchet is down **4 → 3**.

**MAP STUDIO'S VIEWER ALSO DONE, same session.** `map-studio.html` carried the identical `⛶ 3D` map viewer
(`view3dBtn` + `map3d.js`); it is gated behind the same flag, same removal-not-hiding treatment.

**What deliberately remains, and why it is a question rather than a task.** Two surfaces still load Three,
and both are *authoring previews of an asset* rather than *displays of a map*:

- **The studio's in-editor object preview** (`EditorPreview3D`, an ungated inline module) — one planet or
  star spinning in the edit card while a DM builds it. Switching it off removes the only way to see what a
  planet will actually look like.
- **`planet-3d.html` / `/planet-forge`** — the planet baker. Its *output* is a baked 2D sprite sheet
  imported into the studio, so it is arguably already 2D-in-effect; only the authoring view is three.js.

G2 says *"no 3D on any display surface"*, and the owner's sentence is *"we only display the 2d versions of
space maps"*. Reading that as covering asset authoring is a stretch; reading it as covering only map render
is my judgement. **Owner question: may a DM author assets in 3D while every map renders 2D?** If the answer
is no, each is one more `if (window.__G2_2D_ONLY)` — the gate is already in both files.

Ratchet: **4 → 3** (`console.html` cleared; `map-studio.html` half-cleared and annotated).

### The guard was wrong three times, and each was caught by running it against real files

Worth recording, because it is the argument for testing a predicate against production rather than only
fixtures. `loadsThreeD` had to learn, in order:

1. **Declaring ≠ loading.** v1 flagged any file mentioning `vendor/three`, so `console.html` could never be
   cleared and "finish the 2D work" was unreachable without deleting files G2 retains.
2. **A gate does not cover the whole file.** v2 asked only "is there a static `<script src=…map3d.js>`
   beside the gate", and cleared `map-studio.html` the moment its viewer was gated — while an ungated
   inline module in the same file still ran `import * as THREE from 'three'`. A false green in the exact
   place the predicate has to be trusted. Now it strips gated `<script>` blocks and tests what remains.
3. **The fixture was simpler than production.** The "an importmap alone is not a load" test used an
   importmap with only the bare `three` key; every real one also has `three/addons/`, which the pattern
   matched — so v3 flagged every page with a genuine importmap. And `planet-3d.html` loads via
   `await import("three")`, a dynamic bare specifier the pattern missed entirely, which cleared the planet
   baker as 2D.

Sixteen tests now, including one per hole.

### M2-2 · HTML worlds

**SHIPPED 2026-07-29** — `lib/dnd/maps/html-world.ts` (pure) + `app/dnd/_ui/maps/GeneratedMap.tsx`
(renderer). **62 tests.**

All seven tiers get their own vocabulary and palette: a starfield with nebulae for `space`, an ocean disc
with landmasses for `world`, regions for `continent`/`province`, a road-and-block lattice for `city`, blocks
for `district`, walled rooms for `site`. An unillustrated node is the *normal* case — seven tiers deep means
a campaign is dozens of maps, and nobody sources art for a province before knowing whether it survives
contact with the party.

**Determinism is the contract, not a detail**, and it is what most of the tests are about. The same node
draws the same picture every time, on every device, for every player — so a DM can say "the big southern
continent" and be understood, and a screenshot in the campaign notes still matches a month later. Seeded
FNV-1a → xorshift, **unsigned throughout** (the bestiary's `sigilFor` produced out-of-range values for
roughly half of all inputs because `>>` coerces to int32; not repeating that here).

Decisions worth recording:

- **The tier is folded into the seed**, not merely used to pick the vocabulary — so a city promoted to a
  province genuinely redraws rather than keeping its street plan under a province palette.
- **An unknown tier falls back to `site`**, the smallest scale. Better a plain floor plan than a starfield
  for something that turned out to be a tavern.
- **SVG, not positioned divs.** The plan says "HTML", and divs would satisfy the letter — but a `viewBox`
  means one component serves a 96px pin thumbnail and a full-screen map with no per-size code, which is
  exactly what M3's zoom needs. It is also one element to the layout engine instead of 130 positioned
  boxes, which matters when a starfield has 130 of them.
- **Not decorative.** Each map carries `role="img"` and a label of name + tier description, because for a
  screen-reader user *"Ironrow — a city street plan"* is the entire content of that element.

Tests assert the contract rather than the aesthetics: identical output for identical input; different nodes
differ; re-tiering redraws; nothing reads `Math.random` (asserted by tampering with it); every shape is
finite, positive-radius, inside the frame, and within a renderable alpha; **a world's landmasses all sit
inside the ocean disc** (one hanging off the edge reads as a bug, not geography); and no two tiers share a
palette, so scale is legible at a glance.

*Bug found while writing it:* the `space` builder read `star(r) && { ...star(r) }` — building a star,
discarding it, and building another. Deterministic either way, which is exactly why it would never have
surfaced as a defect; it just silently burned half the RNG sequence.

**Not yet mounted on a page** — there is no node-browsing surface until M3-2, which is the next slice.
`GeneratedMap` is the component that surface will use; it is complete, typechecked and lint-clean.

### M2-3 · Mobile and desktop parity — **DONE, and it was continuous rather than a slice**

The plan puts this before the new surfaces, which turned out to be the wrong shape for it: every slice
after M4-1 added controls to the same page, so a one-time audit would have been true for about a day.
What actually happened is that G5 was checked at each slice and the findings landed with the code —
recorded here so the pass is visible in one place rather than scattered:

| Slice | Found at 360px | Fixed |
|---|---|---|
| M4-1 | nudge arrows below the touch minimum; a near-black label on a near-black panel | 44px arrows; `--hx-muted` |
| M4-2 | selection chips inherited the shared `hexBtn`'s **38px** | raised locally — every other /dnd surface uses that class at its own size |
| M4-2b | the snap-override **checkbox rendered at 13px**, a third of everything beside it | the whole label is the target, 44px tall |
| M3-3 | 200 tokens dragged at a **median 18.2 ms per frame** at 360px — vsync-bound | no culling needed; the numbers are in the stylesheet |
| M7 | — | fog, terrain and asset controls built at 44px from the start |

**The final sweep**, with every control this document has added on one map: **no horizontal overflow at a
360px column**, 46 interactive controls, and **one** below the touch minimum — the checkbox above, now
fixed.

**One thing measured and deliberately not "fixed":** at fit zoom on a 360px screen a Medium token is
about 16 screen pixels, because M5-1 decided a token occupies SQUARES and is not counter-scaled like a
pin. That is correct and it is also un-tappable — and the answer is the zoom fix from M3-3, which raised
the ceiling from 1.3× of fit to 8×. A DM on a phone zooms in to interact, and now they can. Counter-scaling
the token instead would make it slide off the space it stands in, which is the thing M5-1 refused for good
reason.

---

## Phase M3 — navigation, zoom, and rendering

### M3-1 · The viewport
One pan/zoom viewport component: wheel and pinch zoom, drag and touch pan, momentum, clamped to bounds,
double-tap to fit. Transform-based (no re-layout). Keyboard accessible.

### M3-2 · Drill-down and breadcrumb — **SHIPPED 2026-07-29**

`/dnd/campaigns/[id]/world` — the surface that finally makes M1 and M2 reachable. Before it the schema was
live and the world generator was tested and **neither could be looked at**, which is this repo's signature
defect and the reason the plan puts a page before content at every phase.

| Piece | Where |
| --- | --- |
| Tree walking (pure) | `lib/dnd/maps/tree.ts` — ancestry, children, roots, descendants, height, `canReparent`, breadcrumb. **31 tests.** |
| Reads | `lib/dnd/maps/query.ts` — `loadMapTree(campaignId, { isDm })` |
| Page | `app/dnd/campaigns/[id]/world/page.tsx` |

**G3 is a query, not a render.** `loadMapTree` takes `isDm` and changes what it **SELECTs**: a player's rows
simply never contain unpublished nodes, `dm_notes`, or `visibility: 'dm'` objects. There is nothing for a
client-side mistake to leak, because the secret never crosses the wire. A React conditional would have been
the wrong shape of fix — view-source is not a security boundary.

**Navigation is a URL** (`?node=<id>`), so every level is shareable and bookmarkable and the browser's back
button walks back *up* the hierarchy for free. M3-1's pan/zoom is a client layer that goes on top; the
addressability underneath survives it.

Decisions the tests pin, each of which is a way a player's view could quietly break:

- **An orphan renders as a root.** A player's filtered rows can contain a city whose continent the DM has
  not published — `parent_id` points at something they cannot see. Treating that as an error, or hiding it,
  shows a player an empty world when the DM believes they published a map. `rootsOf` treats unresolvable
  parents as roots, and `ancestry` simply stops there, so the breadcrumb reads *"Ironrow / The Cut"* rather
  than failing.
- **Cycle-safe everywhere.** Postgres forbids cycles (seed 465), but these functions also run over filtered
  and imported rows, and a breadcrumb that spins is worse than one that stops early.
- **`canReparent` counts the SUBTREE, not the node.** Moving a 3-level city under a depth-6 district is
  illegal even though the city itself would fit — the grandchild lands at depth 9. This mirrors the DB
  cascade so the UI can grey out an illegal drop instead of letting the DM find it via an error toast.
- **A pin with no child still renders**, dimmed and not a link. The plan calls "a place marked but not
  built" a normal authoring state; a dead link or a crash would both be wrong.
- **Empty states distinguish *nothing built* from *nothing you can see*** — the two need different actions
  from the reader, and "No maps" reads as broken for both.

*Two testing notes worth keeping.* The `canReparent` depth test initially picked a target that was also a
descendant, so the cycle rule fired first and the depth rule was never actually exercised — the fixture
needed a second deep branch to test what it claimed to. And a boundary case was added afterwards: depth 7
is the last legal level, so a child of a depth-7 node is the first illegal one, which is exactly where an
off-by-one would live.

**Still open in M3:** M3-1 (pan/zoom viewport), M3-3 (LOD culling), M3-4 (prefetch). The page is currently
a fixed-aspect frame — correct at any width, but not yet zoomable.

---

### M3-2 · Drill-down and breadcrumb (original plan text)
Click a pin → push the child node, with a zoom-into-the-pin transition so the hierarchy is *felt*.
Breadcrumb (`Space / Aurelia / Vances Reach / Ironrow / The Cut / Kettle Corner`) with every level clickable,
collapsing to a dropdown on mobile. Browser back mirrors it.

### M3-3 · Dynamic rendering (LOD) — **SHIPPED 2026-08-01, and the feature had never once been reachable**
### M3-4 · Prefetch the likely next level — **SHIPPED 2026-08-01**
> `lib/dnd/maps/viewport.ts` (43 tests), `MapViewport`, and the world page's pins. Browser-driven at
> desktop and 360px against a throwaway 40-pin city and a 200-token battle map.
>
> ## Two defects, one root cause: a scale threshold is not a zoom level
>
> Both tiers of this slice were already written, styled and tested — and **neither could be reached by
> anybody**, because both were expressed in *pixels per world unit* while every reader thinks in
> *multiples of the whole map*. Every node's world is a fixed 0–100 box, so the scale that fits it in an
> ordinary frame is about 6 (measured live at **6.06**). Therefore:
>
> | Written as | Meant | Actually did |
> |---|---|---|
> | `lodFor`: `dots` under 0.6, `labels` under 1.6 | pins as dots when far out | **nothing ever** — both tiers needed the reader to shrink the whole map to a quarter of the frame |
> | `MAX_SCALE = 8` | "eight times" | capped a battle map at **1.3× of fit** — very nearly no zoom at all, on the tactical maps this plan exists for |
>
> A green suite said nothing about either. The tests asserted `lodFor(0.3) === 'dots'`, which is true and
> unreachable, and the CSS that consumed it was correct and never matched. This is the repo's signature
> defect wearing a third disguise: not unwired, not unwritten, but **written in units nobody's hand ever
> produces**.
>
> ## The tier is about ROOM, not about how far out
>
> A pin is counter-scaled, so it is the same size on screen at every zoom — a pin never *becomes* small.
> What actually goes wrong when a reader zooms out is that **labels collide**. So the rule asks the
> question that matters: *are the two nearest markers on screen further apart than a label is wide?*
>
> That is not a tuning change, it is a different rule, and the reason is that it can tell two maps apart
> that a scale threshold cannot: a **continent with three far-flung regions keeps its names** at exactly
> the zoom where a **forty-district city loses them**. Verified live — the 40-pin city opens at `dots`
> with every label hidden, reaches `labels` at ~2× and `full` at ~3.8×, with the ceiling now at 48.51
> (6.06 × 8) instead of 8.
>
> `full` was given a job rather than left as a synonym for `labels`: at tactical zoom a pin also says how
> many places are inside it (*"Ironrow · 2 inside"*), counted from the tree **the viewer can see**, so a
> player is never told there are six locations in a district when four are unpublished.
>
> A rule that was written and then deleted, which is worth recording: the first draft also hid the
> condition pips at `dots`. It reads sensibly and is wrong — **a DM plays a battle map at the zoom where
> the whole room fits**, and on a crowded board that view is `dots`. Hiding "poisoned" and "prone" at
> precisely the zoom the fight is run at would make the map disagree with the sheet on the one screen
> where it matters.
>
> ## The culling in M3-3 is deliberately NOT built, and that is a measurement rather than an opinion
>
> Two things were measured before building it, and both said don't.
>
> 1. **`content-visibility: auto` does not engage inside the transformed world layer.** It is the only
>    culler that would have cost nothing — the browser's own, keeping every element in the accessibility
>    tree and in find-in-page. Driven live at 26× zoom with 40 pins, **28 of them geometrically off
>    screen**, `checkVisibility({ contentVisibilityAuto: true })` reported **zero skipped**. It was in the
>    stylesheet, computed as `auto`, and did nothing. It was written, shipped into the working tree with a
>    confident comment, and then removed — because a comment claiming a cull that does not happen is worse
>    than no cull at all.
> 2. **Culling is not needed at this scale.** 200 tokens on one node, dragged with real pointer events:
>    **median 17.5 ms per frame on desktop and 18.2 ms at 360px**, worst 19.7 ms — vsync-bound in both,
>    i.e. already at the 60fps the acceptance criterion asks for, at **twice** its object count. That is
>    what transform-based panning buys: the compositor moves one layer and the 200 children never
>    re-layout.
>
> The remaining option was a JavaScript culler, and **G6 forbids the version of it that works**:
> unmounting off-screen tokens also removes them from the accessibility tree and from find-in-page, so a
> DM searching a large map for "Ogre" is told it is not there. The numbers are in the stylesheet so the
> next author re-measures instead of re-deciding.
>
> ## M3-4 — where the reader has centred the map is the touch equivalent of hover
>
> The plan says *"on pin hover/focus"*, and hover is exactly the signal a tablet does not have; G5 makes
> mobile first-class, so a prefetch that only fires for a mouse misses half the table. `visibleNearest`
> takes the three destinations nearest the **centre of the view**, 300 ms after the viewport settles —
> what a reader has centred is a decision almost made, and warming mid-drag warms everything the map slid
> past.
>
> **Next's automatic `<Link>` prefetch is turned OFF on the pins**, which is the whole reason a bounded
> cache is possible. This route is dynamic (`?node=`), so an eager Link fetches the full RSC payload the
> moment it scrolls into view: forty pins, forty requests, to make one of them fast. Bounded twice — three
> per settled view, twenty-four for the lifetime of the mount, so panning across a city cannot walk the
> cache up three at a time.
>
> One prop feeds both halves (`markers`), not two, because the tier is decided by how close the pins are
> and the warming by which one is centred — two lists could disagree about where a pin is, and the symptom
> would be a label hidden for a pin nowhere near the one it supposedly collides with. Every pin is passed,
> including ones with no child: an unbuilt pin still occupies the space that decides whether its
> neighbours can be labelled, and the prefetcher filters for `href` itself.
>
> **Dev could not show this, and a production build did.** `router.prefetch` is a hard no-op in
> development (`app-router.js`: *"Don't prefetch during development"*), so no network effect is
> observable there at all — which is worth writing down, because a feature verified only in dev here
> would have been verified as nothing.
>
> Confirmed against `next start` on a clean production build, on the 40-pin city: **exactly 3 RSC
> prefetch requests**, which is `PREFETCH_NEAREST`. Not forty — which is what Next's own eager `<Link>`
> prefetch would have produced on this dynamic route, and the reason it is turned off on the pins. The
> selection is unit-tested six ways besides: nearest-first, bounded, stable on ties, off-screen excluded,
> and zero-limit meaning zero rather than everything.
>
> The same production pass confirmed M3-3 end to end: the crowded city opens at `dots` with every label
> hidden, at a scale of 6.06 — the exact number that made the old absolute thresholds unreachable.

### M3-3 · Dynamic rendering (LOD) — original plan text
What is drawn depends on zoom: pins as dots when far out, labelled icons closer in, full art and grid at
tactical zoom. Objects outside the viewport are not rendered at all (culling), which is what makes a 400-token
city viable (G6).

### M3-4 · Prefetch the likely next level — original plan text
On pin hover/focus, prefetch the child node's payload so drilling in is instant. Bounded by a small cache.

*Acceptance:* 60fps pan/zoom with 200 objects on desktop and a mid-range phone; drill-down under 150ms warm;
seven levels deep navigable and returnable; back button correct at every level.

---

## Phase M4 — the DM's authoring tools

### M4-1 · Grid designer — **SHIPPED 2026-07-30**

Square or hex, size, **feet per square**, offset nudge, colour and opacity, snap on/off. Feeds G4: the grid
is what converts a sheet's speed in feet into squares — which makes this the slice M5-2 was blocked on, and
the reason it came before movement rather than after.

| Piece | What |
| --- | --- |
| `lib/dnd/maps/grid.ts` | The ONE reader. Parse, snap, cells, hex maths, and the feet ↔ world conversion |
| `app/dnd/_ui/maps/GridOverlay.tsx` | Draws it — a server component, inside the transformed layer |
| `app/dnd/_ui/maps/GridDesigner.tsx` | The DM's controls, under the map they change |
| `world/route.ts` PATCH | `grid` added to the field whitelist, via `sanitizeGrid` |
| `__tests__/dnd/map-grid.test.ts` | 24 cases |

**The size is in WORLD UNITS, not pixels — this plan's own wording was wrong.** A node's picture is a 0–100
box drawn through a pan/zoom transform, so a cell measured in screen pixels would be a different fraction of
the map at every zoom level. A grid is a property of the map, not of the reader's window.

**And the DM sets a COUNT, not a size.** Storage needs a cell size; nobody has ever thought *"I would like a
3.3333-unit cell"*. They think *"this room is twenty squares wide"*. So the control is `cells across`, the
size is derived, and the form states the consequence — *"20 × 20 squares · 5 ft each · **100 ft across**"* —
which is what stops a DM discovering at the table that their dungeon is four miles wide.

**Hex is real, not a stub.** Pointy-top axial coordinates with cube rounding, because rounding `q` and `r`
independently leaves points near the corners belonging to no hex — a token that visibly refuses to snap.
Verified live: a click at world (61.4, 33.8) stored (62.5, 32.4760), which is exactly the computed centre of
hex (7, 6).

#### Two defects that were already in the tree, both invisible until a grid existed

Neither was failing, because **no node had ever had a grid** — M4-1 is the first writer. That is this
codebase's signature defect with the halves swapped: not storage nobody reads, but a reader and a writer
that never met.

1. **The cell size had two names.** `seeds/465` documents the column as `{ kind, size_px, unit_ft, … }`;
   `tokens.ts` read `grid.size`. The moment the designer wrote the documented key, every snap and every
   footprint would have silently gone back to "no grid" and carried on working, wrongly. Settled: `size` is
   canonical, the snake_case names are accepted as read-only aliases, and `sanitizeGrid` emits exactly one
   shape so the aliases cannot spread.
2. **Snapping landed on the grid CORNER.** `snapToGrid(7, 12)` on a 5-unit grid returned `(5, 10)` — an
   intersection. Tokens draw with `translate(-50%, -50%)`, so every snapped token straddled four squares and
   the one question a battle grid exists to answer had four answers. Now the cell centre, verified live: a
   click at world (32.3, 47.9) stored **(32.5, 47.5)**, not (30, 45).

#### And three the browser found, which the suite could not

The standing lesson again — 20,092 passing tests said nothing about any of these.

- **The grid was drawn 0.18 pixels wide.** `STROKE` is divided by `--map-scale` so the line stays a constant
  width on screen, which means the constant is *in screen pixels* — and a plausible-looking `0.18` produced a
  line that was present, correct, in the DOM, and almost invisible. Set to `1`. (`non-scaling-stroke` reaches
  the same place implicitly but pins the width to one DEVICE pixel, which is a much fainter line on the
  high-DPI phones G5 is about, so the width stays stated rather than inherited from the display.)
- **The snap checkbox's label was near-black on a near-black panel** (`rgb(15,20,25)`), because a `label`
  inside the hextech shell inherits a colour meant for a light surface, and every other label in the form
  escaped it only by setting `var(--hx-muted)` as part of its layout style. Nothing testable was wrong: the
  control was present, labelled, focusable and correct in the accessibility tree.
- **A test was measuring the wrong thing.** `map-objects-route` asserted the DM gate by looking for
  `{isDm && (` within 400 characters above `<PlaceToken>`. Mounting `GridDesigner` as a legitimate sibling in
  the same DM-only section pushed it past 400 and failed a test whose subject had not changed. Rewritten to
  assert containment — the gate is still open where the control is mounted.

*Verified at desktop and at 360px (G5): the form stacks to two columns, the nudge arrows stay 44px, and the
grid holds a constant hairline from fit-scale through 8×.*

### M4-2 · Place, move, layer — **SHIPPED 2026-07-30 (place / move / remove); the rest listed below**
Drag from an asset tray onto the map; move, resize, rotate, z-order, duplicate, delete. Multi-select with
box-select. Snap to grid, with a modifier to override. Every action goes through the undo machinery (G7).

**What shipped.** `app/api/dnd/campaigns/[id]/map-objects/route.ts` (POST / PATCH / DELETE) and
`app/dnd/_ui/maps/PlaceToken.tsx`, mounted under the map on the world page for the DM only.

The interaction is **arm, then click the map** rather than drag-from-a-tray. Not a compromise: it is one
mechanism that covers both placing and moving, it works on touch, and the armed state is a visible bar that
says what the next click does and how to cancel — a drag has no equivalent of "I am in a mode I forgot
about". Drag can be layered on later; the write path underneath it is the same three verbs.

**Every rule is enforced server-side, and each was verified against the running app rather than argued
from the code** (403 player POST/PATCH/DELETE, 401 anonymous, 400 unbound token, 400 non-numeric position,
404 unknown node — all observed live):

- **The gate reads the NODE's campaign_id, never the URL's `[id]`.** Those are the same thing only if you
  check; without it a DM of campaign A could write objects onto campaign B's map by naming B's node.
- **PATCH and DELETE find the node through the object row**, so a caller cannot name their own node to
  reach someone else's object.
- **A token bound to nothing is refused (400).** `readToken` already returns null for one and the renderer
  drops it — so without the refusal the DM places a token, sees nothing, and has no way to find out why.
  The route and the renderer share the one predicate rather than each having an opinion.
- **Position is snapped then clamped from the node's own grid and bounds.** Order matters: clamping first
  can snap a boundary point back outside the map. The client sends a raw coordinate and does no geometry.
- **A new object defaults to `visibility: 'dm'`.** Revealing is a decision; defaulting to visible would
  make it an accident. `PlaceToken` opts a *token* into `players` explicitly, because being seen is the
  one thing a token is for.
- **Moving is a PATCH, not delete-and-recreate**, so the object keeps its id — and with it its layer,
  visibility and DM notes. Recreating would silently reset all three, i.e. a "move" that un-hides a token.

**The bug the browser caught, which the tests and the typechecker could not.** The click-to-world
conversion first divided by the transformed layer's `getBoundingClientRect().width`, on the reasoning that
"the layer is the world box". It is not: the layer element is *frame*-sized and its children are positioned
in world units on top of it, so at scale 6.06 in a 1078px frame its rect measures **6536px** while the map
draws **606px** — every click would have landed at roughly a ninth of where it was aimed. Nothing in a
green suite says otherwise; one `getBoundingClientRect` in a live page does. The fix uses what is actually
guaranteed — `transform-origin: 0 0` means the rect's top-left *is* where world (0,0) landed, and
`--map-scale` (already published for the pins) is the divisor. Verified by aiming at world (30,70) and
landing at **(29.96, 69.96)**, then moving to (80,20) and landing at **(79.93, 19.99)**.

**Also fixed while in here:** with no maps at all, the empty state said *"Create a space map above to
start"* while the tier select defaulted to `site` — so following the instruction took an extra step that
looked like correcting a mistake. `childTier` now returns `space` when there is no parent node.

**Still open in M4-2 (at the time that was written):** resize, rotate, duplicate, z-order controls,
multi-select/box-select, a snap-override modifier, and G7 undo integration. The z column is written and
read; nothing edits it yet.

### M4-2b · The rest of it — **SHIPPED 2026-08-01**, including G7's undo
> `seeds/511_dnd_map_edits.sql` (applied live, idempotent), `lib/dnd/maps/object-edits.ts` (24 tests) +
> `journal.ts`, the route's bulk verbs and `map-objects/undo`, `MapObjectTools.tsx`, and
> `MapObjectView.tsx`. Every verb driven against a live server; the UI driven in a browser.
>
> ## G7 could not literally join the sheet's undo, and the reason is the interesting part
>
> "Joins the existing edit-history machinery" reads as *write map edits into `dnd_sheet_edits`*. It
> cannot: that table's `character_id` is NOT NULL and references `dnd_characters`, and a grid, a pin or a
> secret door is not a character. Forcing one in means either a fake character id or dropping the
> constraint for everybody — and the second is how the sheet's own undo stops being able to trust its
> rows.
>
> What DOES join is the **model**, which is what G7 is actually about: a batch id groups one user action,
> undo walks it backwards, and a DM who has used "⟲ Undo" on a character sheet already knows how this
> behaves. What differs is the granularity, and deliberately: a sheet edit is deep and narrow
> (`hp.current: 12 → 7`), a map edit is shallow and wide — a resize changes w and h, a delete changes
> everything. So the journal stores **whole rows**, which makes undo one upsert instead of four replays
> that must happen in the right order.
>
> **One request is one undo.** Removing four tokens is one press to get all four back. That is why the
> bulk verbs take `ids` rather than being called in a loop — four requests would be four batches that
> happened to arrive together.
>
> ## The three defects the live pass found, and the third is the one that matters
>
> 1. **A silent half-undo reported as a whole one.** Deleting a hidden object cascades its
>    `dnd_map_discoveries` rows away, so the journal records them too. Every entry in a batch is written
>    by one INSERT and therefore shares a `created_at` to the microsecond — so ordering by timestamp
>    alone was a **tie**, and the discovery was sometimes restored before the object that its foreign key
>    requires. Measured: the object came back, the discovery did not, and the response still said
>    `restored: 2`. Now `seq` orders within a batch, and a refusal is **named in the response** rather
>    than counted as a success. A batch with any failure is left undoable instead of marked done.
> 2. **The undo control had nothing to say.** It read the head entry's summary, which for that same
>    delete is a discovery row with none — so the button read "⟲ Undo" and the toast read "Undone." at
>    exactly the moment a DM needs to know what came back. It reads the batch's first meaningful summary
>    now: *"⟲ Undo removed a rune"*.
> 3. **Box-select selected nothing on a quick drag.** `start` was React state, so the `pointermove` that
>    arrives in the same tick as `pointerdown` still closed over `null` — the move was ignored, the box
>    stayed a dot, and the "that was a tap, cancel" rule then fired because it never grew. A slow drag
>    recovers on the next render and looks perfect, which is why this only shows when a DM flicks a box
>    over three tokens mid-session. A ref, for the same reason `MapViewport` keeps its pointers in one.
>
> ## And the gap the screenshot found: five of the seven kinds were never drawn
>
> `dnd_map_objects` has carried `image | prop | token | light | area | note | hidden` since M1-3, and the
> world page rendered **two of them**. Survivable while nothing could create one — and this slice is
> exactly what changes that, because it offers resize, rotate and layer controls for kinds the map is
> silent about. That is the repo's signature defect in its worst form: not an unwired feature, but a
> control that appears to work and produces something invisible. `MapObjectView` draws the other five,
> one component discriminated by kind for the same reason there is one table, **under** the tokens
> (a prop over a creature hides the one thing a battle map exists to show), with a DM-only object
> outlined as such **on the map** — "I thought they could see the brazier" is a mistake you otherwise
> find out about mid-session.
>
> ## Decisions worth recording
>
> - **A token is not resizeable, and the control is ABSENT rather than disabled.** Its footprint comes
>   from the creature's size category through the node's grid (M5-1b); a width typed onto one would be
>   the map holding a second opinion about how big an Ogre is. Refused server-side too (400), because a
>   control that is merely hidden is a control the next client forgets to hide.
> - **The snap override is a checkbox, not a held modifier.** A grid is a convenience, not a law — a rug
>   across a doorway belongs between two cells — and a keyboard modifier is a gesture half the table (G5)
>   does not have. The CLAMP is not optional in the same way: it is what keeps an object inside the map,
>   where the viewport can reach it.
> - **Bulk move is a DELTA, single move is absolute.** Moving five tokens to the same x,y would stack
>   them on one square; a delta keeps the shape of the group, which is the only thing "move these" can
>   sensibly mean. Same for z: `dz` keeps their order among themselves.
> - **Undo restores the ORIGINAL ID.** A re-insert under a fresh id would put the object back and orphan
>   every discovery, trigger reference and shared `?token=` link that pointed at it.
> - **Rotation wraps rather than clamping**, because `-90` is how a "rotate left" button counts and a
>   clamp at zero would make it stop working the moment a prop was at 0° — where every prop starts.
> - **A bulk verb has a ceiling (100) and refuses rather than truncating** (G6), and a selection spanning
>   two maps is refused rather than gated on whichever one came first.
> - **Selection is client state, unlike `?token=`.** "Look at this token's reach" is worth sharing;
>   "these five props are highlighted" is not, and in the URL it would push a history entry per checkbox
>   and make the back button undo selections instead of navigation.
>
> **Verified live:** 401 anonymous · 403 player · snap to the cell centre (12.3 → 12.5) · freehand
> keeping 12.3 · resize/rotate/layer landing as `w/h 10, rotation 270, z 1` · a token's resize refused
> 400 · a duplicate one cell away carrying its label, size and rotation · a two-object move as ONE
> journal batch · undo restoring both positions · **a deleted found secret coming back with its
> discovery and its roll of 17** · an empty history answering `200 {ok:false}` rather than an error ·
> 101 ids refused. In the browser: the tools render, `Size` is absent for a token and present for a
> prop, a nudge moves one square and the undo button then reads *"⟲ Undo changed iron brazier"*, undo
> restores it and the button returns to *"Nothing to undo"*, and a box drag over world (5,5)–(40,40)
> selects the two objects inside and not the note at (52.5, 52.5). No horizontal overflow at 360px and
> every tool at the 44px touch minimum — the selection chips inherited the shared `hexBtn`'s 38px and
> were raised locally, since every other /dnd surface uses that class at its own size.

### M4-3 · Asset library — **SHIPPED 2026-08-01**
> `lib/dnd/maps/assets.ts` (13 tests), `app/dnd/_ui/maps/AssetTray.tsx`, and a shared
> `MapClickCatcher.tsx`. Driven live and in a browser.
>
> **No new uploader and no new table**, which is what the slice actually asks for. `dnd_media` already
> stores every image a campaign has, with a kind, a label and a DM-only flag, and `POST /api/dnd/media`
> already uploads with a quota, a size cap and a rate limit. A second uploader would be a second set of
> all four, and the first one to get a fix would be whichever the author had open — the two `MAX_BYTES`
> lesson, again. The tray's empty state links to the gallery rather than growing an upload button.
>
> **"Recently used" is measured from the MAPS, not from a click log.** The obvious implementation is a
> `last_used_at` the tray writes on every placement, and it is wrong in a way that shows up immediately:
> a DM who places forty trees and then undoes them has not stopped using trees, and one who imports a
> map full of an asset has used it forty times without touching the tray. Counting `asset_url` across
> the campaign's own map objects answers the real question — *what is actually on my maps* — and there
> is nothing to keep in sync. The count is shown as well as sorted on (`×12`), because that is how a DM
> recognises the tree they have been using without opening each one.
>
> **The tray stays armed after a placement.** *"Placing forty trees means using the same asset forty
> times"* is the sentence the slice exists for; disarming after every drop would make it forty round
> trips through the picker.
>
> **`MapClickCatcher` is now shared**, extracted when this became its second caller. The click-to-world
> conversion has one non-obvious correctness argument — the transformed layer's rect is FRAME-sized, not
> world-sized, so dividing by its width put every click at a ninth of where it was aimed — and two
> copies would be two answers to *"where did the DM click"*, both looking right, only one carrying the
> fix.
>
> **A scheme check the tray did not strictly need.** `asset_url` ends up in an `<img src>` on every
> viewer's screen, so `javascript:` or `data:text/html` in one is the DM handing a script to the whole
> table. Validated once, server-side, on **both** doors — POST and PATCH — rather than trusted at each
> place that draws it. Verified live: `javascript:`, `data:text/html` and `vbscript:` all stored as
> null; `/dnd/maps/tree.png` kept; `//evil.example/x.png` refused, because a protocol-relative URL is
> not the same-origin path it looks like.
>
> Verified in the browser at the DM's map: seven usable images offered, search narrowing to zero with
> *"Nothing matches …"* and restoring, and the place-as choice between Prop and Scenery. Throwaway node
> removed afterwards.

### M4-4 · Node authoring — **SHIPPED 2026-07-29, and it was the slice that mattered**

**The whole map stack was unreachable and nothing said so.** The schema was live (M1), the browser worked
(M3-2), the pan/zoom was wired (M3-1), the player console was plugged in (MC-1) — and **there was no way to
create a single node**. Read-only infrastructure nobody can put data into is the same defect as an unwired
component, arriving from the other direction, and it is harder to notice: every test passes, every page
renders, and the product does nothing.

| Piece | What |
| --- | --- |
| `app/api/dnd/campaigns/[id]/world/route.ts` | POST / PATCH / DELETE, DM-gated |
| `app/dnd/_ui/maps/WorldAuthor.tsx` | Create a location here · rename · re-tier · edit description · publish/unpublish · link to a console body · delete |

Mounted **above the map and present in the empty state**, because that is where a DM starts.

Decisions worth recording:

- **Field whitelists, never `...body`.** Mass assignment here would let a caller set `depth` (the trigger
  owns it), `campaign_id` (moving a node between campaigns), or `id`. Every writable field is named, and
  PATCH distinguishes *absent* from *explicitly null* so a partial update does not blank what it omits.
- **`.eq('campaign_id')` is authorization, not a filter.** Without it a DM of one campaign could edit any
  node in another by id. Verified: a cross-campaign PATCH changes 0 rows.
- **Postgres's refusals are passed through, not replaced.** The trigger messages are written *for a DM*
  ("Seven levels is the maximum. Place this location in a shallower parent.") — swapping them for a generic
  500 throws away the only useful part. Constraint names are translated; real guidance is kept verbatim.
- **A parent must belong to this campaign.** The FK only requires the row to *exist*, so without the check
  a DM could nest their world under someone else's node.
- **Delete names what it destroys.** It cascades to the whole subtree, so the confirm reads "delete Ironrow
  AND the 6 locations directly inside it" rather than a bare "Are you sure?" — and afterwards the UI
  navigates away, since `?node=` would otherwise point at a row that no longer exists.

**Verified against the live schema** in a rolled-back transaction — 9 checks, all passing: root→depth 1,
child→depth 2, the PATCH whitelist, cross-campaign PATCH affecting nothing, `console_ref` unique within a
campaign but free across campaigns, an 8th level refused with a readable message, re-parenting into a
descendant refused, and DELETE cascading with the right child count.

*Also fixed:* `console_ref` was missing from `NODE_COLS`, so the edit form would have shown the console link
permanently blank and silently cleared it on every save.

**Still open in M4:** the grid designer (M4-1), drag-to-place objects (M4-2) and the asset tray (M4-3) —
this slice is node authoring only.

*Update 2026-07-30:* M4-2's core (place / move / remove, DM-gated, server-side snap+clamp) has since
shipped — see its section above. A DM can now author a map and put the party on it in one sitting, which
is the first time the answer to *"can we run a session with this?"* is yes rather than "the schema
supports it". M4-1 is next and is what makes placement mean **squares** instead of arbitrary points:
without a grid, `snapToGrid` is correctly a no-op and a token stands wherever it was dropped.

---

### M4-4 · Node authoring (original plan text)
Create a child node from a pin in one gesture ("this pin needs a map" → new node, correct parent, correct
depth). Rename, re-tier, re-parent (with the cycle rule enforced), publish/unpublish, delete with confirmation
that names the children it will orphan.

*Acceptance:* a DM builds a 3-level map (city → district → tavern) with a grid, ten objects and two pins,
entirely on a tablet, in one sitting, and every step is undoable.

---

## Phase M5 — characters on the map

### M5-1 · Tokens bound to characters — **SHIPPED 2026-07-30 (read + render); placing them is M4-2**

Owner: *"Make sure we can actually run sessions with it."* A map you cannot put a token on is a picture.

**`dnd_map_objects` shipped applied and complete with M1-3 — kinds, positions, z-order, per-object
visibility, DM notes, a `data` blob — and nothing had ever read or written it.** `grep` over `app/` and
`lib/` returned four matches, all in the seed. The signature defect again, and here it was the exact thing
standing between a map tree and a session on it.

Now shipped: `loadMapObjects` (the G3 split), `lib/dnd/maps/tokens.ts` (the rules, 15 tests), and tokens
rendering inside the viewport's transformed layer.

**G3 is now demonstrable rather than asserted.** The module header has always said *"the DM's view and the
player's view are different QUERIES, not the same payload with a flag"* — there was simply no object table
applying it. Verified against live rows through both branches:

| | objects returned | `dm_notes` key |
| --- | --- | --- |
| **Player** | 3 (the `players` ones) | **absent** — not null, absent |
| **DM** | 4 (including the `dm` ambusher) | present |

A player's query does not name `dm_notes` in its SELECT, so the column never crosses the wire; and a
`dm`-visibility object — which is every `hidden` object, the whole Perception-DC mechanic — is not in the
result set at all. `discovered` is deliberately left out of both: whether *this* party has found a thing is
a per-character question, and answering it here without a character would be the guess G3 forbids.

**A token stores who it is and where it stands, and nothing else (G4).** Not HP, not speed, not conditions
— those live on the sheet and are asked for. A token carrying `hp: 42` is wrong the moment the player takes
damage, with nothing to tell either surface they disagree. Pinned by a test that asserts the parsed token
has exactly two keys.

Decisions worth keeping:
- **A token bound to nothing is dropped, not drawn.** A marker pointing at nothing is worse than a gap: a
  DM would move it and target it and find it does nothing. Same rule as `normalizeStatblock` dropping an
  unparseable AC rather than clamping it.
- **A variant beats its parent** when both ids are present — a DM who placed "Elite Ogre" means the elite.
- **Tokens are NOT counter-scaled, unlike pins.** A pin is a marker whose job is to stay legible at every
  zoom; a token occupies squares, and one that kept its screen size while the map grew would slide off the
  space it stands in. Footprint comes from the node's own grid, so Large covers 2×2 and looks it —
  measured live at 61px against Medium's 30px.
- **No grid means no snapping.** A city pin does not sit on a battle grid, and rounding to an imagined
  one-unit grid would visibly move every marker already placed.

**Also found, and worth stating plainly: the live database has ZERO map nodes.** The tree, the renderer,
the viewport, drill-down and node authoring are all built, and no campaign has ever authored a map. So
"run sessions with it" today means starting from an empty world — which makes M4-1/M4-2 (the DM's placing
tools) the next thing that matters, not another read path.

### M5-1b · The token looks like the character, and fills its squares — **SHIPPED 2026-07-30**

> *"We should be able to place the actual round token images from the character sheets and they should be
> adjusted in size to match the grid size. Make sure that tokens are properly anchored to the center of the
> grid they are on."* — owner, 2026-07-30

M5-1's original text already promised this (*"its portrait, name, size category and colour come from the
sheet — not typed in twice"*) and M5-1 shipped none of it: every token was a gold circle with a letter in it,
every token was Medium, and `asset_url` — the one field that could have carried art — was never written.

**The portrait is RESOLVED, never stored.** Copying `token_url` onto the map object at placement time was one
line in `PlaceToken`, and it is the wrong line for exactly the reason `tokens.ts` already refuses to store HP:
a copied value goes stale, and a player who changes their portrait would keep the old face on the board with
nothing saying the two disagree. `lib/dnd/maps/subjects.ts` looks it up at read time — one query per table for
the whole node, not one per token, because twenty goblins are twenty tokens pointing at one row. `asset_url`
survives as the DM's per-piece override, which is what it was always for.

**Size comes from the same place, and this was a live defect.** `PlaceToken` wrote `size: 'medium'` for
everything, so an Ogre stood on one square while its own stat block said Large. `readToken` now reports an
unstated size as **null rather than 'medium'** — the parser is the one layer that cannot ask the subject — and
the renderer resolves *DM override → the creature's own size → medium*. Character size comes through
`speciesView`, so a PF2 ancestry is read by PF2's rules; creature size off the bestiary row; a variant
inherits its parent's art and size, because "Elite Ogre" is a different stat block for the same ogre.

**Anchoring turned out to be about PARITY, not size.** Tokens draw with `translate(-50%, -50%)`, so M4-1's
snap-to-cell-centre is right for a creature one square wide and wrong for one two squares wide: a Large 2×2
centred on a cell centre reaches half a square past the grid on all four sides and covers **nine** squares
partially instead of four completely. So `tokenAnchor` centres odd footprints (1×1, 3×3) on a cell centre and
even ones (2×2, 4×4) on a grid **vertex**. Hex grids are exempt — a hex has no four-way vertex to straddle.

Measured live at 8× zoom, in world units: Medium **20–25 × 30–35** (exactly one cell, centred on its centre),
Large **50–60 × 30–40** (exactly 2×2, edges flush to grid lines).

#### The bug the browser found this time

**The token's ring was 2px inside a layer scaled 6×.** One CSS pixel *is* one world unit in there, so a `2px`
border was 2 of a Medium token's 5 units — 40% of its diameter, swallowing the portrait it was framing, and
getting heavier as the reader zoomed in. Now a fraction of the footprint (`side * 0.07`), which holds at every
zoom and at every size. The same mistake as M4-1's 0.18-pixel grid line, in the opposite direction: both come
from writing a pixel count inside a coordinate space that is not pixels.

*Also fixed in passing:* the portrait renders as an `<img>` rather than `background: url(${art})`. The latter
builds CSS from a DM-supplied string, where an unescaped `)` ends the `url()` and whatever follows is parsed
as more CSS.

### M5-1 · Tokens bound to characters (original plan text)
A `token` object references a `character_id` (PC or NPC/creature from the bestiary). Its portrait, name, size
category and colour come from the sheet — not typed in twice.

### M5-2 · Movement from the sheet (G4) — **SHIPPED 2026-08-01**
> `lib/dnd/maps/movement.ts` (24 tests), `lib/dnd/maps/reach.ts`, `app/dnd/_ui/maps/ReachOverlay.tsx`,
> and `?token=` selection on the world page. Browser-verified end to end.
>
> **The diagonal is a rules decision, and picking one silently would draw a confidently wrong overlay for
> two systems out of three.** 5e's PHB default charges one square for a diagonal (reach is a SQUARE); the
> DMG variant and PF2's core rules alternate 5/10 ft (reach is an OCTAGON); orthogonal-only is a diamond.
> It is an explicit policy defaulted per system, and the alternating rule is priced **against the path,
> not the step** — its cost depends on how many diagonals the path has already used, so the search carries
> that parity in its state. Charging 7.5 ft per diagonal, or doubling every one, is the plausible shortcut
> that gets the second diagonal wrong on every path.
>
> **Dijkstra, not a breadth-first flood.** With difficult terrain the cheapest path is not the one with
> fewest steps, so a flood marks each cell at whatever the first arrival happened to cost. Tested with a
> mud patch the search correctly routes around.
>
> ## The terrain decision, made the way this slice's own note demanded
>
> The note said M5-2 *"must either add [an authoring surface] or state plainly that the overlay ignores
> terrain"*, because building the reader without the writer would repeat a defect this plan had caught
> twice. **Both, in effect:** terrain is a **parameter** (`cost: (cell) => number | null`), never a lookup
> this module invents, so the reader is already correct for the day a writer exists and nothing in it
> changes. Until then `terrainApplied` comes back `false` and the readout says, in the UI and not just in
> a comment: *"Difficult terrain and blockers are not counted — nothing on this map authors them yet."*
>
> **Speed is read, never copied** — `buildLedger(char).value('speed_walk', base)`, the same ledger the
> sheet uses, so the exhaustion −5ft/level rule is not reimplemented here. A second implementation would
> drift, and the first symptom would be a map letting an exhausted character outrun their own sheet.
>
> A creature token gets **no** overlay rather than a plausible wrong one: creature speed lives in a
> different shape and does not go through the ledger.
>
> ## Found in the browser, would not have been found otherwise
>
> `<title>{costFt} ft</title>` inside the SVG produced **13 hydration mismatches**, one per visible cell:
> adjacent JSX children serialise as one text node on the server and hydrate as two. Typecheck, lint and
> 20,000 tests were all green with it in place. Fixed to a single template expression; re-verified at zero
> console errors.
>
> ## Verified against a real map
>
> No map nodes or tokens existed in the live database, so a temporary node (20 squares, 5 ft) and one
> token were created, checked, and **deleted afterwards — back to 0 nodes, 0 objects.** A 30 ft speed on a
> 5 ft grid drew exactly **168 cells** (13 × 13 − 1), the origin outlined once rather than filled, the
> selected token ringed in the overlay's own teal, and the readout reading *"30 ft · diagonals cost one
> square"*. Selection is a URL (`?token=`), matching M3-2's model — so it is shareable, survives a
> refresh, and costs no client JavaScript.
>
> **Still open, and named rather than implied:** an authoring surface for difficult terrain and blockers
> (M6 territory), and drag-to-move with the over-budget warning — `moveWarning` exists and is tested, but
> nothing drags a token yet, so it has no caller.

### M5-2 · Movement from the sheet (G4) — original plan text
Select a token → its remaining movement shows as a reachable-squares overlay computed from the character's
**actual speed** through the per-system derivation (including the exhaustion −5ft/level rule that already
exists, and PF2's action-based movement). Difficult terrain and blockers reduce it. Dragging beyond the
allowance warns rather than forbids — the DM is in charge (G7).

*What M4-1 leaves it:* `feetToWorld` / `worldToFeet` are the whole of G4's conversion and are already
measured from the node rather than assumed, `squareAt` / `hexAt` / `hexDistance` give it cells to spend, and
speed comes off the sheet through the existing ledger (`buildLedger(char).value('speed_walk', …)`), which is
where the exhaustion rule already lives. **Difficult terrain and blockers have no authoring surface yet** —
`dnd_map_objects` can carry them but nothing writes one, so M5-2 must either add that or state plainly that
the overlay ignores terrain. Building the reader without the writer would be the same defect this slice just
found twice.

### M5-3 · Reach, radius and templates — **SHIPPED 2026-08-01 (spell areas; weapon reach still open)**
> `lib/dnd/maps/templates.ts` (30 tests), spell areas surfaced through `loadReach`, a template overlay and
> an area picker on the world page. Browser-verified.
>
> **The areas are PARSED from the sheet, never restated.** The catalogues already write them in the field
> a player reads — `range: 'Self (15-foot cone)'`, `area: '20-foot burst'` — and this slice's whole point
> is that *"the map and the sheet cannot disagree about a spell's size"*. A second structured copy of the
> number would be a copy that goes stale, the same rule that keeps a portrait and HP off a token. The
> picker offers **only the areas that character's own spells state**; a menu of generic templates would be
> precisely the disagreement this slice exists to prevent.
>
> **Tested against the real catalogue, not fixtures.** Running the parser over the shipped 2024 spell list
> proves it agrees with data someone else wrote — a parser tested on strings I invented would only prove
> it agrees with me. Both directions are asserted: every spell whose range states an area yields one, and
> **no spell that states only a distance yields anything** (`'120 feet'` is how far you can cast it, not
> how big it is — inventing a 120-foot template there is the worst failure this file could have).
>
> ## Two things that are RULES, one that is a table ruling
>
> - **Cone angle is per system.** A 5e cone's width equals its distance, which is 2·atan(0.5) ≈ **53.13°**;
>   a PF2 cone is a quarter circle, **90°**. One number for both draws a visibly wrong template for
>   whichever system loses, so it is chosen from the character's own ruleset — and the readout names which
>   one it used.
> - **Emanation ≠ burst.** Same circle; they differ at exactly the square the caster is standing in. An
>   emanation radiates from the creature and includes its square; a burst is centred on a point and does
>   not. Encoded and tested.
> - **Whether a clipped square counts is a TABLE RULING**, so it is a parameter (`centre` | `any`),
>   defaulted to the common virtual-tabletop convention rather than asserting a book's wording I cannot
>   quote.
>
> ## The bug the arithmetic hid
>
> A 15ft cube came out **3×4**. Measuring `0 ≤ along ≤ 15` from a cell centre admits the centres at 0, 5,
> 10 *and* 15 — a closed interval counts both ends of a span with room for three cells. Half-open `[0, 15)`
> gives 3×3, and a 60ft line gives **12** squares rather than 13. One extra square of Lightning Bolt, every
> cast, and nothing would have flagged it.
>
> ## Wiring was not optional here
>
> `no-orphan-modules.test.ts` failed the moment `templates.ts` landed with no caller: *"A module nothing
> calls is indistinguishable from one that does not exist — and worse, because it looks done."* The repo's
> own guard caught the defect I was about to log as "rules layer only". It is wired.
>
> **Verified in a browser** with a throwaway caster (Burning Hands, Lightning Bolt, Spirit Guardians, Fire
> Bolt), all removed afterwards — back to 0 nodes, 0 objects, 0 QA characters. The picker offered exactly
> the three area spells and correctly omitted Fire Bolt's `120 feet`; a 15ft cone aimed south drew **6
> squares in the danger colour** over the teal movement wash — two different claims, two different
> colours, because "I can walk here" and "this is on fire" must not look alike. Zero console errors.
>
> **Still open, and named:** weapon/attack reach from the sheet (the other half of this slice's title), and
> drag-to-aim — direction is eight compass links today, which costs no client JavaScript and points a cone
> anywhere that matters on a square grid.


### M5-2b / M5-3b / M5-4b · the three named remainders — **SHIPPED 2026-08-01**
> `lib/dnd/maps/terrain.ts` (16 tests), `attacks.ts` + `durations.ts` (18 tests), `TerrainBrush`,
> `KeepArea`, and `MapObjectView`'s terrain rendering. Browser-verified on one battle map carrying all
> three.
>
> Each of these was named as open by the slice that shipped its other half, and each closed the same way:
> **the reader already took what it needed as a parameter, so the writer cost an argument.**
>
> ## M5-2b · terrain, and the parameter that paid off
>
> M5-2's own note demanded it: *"M5-2 must either add an authoring surface or state plainly that the
> overlay ignores terrain. Building the reader without the writer would be the same defect this slice
> just found twice."* It stated it plainly; this is the writer.
>
> **Terrain is an `area` object with `data.terrain`, not a new table or a new kind.** Not a shortcut —
> the same argument M1-3 makes for one object table: a patch of mud needs placing, moving, resizing,
> rotating, layering, hiding from players, deleting and **undoing**, and all nine already work for an
> area. A `dnd_map_terrain` table would be a second set of all nine.
>
> **Difficult is a multiplier; blocked is an absence.** `2` and `null` are not two flavours of one
> thing: difficult ground costs double and the search routes around it when that is cheaper, while a
> blocker cannot be entered at all — the case that makes Dijkstra necessary rather than a flood, and the
> one where being wrong is most visible ("I can see the wall and the map says I can walk through it").
> A blocker under a mud patch is still a wall: **the strictest patch wins**, because layer order decides
> what is drawn on top and must not decide whether a wall is a wall. Overlapping mud does not compound —
> two patches on one square is a mapping accident, not 20 feet of movement a DM cannot account for.
>
> **And the readout now makes one of two claims rather than always the pessimistic one.** "Counted
> terrain and found none" and "did not look" are different statements; `terrainApplied` still comes back
> false on a map that authors none.
>
> ### The defect found while testing it: the search had no edge
>
> Nothing bounded the flood, so a token near a border was offered squares **outside** the 0–100 box every
> node draws itself into — where the viewport's own pan clamp means a reader can never even scroll to
> look. On a map with a wall along the edge it is worse: the route went round the wall **by leaving the
> map**. Fixed as a `bounds` PARAMETER rather than a hardcoded box, because `movement.ts`'s own header
> argues exactly that about terrain — the search takes what it needs as an argument, and the caller that
> knows what a map is supplies it. That also keeps every existing test's unbounded plane meaningful.
>
> ## M5-3b · weapon reach, measured the way movement is measured
>
> The decision that matters, and the one a plausible implementation gets wrong: **"within 10 feet" on a
> square grid is not a circle.** It is whatever the system's own distance rule says — 5e's free diagonal
> makes it a 5×5 SQUARE, PF2's alternating diagonals make it an octagon. A Euclidean circle would
> disagree with the movement overlay drawn a moment earlier **on the same token**: two overlays, one map,
> two answers to "how far is that". So reach borrows `cellDistanceFt` and the two cannot drift.
>
> Parsed from `Attack.range`, never restated. `"150/600 ft"` yields **150** — the second number is long
> range, which imposes disadvantage rather than describing where the weapon reaches, and drawing 600
> would tell a player they can shoot cleanly across the map. A bare `"Melee"` gets the system's melee
> default, which is a rule (5 ft in 5e and PF2) and **null for a system that has no such default** rather
> than an invented number. Anything unparseable is simply not offered: a shape drawn from a range nobody
> can read is worse than no shape.
>
> It shares the `?tpl=` slot with spell areas (`atk:10` beside `cone:15`), because from the reader's
> side they are one question — *show me what this can touch from here* — and two parameters would let a
> DM aim both and watch them overlap into one shape.
>
> ## M5-4b · an area that stays, and runs out
>
> **Nothing ticks. The round is read.** The obvious implementation is a decrementing `roundsLeft` that
> some next-turn handler counts down, and it is wrong in three quiet ways at once: a DM who rewinds the
> round (they do — *"wait, we forgot Ana's turn"*) leaves every area stale; an area created while nobody
> has the map open never ticks; two browsers tick it twice. So an area stores the round it BEGAN on, and
> what is left is arithmetic against `dnd_encounters.round` — the counter M5-5 already connected.
>
> The object saves the **shape**, not the cells, and the map recomputes them at read time exactly as the
> live template does. Saving the cell list would be a copy that silently disagrees with the grid the
> moment a DM changes the squares-across.
>
> **An expired area is faded, not removed.** A wall of fire that silently vanished would look like a bug,
> or like something a player dispelled; taking it off is one press in the object tools. And outside a
> fight an area shows its full duration rather than expiring — a spell placed during exploration has not
> started counting down, and an area that disappeared the moment initiative ended would take the DM's
> prepared battlefield with it.
>
> ## Verified on one map carrying all three
>
> A halberdier on a bog with a three-square wall to the west and a 2×2 mud patch to the east:
>
> | | |
> |---|---|
> | The readout | *"162 cells reachable · **Difficult ground and blockers are counted** — the route goes around a blocker and pays double to cross difficult ground"* |
> | Glaive (`Reach 10 ft.`) | **24 squares** — 5×5 minus the token, exactly as the unit test predicts |
> | Dagger (`5 ft`) | **8 squares** |
> | Longbow (`150/600 ft`) | offered as **150 ft**, not 600 |
> | Burning Hands | 6 squares, unchanged from M5-3's own recorded figure |
> | A persisted Spirit Guardians | survives navigation, 29 cells, titled *"— 3 rounds left"* |
>
> The screenshot shows the movement wash stopping at the wall and going around it, the glaive's reach as
> a red square over it, and the mud hatched. Test data removed afterwards — 0 nodes, 0 objects.

### M5-3 · Reach, radius and templates (original plan text)
Attack reach from the weapon; spell areas as the system defines them (5e cone/sphere/line/cube, PF2 emanation/
burst/cone/line). Placed by drag from the sheet's own attack/spell entries, so the map and the sheet cannot
disagree about a spell's size.

### M5-4 · Conditions and effects visible on the token — **SHIPPED 2026-08-01 (conditions; area duration open)**
> `app/dnd/_ui/maps/TokenConditions.tsx`, `subjects.ts` extended, badges on every token on the world page.
> 15 tests. Browser-verified with an afflicted and a healthy token side by side.
>
> **Read at render time, never copied.** The plan says *"the conditions the sheet already tracks"* —
> already, so the token stores nothing. A copied condition is one that stays after it ends: the DM clears
> "poisoned" on the sheet and the board keeps showing it, with nothing saying the two disagree. Same rule
> that keeps the portrait, the size and HP off a token, and the tests assert `tokens.ts` still refuses to
> carry status.
>
> The query stays narrow — `data->meta, data->combat`, not `data`. That column is the entire sheet; pulling
> twenty of them to draw a row of circles would move megabytes.
>
> **A creature gets no conditions, deliberately.** A bestiary row is a template, not a piece on the board —
> there is nowhere per-instance for a status to live, and inventing one would poison every copy of that
> monster at once. TypeScript caught both creature paths the moment the field was added.
>
> **Exhaustion is a level, not a badge.** "Exhaustion 5" and "exhaustion 1" are different situations; a pip
> saying only "exhausted" would hide the number that decides whether the character can act.
>
> ## Two defects the browser found that the suite could not
>
> **1. The status column was 2.19× the height of the token it annotated.** Three conditions + exhaustion +
> an overflow pip made a stack taller than the piece — the ring became the token and the token became a
> detail underneath it. Measured, not eyeballed. The cap is now on the WHOLE column (three pips, the last
> becoming "+N"), which brings it to **1.29×**. Nothing is lost: the dropped conditions are named in the
> overflow tooltip and all of them are in the token's accessible name.
>
> **2. The glyph was 6.5 screen px.** Present, and too small to read. The ratio was re-measured rather than
> guessed — 0.34 of the footprint for the pip and 0.8 of that for the glyph puts it at ~10px at play zoom
> while staying under the token's own initial (`side * 0.5`), which is the ceiling it must not cross.
>
> **And one the repo's own ratchet found:** `inline-style-hex-ratchet.test.ts` failed on four hardcoded
> colours — *"an inline hex cannot be reached by a token, a media query, the print stylesheet or a contrast
> audit."* Now `--hx-danger` / `--hx-danger-2` / `--hx-gold-*` / `--hx-navy-0`, so the pips follow the skin.
>
> Glyphs rather than words, because a Medium token is a fingernail at play zoom and "Frightened" does not
> fit on one — the words live in the `title` and the accessible name, where there is room. An unrecognised
> condition still gets a mark (`●`) rather than being dropped: a homebrew status the map has not been
> taught must not become the map quietly disagreeing with the sheet.
>
> Verified with five conditions + exhaustion 3 on one token and a clean token beside it; test data removed
> afterwards (0 nodes, 0 objects, 0 QA characters). Zero console errors.
>
> **Still open:** *"area effects persist on the map with their own duration"* — M5-3's templates are drawn
> from a URL and vanish on navigation. Persisting one needs a `dnd_map_objects` row with a duration and a
> turn counter to tick it, which is M5-5's territory (`turn order`) and is better built once that exists
> than invented twice.

### M5-4 · Conditions and effects visible on the token (original plan text)
The token shows the conditions the sheet already tracks, and area effects persist on the map with their own
duration.

### M5-5 · Turn order — **SHIPPED 2026-08-01, and it was a CONNECTION, not a build**
> `lib/dnd/maps/turn.ts` (16 tests), a turn banner and a turn ring on the world page. Browser-verified.
>
> ## ⚠ The audit this slice needed, and nearly did not get
>
> M5-5 asks for *"initiative list, current turn, round counter"* — and **all three already existed.**
> `dnd_encounters` + `dnd_initiative_entries` shipped with the campaign platform (seed 410),
> `InitiativeTracker.tsx` drives them, and `app/api/dnd/encounters/…` is the API behind it.
>
> I got as far as **writing `seeds/511_dnd_encounters.sql`** — its own encounter and combatant tables,
> fully commented — before the apply failed with `column "active" does not exist`, because the table was
> already there with a different shape. That is precisely the defect M0 opens this document by warning
> about, caught by the database rather than by me. **The seed was deleted, not reconciled:** two initiative
> models in one app is worse than none, because the DM's tracker and the map would each be right about a
> different fight. A test now asserts that file cannot come back.
>
> So what was missing was never the data. It was that **the map had no idea whose turn it was.**
>
> ## `current_turn_index` is the authority; `is_current` is a copy
>
> The schema carries both — a position on the encounter and a flag per entry.
> `app/api/dnd/encounters/[id]/route.ts` derives the current entry from the **index**, so that is the
> authority and the flag is a denormalised second opinion any write can miss. The map reads the index for
> the same reason, and a test pins **both sides** of that: if the API ever switches to the flag, the test
> notices. A map highlighting a different token from the tracker beside it would make one screen a liar
> with no way to tell which.
>
> ## Matched on the character, never the name
>
> A fight with three "Goblin" entries is the most ordinary encounter there is; a name match would ring all
> three. `dnd_initiative_entries.character_id` is the only link the schema offers, so a creature token
> never matches — correct rather than unfortunate. And when the current combatant is a typed-in name with
> no character row, **the banner says so** rather than leaving a DM staring at a board where nothing
> glows. Both branches were driven in the browser.
>
> ## It reads; it does not own
>
> No next-turn button here, no initiative editing, no second list. `InitiativeTracker` owns that state on
> the session console, and duplicating it would be two trackers to keep in sync. A test asserts
> `turn.ts` performs no insert, update, upsert or delete.
>
> Three token states stay tellable apart: **turn** (gold glow, loudest — it is the one fact the whole
> table needs), **selected** (teal, matching its own overlay), and everything else. Turn outranks
> selection, because a DM inspecting one token has not stopped the fight.
>
> Verified with a live session, a live encounter at round 3, and three combatants — two linked characters
> and one unlinked "Goblin 1". Banner read *"Round 3 · QA Wizard's turn (2 of 3) · Ambush at the ford"*,
> the Wizard's token glowed and its accessible name said *"Wizard, prone, current turn"* (M5-4's condition
> still there). Advancing to the unlinked combatant produced *"— not linked to a character, so no token is
> highlighted"* and zero glowing tokens. All test data removed afterwards.

### M5-5 · Turn order (original plan text)
Initiative list, current turn, round counter. "Simple turn-by-turn manual combat" is a first-class mode: a list,
a next-turn button, and nothing else required (the owner explicitly wants the simple case to stay simple).

---

## Phase M6 — hidden things, descriptions, triggers

### M6-1 · Hidden objects with a DC (G3) — **SHIPPED 2026-08-01**, with M6-3's read-aloud text
> `lib/dnd/maps/discovery.ts` (27 tests), `POST /api/dnd/maps/search`, `loadMapObjects({ discoveredBy })`,
> and the reveal rendered on the world page. **G3 verified end to end against a live server**, not asserted.
>
> ## The shape is the security
>
> The client sends **a roll** and receives **what that roll found**. It never receives a list to filter and
> it never learns a DC — a payload saying *"there is a thing here, DC 18"* is the same leak as sending the
> object, one step removed: a player could read it in devtools and decide whether searching was worth an
> action. The comparison is server-side because it cannot be anywhere else.
>
> `loadMapObjects` gained `discoveredBy` **as a second query, not a looser filter**. The player branch still
> matches `visibility = 'players'` exactly as before; found objects arrive *by id* from
> `dnd_map_discoveries`. So the only way a secret reaches a player is "there is a row saying they found
> it" — never "the WHERE clause got more generous", which is the property this module's header argues a
> refactor must not be able to undo. The revealed row is selected with `OBJECT_COLS`, **not** the DM
> column set: finding a secret reveals the secret, not the DM's commentary about it.
>
> ## Verified live, in this order
>
> | Step | Result |
> |---|---|
> | Player's page **before** | label 0, DM notes 0, DC 0 |
> | Search, rolled **12** vs DC 15 | `{"found":[]}` |
> | Search, **wrong skill** at 30 | `{"found":[]}` |
> | Search, rolled **17** | returns the object |
> | Player's page **after** | label ✓, read-aloud ✓, **DM notes still 0** |
> | DM's page | label ✓, DM notes ✓ |
> | `dnd_map_discoveries` | one row, `found_by_roll: 17` |
>
> ## The defect the browser pass found
>
> After a successful search the discovery was **written** and the object was **returned** — and the page
> still showed nothing, because it only ever rendered `kind === 'token'`. A secret you successfully find
> and still cannot see is indistinguishable from one you failed to find. Reveals are now drawn as
> counter-scaled markers plus a read-aloud panel, which is **M6-3 delivered alongside** (`description` for
> everyone who has found it, `dm_notes` for the DM only — and only because the DM's own query selected it).
>
> ## Rules decisions
>
> - **`total >= dc` — equal MEETS it.** The single most common off-by-one in tabletop software, and it is
>   silent: the puzzle just seems slightly harder than the DM set.
> - **A hidden object with no DC is unfindable.** A half-written secret revealing itself to the first
>   searcher is worse than one that never reveals, because the DM never learns it was unfinished.
> - **No skill named means any check finds it** — "notice this somehow" is what an unset field means, and
>   refusing every roll would make it permanently unfindable.
> - **A miss is not an error.** 200 with an empty `found`; the player learns exactly what a player at a
>   table learns. The per-reason miss counts exist for a DM log and are *deliberately not returned* —
>   "3 things here you failed to find" is the map pointing at the secrets it just refused to show.
>
> The route also refuses a character from another campaign (without that check, a member could write
> discoveries onto someone else's character) and bounds the client-supplied roll while recording it in
> `found_by_roll`. It does **not** re-derive the roll from the sheet: a real search carries advantage,
> guidance, a bardic die and a DM's flat bonus, and re-deriving would refuse half the rolls a table makes.
> The honest description is that the DC stays secret, the comparison is server-side, and the roll is
> logged — a player editing their total in devtools is doing what a player lying about a d20 does, and the
> DM can see it either way.
>
> **Still open in M6 (at the time this was written):** M6-2 passive detection, M6-4 triggers and M6-5 trigger safety. `dnd_map_triggers`
> exists (M1-5) and has no reader — the `when`/`then` machinery is the largest remaining piece of this plan.

### M6-1 · Hidden objects with a DC (G3) (original plan text)
A `hidden` object carries `{ skill: perception|investigation|…, dc, description, reveals }`. **The player's map
payload does not contain it.** When a player rolls the relevant check — through the existing roller, so the
result is auditable — the server compares and, on success, writes a `map_discovery` and pushes the reveal. A
client that never received the secret cannot leak it.

### M6-2 · Passive detection — **SHIPPED 2026-08-01**
> `lib/dnd/maps/passive.ts` (pure rules, 21 tests) + `lib/dnd/maps/passive-scan.ts` (the I/O half),
> running on the player's world page. Verified end to end against a live server with four hidden objects.
>
> ## Passive is not a free roll, and that is the whole design
>
> The tempting implementation compares every hidden object's DC against a passive score. It would be
> wrong in a way nobody would report as a bug: it quietly deletes the difference between **looking
> around** and **searching the bookcase**, which for a lot of dungeons is the entire puzzle. So only
> `PASSIVE_SKILLS` (Perception) is eligible — an **Investigation** secret still needs
> `POST /api/dnd/maps/search`, because investigating is an action you take.
>
> **Range is required, not optional.** Without it, walking onto a map reveals every passively-findable
> secret on it at once. 30 ft by default, short on purpose; a DM who wants a thing noticed from across
> the room says so on the object (`noticeRangeFt`).
>
> **The score is not recomputed here.** `summarizeMember` already derives it per system — 10 + the
> Perception modifier for 5e, PF2's Perception proficiency for PF2, and **null for IG**, which has no
> equivalent and where inventing one from Wisdom would be a rule we made up. A second implementation
> would drift, and the first symptom would be the map noticing things the party sheet says it should
> not. A test reads the file and asserts it contains no `abilityMod` / `profBonus` / `10 +`.
>
> **A passive find is recorded with `found_by_roll: NULL`**, deliberately: a DM reading the audit trail
> can then tell *"they walked past and spotted it"* from *"they searched and rolled a 17"*. Writing an
> invented number would destroy the distinction the column exists for.
>
> **It runs on render, not on movement** — the plan says "when a token moves within range" and nothing
> moves tokens yet. Rendering asks the same question at the only moment currently available: *the party
> is standing here; what do they notice?* Building the comparison and leaving it uncalled until
> drag-to-move exists is the pattern `no-orphan-modules` was written to stop.
>
> **It scans for the VIEWER's own characters only.** Scanning on the DM's behalf would write discoveries
> onto sheets nobody was looking at — a player would return to find their character had "noticed" things
> during someone else's session.
>
> ## The defect found before it shipped: the marker landed in the corner
>
> A discovery written *during* a render is not in the object payload that render already fetched — the
> object was `visibility: 'dm'` at fetch time. The merge looked the position up in `objects` and fell
> back to `?? 0`, so the first time a player noticed a rune beside them, its marker drew at world (0,0)
> — the corner of the map — and was correct again on the next reload. **Wrong exactly once**, which is
> the hardest kind of wrong to notice. `PassiveNotice` now carries `x`/`y`, because the caller genuinely
> cannot look them up.
>
> ## Verified live, with four objects chosen to be told apart
>
> | | |
> |---|---|
> | A rune, Perception DC 14, 10 ft away (passive 16) | **found**, marker at exactly (12.5, 22.5) |
> | A sigil, Perception DC 5, ~110 ft away | **not found** — range, not DC, is what stopped it |
> | A flagstone, **Investigation** DC 5, adjacent | **not found** — it needs an action |
> | The rune's `dm_notes` | **never in the player's HTML** |
>
> Plus: `found_by_roll` written as `null`; the banner appears once and not on the second visit while the
> rune stays visible; the DM sees all four and the `dm_notes`, and **the DM's own visit wrote no
> discoveries**. Throwaway campaign data removed afterwards — back to 0 nodes, 0 objects.

### M6-2 · Passive detection (original plan text)
Some systems notice things without rolling (5e passive Perception). Supported as an automatic server-side
comparison when a token moves within range.

### M6-3 · Descriptions
Any object or region can carry read-aloud text and DM-only notes. Players see the former on discovery; the DM
sees both, always.

### M6-4 · Triggers — **SHIPPED 2026-08-01 (engine + DM preview board; the executor followed, below)**
### M6-5 · Trigger safety — **SHIPPED 2026-08-01**
> `lib/dnd/maps/triggers.ts` (32 tests) and a DM-only trigger board on the world page.
> `dnd_map_triggers` shipped with M1-5 and **had no reader until now**.
>
> ## The engine is pure, and that is what makes the preview honest
>
> Nothing in it reads a database or performs an effect. `resolve()` takes an event and a set of triggers
> and returns **a plan** — an ordered list of actions plus the chain that produced them. The caller
> executes it, or shows it to a DM without executing it, and **both use the same code**.
>
> That is the whole answer to *"an untestable trigger is a trap for its author"*. A preview built from a
> second, parallel code path is a preview of something else: the DM tests the puzzle, it works, and the
> real firing does something different. A test asserts `preview()` and `resolve()` produce the same
> actions for the same trigger.
>
> `preview` bypasses `armed` and `once` **on the chosen trigger only** — testing a disarmed or
> already-fired trigger is the point — while everything it chains to is walked under the ordinary rules.
>
> ## M6-5: a puzzle that eats itself fails loudly
>
> - **Cycles are reported with the PATH, not just detected.** "Cycle detected" says there is one; *"Alarm
>   bell → Guard summons → Alarm bell"* says where it is. Checked against the path rather than a global
>   visited set, so a **diamond** — two branches firing the same trigger — is allowed, because refusing it
>   would break the composability triggers exist for.
> - **The chain still returns what it safely resolved.** Failing loudly is not failing entirely; the DM
>   sees the effects that do work *and* the link that does not.
> - **Depth cap (8) and a total-action cap (200).** A chain of 20 distinct triggers has no cycle and is
>   still a runaway, and a fan-out bomb is as bad as a cycle while the depth cap catches neither.
> - **A dangling `fire_trigger` is named**, not skipped — a DM who deleted a trigger another one calls
>   learns it here rather than at the table.
> - **An unknown action stays in the plan AND is reported.** Dropping it would make a typo silently do
>   nothing.
>
> ## Verified in a browser, with a real cycle in the database
>
> Three triggers on a live node — one healthy pit trap, plus `Alarm bell → Guard summons → Alarm bell`
> with a dangling reference. The DM's board showed all three, the cycle warning naming its path, and the
> broken reference. **A player saw none of it**: no board, no trigger names, no action kinds — a trigger is
> the machinery behind a puzzle, and handing a player the `when`/`then` is handing them the answer.
>
> Two things the browser caught that the tests had not:
> 1. **"across 4 triggers" on a three-trigger map.** `fired` records each WALK and a diamond legitimately
>    walks one twice — a small lie in the one place a DM checks whether their puzzle is sane. Deduplicated,
>    with a test.
> 2. **The cycle path printed raw UUIDs.** The path is the entire value of a cycle report; three UUIDs is
>    something to decode before it is something to act on. Now names.
>
> ⏸ **Still open, and it is the larger half: the EXECUTOR.** The engine says what should happen; nothing
> performs it yet, and nothing emits the events (`token_enters`, `door_opened`, …) that would drive it.
> That needs a per-action implementation — `apply_damage` writes to a sheet, `spawn_creature` writes a map
> object, `post_feed` writes to the campaign feed — each of which touches a subsystem with its own rules.
> Deliberately not rushed into this slice: a half-implemented executor that silently no-ops three of its
> eleven actions is worse than an engine that plainly has no executor, because the DM's preview would
> promise things that never happen.


### M6-4b · the executor — **SHIPPED 2026-08-01**
> `lib/dnd/maps/execute.ts` (11 tests), `POST /api/dnd/campaigns/[id]/map-triggers/fire`, and a
> "⚡ Fire it for real" button on the DM's trigger board. All eleven actions driven live.
>
> M6-5 deferred this with a condition attached, and the condition is the design:
>
> > *"a half-implemented executor that silently no-ops three of its eleven actions is worse than an engine
> > that plainly has no executor, because the DM's preview would promise things that never happen."*
>
> So the contract is **not** "perform everything". Three of the eleven genuinely cannot be performed by a
> server. The contract is that **no action returns nothing**, and each of the three says why in words a
> DM can act on.
>
> ## Three outcomes, and `asked` is not a failure
>
> | | |
> |---|---|
> | `done` | the database changed |
> | `asked` | the table has to do it — a die is rolled by a person, speakers are in the room |
> | `failed` | attempted and refused, or it names something that is not there — with the reason |
>
> Recording an `asked` as a failure would make a healthy puzzle look broken; recording it as `done` would
> be the lie this file exists to prevent. Both are posted to the campaign feed, so the DM sees the ask
> rather than having to notice its absence.
>
> **It does not roll dice, and a test asserts there is no `Math.random` in it.** The server could
> generate a number, and that would be the map quietly taking a roll away from the table — the same
> reason `maps/search` accepts the player's own total instead of re-deriving it.
>
> ## The structural test is the one that matters
>
> `KNOWN_ACTIONS` has eleven entries; a test reads the executor's source and fails if any of them has no
> `case`. That is the exact failure M6-5 refused to ship, and it is the one that returns silently the day
> someone adds a twelfth action. There is also no `break` anywhere in the switch — every branch returns
> an outcome, so a fall-through cannot quietly perform the wrong action.
>
> ## Decisions worth recording
>
> - **Every map write is scoped to the node, every sheet write to the campaign**, asserted by a test that
>   scans the queries. Without it a trigger could name an object id belonging to someone else's map.
> - **Damage floors at zero and refuses a sheet with no HP.** Negative HP is a rules question this map
>   does not get to answer (5e says 0 and death saves; other systems differ), and `0 − amount` on a sheet
>   with no HP would invent a number the map has no business deciding.
> - **A condition already present is `done`, not a failure.** A pit trap that fires twice should not
>   report an error the second time — the character is prone either way, which is the state asked for.
> - **A moved or spawned token is snapped and clamped through the same helpers the placing route uses**,
>   so a trigger cannot put a token somewhere a DM could not — including off the map, where M5-2's new
>   bounds mean nothing could ever walk to it.
> - **`once` is disarmed AFTER the work, and only for triggers that actually fired.** A run that failed
>   part-way leaves them armed: a puzzle a DM can retry beats one that is spent and did nothing.
> - **The live path resolves through the same `preview()` the board renders.** M6-4's whole argument was
>   that a preview from a parallel code path is a preview of something else; firing from a "fire it"
>   button uses the DM's explicit choice, so a disarmed trigger still fires rather than the control
>   silently doing nothing.
> - **The feed is `dnd_roll_log`**, which is where M7-4 already says map-driven activity belongs. A
>   trigger with its own log would be a second place to look during a fight.
>
> ## The defect the live pass found
>
> The feed's `actor_name` was written as the DM's display name, so narration read *"Andrew — The floor
> gives way beneath you."* That column answers **who is speaking**, and for a trap the answer is the
> trap. Everyone at the table already knows who the DM is; what they cannot tell from a name is
> read-aloud text from an instruction to roll. Now `Read aloud` / `Trigger` / `Map`.
>
> ## Verified live — one trigger carrying all eleven actions plus two malformed ones
>
> `401` anonymous · `403` player · then **9 done · 2 for the table · 3 failed**:
>
> ```
> done   reveal_object     Revealed A sigil.
> done   move_token        Moved Victim to (27.5, 27.5).        ← 27.3/27.9 snapped
> done   apply_condition   QA-M64 Victim is now prone.
> done   apply_condition   QA-M64 Victim was already Prone.     ← idempotent, not an error
> done   apply_damage      QA-M64 Victim takes 7 damage (20 → 13).
> done   show_description  The floor gives way beneath you.
> done   post_feed         A gong sounds somewhere below.
> asked  roll_check        Roll Dexterity save (DC 15).
> asked  play_sound        Cue "QA-M64 Gong" on the soundboard.
> done   spawn_creature    Spawned Acolyte at (62.5, 62.5).
> done   hide_object       Hid A sigil.
> failed apply_damage      apply_damage needs a characterId and a numeric amount.
> failed reveal_object     No object "0000…" on this map.
> failed melt_the_floor    "melt_the_floor" is not an action this map knows how to perform.
> ```
>
> And the world actually changed: the sigil ended `dm` (revealed then hidden), the token at exactly
> (27.5, 27.5), one `prone` rather than two, HP 13, the Acolyte on the board, and the `once` trigger
> disarmed with a `fired_at`. Test data removed afterwards — 0 nodes.
>
> **Still open in M6:** nothing emits `token_enters` / `door_opened` automatically — the events exist and
> the route accepts them, but only a DM's button and an explicit event POST reach them today. Emitting on
> a token move belongs with drag-to-move, which is M7's territory.

### M6-4 · Triggers (original plan text)
`when` → `then`, both data:
- **when**: token enters/leaves a region · object discovered · check passed/failed · turn starts/ends · door
  opened · DM fires manually.
- **then**: reveal object · hide object · show description · move token · apply condition/damage · roll a check
  · play a sound · spawn creature · fire another trigger · post to the campaign feed.

Composable, `once`-able, armable/disarmable, and **fully previewable by the DM** ("fire this now") — an
untestable trigger is a trap for its author. This is the machinery behind "really complex encounters and
puzzles and challenges".

### M6-5 · Trigger safety
Cycle detection and a depth cap on trigger chains, with the chain shown in the DM's log. A puzzle that
infinite-loops must fail loudly, not hang the table.

---

## Phase MC — the player console, plugged in (owner request, 2026-07-29)

> *"Please make it so that the custom viewer that has all of the space sounds and stuff is also totally
> plugged in to show descriptions and locations and information and images of places and thumbnails and
> everything like that. It should be wired to work with everything we are building."* — and, clarifying:
> *"This is the viewer that the players have when they are viewing the map."*

**MC-1 · The bridge — SHIPPED 2026-07-29.**

Two map systems existed and did not know about each other. The console renders a `dnd_maps.data` stardust
blob whose bodies are `instances` with their own string ids; the world is `dnd_map_nodes`, a tree of real
rows carrying descriptions, art and children. A player clicking a planet saw whatever prose the DM typed
into the blob, while the node holding that planet's actual record was invisible.

| Piece | What |
| --- | --- |
| `seeds/466_dnd_map_node_console_ref.sql` | `console_ref` on `dnd_map_nodes` — the stardust instance id a node represents. **Applied live, verified idempotent.** |
| `app/api/dnd/campaigns/[id]/world/route.ts` | The tree, player-filtered, for a viewer that cannot import TypeScript |
| `public/dnd/maps/console.html` | Fetches it, indexes it, and enriches the CRT readout |

Selecting a body now shows, beneath the stardust data: the node's **tier record header**, its **thumbnail**,
its **authored description**, its **sub-locations as clickable chips**, and an **▶ ENTER ⟨PLACE⟩** link into
the React world page.

Decisions worth recording:

- **G3 is enforced at the endpoint, not in the console.** The console is a static file any player can read,
  so anything sent to it is disclosed. `loadMapTree(..., { isDm: false })` is the *same function* the React
  page uses — two readers of one tree must not be two queries that can disagree about what a player may see.
- **`console_ref` first, lowercased name second.** The explicit link survives a rename; the name fallback is
  what makes every *existing* map useful with no DM effort. Name-only would have been wrong in both
  directions — two moons called "Kestrel" collide, and a rename silently unlinks. First-wins on a collision,
  so the picture does not depend on row order.
- **Both descriptions are shown when both exist.** The stardust `desc` and the node `blurb` are different
  fields written at different times; silently preferring one loses whichever the DM edited last.
- **Enrichment must never take the map down.** A failed world fetch is swallowed — the console's job is to
  render the map, and the node records sit on top of it.
- **Navigation targets the top window.** The console runs in an iframe; a same-frame link would render the
  whole app nested inside its own map viewer.
- The world refreshes on its own 12s interval alongside the 4s map poll, so publishing a location or editing
  a description reaches players without a reload.

*Small hazard fixed in passing:* an HTML comment in `console.html` contained a literal script open-tag while
explaining the G2 gate. Legal HTML, but it breaks naive parsers — including the syntax check used while
editing the file, which reported a false error. Reworded, with a note saying why.

**MC-2 · the rest of the bridge — DONE 2026-08-01.** All three of the items this section listed as open
are closed, and the first was already closed when it was written:

- **`console_ref` has an editor**, and had one before this note was read again. `WorldAuthor` carries it,
  the world route whitelists it, and the page passes it — end to end. **The note was stale, and re-reading
  the code before building the "missing" feature is the only reason a second editor was not written
  beside the first.** That is this repo's signature defect arriving from a third direction: not unwired
  code, but a plan describing the app as it was.
- **Sectors and systems are linked**, not only bodies. `nodeFor` already took `{id, name}` and a sector
  is one, so the whole change was passing it — the two-index design (explicit `console_ref` first,
  lowercased name second) did the rest.
- **POIs link to their node**, when one shares their name. Deliberately a LINK and not a whole node
  record: the body's readout already carries one, and a full block per POI would bury the body's own
  description under its landmarks.

---

## Phase M7 — live play — **SHIPPED 2026-08-01**

> `seeds/512_dnd_map_fog.sql` (applied live, idempotent), `lib/dnd/maps/fog.ts` (13 tests),
> `FogOverlay` / `FogTools` / `LiveMap`, the player-move exception on `map-objects`, and the search's
> feed line. Driven live with a DM and two players on one fogged map.

### M7-1 · Player view — read-only, fog-limited, **own-token movable**

The first two clauses were already true: G3 has made the player's view a different QUERY since M3-2, so
there is nothing on their page to make read-only. The third was the hole, and it is deliberately the
narrowest possible exception to the DM-only rule.

**A player may change the POSITION of a token bound to a character they own, and nothing else.** Not its
visibility (which would reveal an ambusher), not its label, not its layer, not another player's piece,
and not several at once. `PLAYER_MOVE_FIELDS` is a whitelist and a body carrying `visibility` beside `x`
is **not a move with an extra field — it is a reveal wearing a move's clothes**, so the whole request is
refused rather than filtered.

**Ownership is checked against the CHARACTER row.** A token's `data.characterId` is the DM's claim about
what the piece stands for; `dnd_characters.owner_user_id` is the database's claim about whose it is, and
only the second one is a permission. Campaign membership is still required on top — owning a character is
not being at the table, and a character can outlive the campaign it was made in.

### M7-2 · Fog of war — it HIDES, it does not darken

The whole slice turns on one decision. **A player's fog is opaque and the things under it are not sent at
all**: tokens, scenery, pins, discovered secrets and persisted spell areas are each filtered out of the
render, not covered up. A token drawn beneath a translucent overlay is a token anybody can find by
turning up their screen brightness — the same class of mistake as filtering a secret in React instead of
in the query (G3). The DM's fog is a wash, because their job is to read the map AND know what the party
cannot see.

**Fog is one masked rectangle, not a grid of dark cells.** A per-cell fog is 1,600 elements on a 40×40
map to draw a shape that is mostly one colour, and it looks blocky in a way nothing else here does. One
`<rect>` with an SVG mask, holes punched by the revealed patches and the vision circles, at any zoom.

**`fog` is a column, not an inference.** The tempting version — "fog is on when a revealed patch exists"
— needs no schema change and is wrong exactly when fog matters most: a DM who has darkened a corridor and
revealed nothing yet would have no fog at all, because there is nothing to infer it from. And not on
`grid`, which `readGrid` sanitises to a fixed shape and which M4-1 already found two names for.

**Revealed regions are ordinary `area` objects** (`data.fog = 'revealed'`), so every M4-2 tool reaches
them — including the one that matters at a table: a DM who reveals the wrong room presses **⟲ Undo**.

**Vision is read from the sheet.** `speciesView(...).senses` already says "Darkvision 60 ft" on the
player's own sheet; `visionFt` takes the LARGEST stated sense rather than the first, because taking the
first makes the answer depend on the order a species file was written in. Feet are converted through the
node's own grid, so 60 ft of darkvision is 60 feet of *this* map. A character whose senses say nothing
gets `DEFAULT_SIGHT_FT` — a **stated** default rather than an invented rule, because with fog on a party
of humans would otherwise be blind and a DM would have to hand out darkvision to run a dark corridor.

### M7-3 · Sync — refresh the server render, do not mirror it

Everything on this page is computed on the server: the G3 split, the fog holes, the terrain costs, the
portraits. A client-side mirror would be a second implementation of all of it, and **the first thing to
drift would be the one that decides what a player may see.** So `LiveMap` calls `router.refresh()`, which
re-runs the same render for this viewer — which means a late joiner and a reconnect need no special case,
because their next refresh IS full state, produced by the code that owns the rules. That is P7-4's
"late-joiner full state" satisfied by construction rather than by a second payload.

Three rules make polling behave, and each is a defect avoided:

1. **Nothing polls a hidden tab** — a DM with twelve tabs open is not re-rendering twelve maps. This is
   also the reconnect-after-sleep fix: a waking laptop fires `visibilitychange` and refreshes at once
   rather than at the next tick.
2. **Nothing refreshes while an input is focused.** `router.refresh()` swaps the server-rendered tree
   under a control and can drop a keystroke — and the DM authoring a description is the one person
   guaranteed to be typing on this page.
3. **A refresh in flight is not started again**, so a slow connection does not stack requests and make
   the page worse the worse the network is.

And a **Pause while I set up** button, because a DM staging a scene needs the board to hold still — the
small version of the plan's "stage privately and publish".

### M7-4 · The roll feed connection — and the care it needs

A map search now posts to `dnd_roll_log`, which is where the plan says it belongs (*"the feed work
already shipped is the right home, not a second log"*).

**And it says nothing about whether anything was found.** A line reading "found something" on a hit would
announce to the whole table that there WAS something to find — the same leak M6-1 closed by refusing to
return the miss counts. The feed carries what a table actually sees when someone searches a room: who
searched, with what, where, and the number on the die. Verified: a roll of 4 and a roll of 19 produce
identical lines apart from the number.

### Verified live — one fogged crypt, one DM, two players

| | |
|---|---|
| Player's own token | visible |
| A token 100 ft away in the dark | **not in their HTML at all** |
| Scenery beside it | **not in their HTML at all** |
| Fog holes for the player | 1 — their own dwarf's vision |
| DM | sees all three |
| After the DM brushes that corner | the player sees both, immediately |
| Player moves own token to (22, 22) | **200**, snapped to (22.5, 22.5) |
| Player moves another player's token | **403** |
| Player sends `{x, y, visibility: 'dm'}` | **403** — the whole request, not the visibility field |
| A third player moving the first one's token | **403** |
| Feed after a miss (4) and a hit (19) | two identical lines, differing only in the number |

Test data removed afterwards — 0 nodes.

### The last two gaps, closed 2026-08-01

Both were named at the end of M7 and both are done. They turned out to be one thing: a token that moves
is the event, and a drag is how a token moves.

**Drag-to-move.** The write path has existed since M4-2; the gesture had not, so moving a piece meant
arming a control under the map and clicking. **It needs no mode, unlike box-select, and the reason is the
whole design:** a drag on empty map is ambiguous between panning and selecting, but a drag that begins ON
a token is not — nothing else could be meant. So the handler attaches to the tokens and stops the gesture
reaching the viewport.

It also does not break the click. A token is a LINK (selecting it shows its movement, M5-2), so a
handler that swallowed every `pointerdown` would take that away. The distinction is DISTANCE — under
five screen pixels is a click and the link is untouched; past it, the navigation is suppressed and the
piece moves. Screen pixels rather than world units, because the threshold is about the reader's hand and
not about the map. And the drop sends a **raw world coordinate**: snapping, clamping, the DM/own-token
gate and the triggers all stay server-side, exactly as they are for click-to-place.

**`token_enters` now fires by itself**, which is what makes M6-4's executor part of play rather than a
button. `lib/dnd/maps/regions.ts` (12 tests) answers *"which regions did this token just walk into"*,
and the distinction in that sentence is the design: **entered, not "is inside"**. Asking for containment
would spring a pit trap on every step across the room it is in, which at a table reads as the map being
broken rather than as the puzzle being clever. Regions are half-open on their far edge for the same
reason the terrain patches are — a closed interval puts a shared wall in both rooms and fires two
triggers for one step.

A map with no triggers, or no regions, pays for none of this: both are checked before anything else is
loaded.

Verified live — a pit with a trap on it, and a walker:

| Step | Result |
|---|---|
| Walk in | `triggered: ["Walker entered a region — 3 effects applied"]` · **HP 30 → 24** |
| Move WITHIN the pit | no trigger, **HP unchanged** |
| Walk out | no trigger |
| Walk back in | fires again — it is not a `once` trap · **HP 24 → 18** |
| The sheet | carries `prone` |
| The feed | *"Read aloud — The flagstones give way."* |

Test data removed afterwards — 0 nodes.

**Nothing in this plan is now unbuilt.**



### The original M7 plan text

## Phase M7 — live play

### M7-1 · Player view
Read-only, fog-limited, own-token movable. Reuses the campaign's existing realtime plumbing.
### M7-2 · Fog of war and vision
Per-node fog with DM reveal brush; token vision radii from the sheet (darkvision etc.).
### M7-3 · Sync
Token moves, reveals and trigger effects broadcast to everyone at the table, with the DM able to stage changes
privately and publish them.
### M7-4 · The roll feed connection
Map-driven checks (a Perception attempt against a hidden object) appear in the existing recent-rolls feed with
their reason — the feed work already shipped is the right home, not a second log.

---

## Slice order

**M0** audit ✅ → **M1-1…M1-5** schema + seeds ✅ (2026-07-29, applied live, 15 invariants verified) → **M2-1…M2-3** 2D-only + HTML worlds
→ **M3-1…M3-2** viewport + drill-down → **M3-3…M3-4** LOD + prefetch → **M4-1…M4-4** DM tools → **M5-1…M5-3**
tokens + movement + templates → **M6-1…M6-3** hidden + descriptions → **M6-4…M6-5** triggers → **M5-4…M5-5**
conditions + initiative → **M7-1…M7-4** live play.

Each slice: typecheck + lint + tests + **browser verification at desktop and 360px**, committed on its own.

## Why this stays good for a long time

Three properties are doing the work, and each is a direct response to how this codebase has actually broken
before:

1. **One node type and one object table.** The recurring defect here is *"authored but not wired"* — a feature
   built for one case and never connected for the others. Seven tier types would have guaranteed it. One type
   means a fix to dragging, undo, or mobile layout lands everywhere at once.
2. **Secrets never reach the client.** A hidden item filtered in the UI is not hidden. Making the *query*
   different, rather than the rendering, means a future refactor cannot accidentally reveal it.
3. **The sheet owns the numbers.** Movement, reach and areas are asked for, never restated. The map cannot
   drift from the rules because it does not hold a copy of them — the same reason the rollers never recompute a
   total.
