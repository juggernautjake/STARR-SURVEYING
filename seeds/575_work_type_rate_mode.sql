-- seeds/575_work_type_rate_mode.sql
--
-- TWO KINDS OF ACTIVITY (owner request, 2026-08-04)
-- ════════════════════════════════════════════════
--
-- *"Right now I want to log 7 hours of field work at $25 an hour, and 1 hour of driving time at $15
-- an hour. But I can't do the $15 an hour."*
--
-- That one sentence separates the activities into two kinds, and the table had no way to say which
-- was which:
--
--   • **Ordinary work pays the person's own base pay.** Field work at $25 because *that person* is
--     on $25. Somebody else doing the same field work earns their own rate. `work_type_rates` had
--     field work at a flat $20, which is why the owner's own $25 was unreachable from the hours
--     screen.
--   • **Some activities pay a set rate to everybody.** *"If people are riding in a vehicle for an
--     hour to a job, then they all get $15."* Driving is $15 for the party chief and $15 for the
--     intern, because the hour is worth what it is worth regardless of who spends it.
--
-- `rate_mode` is that distinction, and it is the only thing standing between "log 7 field + 1
-- driving" working and not working.
--
--   'base' — pays the person's `employee_profiles.hourly_rate`. `base_rate` on the row is ignored.
--   'flat' — pays `base_rate` to everybody, regardless of their base pay.
--
-- Default is 'base', deliberately. A new activity somebody adds without thinking about it pays
-- people their normal rate, which is the safe wrong answer; defaulting to 'flat' would silently put
-- everybody on whatever number happened to be in the column.

ALTER TABLE work_type_rates
  ADD COLUMN IF NOT EXISTS rate_mode TEXT NOT NULL DEFAULT 'base';

-- Named check rather than a free-text column: a typo like 'Flat' would otherwise read as 'not flat'
-- and quietly pay somebody their base rate for a fixed-rate activity.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_type_rates_rate_mode_check') THEN
    ALTER TABLE work_type_rates
      ADD CONSTRAINT work_type_rates_rate_mode_check CHECK (rate_mode IN ('base', 'flat'));
  END IF;
END $$;

COMMENT ON COLUMN work_type_rates.rate_mode IS
  'base = pays the person''s own hourly_rate (base_rate ignored); flat = pays base_rate to everybody.';

-- ── The firm's starting configuration ──────────────────────────────────────────────────────────
--
-- Everything that is "the job" pays base pay. Only travel and the non-survey odds and ends pay a
-- set rate, which is what the owner described. All of it is editable from
-- /admin/pay-rates — these are starting values, not a policy baked into a migration.

UPDATE work_type_rates SET rate_mode = 'base'
 WHERE work_type IN ('field_work', 'drawing', 'research', 'office', 'supervision', 'legal', 'misc');

UPDATE work_type_rates SET rate_mode = 'flat'
 WHERE work_type IN ('driving', 'equipment_maint', 'education');

-- *"If people are riding in a vehicle for an hour to a job, then they all get $15."* Stated twice,
-- so it is set here rather than left at the seeded $16 for somebody to notice later.
UPDATE work_type_rates SET base_rate = 15 WHERE work_type = 'driving';
