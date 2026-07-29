-- seeds/458_dnd_account_recovery.sql — a way back into an account (P2-4, audit F-3).
--
-- Identity on /dnd is `name:<normalized>` with NO email, by design. The consequence, which nobody had
-- followed through on: a forgotten password made every character, variant, campaign membership and piece of
-- homebrew on that account permanently unreachable, with no admin path. This adds the one column that makes
-- a recovery route possible without collecting an email.
--
-- STORED AS A BCRYPT HASH, exactly like the password. A recovery code that sat in plaintext would be a
-- second, weaker credential readable by anyone with database access — strictly worse than having no
-- recovery at all, because it would look responsible.
--
-- NULLABLE and defaulted to NULL: every existing account simply has no code until its owner generates one.
-- No backfill, because a code the user has never seen protects nobody and generating one silently would
-- create a credential nobody knows exists.

alter table if exists public.dnd_users
  add column if not exists recovery_hash text,
  -- When the current code was issued. Shown in the UI ("generated 3 March") so someone can tell whether the
  -- code on their scrap of paper is the live one after regenerating.
  add column if not exists recovery_set_at timestamptz;

comment on column public.dnd_users.recovery_hash is
  'bcrypt hash of a single-use account recovery code (P2-4). NULL = no code issued. Cleared on redemption.';
comment on column public.dnd_users.recovery_set_at is
  'When the current recovery code was generated. NULL when no code is issued.';
