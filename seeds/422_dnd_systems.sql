-- seeds/422_dnd_systems.sql — game systems + a scoped rules/feats/abilities store for the
-- character builder (Phase V). A character is built against a chosen system OR "ambiguous".
--
-- The store lets the AI ground a build in ONE system's rules only — retrieval is scoped by
-- system_id so it can never pull Pathfinder rules into a D&D 5e character (the core
-- anti-contamination property). Semantic search via pgvector, mirroring the FS-tutor RAG
-- (seeds/403). Authorization is in app code (service-role client). Idempotent.

CREATE EXTENSION IF NOT EXISTS vector;

-- One row per supported game system.
CREATE TABLE IF NOT EXISTS dnd_systems (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text NOT NULL UNIQUE,          -- stable slug, e.g. 'dnd5e-2014'
  name       text NOT NULL,                 -- display name
  publisher  text,                          -- e.g. 'Wizards of the Coast'
  notes      text,                          -- edition/scope notes
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_systems ENABLE ROW LEVEL SECURITY; -- service role (app code) bypasses.

-- A retrievable rules/content entry within a system: a rule, feat, ability, spell, class,
-- species, item, condition, etc. `body` is the searchable prose; `data` holds any structured
-- mechanics; `embedding` powers semantic retrieval. Every entry belongs to exactly one system.
CREATE TABLE IF NOT EXISTS dnd_system_entries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id      uuid NOT NULL REFERENCES dnd_systems(id) ON DELETE CASCADE,
  kind           text NOT NULL DEFAULT 'rule',  -- rule|feat|ability|spell|class|species|item|condition|other
  name           text NOT NULL,
  body           text NOT NULL DEFAULT '',
  source         text,                          -- book / citation shown with a retrieved entry
  data           jsonb,                         -- optional structured mechanics
  embedding      vector(1024),                  -- voyage-3.5 / voyage-3-large default dim (matches seeds/403)
  token_estimate integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_system_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dnd_system_entries_sys ON dnd_system_entries (system_id, kind);
CREATE INDEX IF NOT EXISTS idx_dnd_system_entries_name ON dnd_system_entries (system_id, lower(name));

-- Scoped semantic search: results are ALWAYS restricted to a single system, so a build can
-- never retrieve another system's rules. Exact cosine — fine for a curated per-system corpus.
CREATE OR REPLACE FUNCTION match_dnd_system_entries(
  p_system_id uuid,
  query_embedding vector(1024),
  match_count int DEFAULT 8,
  min_similarity float DEFAULT 0.35
)
RETURNS TABLE (
  id uuid,
  system_id uuid,
  kind text,
  name text,
  body text,
  source text,
  similarity float
)
LANGUAGE sql STABLE AS $$
  SELECT e.id, e.system_id, e.kind, e.name, e.body, e.source,
         1 - (e.embedding <=> query_embedding) AS similarity
  FROM dnd_system_entries e
  WHERE e.system_id = p_system_id
    AND e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding) >= min_similarity
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- A character is built against a system (or left system-ambiguous). Nullable-safe default so
-- every existing character reads as 'ambiguous'.
ALTER TABLE dnd_characters ADD COLUMN IF NOT EXISTS system text NOT NULL DEFAULT 'ambiguous';

-- Seed the popular systems (entries curated later). Idempotent on the stable key.
INSERT INTO dnd_systems (key, name, publisher, notes) VALUES
  ('dnd5e-2014',   'D&D 5e (2014)',        'Wizards of the Coast', 'The 2014 Player''s Handbook edition.'),
  ('dnd5e-2024',   'D&D 5e (2024)',        'Wizards of the Coast', 'The 2024 revised edition.'),
  ('pathfinder2e', 'Pathfinder 2e',        'Paizo',                'Pathfinder Second Edition (Remaster-aware).')
ON CONFLICT (key) DO NOTHING;
