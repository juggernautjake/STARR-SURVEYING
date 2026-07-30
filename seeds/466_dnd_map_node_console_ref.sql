-- seeds/466_dnd_map_node_console_ref.sql — link a map node to a body in the player console.
--
-- Owner, 2026-07-29: *"Please make it so that the custom viewer that has all of the space sounds and stuff
-- is also totally plugged in to show descriptions and locations and information and images of places and
-- thumbnails and everything like that. It should be wired to work with everything we are building."*
--
-- ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────────────────────────────────
--
-- There are two map systems and they do not know about each other. The console (`public/dnd/maps/
-- console.html`) renders a `dnd_maps.data` blob — the stardust format, whose bodies are `instances` with
-- their own string ids. The nested world (seed 465) is `dnd_map_nodes`, a tree of real rows with
-- descriptions, art and children. A player clicking a planet in the console gets whatever prose the DM
-- typed into the blob; the node holding that planet's actual description, image and sub-locations is
-- invisible to them.
--
-- `console_ref` is the join: the stardust instance id that a node corresponds to. One nullable text column
-- rather than a join table, because the relationship is at most 1:1 and a table would need its own
-- lifecycle for nothing.
--
-- ── WHY NOT MATCH ON NAME ────────────────────────────────────────────────────────────────────────────
--
-- Name matching is the obvious shortcut and it is wrong in both directions: two moons called "Kestrel" in
-- different systems collide, and renaming a node silently unlinks it. The console DOES fall back to a
-- case-insensitive name match when `console_ref` is null — that keeps existing maps useful with no DM
-- effort — but the explicit reference is what makes the link survive a rename, which is why it exists.
--
-- Unique per campaign, not globally: the same stardust id can legitimately appear in two campaigns' blobs,
-- since those ids are generated inside each map document.

BEGIN;

ALTER TABLE dnd_map_nodes ADD COLUMN IF NOT EXISTS console_ref text;

COMMENT ON COLUMN dnd_map_nodes.console_ref IS
  'The stardust `instances[].id` in dnd_maps.data that this node represents, so the player console can show the node''s description, art and children when a body is selected. NULL = not linked; the console then falls back to a case-insensitive name match.';

-- Partial unique index: two nodes must not claim the same console body within one campaign, but any number
-- of nodes may be unlinked. A plain UNIQUE would treat every NULL as distinct on some engines and would
-- also block the (campaign, NULL) case here from being repeated — the WHERE clause states the intent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd_map_nodes_console_ref
  ON dnd_map_nodes (campaign_id, console_ref)
  WHERE console_ref IS NOT NULL;

COMMIT;
