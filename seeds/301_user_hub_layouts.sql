-- ============================================================================
-- 301_user_hub_layouts.sql
--
-- Per-user hub customization storage. Backs the new `/admin/me` hub
-- redesign (slice 78 of customizable-hub-and-work-mode-2026-05-28.md).
--
-- One row per user. When a user has no row, the hub falls back to the
-- persona-default layout inferred from their roles. Existing users get
-- no row until they first save customizations.
--
-- user_hub_layouts                  one row per user
--   user_email TEXT PK              identifies the user (consistent with
--                                   pto_balances, daily_time_logs)
--   layout_version INT              schema version of the `widgets` jsonb;
--                                   migrations bump this when widget shapes
--                                   change so consumers can up-convert
--   widgets JSONB                   array of widget instances:
--     [{ id, type, x, y, w, h, customization }]
--   active_persona TEXT             optional override of inferred persona
--   theme TEXT                      theme id ('starr-default' default)
--   custom_theme JSONB              palette object when theme = 'custom';
--                                   shape includes bg/surface/fg/accent +
--                                   derived secondary colors + contrast audit
--   density TEXT                    'compact' | 'comfortable' | 'spacious'
--   font_scale NUMERIC(3,2)         multiplier on the type scale
--                                   (clamped 0.875..1.5 at the app layer)
--   hub_settings JSONB              cross-widget hub prefs (greeting
--                                   collapse timer, role-chip visibility,
--                                   user-menu placement, etc.)
--   updated_at TIMESTAMPTZ
--
-- Idempotent: every CREATE / ADD uses IF NOT EXISTS, so the file is
-- safe to re-run against a live DB or a fresh dev clone.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_hub_layouts (
  user_email      TEXT PRIMARY KEY,
  layout_version  INT NOT NULL DEFAULT 1,
  widgets         JSONB NOT NULL DEFAULT '[]'::jsonb,
  active_persona  TEXT,
  theme           TEXT NOT NULL DEFAULT 'starr-default',
  custom_theme    JSONB,
  density         TEXT NOT NULL DEFAULT 'comfortable'
    CHECK (density IN ('compact', 'comfortable', 'spacious')),
  font_scale      NUMERIC(3,2) NOT NULL DEFAULT 1.00
    CHECK (font_scale >= 0.75 AND font_scale <= 2.00),
  hub_settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Most reads hit by user_email; the PK already covers that path.
-- Add a separate index on theme for the future "themes in use" analytics
-- query (so we can deprecate unused built-in themes without a table scan).
CREATE INDEX IF NOT EXISTS idx_user_hub_layouts_theme
  ON public.user_hub_layouts(theme);

COMMENT ON TABLE public.user_hub_layouts IS
  'Per-user hub customization. One row per user. Absent row means the user '
  'has never saved customizations and uses the persona-default layout.';

COMMENT ON COLUMN public.user_hub_layouts.widgets IS
  'Array of widget instances: [{ id, type, x, y, w, h, customization }]. '
  'See lib/hub/types.ts for the TypeScript shape that maps to this column.';

COMMENT ON COLUMN public.user_hub_layouts.custom_theme IS
  'When theme = ''custom'', stores the user-defined palette + the WCAG '
  'contrast audit results captured at save time. NULL for built-in themes.';

COMMENT ON COLUMN public.user_hub_layouts.layout_version IS
  'Schema version of the widgets jsonb. Bumped by migrations when widget '
  'shapes change so consumers can up-convert legacy layouts on read.';

-- Auto-bump updated_at on row update so consumers can use it for cache
-- invalidation without depending on the API layer to set it.
CREATE OR REPLACE FUNCTION public.touch_user_hub_layouts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_hub_layouts_touch ON public.user_hub_layouts;
CREATE TRIGGER trg_user_hub_layouts_touch
  BEFORE UPDATE ON public.user_hub_layouts
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_hub_layouts_updated_at();

COMMIT;
