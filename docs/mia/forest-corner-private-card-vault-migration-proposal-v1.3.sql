-- PROPOSAL ONLY — V1.3 REVIEW CANDIDATE. DO NOT EXECUTE.
-- Prototype Mia Forest Corner private card vault.
-- Documentation-only artifact; not a Supabase migration.
-- Requires disposable PostgreSQL validation and separate approval.
--
-- V1.3 addresses V1.2 review findings:
-- * fail-closed object preflight; no IF NOT EXISTS / DROP / CREATE OR REPLACE
-- * per-source SHA-256 evidence metadata
-- * bounded, allowlisted source_refs structure
-- * append-only card/event records and serialized event transitions
-- * atomic initial card + proposed-event insertion through one RPC
--
-- Important: the Edge Function MUST independently verify every source pointer,
-- prototype-Mia identity, and mia_messages session ownership. SQL cannot prove
-- those facts from a browser-supplied JSON document.

begin;

do $preflight$
begin
  if to_regclass('public.mia_forest_corner_cards') is not null then
    raise exception 'Refusing to proceed: public.mia_forest_corner_cards already exists';
  end if;
  if to_regclass('public.mia_forest_corner_card_events') is not null then
    raise exception 'Refusing to proceed: public.mia_forest_corner_card_events already exists';
  end if;
  if to_regprocedure('public.mia_forest_corner_reject_mutation_v13()') is not null
     or to_regprocedure('public.mia_forest_corner_validate_card_v13()') is not null
     or to_regprocedure('public.mia_forest_corner_guard_event_v13()') is not null
     or to_regprocedure('public.mia_forest_corner_insert_card_v13(jsonb,text)') is not null then
    raise exception 'Refusing to proceed: a V1.3 Forest Corner function already exists';
  end if;
  if to_regrole('anon') is null or to_regrole('authenticated') is null
     or to_regrole('service_role') is null then
    raise exception 'Refusing to proceed: expected Supabase roles are missing';
  end if;
end;
$preflight$;

create table public.mia_forest_corner_cards (
  card_id uuid primary key default gen_random_uuid(),
  identity_id uuid not null
    default 'cb6d01b4-0e3f-46ee-8946-360aa91db1ea'::uuid
    check (identity_id = 'cb6d01b4-0e3f-46ee-8946-360aa91db1ea'::uuid),
  schema_version text not null default '1.0.0' check (schema_version = '1.0.0'),
  category text not null check (category in (
    'comfort_anchor','shared_decision','emotion_residue','life_event',
    'reflection','creative_seed','relationship_context','scene_build_progress'
  )),
  title text not null check (length(btrim(title)) between 1 and 120),
  summary text not null check (length(btrim(summary)) between 1 and 1200),
  emotional_tone text null check (emotional_tone is null or length(emotional_tone) <= 80),
  source_refs jsonb not null
    check (case when jsonb_typeof(source_refs) = 'array'
      then jsonb_array_length(source_refs) between 1 and 12
      else false end),
  source_manifest_digest text not null
    check (source_manifest_digest ~ '^[0-9a-f]{64}$'),
  digest_version text not null default 'sha256-canonical-v1'
    check (digest_version = 'sha256-canonical-v1'),
  evidence_kind text not null check (evidence_kind in ('explicit','derived')),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  privacy_scope text not null default 'prototype_mia_private_pair'
    check (privacy_scope = 'prototype_mia_private_pair'),
  idempotency_key text not null unique
    check (length(idempotency_key) between 16 and 200),
  created_at timestamptz not null default now(),
  supersedes_card_id uuid null
    references public.mia_forest_corner_cards(card_id) on delete restrict,
  constraint mia_forest_corner_cards_no_self_supersede
    check (supersedes_card_id is null or supersedes_card_id <> card_id)
);

-- A card can have at most one direct successor. This prevents branching revisions.
create unique index mia_forest_corner_cards_one_successor_v13
  on public.mia_forest_corner_cards(supersedes_card_id)
  where supersedes_card_id is not null;

create table public.mia_forest_corner_card_events (
  event_id uuid primary key default gen_random_uuid(),
  card_id uuid not null
    references public.mia_forest_corner_cards(card_id) on delete restrict,
  event_type text not null check (event_type in ('proposed','accepted','rejected','superseded')),
  actor_scope text not null check (actor_scope in ('server','private_pair_user')),
  review_note text null check (review_note is null or length(review_note) <= 500),
  idempotency_key text not null unique
    check (length(idempotency_key) between 16 and 200),
  created_at timestamptz not null default now(),
  constraint mia_forest_corner_event_actor_rule_v13 check (
    (event_type in ('proposed','superseded') and actor_scope = 'server')
    or (event_type in ('accepted','rejected') and actor_scope = 'private_pair_user')
  )
);

create unique index mia_forest_corner_events_one_proposal_v13
  on public.mia_forest_corner_card_events(card_id)
  where event_type = 'proposed';
create unique index mia_forest_corner_events_one_review_v13
  on public.mia_forest_corner_card_events(card_id)
  where event_type in ('accepted','rejected');
create unique index mia_forest_corner_events_one_superseded_v13
  on public.mia_forest_corner_card_events(card_id)
  where event_type = 'superseded';
create index mia_forest_corner_events_card_time_v13
  on public.mia_forest_corner_card_events(card_id, created_at, event_id);

-- Validate source-reference shape and total payload size at the database boundary.
create function public.mia_forest_corner_validate_card_v13()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $fn$
declare
  item jsonb;
  source_table text;
  source_id text;
  source_digest text;
  source_timestamp text;
  key_count integer;
begin
  if octet_length(NEW.source_refs::text) > 8192 then
    raise exception 'source_refs exceeds 8 KiB';
  end if;

  for item in select value from jsonb_array_elements(NEW.source_refs)
  loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Each source_refs entry must be an object';
    end if;

    select count(*) into key_count from jsonb_object_keys(item);
    if key_count <> 5
       or not (item ? 'source_table')
       or not (item ? 'source_record_id')
       or not (item ? 'source_timestamp')
       or not (item ? 'digest_algorithm')
       or not (item ? 'source_digest') then
      raise exception 'source_refs entry has missing or unexpected keys';
    end if;

    source_table := item->>'source_table';
    source_id := item->>'source_record_id';
    source_timestamp := item->>'source_timestamp';
    source_digest := item->>'source_digest';

    if source_table is null or source_table not in (
      'mia_messages','mia_memories','mia_emotion_events',
      'mia_life_events','mia_relationship_context'
    ) then
      raise exception 'Source table is not allowlisted';
    end if;
    if source_id is null or length(source_id) not between 1 and 128 then
      raise exception 'Invalid source record identifier';
    end if;
    if source_timestamp is null or length(source_timestamp) > 64 then
      raise exception 'Invalid source timestamp';
    end if;
    if item->>'digest_algorithm' is distinct from 'sha256-canonical-v1'
       or source_digest is null
       or source_digest !~ '^[0-9a-f]{64}
      raise exception 'Invalid source digest metadata';
    end if;
  end loop;

  return NEW;
end;
$fn$;

create trigger mia_forest_corner_validate_card_insert_v13
before insert on public.mia_forest_corner_cards
for each row execute function public.mia_forest_corner_validate_card_v13();

-- Reject all card/event row mutation and TRUNCATE.
create function public.mia_forest_corner_reject_mutation_v13()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $fn$
begin
  raise exception 'Forest Corner card records are append-only';
end;
$fn$;

create trigger mia_forest_corner_cards_no_update_delete_v13
before update or delete on public.mia_forest_corner_cards
for each row execute function public.mia_forest_corner_reject_mutation_v13();
create trigger mia_forest_corner_cards_no_truncate_v13
before truncate on public.mia_forest_corner_cards
for each statement execute function public.mia_forest_corner_reject_mutation_v13();
create trigger mia_forest_corner_events_no_update_delete_v13
before update or delete on public.mia_forest_corner_card_events
for each row execute function public.mia_forest_corner_reject_mutation_v13();
create trigger mia_forest_corner_events_no_truncate_v13
before truncate on public.mia_forest_corner_card_events
for each statement execute function public.mia_forest_corner_reject_mutation_v13();

-- Serialize state transitions by locking the immutable card row.
create function public.mia_forest_corner_guard_event_v13()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $fn$
declare
  has_proposal boolean;
  has_review boolean;
  has_accepted boolean;
  has_rejected boolean;
  has_superseded boolean;
  has_successor boolean;
begin
  perform 1 from public.mia_forest_corner_cards
   where card_id = NEW.card_id
   for update;
  if not found then
    raise exception 'Card does not exist';
  end if;

  select exists(select 1 from public.mia_forest_corner_card_events
    where card_id = NEW.card_id and event_type = 'proposed') into has_proposal;
  select exists(select 1 from public.mia_forest_corner_card_events
    where card_id = NEW.card_id and event_type in ('accepted','rejected')) into has_review;
  select exists(select 1 from public.mia_forest_corner_card_events
    where card_id = NEW.card_id and event_type = 'accepted') into has_accepted;
  select exists(select 1 from public.mia_forest_corner_card_events
    where card_id = NEW.card_id and event_type = 'rejected') into has_rejected;
  select exists(select 1 from public.mia_forest_corner_card_events
    where card_id = NEW.card_id and event_type = 'superseded') into has_superseded;
  select exists(select 1 from public.mia_forest_corner_cards
    where supersedes_card_id = NEW.card_id) into has_successor;

  if NEW.event_type = 'proposed' then
    if has_proposal then raise exception 'Card already has a proposed event'; end if;
  elsif NEW.event_type in ('accepted','rejected') then
    if not has_proposal or has_review or has_superseded then
      raise exception 'Invalid or duplicate card review transition';
    end if;
  elsif NEW.event_type = 'superseded' then
    if not has_proposal or not has_accepted or has_rejected or has_superseded or not has_successor then
      raise exception 'Invalid supersession transition';
    end if;
  end if;

  return NEW;
end;
$fn$;

create trigger mia_forest_corner_guard_event_insert_v13
before insert on public.mia_forest_corner_card_events
for each row execute function public.mia_forest_corner_guard_event_v13();

-- Single transaction boundary for creating a card and its initial proposal event.
-- Caller supplies a complete, already source-verified card document.
-- This function does not independently prove source ownership/session membership.
create function public.mia_forest_corner_insert_card_v13(p_card jsonb, p_event_key text)
returns uuid
language plpgsql
set search_path = pg_catalog, public
as $fn$
declare
  new_card_id uuid;
begin
  if octet_length(p_card::text) > 12288 then
    raise exception 'Card payload exceeds 12 KiB';
  end if;
  if p_card->>'identity_id' is not null
     and p_card->>'identity_id' <> 'cb6d01b4-0e3f-46ee-8946-360aa91db1ea' then
    raise exception 'Identity mismatch';
  end if;
  if p_card->>'privacy_scope' is not null
     and p_card->>'privacy_scope' <> 'prototype_mia_private_pair' then
    raise exception 'Privacy scope mismatch';
  end if;
  if p_event_key is null or length(p_event_key) not between 16 and 200 then
    raise exception 'Invalid proposal event idempotency key';
  end if;

  insert into public.mia_forest_corner_cards (
    identity_id, schema_version, category, title, summary, emotional_tone,
    source_refs, source_manifest_digest, digest_version, evidence_kind,
    confidence, privacy_scope, idempotency_key, supersedes_card_id
  ) values (
    'cb6d01b4-0e3f-46ee-8946-360aa91db1ea'::uuid,
    coalesce(p_card->>'schema_version','1.0.0'),
    p_card->>'category',
    p_card->>'title',
    p_card->>'summary',
    p_card->>'emotional_tone',
    p_card->'source_refs',
    p_card->>'source_manifest_digest',
    coalesce(p_card->>'digest_version','sha256-canonical-v1'),
    p_card->>'evidence_kind',
    (p_card->>'confidence')::numeric,
    'prototype_mia_private_pair',
    p_card->>'idempotency_key',
    nullif(p_card->>'supersedes_card_id','')::uuid
  )
  on conflict (idempotency_key) do nothing
  returning card_id into new_card_id;

  if new_card_id is null then
    select card_id into new_card_id from public.mia_forest_corner_cards
     where idempotency_key = p_card->>'idempotency_key';
    if new_card_id is null then
      raise exception 'Idempotent card insert could not resolve original row';
    end if;
    return new_card_id;
  end if;

  insert into public.mia_forest_corner_card_events (
    card_id, event_type, actor_scope, idempotency_key
  ) values (new_card_id, 'proposed', 'server', p_event_key);

  return new_card_id;
end;
$fn$;

alter table public.mia_forest_corner_cards enable row level security;
alter table public.mia_forest_corner_card_events enable row level security;

revoke all on table public.mia_forest_corner_cards from public, anon, authenticated;
revoke all on table public.mia_forest_corner_card_events from public, anon, authenticated;
grant select, insert on table public.mia_forest_corner_cards to service_role;
grant select, insert on table public.mia_forest_corner_card_events to service_role;
revoke update, delete, truncate, references, trigger
  on table public.mia_forest_corner_cards from service_role;
revoke update, delete, truncate, references, trigger
  on table public.mia_forest_corner_card_events from service_role;

revoke all on function public.mia_forest_corner_reject_mutation_v13() from public, anon, authenticated;
revoke all on function public.mia_forest_corner_validate_card_v13() from public, anon, authenticated;
revoke all on function public.mia_forest_corner_guard_event_v13() from public, anon, authenticated;
revoke all on function public.mia_forest_corner_insert_card_v13(jsonb,text) from public, anon, authenticated;
grant execute on function public.mia_forest_corner_insert_card_v13(jsonb,text) to service_role;

commit;

-- ROLLBACK / DECOMMISSION (NOT AN AUTOMATIC DROP SCRIPT):
-- 1) Disable the feature flag and return the card endpoint to read-only/offline mode.
-- 2) Stop all writers; verify no in-flight requests remain.
-- 3) Revoke service_role table and RPC grants; preserve card/event data.
-- 4) Export and verify an encrypted retention copy under the approved retention policy.
-- 5) In disposable staging only, drop objects only after checking exact ownership,
--    dependencies, and that the objects were created by this test. Never cascade.
-- 6) Production deletion requires a separate explicit retention/deletion approval.
--
-- Still required before staging:
-- * Execute against a disposable Postgres instance and inspect function/trigger/grant behavior.
-- * Test concurrent event inserts, duplicate card idempotency, RPC rollback,
--   RLS/grants, TRUNCATE/UPDATE/DELETE rejection, and revision/supersession lifecycle.
-- * Edge Function must verify source record identity/session and compute all digests.
-- * The shared mia-chat bearer token remains an interim gate, not E2EE or separate human identity.
 then
      raise exception 'Invalid source digest metadata';
    end if;
  end loop;

  return NEW;
end;
$fn$;

create trigger mia_forest_corner_validate_card_insert_v13
before insert on public.mia_forest_corner_cards
for each row execute function public.mia_forest_corner_validate_card_v13();

-- Reject all card/event row mutation and TRUNCATE.
create function public.mia_forest_corner_reject_mutation_v13()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $fn$
begin
  raise exception 'Forest Corner card records are append-only';
end;
$fn$;

create trigger mia_forest_corner_cards_no_update_delete_v13
before update or delete on public.mia_forest_corner_cards
for each row execute function public.mia_forest_corner_reject_mutation_v13();
create trigger mia_forest_corner_cards_no_truncate_v13
before truncate on public.mia_forest_corner_cards
for each statement execute function public.mia_forest_corner_reject_mutation_v13();
create trigger mia_forest_corner_events_no_update_delete_v13
before update or delete on public.mia_forest_corner_card_events
for each row execute function public.mia_forest_corner_reject_mutation_v13();
create trigger mia_forest_corner_events_no_truncate_v13
before truncate on public.mia_forest_corner_card_events
for each statement execute function public.mia_forest_corner_reject_mutation_v13();

-- Serialize state transitions by locking the immutable card row.
create function public.mia_forest_corner_guard_event_v13()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $fn$
declare
  has_proposal boolean;
  has_review boolean;
  has_superseded boolean;
  has_successor boolean;
begin
  perform 1 from public.mia_forest_corner_cards
   where card_id = NEW.card_id
   for update;
  if not found then
    raise exception 'Card does not exist';
  end if;

  select exists(select 1 from public.mia_forest_corner_card_events
    where card_id = NEW.card_id and event_type = 'proposed') into has_proposal;
  select exists(select 1 from public.mia_forest_corner_card_events
    where card_id = NEW.card_id and event_type in ('accepted','rejected')) into has_review;
  select exists(select 1 from public.mia_forest_corner_card_events
    where card_id = NEW.card_id and event_type = 'superseded') into has_superseded;
  select exists(select 1 from public.mia_forest_corner_cards
    where supersedes_card_id = NEW.card_id) into has_successor;

  if NEW.event_type = 'proposed' then
    if has_proposal then raise exception 'Card already has a proposed event'; end if;
  elsif NEW.event_type in ('accepted','rejected') then
    if not has_proposal or has_review or has_superseded then
      raise exception 'Invalid or duplicate card review transition';
    end if;
  elsif NEW.event_type = 'superseded' then
    if not has_proposal or has_superseded or not has_successor then
      raise exception 'Invalid supersession transition';
    end if;
  end if;

  return NEW;
end;
$fn$;

create trigger mia_forest_corner_guard_event_insert_v13
before insert on public.mia_forest_corner_card_events
for each row execute function public.mia_forest_corner_guard_event_v13();

-- Single transaction boundary for creating a card and its initial proposal event.
-- Caller supplies a complete, already source-verified card document.
-- This function does not independently prove source ownership/session membership.
create function public.mia_forest_corner_insert_card_v13(p_card jsonb, p_event_key text)
returns uuid
language plpgsql
set search_path = pg_catalog, public
as $fn$
declare
  new_card_id uuid;
begin
  if octet_length(p_card::text) > 12288 then
    raise exception 'Card payload exceeds 12 KiB';
  end if;
  if p_card->>'identity_id' is not null
     and p_card->>'identity_id' <> 'cb6d01b4-0e3f-46ee-8946-360aa91db1ea' then
    raise exception 'Identity mismatch';
  end if;
  if p_card->>'privacy_scope' is not null
     and p_card->>'privacy_scope' <> 'prototype_mia_private_pair' then
    raise exception 'Privacy scope mismatch';
  end if;
  if p_event_key is null or length(p_event_key) not between 16 and 200 then
    raise exception 'Invalid proposal event idempotency key';
  end if;

  insert into public.mia_forest_corner_cards (
    identity_id, schema_version, category, title, summary, emotional_tone,
    source_refs, source_manifest_digest, digest_version, evidence_kind,
    confidence, privacy_scope, idempotency_key, supersedes_card_id
  ) values (
    'cb6d01b4-0e3f-46ee-8946-360aa91db1ea'::uuid,
    coalesce(p_card->>'schema_version','1.0.0'),
    p_card->>'category',
    p_card->>'title',
    p_card->>'summary',
    p_card->>'emotional_tone',
    p_card->'source_refs',
    p_card->>'source_manifest_digest',
    coalesce(p_card->>'digest_version','sha256-canonical-v1'),
    p_card->>'evidence_kind',
    (p_card->>'confidence')::numeric,
    'prototype_mia_private_pair',
    p_card->>'idempotency_key',
    nullif(p_card->>'supersedes_card_id','')::uuid
  )
  on conflict (idempotency_key) do nothing
  returning card_id into new_card_id;

  if new_card_id is null then
    select card_id into new_card_id from public.mia_forest_corner_cards
     where idempotency_key = p_card->>'idempotency_key';
    if new_card_id is null then
      raise exception 'Idempotent card insert could not resolve original row';
    end if;
    return new_card_id;
  end if;

  insert into public.mia_forest_corner_card_events (
    card_id, event_type, actor_scope, idempotency_key
  ) values (new_card_id, 'proposed', 'server', p_event_key);

  return new_card_id;
end;
$fn$;

alter table public.mia_forest_corner_cards enable row level security;
alter table public.mia_forest_corner_card_events enable row level security;

revoke all on table public.mia_forest_corner_cards from public, anon, authenticated;
revoke all on table public.mia_forest_corner_card_events from public, anon, authenticated;
grant select, insert on table public.mia_forest_corner_cards to service_role;
grant select, insert on table public.mia_forest_corner_card_events to service_role;
revoke update, delete, truncate, references, trigger
  on table public.mia_forest_corner_cards from service_role;
revoke update, delete, truncate, references, trigger
  on table public.mia_forest_corner_card_events from service_role;

revoke all on function public.mia_forest_corner_reject_mutation_v13() from public, anon, authenticated;
revoke all on function public.mia_forest_corner_validate_card_v13() from public, anon, authenticated;
revoke all on function public.mia_forest_corner_guard_event_v13() from public, anon, authenticated;
revoke all on function public.mia_forest_corner_insert_card_v13(jsonb,text) from public, anon, authenticated;
grant execute on function public.mia_forest_corner_insert_card_v13(jsonb,text) to service_role;

commit;

-- ROLLBACK / DECOMMISSION (NOT AN AUTOMATIC DROP SCRIPT):
-- 1) Disable the feature flag and return the card endpoint to read-only/offline mode.
-- 2) Stop all writers; verify no in-flight requests remain.
-- 3) Revoke service_role table and RPC grants; preserve card/event data.
-- 4) Export and verify an encrypted retention copy under the approved retention policy.
-- 5) In disposable staging only, drop objects only after checking exact ownership,
--    dependencies, and that the objects were created by this test. Never cascade.
-- 6) Production deletion requires a separate explicit retention/deletion approval.
--
-- Still required before staging:
-- * Execute against a disposable Postgres instance and inspect function/trigger/grant behavior.
-- * Test concurrent event inserts, duplicate card idempotency, RPC rollback,
--   RLS/grants, TRUNCATE/UPDATE/DELETE rejection, and revision/supersession lifecycle.
-- * Edge Function must verify source record identity/session and compute all digests.
-- * The shared mia-chat bearer token remains an interim gate, not E2EE or separate human identity.
