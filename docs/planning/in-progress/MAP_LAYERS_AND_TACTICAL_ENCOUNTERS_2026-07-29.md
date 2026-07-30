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

### M2-3 · Mobile and desktop parity for the existing map surfaces
The current map pages audited and fixed at 360px and desktop before new surfaces are added on top.

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

### M3-3 · Dynamic rendering (LOD)
What is drawn depends on zoom: pins as dots when far out, labelled icons closer in, full art and grid at
tactical zoom. Objects outside the viewport are not rendered at all (culling), which is what makes a 400-token
city viable (G6).

### M3-4 · Prefetch the likely next level
On pin hover/focus, prefetch the child node's payload so drilling in is instant. Bounded by a small cache.

*Acceptance:* 60fps pan/zoom with 200 objects on desktop and a mid-range phone; drill-down under 150ms warm;
seven levels deep navigable and returnable; back button correct at every level.

---

## Phase M4 — the DM's authoring tools

### M4-1 · Grid designer
Square or hex, size in pixels, **feet per square**, offset nudge, colour and opacity, snap on/off. Feeds G4:
the grid is what converts a sheet's speed in feet into squares.

### M4-2 · Place, move, layer
Drag from an asset tray onto the map; move, resize, rotate, z-order, duplicate, delete. Multi-select with
box-select. Snap to grid, with a modifier to override. Every action goes through the undo machinery (G7).

### M4-3 · Asset library
Reuse the existing File Explorer / media plumbing rather than a new uploader. Campaign-scoped asset tray with
search; recently-used first, because placing forty trees means using the same asset forty times.

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

### M5-1 · Tokens bound to characters (original plan text)
A `token` object references a `character_id` (PC or NPC/creature from the bestiary). Its portrait, name, size
category and colour come from the sheet — not typed in twice.

### M5-2 · Movement from the sheet (G4)
Select a token → its remaining movement shows as a reachable-squares overlay computed from the character's
**actual speed** through the per-system derivation (including the exhaustion −5ft/level rule that already
exists, and PF2's action-based movement). Difficult terrain and blockers reduce it. Dragging beyond the
allowance warns rather than forbids — the DM is in charge (G7).

### M5-3 · Reach, radius and templates
Attack reach from the weapon; spell areas as the system defines them (5e cone/sphere/line/cube, PF2 emanation/
burst/cone/line). Placed by drag from the sheet's own attack/spell entries, so the map and the sheet cannot
disagree about a spell's size.

### M5-4 · Conditions and effects visible on the token
The token shows the conditions the sheet already tracks, and area effects persist on the map with their own
duration.

### M5-5 · Turn order
Initiative list, current turn, round counter. "Simple turn-by-turn manual combat" is a first-class mode: a list,
a next-turn button, and nothing else required (the owner explicitly wants the simple case to stay simple).

---

## Phase M6 — hidden things, descriptions, triggers

### M6-1 · Hidden objects with a DC (G3)
A `hidden` object carries `{ skill: perception|investigation|…, dc, description, reveals }`. **The player's map
payload does not contain it.** When a player rolls the relevant check — through the existing roller, so the
result is auditable — the server compares and, on success, writes a `map_discovery` and pushes the reveal. A
client that never received the secret cannot leak it.

### M6-2 · Passive detection
Some systems notice things without rolling (5e passive Perception). Supported as an automatic server-side
comparison when a token moves within range.

### M6-3 · Descriptions
Any object or region can carry read-aloud text and DM-only notes. Players see the former on discovery; the DM
sees both, always.

### M6-4 · Triggers
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

**Still open for MC:** the DM has no UI to *set* `console_ref` (today it is a column with no editor — the
name fallback covers the common case); sectors/systems are not yet linked, only bodies; and POIs could map
to child nodes rather than being blob-only.

---

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
