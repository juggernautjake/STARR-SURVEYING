-- seeds/511_dnd_map_edits.sql — the undo journal for map authoring (M4-2 · G7).
--
-- G7: *"Every DM action is undoable. Map authoring is destructive by nature (drag something, lose its old
-- position); it joins the existing edit-history/undo machinery rather than inventing its own."*
--
-- ── WHY THIS IS A NEW TABLE AND NOT `dnd_sheet_edits` ────────────────────────────────────────────────
--
-- The obvious reading of "joins the existing machinery" is to write map edits into the table the sheet
-- already uses. It cannot: `dnd_sheet_edits.character_id` is NOT NULL and references `dnd_characters`,
-- and a grid, a pin or a secret door is not a character. Forcing one in would mean either a fake
-- character id or dropping that constraint for everybody, and the second is how the sheet's own undo
-- stops being able to trust its rows.
--
-- What DOES join is the MODEL, which is the part G7 is actually about: a batch id groups one user action,
-- `source` says who did it, and undo means walking a batch newest-first and putting each row back. A DM
-- who has used "⟲ Undo" on a character sheet already knows how this behaves.
--
-- ── THE WHOLE ROW, BEFORE AND AFTER — NOT A FIELD PATH ──────────────────────────────────────────────
--
-- `dnd_sheet_edits` journals `field_path` + old/new value, which suits a sheet: edits are deep and
-- narrow ("hp.current: 12 → 7"). Map edits are the opposite — shallow and wide. Moving a token changes
-- x and y; a resize changes w and h; a delete changes everything at once. Storing the whole row makes
-- undo a single upsert and makes a multi-field change one journal entry rather than four that must be
-- replayed in the right order.
--
-- ── DISCOVERIES ARE JOURNALLED TOO, AND THAT IS THE POINT OF `entity` ───────────────────────────────
--
-- `dnd_map_discoveries.map_object_id` cascades. So deleting a hidden object the rogue had already found
-- silently destroys the discovery rows as well, and an undo that restored only the object would hand
-- back the secret with the party's knowledge of it quietly erased — the map and the table would then
-- disagree about something nobody could see had changed. Journalling them in the same batch is what
-- makes "undo" mean undo.

BEGIN;

CREATE TABLE IF NOT EXISTS dnd_map_edits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The node the action happened on. Undo is offered per map, because that is the scope a DM is looking
  -- at when they want it back. ON DELETE CASCADE: a deleted node's journal has nothing to restore into.
  map_node_id    uuid NOT NULL REFERENCES dnd_map_nodes(id) ON DELETE CASCADE,
  -- One user action. Placing three tokens with one gesture is one batch; undo takes back all three.
  batch_id       uuid NOT NULL,
  editor_user_id uuid REFERENCES dnd_users(id) ON DELETE SET NULL,
  -- Which table the row belongs to. Not a foreign key: the whole purpose of a `delete` entry is to
  -- describe a row that no longer exists, and an FK would forbid exactly that.
  entity         text NOT NULL DEFAULT 'object' CHECK (entity IN ('object', 'discovery')),
  entity_id      uuid NOT NULL,
  action         text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  -- Whole rows. `before` is null for a create, `after` null for a delete; both present for an update.
  before         jsonb,
  after          jsonb,
  -- Position within the batch, and it is load-bearing rather than cosmetic.
  --
  -- The first version ordered an undo by `created_at DESC` alone. Every entry in one batch is written by
  -- a single INSERT, so they share a timestamp to the microsecond and the sort is a tie — meaning the
  -- order was whatever Postgres felt like. That is fine until a batch contains rows that depend on each
  -- other: deleting a hidden object journals the object AND the discoveries that cascaded with it, and
  -- restoring a discovery before its object is refused by the foreign key.
  --
  -- Measured live: the object came back, the discovery did not, and the response still said
  -- `restored: 2`. A silent half-undo that reports success is the worst outcome available here, because
  -- the DM has no reason to look.
  seq            integer NOT NULL DEFAULT 0,
  -- What a DM reads in the undo control: "Moved Ogre", "Removed a scratched rune".
  summary        text,
  -- Set when this batch has itself been undone, so an undo cannot be applied twice and the control can
  -- say so. A second boolean column would drift from the timestamp; one nullable timestamp is both.
  undone_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Added after the table first shipped; kept as an ALTER so a database that already has it is untouched
-- and one that does not gets it. (See `450` for what happens when a seed assumes it is the first run.)
ALTER TABLE dnd_map_edits ADD COLUMN IF NOT EXISTS seq integer NOT NULL DEFAULT 0;

ALTER TABLE dnd_map_edits ENABLE ROW LEVEL SECURITY;

-- The one query the undo control makes: the most recent not-yet-undone batch on this node.
CREATE INDEX IF NOT EXISTS idx_dnd_map_edits_node
  ON dnd_map_edits (map_node_id, created_at DESC);
-- And the one the undo itself makes: every entry in a batch, newest first, because a batch that created
-- a thing and then moved it must be walked backwards or the move is re-applied to a row that is gone.
CREATE INDEX IF NOT EXISTS idx_dnd_map_edits_batch
  ON dnd_map_edits (batch_id, created_at DESC, seq DESC);

COMMIT;
