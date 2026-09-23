-- seeds/659_blocked_numbers.sql — numbers the business line will not put through.
--
-- Owner, 2026-09-23: "we seem to be getting some calls from the same number over and over... There
-- were three or four today from the same number and it was just a recorded message playing... We
-- need to be able to deal with spam callers by blocking them or something."
--
-- ── WHAT THE CALLS ACTUALLY WERE ────────────────────────────────────────────────────────────────
--
-- Four calls from +1 318-209-1951 on 2026-09-23 and five from +1 410-208-0334 on 2026-09-22. The
-- transcripts are the same recording both days:
--
--     "An agent. Press 9 to opt out or call 8 7 7 5 5 6 9 2 5 5."
--
-- Two different caller IDs, one campaign, one opt-out number. Nomorobo has 877-556-9255 flagged as
-- a known robocaller. The area codes — Louisiana and Maryland — belong to nobody who needs a survey
-- in Bell County.
--
-- ── SO BLOCKING BY NUMBER IS NECESSARY AND NOT SUFFICIENT ───────────────────────────────────────
--
-- The caller ID is spoofed, which is why the same recording arrived from two unrelated numbers.
-- Blocking each number as it appears will always be one step behind the campaign. It is still worth
-- doing — it stops the number that is ringing TODAY, and Hank's phone stops ringing — but the table
-- is built so the next step is possible without a migration: `pattern` blocks a prefix (a whole
-- exchange, a whole area code) and `auto_blocked` marks what the system proposed rather than what a
-- person decided.
--
-- ── A BLOCKED CALL IS STILL RECORDED ────────────────────────────────────────────────────────────
--
-- `phone_calls` keeps its row when a blocked number rings, with `answered_by = 'blocked'`. Three
-- reasons: you can see the block is working rather than infer it from silence; a number blocked by
-- mistake shows up as a customer who stopped getting through; and the pattern of a campaign is
-- visible after the fact. What a blocked call does NOT do is text, email or ring the bell — which
-- is the whole point.

create table if not exists public.blocked_numbers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,

  -- E.164, exactly as Twilio presents it in `From` — +13182091951. Stored normalised so a person
  -- typing (318) 209-1951 into the admin form blocks the number that is actually calling.
  number       text,

  -- A prefix, for when the campaign rotates its last four digits: '+1318209' blocks the exchange.
  -- Deliberately separate from `number` so an ordinary block cannot become a wildcard by accident.
  pattern      text,

  reason       text not null default 'spam',
  notes        text,

  -- Who decided. `auto_blocked` rows were proposed by the system from repeated robocall
  -- classifications and should be reviewed; a person's block is not second-guessed.
  blocked_by   text,
  auto_blocked boolean not null default false,

  -- What it has stopped since, so the value is visible and a mistaken block is obvious.
  hit_count    integer not null default 0,
  last_hit_at  timestamptz,

  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- One of the two, never neither and never both: a row that is both a number and a pattern has no
  -- single meaning, and a row that is neither blocks nothing while looking like it blocks something.
  constraint blocked_numbers_one_target check (
    (number is not null and pattern is null) or (number is null and pattern is not null)
  )
);

create unique index if not exists blocked_numbers_number_idx
  on public.blocked_numbers (org_id, number) where number is not null;
create unique index if not exists blocked_numbers_pattern_idx
  on public.blocked_numbers (org_id, pattern) where pattern is not null;
-- The lookup happens while a caller is holding, so it reads one small index.
create index if not exists blocked_numbers_active_idx
  on public.blocked_numbers (active) where active = true;

comment on table public.blocked_numbers is
  'Numbers the business line refuses. A blocked call still gets a phone_calls row (answered_by = '
  '''blocked'') so the block is visible and a mistake is recoverable — it simply tells nobody.';
comment on column public.blocked_numbers.pattern is
  'A prefix such as +1318209, for a campaign that rotates its last digits. Separate from `number` '
  'so an ordinary block cannot become a wildcard by accident.';

alter table public.blocked_numbers enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'blocked_numbers' and policyname = 'service_role_all') then
    create policy service_role_all on public.blocked_numbers
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- ── THE TWO THAT PROMPTED THIS ──────────────────────────────────────────────────────────────────
--
-- Blocked as `blocked_by = 'investigation'` rather than auto, because a person read the transcripts
-- and identified the campaign; this is not a guess the system made.
insert into public.blocked_numbers (number, reason, notes, blocked_by)
values
  ('+13182091951', 'robocall',
   'Four calls on 2026-09-23. Recording: "An agent. Press 9 to opt out or call 877-556-9255." Same '
   'campaign as +14102080334. Nomorobo flags 877-556-9255 as a known robocaller.', 'investigation'),
  ('+14102080334', 'robocall',
   'Five calls on 2026-09-22, same recording and same opt-out number as +13182091951 — the caller '
   'ID is spoofed and the campaign rotates it.', 'investigation')
on conflict do nothing;
