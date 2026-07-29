-- seeds/459_dnd_storage_ledger.sql — who stored how many bytes (P2-7, audit F-6).
--
-- The per-file limits capped how big ONE upload can be. Nothing capped how many, so a single account could
-- fill the media bucket 25 MB at a time with no symptom but the storage bill.
--
-- WHY A LEDGER RATHER THAN A COLUMN ON EACH TABLE. Neither `dnd_media` nor `dnd_character_uploads` records
-- a size, and they are not the only writers — avatars, homebrew art and soundboard audio land elsewhere or
-- are not recorded at all. Summing what those tables happen to know would undercount by construction and
-- drift further with every new upload surface.
--
-- `object_path` is UNIQUE so recording is idempotent: a retried upload of the same storage key updates one
-- row rather than double-counting bytes that exist once. That matters because the release path deletes by
-- path, and a duplicate row would leak quota that nothing could ever free.

create table if not exists public.dnd_storage_objects (
  id           uuid primary key default gen_random_uuid(),
  -- Nullable: the owning account may be deleted while the bytes remain. Those rows stop counting against
  -- anyone, which is correct — a deleted user has no quota to consume.
  user_id      uuid references public.dnd_users(id) on delete set null,
  bucket       text not null,
  object_path  text not null unique,
  bytes        bigint not null check (bytes >= 0),
  -- What it was attached to, purely for diagnosis ("what is using my space?"). Deliberately free text: the
  -- ledger must not gain a foreign key per upload surface, or adding a surface means changing this table.
  kind         text,
  created_at   timestamptz not null default now()
);

alter table public.dnd_storage_objects enable row level security;

-- The hot query is "how many bytes does this user have", so index for exactly that.
create index if not exists idx_dnd_storage_objects_user on public.dnd_storage_objects (user_id);

comment on table public.dnd_storage_objects is
  'Append-only ledger of uploaded objects and their sizes, for the per-account storage quota (P2-7). '
  'Rows are DELETED when the underlying object is removed — a quota that only counts upward eventually '
  'locks every active account out permanently.';
