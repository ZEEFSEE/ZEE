-- PROPOSAL ONLY — DO NOT EXECUTE AUTOMATICALLY.
-- Prototype Mia Forest Corner private card vault V1.2.
-- This file is stored under docs/, not supabase/migrations/.
-- Requires separate explicit approval and staging review before execution.

begin;

create table if not exists public.mia_forest_corner_cards (
  card_id uuid primary key default gen_random_uuid(),
  identity_id uuid not null
    default 'cb6d01b4-0e3f-46ee-8946-360aa91db1ea'::uuid,
  schema_version text not null default '1.0.0'
    check (schema_version = '1.0.0'),
  category text not null check (category in (
    'comfort_anchor','shared_decision','emotion_residue','life_event',
    'reflection','creative_seed','relationship_context','scene_build_progress'
  )),
  title text not null check (length(btrim(title)) between 1 and 120),
  summary text not null check (length(btrim(summary)) between 1 and 1200),
  emotional_tone text null check (emotional_tone is null or length(emotional_tone) <= 80),
  source_refs jsonb not null
    check (jsonb_typeof(source_refs) = 'array' and jsonb_array_length(source_refs) between 1 and 12),
  evidence_kind text not null check (evidence_kind in ('explicit','derived')),
  confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  privacy_scope text not null default 'prototype_mia_private_pair'
    check (privacy_scope = 'prototype_mia_private_pair'),
  idempotency_key text not null unique check (length(idempotency_key) between 16 and 200),
  created_at timestamptz not null default now(),
  supersedes_card_id uuid null references public.mia_forest_corner_cards(card_id)
    on delete restrict,
  constraint mia_forest_corner_cards_identity_fixed
    check (identity_id = 'cb6d01b4-0e3f-46ee-8946-360aa91db1ea'::uuid),
  constraint mia_forest_corner_cards_no_self_supersede
    check (supersedes_card_id is null or supersedes_card_id <> card_id)
);

create table if not exists public.mia_forest_corner_card_events (
  event_id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.mia_forest_corner_cards(card_id) on delete restrict,
  event_type text not null check (event_type in ('proposed','accepted','rejected','superseded')),
  actor_scope text not null check (actor_scope in ('server','private_pair_user')),
  review_note text null check (review_note is null or length(review_note) <= 500),
  idempotency_key text not null unique check (length(idempotency_key) between 16 and 200),
  created_at timestamptz not null default now(),
  constraint mia_forest_corner_event_actor_rule check (
    (event_type in ('proposed','superseded') and actor_scope = 'server')
    or (event_type in ('accepted','rejected') and actor_scope = 'private_pair_user')
  )
);

-- Enforce immutable payload and event history, including accidental TRUNCATE.
create or replace function public.mia_forest_corner_reject_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Forest Corner card records are append-only';
end;
$$;

drop trigger if exists mia_forest_corner_cards_no_row_mutation
  on public.mia_forest_corner_cards;
create trigger mia_forest_corner_cards_no_row_mutation
before update or delete on public.mia_forest_corner_cards
for each row execute function public.mia_forest_corner_reject_mutation();

drop trigger if exists mia_forest_corner_cards_no_truncate
  on public.mia_forest_corner_cards;
create trigger mia_forest_corner_cards_no_truncate
before truncate on public.mia_forest_corner_cards
for each statement execute function public.mia_forest_corner_reject_mutation();

drop trigger if exists mia_forest_corner_events_no_row_mutation
  on public.mia_forest_corner_card_events;
create trigger mia_forest_corner_events_no_row_mutation
before update or delete on public.mia_forest_corner_card_events
for each row execute function public.mia_forest_corner_reject_mutation();

drop trigger if exists mia_forest_corner_events_no_truncate
  on public.mia_forest_corner_card_events;
create trigger mia_forest_corner_events_no_truncate
before truncate on public.mia_forest_corner_card_events
for each statement execute function public.mia_forest_corner_reject_mutation();

alter table public.mia_forest_corner_cards enable row level security;
alter table public.mia_forest_corner_card_events enable row level security;

-- No browser-role policies. The Edge Function is the only intended access path.
revoke all on table public.mia_forest_corner_cards from public, anon, authenticated;
revoke all on table public.mia_forest_corner_card_events from public, anon, authenticated;
grant select, insert on table public.mia_forest_corner_cards to service_role;
grant select, insert on table public.mia_forest_corner_card_events to service_role;
revoke update, delete, truncate, references, trigger
  on table public.mia_forest_corner_cards from service_role;
revoke update, delete, truncate, references, trigger
  on table public.mia_forest_corner_card_events from service_role;

commit;

-- Important review notes:
-- 1) Execute only after checking existing table names and role grants in staging.
-- 2) No policy is created for anon/authenticated; no browser access is intended.
-- 3) The Edge Function must verify each source pointer and insert the initial
--    'proposed' event in the same transaction as the card.
-- 4) The Edge Function must enforce at most one initial 'proposed' event/card,
--    validate source_refs against a hard-coded table allowlist, and reject
--    AURORA/public/federation records. JSON schema validation belongs server-side.
-- 5) Review events must be explicit user actions, never inferred from page views.
-- 6) Do not use this proposal as a live migration until staging tests pass.
