-- seeds/421_dnd_maps.sql — campaign maps for the /dnd Stardust galaxy-map suite (Phase U).
--
-- One row per map in a campaign. A map is either an uploaded image ('image' — a premade
-- map PNG/JPG in the dnd-media bucket) or a built map ('built' — the Stardust Map Studio's
-- `stardust-map` JSON in `data`). The DM manages maps from campaign management; players see
-- the campaign's published map in the hub. Authorization is enforced in app code
-- (service-role client): DM writes/publishes/deletes, members read published. Idempotent.
CREATE TABLE IF NOT EXISTS dnd_maps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES dnd_campaigns(id) ON DELETE CASCADE,
  name         text NOT NULL DEFAULT 'Untitled Map',
  kind         text NOT NULL DEFAULT 'built',   -- 'image' | 'built'
  image_url    text,                            -- for kind='image' (public dnd-media URL)
  storage_path text,                            -- bucket key, for cleanup on delete
  data         jsonb,                           -- for kind='built' (stardust-map v2)
  published    boolean NOT NULL DEFAULT false,  -- shown to players in the campaign hub
  created_by   uuid REFERENCES dnd_users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_maps ENABLE ROW LEVEL SECURITY; -- service role (app code) bypasses.
CREATE INDEX IF NOT EXISTS idx_dnd_maps_campaign ON dnd_maps (campaign_id);
CREATE INDEX IF NOT EXISTS idx_dnd_maps_published ON dnd_maps (campaign_id, published);
