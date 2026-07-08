-- seeds/416_dnd_stream_donations.sql — chat currency, donations/superchats, member chat
-- posts, and per-username history (Phase R). Additive + idempotent.

-- Messages gain a kind (plain chat / donation / superchat / system), a Kibble amount for
-- money events, and the real user who sent it (set for campaign-member posts, so the
-- streamer can tell a fellow player's line from an anonymous viewer). Persisted lines are
-- what power the "click a username → their history this session" lookup.
ALTER TABLE dnd_stream_messages
  ADD COLUMN IF NOT EXISTS kind           text   NOT NULL DEFAULT 'chat'
    CHECK (kind IN ('chat','donation','superchat','system')),
  ADD COLUMN IF NOT EXISTS amount         bigint,                     -- Kibbles for donation/superchat
  ADD COLUMN IF NOT EXISTS sender_user_id uuid REFERENCES dnd_users(id) ON DELETE SET NULL;

-- Fast per-username history within a character's feed.
CREATE INDEX IF NOT EXISTS idx_dnd_stream_msg_user
  ON dnd_stream_messages (character_id, username, created_at);

-- Stream state gains the donation switches + the streamer's running Kibble stash.
ALTER TABLE dnd_stream_state
  ADD COLUMN IF NOT EXISTS donations_enabled boolean NOT NULL DEFAULT false,   -- OFF by default
  ADD COLUMN IF NOT EXISTS generosity        text    NOT NULL DEFAULT 'off'
    CHECK (generosity IN ('off','stingy','normal','generous','overgiving')),
  ADD COLUMN IF NOT EXISTS kibbles_earned    bigint  NOT NULL DEFAULT 0;       -- convertible to game gold
