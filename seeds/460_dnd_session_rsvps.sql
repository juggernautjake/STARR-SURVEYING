-- seeds/460_dnd_session_rsvps.sql — who is coming to a session (P3-5).
--
-- P1-5 made sessions schedulable and surfaced a "Next session" banner. This records the answer to the
-- question that immediately follows.
--
-- ONE ROW PER MEMBER PER SESSION, enforced by the unique constraint, so answering again UPDATES rather than
-- appending. Without it a player who changed their mind twice would be counted three times, and the tally —
-- the entire point of the table — would drift upward with every reconsideration.
--
-- There is deliberately NO "invited" row created up front. A member with no row has simply not answered,
-- which `tallyRsvps` reports as `awaiting` by comparing against the campaign's membership. Pre-seeding
-- invitations would mean maintaining them as members join and leave, for no gain.

create table if not exists public.dnd_session_rsvps (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.dnd_sessions(id) on delete cascade,
  user_id    uuid not null references public.dnd_users(id) on delete cascade,
  status     text not null check (status in ('yes', 'no', 'maybe')),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);

alter table public.dnd_session_rsvps enable row level security;

-- The hot query is "every answer for this session".
create index if not exists idx_dnd_session_rsvps_session on public.dnd_session_rsvps (session_id);

comment on table public.dnd_session_rsvps is
  'Per-member attendance answers for a session (P3-5). One row per member per session; a member with no '
  'row has not answered, which is deliberately distinct from having answered "no".';
