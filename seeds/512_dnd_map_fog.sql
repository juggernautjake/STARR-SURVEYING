-- seeds/512_dnd_map_fog.sql — fog of war, per node (M7-2).
--
-- ── WHY A COLUMN AND NOT AN INFERENCE ───────────────────────────────────────────────────────────────
--
-- The tempting version is "fog is on when at least one revealed patch exists", which needs no schema
-- change and is wrong at exactly the moment fog matters most: a DM who has fogged a map and revealed
-- nothing yet — the corridor before anyone opens the door — would have no fog at all, because there is
-- nothing to infer it from. The state a DM wants is *"this map is dark until I say otherwise"*, and that
-- is a fact about the node, not about its contents.
--
-- ── AND NOT ON `grid` ───────────────────────────────────────────────────────────────────────────────
--
-- `grid` is a jsonb blob and it would have fitted. It is also the one column M4-1 already found two
-- names for (`size` vs `size_px`), and every reader of it goes through `readGrid`, which sanitises to a
-- fixed shape — a boolean smuggled in there would either be stripped or force `readGrid` to know about
-- something that is not geometry.
--
-- The REVEALED regions are ordinary `area` map objects carrying `data.fog = 'revealed'`, for the same
-- reason terrain is (see `lib/dnd/maps/terrain.ts`): they need placing, moving, resizing, hiding,
-- deleting and undoing, and all six already work for an area.

BEGIN;

ALTER TABLE dnd_map_nodes
  ADD COLUMN IF NOT EXISTS fog boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN dnd_map_nodes.fog IS
  'Fog of war: when true, players see only what the DM has revealed (area objects with data.fog = ''revealed'') plus what their own tokens can see. Default false — a map is lit unless a DM darkens it, because the alternative is every existing map going black on deploy.';

COMMIT;
