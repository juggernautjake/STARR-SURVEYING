-- seeds/648_job_map_layer_colours.sql — a sheet you can tell apart at a glance
--
-- Owner, 2026-09-19: "Need to be able to assign colors to the different layers so we can tell what
-- points are on each layer. When we hover over a layer or over a point it should show the relation
-- somehow."
--
-- ── TWO THINGS WANT TO COLOUR THE SAME PIN ──────────────────────────────────────────────────────
--
-- `point_type` already owns a colour — utility blue, fence brown, monument green — and that is a
-- genuinely useful thing to see on a map: it says what the pin IS without reading it.
--
-- A layer colour answers a different question: which sheet is this on. Both are wanted and they
-- cannot both own the fill, so the rule is that the layer wins WHEN IT HAS ONE, and `colour` is
-- nullable precisely so that "no opinion" is expressible. A map where nobody has coloured a layer
-- looks exactly as it did yesterday and still reads by type; a map where somebody has coloured
-- "Utilities" orange reads by sheet. Neither is imposed.
--
-- The type is not lost when a layer takes over the fill: the pin keeps its type icon, and the
-- legend still lists types. What changes is the fill, which is the loudest signal available and so
-- belongs to whichever question the person has said they care about.
--
-- ── WHY A TEXT COLUMN AND NOT A TOKEN ───────────────────────────────────────────────────────────
--
-- Point types name a CSS custom property (`--map-pin-utility`) because their palette is fixed and
-- belongs to the design system. A layer's colour is chosen by a surveyor for their own reasons, from
-- a small palette in the UI, so it is stored as the value. The CHECK keeps it to a 6-digit hex,
-- which is narrow enough that nothing can inject a colour that is really a CSS expression.

BEGIN;

ALTER TABLE public.job_map_layers
  ADD COLUMN IF NOT EXISTS colour text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_map_layers_colour_check') THEN
    ALTER TABLE public.job_map_layers ADD CONSTRAINT job_map_layers_colour_check
      CHECK (colour IS NULL OR colour ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
END $$;

COMMENT ON COLUMN public.job_map_layers.colour IS
  'What colour this sheet''s points are drawn in, as #RRGGBB. NULL means "no opinion" — those points keep the colour of their point_type, which is how every map looked before seeds/648.';

COMMIT;
