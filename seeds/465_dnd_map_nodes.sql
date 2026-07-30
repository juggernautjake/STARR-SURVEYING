-- seeds/465_dnd_map_nodes.sql — the nested map tree (M1-1 … M1-5).
--
-- Plan: docs/planning/in-progress/MAP_LAYERS_AND_TACTICAL_ENCOUNTERS_2026-07-29.md
--
-- ── ONE NODE TYPE, NOT SEVEN ─────────────────────────────────────────────────────────────────────────
--
-- The owner asked for seven tiers — space → world → continent → province → city → slum → street corner.
-- Modelling seven TYPES would mean seven tables, seven editors, seven renderers and seven places to forget
-- something, and it breaks the first time a DM wants a district between city and slum, or a dungeon three
-- levels inside one building. So `tier` is a LABEL on a self-nesting node, not a structural distinction: a
-- world map and a street corner differ in their content and grid scale, not in their nature. "A location
-- could have even more locations in it" then falls out for free instead of being a special case, and depth
-- 7 is a validation rule rather than seven code paths.
--
-- ── WHY DEPTH IS A TRIGGER AND NOT A COLUMN THE APP SETS ─────────────────────────────────────────────
--
-- `depth` is derived from the parent, in the database, on every insert and update. Two reasons, and the
-- second is the one that bites:
--   1. A client-supplied depth is a client-supplied lie waiting to happen. Every route that creates a node
--      would have to remember to compute it, and the one that forgets writes a node that sorts and
--      validates as a root.
--   2. RE-PARENTING. Drag a city under a different province and the depth of the city AND EVERY DESCENDANT
--      changes. An app-side calculation gets the node right and silently leaves its subtree wrong — the
--      classic tree bug, invisible until someone opens a grandchild. The trigger cascades.
--
-- Exceeding depth 7 RAISES rather than clamps (plan G6, "nothing silently truncates"): a DM who nests one
-- level too far must be told, not quietly given a sibling of the thing they meant to nest inside.
--
-- ── CYCLES ───────────────────────────────────────────────────────────────────────────────────────────
--
-- A node may not be its own ancestor. Enforced HERE rather than only in app code, because a cycle is not a
-- validation nicety — it makes `depth` non-terminating and hangs any recursive read. The plan says "app
-- code AND a recursive check"; this is that check, and it runs before the depth cascade so a cycle can
-- never be created even momentarily.
--
-- ── RESERVED WORDS ───────────────────────────────────────────────────────────────────────────────────
--
-- The plan writes the trigger columns as `when` / `then`. Both are SQL reserved words; a table with them
-- needs quoting at every single reference forever, and the first unquoted one is a syntax error at runtime
-- rather than at review. Named `fires_when` / `fires_then` instead — same meaning, no landmine.

BEGIN;

-- ── M1-1 · the nodes ─────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dnd_map_nodes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES dnd_campaigns(id) ON DELETE CASCADE,
  -- NULL = a root (the space map). Deleting a parent takes its subtree with it, which is what a DM means
  -- by deleting a continent; the UI is required to name the children first (plan M4-4).
  parent_id    uuid REFERENCES dnd_map_nodes(id) ON DELETE CASCADE,
  tier         text NOT NULL DEFAULT 'site',
  depth        int  NOT NULL DEFAULT 1,
  name         text NOT NULL,
  blurb        text,
  image_url    text,
  storage_path text,                                  -- bucket key, so deleting a node can clean up its art
  -- 'html' = generated from the node id (a starfield, a disc, a street lattice) so a DM never faces an
  -- empty map for want of art. '3d'/'hybrid' are deliberately NOT permitted while G2 holds — the check is
  -- the enforcement of a product decision, not a type hint.
  render_kind  text NOT NULL DEFAULT 'html',
  grid         jsonb NOT NULL DEFAULT '{}'::jsonb,    -- { kind, size_px, unit_ft, offset, opacity, colour }
  bounds       jsonb NOT NULL DEFAULT '{}'::jsonb,    -- logical extent, so zoom is deterministic
  published    boolean NOT NULL DEFAULT false,
  sort_order   int NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES dnd_users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dnd_map_nodes_depth_range CHECK (depth BETWEEN 1 AND 7),
  CONSTRAINT dnd_map_nodes_name_present CHECK (length(btrim(name)) > 0),
  CONSTRAINT dnd_map_nodes_tier_known CHECK (
    tier IN ('space', 'world', 'continent', 'province', 'city', 'district', 'site')
  ),
  -- G2: 2D only. Lifting it is a one-line change here plus an owner decision in the plan.
  CONSTRAINT dnd_map_nodes_render_2d_only CHECK (render_kind IN ('image', 'html')),
  -- A node cannot be its own parent. The full ancestor check is the trigger below; this catches the
  -- one-hop case declaratively, which is the case a bug is most likely to produce.
  CONSTRAINT dnd_map_nodes_not_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_dnd_map_nodes_campaign ON dnd_map_nodes (campaign_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_dnd_map_nodes_parent   ON dnd_map_nodes (parent_id);
CREATE INDEX IF NOT EXISTS idx_dnd_map_nodes_roots    ON dnd_map_nodes (campaign_id) WHERE parent_id IS NULL;

-- Reject a cycle before it exists. Walks up from the proposed parent looking for this node.
CREATE OR REPLACE FUNCTION dnd_map_nodes_reject_cycle() RETURNS trigger AS $$
DECLARE
  walker uuid := NEW.parent_id;
  hops   int  := 0;
BEGIN
  WHILE walker IS NOT NULL LOOP
    IF walker = NEW.id THEN
      RAISE EXCEPTION 'map node % cannot be its own ancestor', NEW.id
        USING HINT = 'Re-parenting would create a cycle. Pick a parent outside this node''s subtree.';
    END IF;
    hops := hops + 1;
    -- Belt and braces: if the table were ALREADY cyclic (a bad restore, a manual edit), the walk above
    -- would spin forever and take the connection with it. 8 = max depth 7 plus one.
    IF hops > 8 THEN
      RAISE EXCEPTION 'map node ancestry exceeded % hops — the tree is already cyclic', hops;
    END IF;
    SELECT parent_id INTO walker FROM dnd_map_nodes WHERE id = walker;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Derive depth from the parent. Never trusts the supplied value.
CREATE OR REPLACE FUNCTION dnd_map_nodes_set_depth() RETURNS trigger AS $$
DECLARE
  parent_depth int;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.depth := 1;
  ELSE
    SELECT depth INTO parent_depth FROM dnd_map_nodes WHERE id = NEW.parent_id;
    IF parent_depth IS NULL THEN
      RAISE EXCEPTION 'parent map node % does not exist', NEW.parent_id;
    END IF;
    IF parent_depth >= 7 THEN
      RAISE EXCEPTION 'map nesting limit reached: % is already at depth 7', NEW.parent_id
        USING HINT = 'Seven levels is the maximum. Place this location in a shallower parent.';
    END IF;
    NEW.depth := parent_depth + 1;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-parenting moves a whole subtree. Cascade the new depths, or every descendant silently keeps the old
-- one — right at the node you dragged, wrong at its grandchildren.
CREATE OR REPLACE FUNCTION dnd_map_nodes_cascade_depth() RETURNS trigger AS $$
BEGIN
  IF NEW.depth IS DISTINCT FROM OLD.depth THEN
    WITH RECURSIVE subtree AS (
      SELECT id, NEW.depth AS new_depth FROM dnd_map_nodes WHERE parent_id = NEW.id
      UNION ALL
      SELECT c.id, s.new_depth + 1 FROM dnd_map_nodes c JOIN subtree s ON c.parent_id = s.id
    )
    UPDATE dnd_map_nodes n
       SET depth = s.new_depth + 1
      FROM subtree s
     WHERE n.id = s.id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dnd_map_nodes_cycle    ON dnd_map_nodes;
DROP TRIGGER IF EXISTS trg_dnd_map_nodes_depth    ON dnd_map_nodes;
DROP TRIGGER IF EXISTS trg_dnd_map_nodes_cascade  ON dnd_map_nodes;

-- Order matters: reject cycles FIRST, so the depth walk can never meet one.
CREATE TRIGGER trg_dnd_map_nodes_cycle  BEFORE INSERT OR UPDATE OF parent_id ON dnd_map_nodes
  FOR EACH ROW EXECUTE FUNCTION dnd_map_nodes_reject_cycle();
CREATE TRIGGER trg_dnd_map_nodes_depth  BEFORE INSERT OR UPDATE ON dnd_map_nodes
  FOR EACH ROW EXECUTE FUNCTION dnd_map_nodes_set_depth();
CREATE TRIGGER trg_dnd_map_nodes_cascade AFTER UPDATE OF parent_id ON dnd_map_nodes
  FOR EACH ROW EXECUTE FUNCTION dnd_map_nodes_cascade_depth();

-- ── M1-2 · pins: where on the parent a child lives ───────────────────────────────────────────────────
--
-- BOTH HALVES ARE NULLABLE-BY-DESIGN. A child may exist with no pin (a place not yet located) and a pin may
-- point at nothing yet (a place marked but not built). The plan calls both normal authoring states, so
-- neither may error — which is why `child_node_id` is nullable rather than the obvious NOT NULL.
CREATE TABLE IF NOT EXISTS dnd_map_pins (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_node_id   uuid NOT NULL REFERENCES dnd_map_nodes(id) ON DELETE CASCADE,
  child_node_id uuid REFERENCES dnd_map_nodes(id) ON DELETE SET NULL,
  x             numeric(10,4) NOT NULL DEFAULT 0,
  y             numeric(10,4) NOT NULL DEFAULT 0,
  icon          text,
  label         text,
  visibility    text NOT NULL DEFAULT 'dm',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dnd_map_pins_visibility CHECK (visibility IN ('dm', 'players', 'discovered')),
  CONSTRAINT dnd_map_pins_not_self   CHECK (child_node_id IS NULL OR child_node_id <> map_node_id)
);
CREATE INDEX IF NOT EXISTS idx_dnd_map_pins_node  ON dnd_map_pins (map_node_id);
CREATE INDEX IF NOT EXISTS idx_dnd_map_pins_child ON dnd_map_pins (child_node_id);

-- ── M1-3 · objects: everything placed on a map ───────────────────────────────────────────────────────
--
-- ONE TABLE, DISCRIMINATED BY `kind`, for the same reason there is one node type: the DM's manipulations
-- (move, resize, rotate, layer, delete, undo) are IDENTICAL for all of them, so they should be one code
-- path. Seven tables would guarantee that a fix to dragging lands on some of them.
CREATE TABLE IF NOT EXISTS dnd_map_objects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_node_id uuid NOT NULL REFERENCES dnd_map_nodes(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  x           numeric(10,4) NOT NULL DEFAULT 0,
  y           numeric(10,4) NOT NULL DEFAULT 0,
  w           numeric(10,4),
  h           numeric(10,4),
  rotation    numeric(7,3) NOT NULL DEFAULT 0,
  z           int NOT NULL DEFAULT 0,
  asset_url   text,
  label       text,
  description text,                                   -- read-aloud text (M6-3)
  dm_notes    text,                                   -- DM-only, never sent to a player payload (G3)
  -- Kind-specific fields. For `token`: character_id, size category. For `hidden`: skill, dc, reveals.
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility  text NOT NULL DEFAULT 'dm',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dnd_map_objects_kind CHECK (
    kind IN ('image', 'prop', 'token', 'light', 'area', 'note', 'hidden')
  ),
  CONSTRAINT dnd_map_objects_visibility CHECK (visibility IN ('dm', 'players', 'discovered'))
);
CREATE INDEX IF NOT EXISTS idx_dnd_map_objects_node ON dnd_map_objects (map_node_id, z);
-- The player-payload query is "this node, visible to players" — the index that keeps G3's separate query
-- cheap enough that nobody is tempted to fetch everything and filter in the client.
CREATE INDEX IF NOT EXISTS idx_dnd_map_objects_visible
  ON dnd_map_objects (map_node_id) WHERE visibility <> 'dm';

-- ── M1-4 · discoveries: what has been found, PER CHARACTER ───────────────────────────────────────────
--
-- Per character, not per campaign, because "the rogue noticed the loose flagstone and nobody else did" is
-- the entire point of a Perception DC.
CREATE TABLE IF NOT EXISTS dnd_map_discoveries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_object_id uuid NOT NULL REFERENCES dnd_map_objects(id) ON DELETE CASCADE,
  character_id  uuid NOT NULL REFERENCES dnd_characters(id) ON DELETE CASCADE,
  found_at      timestamptz NOT NULL DEFAULT now(),
  found_by_roll int,                                  -- the total that beat the DC, for the audit trail
  CONSTRAINT dnd_map_discoveries_once UNIQUE (map_object_id, character_id)
);
CREATE INDEX IF NOT EXISTS idx_dnd_map_discoveries_char ON dnd_map_discoveries (character_id);

-- ── M1-5 · triggers ──────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dnd_map_triggers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_node_id uuid NOT NULL REFERENCES dnd_map_nodes(id) ON DELETE CASCADE,
  name        text,
  fires_when  jsonb NOT NULL DEFAULT '{}'::jsonb,     -- `when` is reserved; see the header note
  fires_then  jsonb NOT NULL DEFAULT '[]'::jsonb,
  once        boolean NOT NULL DEFAULT false,
  armed       boolean NOT NULL DEFAULT true,
  fired_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dnd_map_triggers_node ON dnd_map_triggers (map_node_id) WHERE armed;

-- RLS on every table; the app's service role bypasses it and authorization lives in app code, matching
-- every other dnd_* table (seed 421 states the same rule).
ALTER TABLE dnd_map_nodes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE dnd_map_pins        ENABLE ROW LEVEL SECURITY;
ALTER TABLE dnd_map_objects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dnd_map_discoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE dnd_map_triggers    ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE dnd_map_nodes IS
  'The nested map tree, depth 1-7. One node type for every tier — `tier` is a label, not a structural distinction, so a street corner and a world are the same kind of thing. `depth` is derived by trigger from the parent and cascades on re-parent; it is never trusted from the client.';
COMMENT ON TABLE dnd_map_objects IS
  'Everything placed on a map, discriminated by `kind`. One table because the DM manipulations (move/resize/rotate/layer/delete/undo) are identical across kinds. `dm_notes` and visibility=dm rows must never reach a player payload.';

COMMIT;
