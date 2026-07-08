-- seeds/414_dnd_stream_controls.sql — Streamer chat-controls revamp (Phase K).
--
-- Extends the streamer-chat mechanic with: a manual/auto resist-DC, DM-selectable chat
-- moods, an aggressive "focus" window (topic + intensity + duration), a cache of
-- AI-generated mood lines refreshed on a cadence, idle auto-end tracking, a persistent
-- set of DM chat aliases (optionally backed by a generated NPC sheet), and a DM inbox of
-- viewer replies. All additive + idempotent — safe to re-run.

-- ── dnd_stream_state: DC mode, moods, focus window, AI-line cache, idle tracking ─────
ALTER TABLE dnd_stream_state
  ADD COLUMN IF NOT EXISTS dc_mode        text    NOT NULL DEFAULT 'auto'
    CHECK (dc_mode IN ('auto','manual')),
  ADD COLUMN IF NOT EXISTS dc_manual      integer,                         -- exact DC when dc_mode='manual'
  ADD COLUMN IF NOT EXISTS moods          text[]  NOT NULL DEFAULT ARRAY[]::text[],  -- selected mood ids; empty = default
  ADD COLUMN IF NOT EXISTS focus_topic    text,                            -- active aggressive-focus subject
  ADD COLUMN IF NOT EXISTS focus_until    timestamptz,                     -- when the focus window ends
  ADD COLUMN IF NOT EXISTS focus_intensity integer NOT NULL DEFAULT 3,     -- 1–5 aggressiveness of the focus flood
  ADD COLUMN IF NOT EXISTS ai_mood_lines  jsonb   NOT NULL DEFAULT '{}'::jsonb,  -- { moodId: string[] } cache
  ADD COLUMN IF NOT EXISTS ai_lines_at    timestamptz,                     -- last AI mood-line refresh
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,                   -- last DM interaction (idle auto-end)
  ADD COLUMN IF NOT EXISTS end_warning_at timestamptz;                     -- when the 2h auto-end warning fired

-- ── dnd_stream_aliases: a DM's persistent chat handles (per DM user) ─────────────────
-- The DM builds a stable of named handles to speak as in a streamer's chat. Each may
-- carry a fixed color/badges (so it always looks the same) and may be linked to a
-- generated NPC character sheet. Scoped to the DM user so it's reusable across their
-- streamer characters. Aliases are ONLY used when the DM explicitly selects one.
CREATE TABLE IF NOT EXISTS dnd_stream_aliases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES dnd_users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  color            text,
  badges           text[] NOT NULL DEFAULT ARRAY[]::text[],
  npc_character_id uuid REFERENCES dnd_characters(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
ALTER TABLE dnd_stream_aliases ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dnd_aliases_user ON dnd_stream_aliases (user_id);

-- ── dnd_stream_replies: DM inbox of replies aimed at a chat viewer ───────────────────
-- When the streamer (owner) or DM replies to a chatter from the search panel, it lands
-- here with the viewer's original handle + line so the DM can respond back AS that
-- viewer, or spin them into a full NPC.
CREATE TABLE IF NOT EXISTS dnd_stream_replies (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id     uuid NOT NULL REFERENCES dnd_characters(id) ON DELETE CASCADE,
  from_user_id     uuid REFERENCES dnd_users(id) ON DELETE SET NULL,
  chatter_username text NOT NULL,
  chatter_message  text,
  chatter_color    text,
  reply_body       text NOT NULL,
  handled          boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_stream_replies ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dnd_replies_char ON dnd_stream_replies (character_id, handled, created_at);
