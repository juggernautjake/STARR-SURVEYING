-- seeds/645_job_map_layers.sql — layers, so a busy map stops being one crowded sheet
--
-- Owner, 2026-09-18: "I want it where we can create different layers for points. right now we are
-- sticking the points on the same level, but that might make things get cramped a little … We can
-- still put all of the points on one layer, but we can also create and name layers and have layer
-- management and move points between layers if we so desire … We need to be able to name and rename
-- layers too. We need to be able to hide and unhide the different layers too."
--
-- Spec: docs/planning/in-progress/interactive-property-map-2026-09-16.md
--
-- ── WHY A LAYER IS NOT A POINT TYPE ─────────────────────────────────────────────────────────────
--
-- The map already groups points by `point_type` (utilities, fences, buildings …) and the legend can
-- already filter by it. That is a CLASSIFICATION: what a point is, drawn from a fixed vocabulary, and
-- a point has exactly one whether or not anybody chose it.
--
-- A layer is a SHEET the surveyor decided to make: "first visit", "for the title company",
-- "everything Hank flagged". It is named by a person, it is theirs to rename, and the whole reason
-- for it is that it can be switched off so the picture underneath is readable. Overloading the type
-- vocabulary to carry that would mean adding a colour every time somebody wanted a new sheet, and
-- would lose the one property that matters here — that a layer can be hidden.
--
-- So: type stays the classification and keeps the colours; layer is the sheet. They filter
-- independently and both are honoured at once.
--
-- ── EVERY POINT IS ON A LAYER, INCLUDING THE ONES THAT PREDATE LAYERS ───────────────────────────
--
-- `layer_id` is nullable and NULL is read as "the map's default layer". That is deliberate: it means
-- this migration does not have to invent a layer for every map that already exists and then backfill
-- every point, and it means a map whose owner never opens the layers panel behaves exactly as it did
-- yesterday. `ensureDefaultLayer()` in lib/jobs/property-map-server.ts creates the row lazily, the
-- first time a map is actually read, and adopts the NULL points into it.
--
-- The partial unique index on `is_default` is what stops two concurrent reads of the same map each
-- deciding to create that row.
--
-- ── DELETING A LAYER MUST NOT DELETE POINTS ─────────────────────────────────────────────────────
--
-- ON DELETE SET NULL, not CASCADE. A sheet being thrown away is not the survey work on it being
-- thrown away, and NULL already means "the default layer" — so a deleted layer's points fall back to
-- the base sheet and stay on the map. The API moves them explicitly as well, so the fallback is a
-- backstop rather than the mechanism.

BEGIN;

CREATE TABLE IF NOT EXISTS public.job_map_layers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  map_id      uuid NOT NULL REFERENCES public.job_property_maps(id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT 'Layer' CHECK (btrim(name) <> '' AND char_length(name) <= 120),
  -- Top-to-bottom order in the layers panel. Not a z-order: the pins are drawn by the map in ordinal
  -- order regardless, because a pin hidden under another pin is a pin nobody can click.
  ordinal     integer NOT NULL DEFAULT 1 CHECK (ordinal > 0),
  -- Hiding is saved rather than kept in the browser. A two-person firm looking at the same job wants
  -- "the sheet I turned off" to still be off tomorrow and on the other person's screen; a per-browser
  -- toggle would make the map look different to each of them with nothing to point at.
  is_visible  boolean NOT NULL DEFAULT true,
  -- The sheet every point lands on when nobody has chosen. Exactly one per map, and it cannot be
  -- deleted — see the API. It CAN be renamed, which is why it is a real row and not a synthetic one.
  is_default  boolean NOT NULL DEFAULT false,
  created_by  text,
  updated_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

COMMENT ON TABLE public.job_map_layers IS
  'A named, hideable sheet of points on a job property map (owner, 2026-09-18). Distinct from point_type, which classifies what a point IS: a layer is a grouping somebody made and can switch off. NULL job_map_points.layer_id means the map default layer.';

-- The one listing query: a map's live layers, in panel order.
CREATE INDEX IF NOT EXISTS idx_job_map_layers_map
  ON public.job_map_layers (map_id, ordinal) WHERE deleted_at IS NULL;

-- One default sheet per map. This is what makes the lazy `ensureDefaultLayer` safe to call from two
-- requests at once: the loser of the race gets a unique violation and re-reads instead of creating
-- a second base layer nobody asked for.
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_map_layers_one_default
  ON public.job_map_layers (map_id) WHERE is_default AND deleted_at IS NULL;

-- Two live sheets on one map should not share a name — "which 'Utilities' did you mean?" is not a
-- question a layers panel should be able to ask. Case-insensitive, because "Utilities" and
-- "utilities" are the same sheet to everybody except the database.
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_map_layers_name
  ON public.job_map_layers (map_id, lower(btrim(name))) WHERE deleted_at IS NULL;

-- ── THE POINT'S SHEET ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.job_map_points
  ADD COLUMN IF NOT EXISTS layer_id uuid REFERENCES public.job_map_layers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.job_map_points.layer_id IS
  'Which layer this point is on. NULL means the map default layer — the state every point created before seeds/645 is in, and what a point falls back to when its layer is deleted.';

-- "Show me this layer's points", and the count beside each layer's name in the panel.
CREATE INDEX IF NOT EXISTS idx_job_map_points_layer
  ON public.job_map_points (layer_id) WHERE deleted_at IS NULL;

-- Server-only, like every other job-owned table: reads and writes go through the API with the
-- service role, which is where the job's permissions are actually checked.
ALTER TABLE public.job_map_layers ENABLE ROW LEVEL SECURITY;

COMMIT;
