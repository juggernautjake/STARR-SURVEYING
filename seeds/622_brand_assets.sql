-- ============================================================================
-- 622_brand_assets.sql
--
-- Uploaded brand assets, and the resolution variations of each one.
--
-- ── WHY THE LIBRARY NEEDED A DATABASE ──────────────────────────────────────
--
-- Owner: *"I also want it so that I can upload new designs to the branding
-- kit. There needs to be a whole process for uploading a design. when
-- uploading, we can just upload the image, or we can fill out all of the
-- color and font and use case and description information. We should be able
-- to add multiple resolution variations to it as well."*
--
-- The existing library is 178 files in `public/branding` described by
-- `lib/branding/logos.ts`. That is the right shape for artwork that ships
-- with the code: it is versioned, reviewable, and the page cannot disagree
-- with the disk. It is the wrong shape for artwork somebody adds on a
-- Tuesday — that would mean a commit, a deploy, and a developer, for the act
-- of adding a photograph of a new cap.
--
-- So the two coexist rather than one replacing the other. The static manifest
-- stays the source of truth for the marks the brand is BUILT from, and this
-- holds everything added since. The portal reads both and says which is
-- which, because "can I edit this?" has a different answer for each.
--
-- ── THE PROFILE IS OPTIONAL, AND THAT IS THE POINT ─────────────────────────
--
-- Every descriptive column here is nullable and every array defaults to
-- empty. The owner asked for two paths — *"we can just upload the image, or
-- we can fill out all of the … information"* — and a schema with NOT NULL on
-- `description` turns the first path into a form somebody abandons.
--
-- What is NOT optional is `name` and `storage_path`. An asset with no name is
-- a row nobody can find again, and one with no file is not an asset.
--
-- ── COLOURS AND FONTS ARE NAMES, NOT VALUES ────────────────────────────────
--
-- `colours` holds palette NAMES ('Starr Red'), not hex codes, exactly as
-- `BRAND_LOGOS.colours` does. Storing #BD1218 here would create a second
-- palette that goes stale the day the first one moves — which is the whole
-- reason `lib/branding/palette.ts` exists. The API validates every name
-- against the palette on write, so a stored name always resolves.
--
-- ── VARIANTS ───────────────────────────────────────────────────────────────
--
-- One row per resolution. The original is a variant too (`is_original`), so
-- "give me the biggest one" is a query rather than a special case, and a
-- generated 512px PNG and a hand-made 512px PNG are the same kind of thing.
--
-- Applied against live Supabase with node-pg + SUPABASE_DB_URL. Idempotent.
-- ============================================================================

BEGIN;

-- ── Bucket: starr-brand-assets ────────────────────────────────────────────
--
-- Private. Reads go through the app, which already gates /admin/branding to
-- the five roles that produce things carrying the logo; a public bucket would
-- put the firm's unreleased artwork on a guessable URL.
--
-- 25 MB. Larger than the equipment-photo bucket (10 MB) because a print-
-- resolution mark or a layered export is genuinely bigger than a snapshot,
-- and far below the 500 MB app cap because nothing here is a video. The cap
-- that matters is the bucket's — see lib/storage/uploads.ts on why a client
-- cap above the server's is the one that wastes somebody's whole upload.
--
-- SVG is allowed and is the one MIME here worth a sentence: the Downloads tab
-- says out loud that the library has no vector artwork and that a trace is
-- worth commissioning. When that trace arrives, this is where it lands.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'starr-brand-assets',
  'starr-brand-assets',
  false,
  26214400,               -- 25 MB
  ARRAY['image/png','image/jpeg','image/webp','image/svg+xml','image/gif','application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/svg+xml','image/gif','application/pdf'];

-- Service-role full access. The role gate lives in the route (the same five
-- roles the page and the resize endpoint use), matching every other curated
-- bucket in this codebase.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'brand_assets_service_role_all'
  ) THEN
    CREATE POLICY brand_assets_service_role_all ON storage.objects
      FOR ALL TO service_role
      USING (bucket_id = 'starr-brand-assets')
      WITH CHECK (bucket_id = 'starr-brand-assets');
  END IF;
END $$;

-- ── brand_assets ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brand_assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The URL-safe handle. Derived from the name on create, uniquified with a
  -- suffix rather than rejected: somebody uploading "Star Mark" a second time
  -- wants a second asset, not an error about a slug they never typed.
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,

  -- Mirrors LogoKind in lib/branding/logos.ts plus the two an upload can be
  -- that a built-in mark never is. Deliberately a CHECK rather than an enum:
  -- an enum needs a migration to add a value, and this list will grow.
  kind            TEXT NOT NULL DEFAULT 'other'
                  CHECK (kind IN ('badge','lockup','mark','heritage','apparel','photo','pattern','other')),

  -- ── the profile. Every column below is optional by design. ──────────────
  note            TEXT,                      -- the one-line card caption
  description     TEXT,                      -- what the mark IS
  use_cases       TEXT[] NOT NULL DEFAULT '{}',
  avoid           TEXT[] NOT NULL DEFAULT '{}',
  colours         TEXT[] NOT NULL DEFAULT '{}',  -- palette NAMES, validated on write
  fonts           TEXT[] NOT NULL DEFAULT '{}',
  min_size        TEXT,
  plate           TEXT NOT NULL DEFAULT 'white'
                  CHECK (plate IN ('white','mist','dark','cream','none')),

  -- ── the file ────────────────────────────────────────────────────────────
  storage_path    TEXT NOT NULL,             -- the original, in starr-brand-assets
  file_type       TEXT NOT NULL,             -- MIME, as stored
  original_filename TEXT,
  width           INTEGER,                   -- pixels; NULL for SVG and PDF
  height          INTEGER,
  bytes           BIGINT,

  -- draft: uploaded, not yet part of the kit. approved: in the kit.
  -- archived: kept for the record, hidden from the library.
  --
  -- Everything lands as 'approved' by default. A draft state that everything
  -- defaults INTO is a queue nobody empties, and this is the firm's own
  -- artwork uploaded by the five roles that make the firm's artwork — there
  -- is no reviewer waiting. The state exists so a work-in-progress CAN be
  -- parked, not so every upload has to be.
  status          TEXT NOT NULL DEFAULT 'approved'
                  CHECK (status IN ('draft','approved','archived')),

  created_by      TEXT,                      -- email, matching the other admin tables
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brand_assets_kind_idx    ON brand_assets (kind);
CREATE INDEX IF NOT EXISTS brand_assets_status_idx  ON brand_assets (status);
CREATE INDEX IF NOT EXISTS brand_assets_created_idx ON brand_assets (created_at DESC);

-- ── brand_asset_variants ──────────────────────────────────────────────────
--
-- One row per resolution of one asset. The original is a variant with
-- `is_original = TRUE`, so the biggest available file is a query and not a
-- branch in every consumer.
CREATE TABLE IF NOT EXISTS brand_asset_variants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      UUID NOT NULL REFERENCES brand_assets(id) ON DELETE CASCADE,

  -- What a person calls it: '2048px', 'Embroidery', 'Favicon'. Free text,
  -- because a variation is not always a width — 'One colour, for the sign
  -- shop' is a legitimate variation and a width column cannot hold it.
  label         TEXT NOT NULL,

  storage_path  TEXT NOT NULL,
  file_type     TEXT NOT NULL,
  width         INTEGER,
  height        INTEGER,
  bytes         BIGINT,

  -- TRUE for the file the asset was created from. Exactly one per asset,
  -- enforced by the partial unique index below rather than by hoping.
  is_original   BOOLEAN NOT NULL DEFAULT FALSE,

  -- 'upload' when somebody supplied the file, 'generated' when the server
  -- resized the original. Worth recording: a generated 4096px from a 700px
  -- original carries no more detail than the original, and the UI refuses to
  -- offer that — but only if it knows which is which.
  source        TEXT NOT NULL DEFAULT 'upload'
                CHECK (source IN ('upload','generated')),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brand_asset_variants_asset_idx
  ON brand_asset_variants (asset_id, width DESC NULLS LAST);

-- One original per asset. Without this a re-upload that forgets to clear the
-- flag leaves two rows claiming to be the source, and "the biggest one" stops
-- having an answer.
CREATE UNIQUE INDEX IF NOT EXISTS brand_asset_variants_one_original
  ON brand_asset_variants (asset_id) WHERE is_original;

-- A label is unique within its asset, so "2048px" cannot exist twice and mean
-- two different files.
CREATE UNIQUE INDEX IF NOT EXISTS brand_asset_variants_label_unique
  ON brand_asset_variants (asset_id, lower(label));

-- ── updated_at ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION brand_assets_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS brand_assets_touch ON brand_assets;
CREATE TRIGGER brand_assets_touch
  BEFORE UPDATE ON brand_assets
  FOR EACH ROW EXECUTE FUNCTION brand_assets_touch_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
--
-- On, with no policy for anon or authenticated. Every read and write goes
-- through the route as service_role, which is where the five-role gate lives.
-- RLS enabled with no policies is a closed door, not an oversight: it means a
-- leaked anon key reads nothing here.
ALTER TABLE brand_assets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_asset_variants  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'brand_assets' AND policyname = 'brand_assets_service_all') THEN
    CREATE POLICY brand_assets_service_all ON brand_assets FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'brand_asset_variants' AND policyname = 'brand_asset_variants_service_all') THEN
    CREATE POLICY brand_asset_variants_service_all ON brand_asset_variants FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;
