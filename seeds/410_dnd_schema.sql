-- 410_dnd_schema.sql — D&D Campaign Platform core schema (Phase A, slices A1–A8)
-- Spec: docs/planning/in-progress/DND_CAMPAIGN_PLATFORM_2026-07-06.md
-- All tables namespaced dnd_*. RLS enabled everywhere; the app accesses via the
-- Supabase service role (supabaseAdmin), which bypasses RLS — same pattern as the
-- learn/flashcard tables. Idempotent: CREATE TABLE IF NOT EXISTS throughout.
BEGIN;

-- ── Users & invites (Phase A1) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dnd_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text,
  display_name  text NOT NULL,
  avatar_url    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz
);
ALTER TABLE dnd_users ENABLE ROW LEVEL SECURITY;

-- ── Campaigns / members / sessions (Phase A2) ────────────────────────────────
CREATE TABLE IF NOT EXISTS dnd_campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dm_user_id  uuid NOT NULL REFERENCES dnd_users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  blurb       text,
  theme       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_campaigns ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS dnd_campaign_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES dnd_campaigns(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES dnd_users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'player' CHECK (role IN ('dm','player')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id)
);
ALTER TABLE dnd_campaign_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dnd_members_campaign ON dnd_campaign_members (campaign_id);
CREATE INDEX IF NOT EXISTS idx_dnd_members_user ON dnd_campaign_members (user_id);

CREATE TABLE IF NOT EXISTS dnd_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES dnd_campaigns(id) ON DELETE CASCADE,
  title        text NOT NULL,
  scheduled_at timestamptz,
  status       text NOT NULL DEFAULT 'prep' CHECK (status IN ('prep','live','done')),
  sort_order   integer NOT NULL DEFAULT 0,
  dm_notes     text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dnd_sessions_campaign ON dnd_sessions (campaign_id);

-- ── Characters (PCs + NPCs on the shared engine) (Phase A3) ──────────────────
CREATE TABLE IF NOT EXISTS dnd_characters (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid REFERENCES dnd_campaigns(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES dnd_users(id) ON DELETE SET NULL,
  name          text NOT NULL,
  sheet_type    text NOT NULL DEFAULT 'generic',
  theme         jsonb NOT NULL DEFAULT '{}'::jsonb,
  art_url       text,
  token_url     text,
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- full sheet state on the shared engine
  bio           jsonb NOT NULL DEFAULT '{}'::jsonb,   -- editable descriptions
  visibility    text NOT NULL DEFAULT 'campaign' CHECK (visibility IN ('private','campaign','public')),
  is_npc        boolean NOT NULL DEFAULT false,
  is_library    boolean NOT NULL DEFAULT false,       -- reusable NPC template
  quick_stats   jsonb,                                -- compact summary for the quick sheet
  ai_generated  boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_characters ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dnd_characters_campaign ON dnd_characters (campaign_id);
CREATE INDEX IF NOT EXISTS idx_dnd_characters_owner ON dnd_characters (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_dnd_characters_npc ON dnd_characters (campaign_id, is_npc);

-- invites depend on campaigns + characters + users
CREATE TABLE IF NOT EXISTS dnd_invites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         uuid NOT NULL REFERENCES dnd_campaigns(id) ON DELETE CASCADE,
  code                text UNIQUE NOT NULL,
  role                text NOT NULL DEFAULT 'player' CHECK (role IN ('dm','player')),
  character_id        uuid REFERENCES dnd_characters(id) ON DELETE SET NULL,
  created_by          uuid REFERENCES dnd_users(id) ON DELETE SET NULL,
  expires_at          timestamptz,
  used_by             uuid REFERENCES dnd_users(id) ON DELETE SET NULL,
  used_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_invites ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dnd_invites_campaign ON dnd_invites (campaign_id);

-- ── Custom/homebrew content library + media + logs (Phase A4) ─────────────────
CREATE TABLE IF NOT EXISTS dnd_content (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         uuid REFERENCES dnd_campaigns(id) ON DELETE CASCADE,  -- null = global
  kind                text NOT NULL CHECK (kind IN ('armor','weapon','item','magic_item','feat','feature','spell','ability','attack')),
  name                text NOT NULL,
  rarity              text,
  data                jsonb NOT NULL DEFAULT '{}'::jsonb,   -- stats + effects[] {target, operation, value, condition}
  requires_attunement boolean NOT NULL DEFAULT false,
  created_by          uuid REFERENCES dnd_users(id) ON DELETE SET NULL,
  is_homebrew         boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_content ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dnd_content_campaign_kind ON dnd_content (campaign_id, kind);

CREATE TABLE IF NOT EXISTS dnd_media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid REFERENCES dnd_campaigns(id) ON DELETE CASCADE,
  character_id uuid REFERENCES dnd_characters(id) ON DELETE CASCADE,
  session_id   uuid REFERENCES dnd_sessions(id) ON DELETE SET NULL,
  url          text NOT NULL,
  thumb_url    text,
  kind         text NOT NULL DEFAULT 'art' CHECK (kind IN ('art','token','map','handout','reveal','avatar')),
  label        text,
  caption      text,
  uploaded_by  uuid REFERENCES dnd_users(id) ON DELETE SET NULL,
  gallery_tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_media ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dnd_media_campaign ON dnd_media (campaign_id);
CREATE INDEX IF NOT EXISTS idx_dnd_media_character ON dnd_media (character_id);

CREATE TABLE IF NOT EXISTS dnd_roll_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES dnd_campaigns(id) ON DELETE CASCADE,
  session_id   uuid REFERENCES dnd_sessions(id) ON DELETE SET NULL,
  character_id uuid REFERENCES dnd_characters(id) ON DELETE SET NULL,
  actor_name   text,
  label        text NOT NULL,
  formula      text,
  result       integer,
  breakdown    text,
  crit         boolean NOT NULL DEFAULT false,
  fumble       boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_roll_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dnd_roll_log_campaign ON dnd_roll_log (campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dnd_recaps (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL REFERENCES dnd_sessions(id) ON DELETE CASCADE,
  draft_markdown text,
  final_markdown text,
  generated_by   text NOT NULL DEFAULT 'ai' CHECK (generated_by IN ('ai','human')),
  edited_by      uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_recaps ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS dnd_sheet_edits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id   uuid NOT NULL REFERENCES dnd_characters(id) ON DELETE CASCADE,
  editor_user_id uuid REFERENCES dnd_users(id) ON DELETE SET NULL,
  is_dm          boolean NOT NULL DEFAULT false,
  field_path     text,
  old_value      jsonb,
  new_value      jsonb,
  scope          text NOT NULL DEFAULT 'permanent' CHECK (scope IN ('temp','permanent')),
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_sheet_edits ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dnd_sheet_edits_char ON dnd_sheet_edits (character_id, created_at DESC);

-- ── Encounters & initiative (Phase A5) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS dnd_encounters (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid NOT NULL REFERENCES dnd_sessions(id) ON DELETE CASCADE,
  name               text,
  round              integer NOT NULL DEFAULT 1,
  current_turn_index integer NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'prep' CHECK (status IN ('prep','live','done')),
  created_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_encounters ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dnd_encounters_session ON dnd_encounters (session_id);

CREATE TABLE IF NOT EXISTS dnd_initiative_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES dnd_encounters(id) ON DELETE CASCADE,
  character_id uuid REFERENCES dnd_characters(id) ON DELETE SET NULL,   -- PC or NPC template
  name         text NOT NULL,
  token_url    text,
  initiative   integer,
  hp           integer,
  max_hp       integer,
  conditions   text[] NOT NULL DEFAULT ARRAY[]::text[],
  sort_order   integer NOT NULL DEFAULT 0,
  is_current   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_initiative_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dnd_init_encounter ON dnd_initiative_entries (encounter_id, sort_order);

-- ── Messaging & handouts (Phase A6) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dnd_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES dnd_campaigns(id) ON DELETE CASCADE,
  channel      text NOT NULL DEFAULT 'party' CHECK (channel IN ('party','dm_broadcast','direct','group')),
  from_user_id uuid REFERENCES dnd_users(id) ON DELETE SET NULL,
  to_user_ids  uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  body         text,
  image_url    text,
  is_reveal    boolean NOT NULL DEFAULT false,
  read_by      uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dnd_messages_campaign ON dnd_messages (campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dnd_handouts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES dnd_campaigns(id) ON DELETE CASCADE,
  session_id  uuid REFERENCES dnd_sessions(id) ON DELETE SET NULL,
  url         text NOT NULL,
  label       text,
  uploaded_by uuid REFERENCES dnd_users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_handouts ENABLE ROW LEVEL SECURITY;

-- ── Streamer chat (Phase A7) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dnd_stream_state (
  character_id uuid PRIMARY KEY REFERENCES dnd_characters(id) ON DELETE CASCADE,
  is_live      boolean NOT NULL DEFAULT false,
  viewer_count integer NOT NULL DEFAULT 0,
  chat_speed   integer NOT NULL DEFAULT 3,
  active_spam  jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_stream_state ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS dnd_stream_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES dnd_characters(id) ON DELETE CASCADE,
  username     text NOT NULL,
  body         text NOT NULL,
  style        text,
  badges       text[] NOT NULL DEFAULT ARRAY[]::text[],
  color        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_stream_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dnd_stream_msgs ON dnd_stream_messages (character_id, created_at);

CREATE TABLE IF NOT EXISTS dnd_stream_polls (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES dnd_characters(id) ON DELETE CASCADE,
  question     text NOT NULL,
  options      jsonb NOT NULL DEFAULT '[]'::jsonb,
  votes        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  result       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_stream_polls ENABLE ROW LEVEL SECURITY;

-- ── Soundboard (Phase A8) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dnd_soundboard_tabs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES dnd_campaigns(id) ON DELETE CASCADE,
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES dnd_users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_soundboard_tabs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS dnd_sounds (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES dnd_campaigns(id) ON DELETE CASCADE,
  tab_id      uuid NOT NULL REFERENCES dnd_soundboard_tabs(id) ON DELETE CASCADE,
  label       text NOT NULL,
  url         text NOT NULL,
  kind        text NOT NULL DEFAULT 'sfx' CHECK (kind IN ('sfx','music')),
  volume      real NOT NULL DEFAULT 1.0,
  loop        boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_sounds ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dnd_sounds_tab ON dnd_sounds (tab_id, sort_order);

SELECT 'dnd schema: ' || count(*) || ' dnd_* tables' AS status
FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'dnd\_%';

COMMIT;
