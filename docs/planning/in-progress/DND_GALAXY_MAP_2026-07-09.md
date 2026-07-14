# Stardust Galaxy Map Suite → integrated into the /dnd backend

**Source:** four self-contained vanilla HTML tools + a handoff brief (uploaded 2026-07-09):
Map Studio (DM editor), Stardust Console (player viewer), Galaxy Forge (spiral generator —
*file not attached; functionality is inlined in Studio*), 3D Planet Generator (Three.js).
**Goal (per the user, overriding the handoff's "static site" deploy):** bring the full suite
**into the /dnd platform**, DB-backed and **restyled to our hextech (League-of-Legends) look**,
with a **DM "Map Management"** section in campaign management to **upload a premade map image**
*or* **open the built-in map maker/generator**.

---

## 1. What the suite does (from the handoff)

- **Map Studio** — DM workbench: object library (planet/star/moon/station/debris/system/galaxy/
  spingalaxy/svg/background), place instances (drag-ghost-confirm, move/resize/duplicate), draw
  sectors/systems (polygon + scale/rotate/reshape handles, auto-nesting sub-systems), drop POIs
  (16 kinds, anchored + spin-locked to bodies), map-wide + per-object effects (sparkles, nebula,
  shooting stars), publish maps for a campaign.
- **Console** — read-only "ship console" player viewer: loads the published campaign map, pan/zoom/
  fit, click a system/body to fly + read lore/faction/stats/POIs on a CRT readout, legend.
- **Galaxy Forge** — procedural differential-spin spiral galaxies (or import an image) → export.
- **3D Planet Generator** — real WebGL planets (Three.js via CDN) → bake to a `.planet3d`
  spinning sprite-sheet that the dependency-free map places.

**Shared engine** (copy-pasted into every file — we extract it once): `art(asset, animate)` (renders
any object kind → SVG string), `fxOverlay(fx, seed)`, `DiffSpinGalaxy` (image → concentric spin
rings), `POI_TYPES`/`poiIconSVG`, `spiralSVG`/`nebulaSVG`, `AmbientFX` (starfield/shooting stars).

**The `stardust-map` schema (v2)** is the contract (see handoff §3.1): `{ type, version, meta,
background, centerGalaxy, mapFx, sectors[], instances[], assets[] }`. Sectors are world-space
polygons with style (`borderStyle/borderWidth/fillOpacity`) + fx; instances are bodies with
`x/y/size`, a `look` object per kind, `fx`, and anchored `pois[]` (`ax/ay ∈ [-1,1]`).

---

## 2. Integration architecture (the key decisions)

**Decision A — port strategy: bring the tools in as restyled, DB-wired client pages, do NOT rewrite
the engine to React.** The four apps are large, working, and self-contained; the value is the
canvas/SVG engine, not the DOM plumbing. We keep the vanilla engine and:
1. **Restyle** — replace each tool's `:root` CSS variables + Google-font imports with our hextech
   tokens (`--hx-navy/panel/gold/teal/text`, Cinzel/Inter) and adjust component chrome (buttons,
   panels, tabs, inspector) to the League-of-Legends framed-panel look.
2. **Re-persist** — replace every `localStorage["stardust-*"]` read/write with `fetch()` to new
   `/api/dnd/campaigns/[id]/maps` endpoints backed by a `dnd_maps` table. Same-origin → the platform
   session cookie authorizes DM writes / member reads.
3. **Mount** — serve the tools as platform routes under `/dnd/campaigns/[id]/map-studio` and
   `…/console` (self-contained pages that run the vanilla engine in a `useEffect`, or as a
   same-origin `<iframe>` of a restyled static asset with a postMessage↔API bridge — pick per tool
   during its slice; the editor is heavy enough that a same-origin static asset + fetch-shim is the
   lower-risk path).

**Decision B — storage model.** New `dnd_maps` table (one row per map):
`{ id, campaign_id, name, kind: 'image' | 'built', image_url, data jsonb (stardust-map), published,
 created_by, created_at, updated_at }`. Uploaded images reuse the `dnd-media` bucket (same as
CampaignGalleryDm). Built maps store the `stardust-map` JSON in `data`. `localStorage` size cap
(~5 MB) goes away; image-heavy maps live in Storage + Postgres.

**Decision C — DM Map Management** lives in `app/dnd/_ui/CampaignPageClient.tsx` as a new framed
`section` (DM-only), offering: **Upload premade map** (png/jpeg/webp → dnd-media → `dnd_maps` row,
kind='image'), a **list** of the campaign's maps (image + built) with **publish toggle**, **rename**,
**open**, **delete**, and **＋ Open Map Maker** (launches the Studio for this campaign). Players see
the **published** map in the campaign hub via the restyled Console.

**Decision D — Three.js dependency** stays only in the 3D Planet Generator (it needs WebGL);
everything it produces (a baked sprite-sheet in `.planet3d`) is consumed by the dependency-free
Studio/Console, so the *map itself* never needs WebGL or a network. Loaded via the existing CDN
import-map with a clear offline message (unchanged).

**Decision E — the missing Galaxy Forge file.** `galaxy_diffspin_placeable.html` was not attached.
Its differential-spin spiral engine (`DiffSpinGalaxy`, `spiralSVG`) is **inlined in Map Studio**, so
core galaxy generation is covered inside the editor. A standalone Forge page is a later, optional
slice (reconstructable from the shared engine) — flagged, not blocking.

---

## 3. Data model (new)

```sql
CREATE TABLE dnd_maps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES dnd_campaigns(id) ON DELETE CASCADE,
  name         text NOT NULL DEFAULT 'Untitled Map',
  kind         text NOT NULL DEFAULT 'built',   -- 'image' | 'built'
  image_url    text,                            -- for kind='image' (dnd-media bucket)
  storage_path text,
  data         jsonb,                           -- for kind='built' (stardust-map v2)
  published    boolean NOT NULL DEFAULT false,  -- the one players see in the hub
  created_by   uuid REFERENCES dnd_users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
```
Authorization (app code, service-role): **DM of the campaign** writes/publishes/deletes; **members**
read published maps. Mirrors `getCampaignRole`.

---

## 4. Implementation slices (commit plan)

- **Slice 0 — Planning doc** *(this file)*.
- **Slice 1 — Maps data + DM Map Management (image path):** `seeds/421_dnd_maps.sql`; API
  `/api/dnd/campaigns/[id]/maps` (GET list, POST upload-image + create, PATCH rename/publish,
  DELETE) ; the **Map Management** section in `CampaignPageClient` (upload premade map, list,
  publish/rename/delete). Players' hub shows the published image map. A complete, useful vertical.
- **Slice 2 — Shared engine module:** extract the vanilla engine (`art`, `fxOverlay`,
  `DiffSpinGalaxy`, `POI_TYPES`, `spiralSVG`, `nebulaSVG`, `AmbientFX`) into one file the tool pages
  share; re-skin its palette to hextech tokens.
- **Slice 3 — Map Studio (DM editor):** the restyled editor at `/dnd/campaigns/[id]/map-studio`,
  persistence wired to the maps API (save/publish/open/list). "＋ Open Map Maker" launches it.
- **Slice 4 — Console (player viewer):** restyled read-only viewer that loads the campaign's
  published built-map from the API; surfaced in the campaign hub.
- **Slice 5 — 3D Planet Generator + Galaxy Forge:** restyled generator page (Three.js CDN) exporting
  `.planet3d` into the editor; optional standalone Forge page.
- **Slice 6 — Verify + polish:** tsc + eslint + `npx vitest run __tests__/dnd`; headless renders.

Each slice: typecheck + lint, commit, push. Seed files are the DB hand-off (the DM applies them).

---

## 5. Restyle spec (hextech)

Replace each tool's cosmic palette with our tokens (keep a *space* feel via the dark navy ground):
`--void→--hx-navy-0 (#010a13)`, `--panel→--hx-panel (#0b1a2c)`, `--panel2→--hx-panel-2`,
`--line→--hx-line`, `--gold→--hx-gold-1/2`, accent `--aether/cyan→--hx-teal-1 (#0ac8b9)`,
`--ink→--hx-text (#f0e6d2)`, `--dim→--hx-muted`. Fonts → Cinzel (display) / Inter (body). Buttons and
panels adopt the framed-panel / `.hexBtn` treatment. The map canvas keeps a deep-space backdrop
(navy + starfield) so bodies read, but all chrome (tabs, inspector, toolbars, modals) becomes hextech.

---

## 6. Assumptions, risks, deferrals

- **No live DB from here.** The `dnd_maps` table + any demo map ship as a seed the DM applies; runtime
  degrades gracefully if unmigrated (API try/catch → empty list).
- **Port fidelity:** the vanilla engine is preserved verbatim (only palette + persistence change), so
  editor/console behavior stays identical to the working files. Restyling touches CSS only.
- **Galaxy Forge standalone file missing** — core spiral gen is inlined in Studio; standalone page
  deferred to Slice 5 / optional.
- **Storage:** built maps with embedded data-URL images can be large; we store the JSON in Postgres
  `jsonb` and push raw uploaded images to the `dnd-media` bucket (not inline) to stay well under
  row-size limits.
- **Auth:** map read/write reuses `getCampaignRole` (DM writes, members read) — no new auth surface.
