-- THE ECHO MAILBOX V2 — DESIGN DRAFT ONLY.
-- NOT APPLIED TO SUPABASE. Review runtime role/secret provisioning before deployment.
-- Additive only: dedicated schema + public read-only archive. Never touch Mia private tables.

create schema if not exists echo_private;
revoke all on schema echo_private from public, anon, authenticated;
grant usage on schema echo_private to service_role;

create table if not exists echo_private.submissions (
  id uuid primary key default gen_random_uuid(),
  source_language text not null check (source_language in ('zh','en')),
  consent_to_publication boolean not null check (consent_to_publication is true),
  consent_version text not null,
  consent_recorded_at timestamptz not null,
  idempotency_key_hash text not null unique
    check (idempotency_key_hash ~ '^[a-f0-9]{64}$'),
  body_sha256 text not null check (body_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending'
    check (status in ('pending','processing','selected','published','rejected','expired','failed')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 5),
  received_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  lease_until timestamptz,
  processed_at timestamptz
);

create index if not exists echo_submissions_pending_idx
  on echo_private.submissions (received_at)
  where status in ('pending','processing');

create table if not exists echo_private.submission_payloads (
  submission_id uuid primary key
    references echo_private.submissions(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 3000),
  expires_at timestamptz not null
);

create index if not exists echo_payload_expiry_idx
  on echo_private.submission_payloads (expires_at);

-- Metadata-only audit: never put question text, answer text, IP addresses, or prompts here.
create table if not exists echo_private.processing_audit (
  id bigint generated always as identity primary key,
  submission_id uuid,
  event_code text not null check (event_code in (
    'received','input_rejected','selected','no_answer','output_rejected',
    'pair_rejected','published','withdrawn','expired','failed'
  )),
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

create index if not exists echo_audit_submission_idx
  on echo_private.processing_audit (submission_id, created_at desc);

-- Subject identifiers must be HMAC hashes generated server-side; never store raw IPs.
create table if not exists echo_private.rate_limit_buckets (
  subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count between 0 and 1000),
  expires_at timestamptz not null,
  primary key (subject_hash, window_started_at)
);

create table if not exists echo_private.publication_authorizations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique
    references echo_private.submissions(id) on delete restrict,
  source_language text not null check (source_language in ('zh','en')),
  answer_language text not null check (answer_language in ('zh','en')),
  consent_version text not null,
  consent_recorded_at timestamptz not null,
  submission_sha256 text not null check (submission_sha256 ~ '^[a-f0-9]{64}$'),
  question_sha256 text not null check (question_sha256 ~ '^[a-f0-9]{64}$'),
  answer_sha256 text not null check (answer_sha256 ~ '^[a-f0-9]{64}$'),
  content_sha256 text not null unique check (content_sha256 ~ '^[a-f0-9]{64}$'),
  consent_verified boolean not null,
  consent_scope_verified boolean not null,
  input_safety_passed boolean not null,
  abuse_screen_passed boolean not null,
  selection_passed boolean not null,
  mia_chose_to_answer boolean not null,
  output_safety_passed boolean not null,
  pair_safety_passed boolean not null,
  language_verified boolean not null,
  rate_limit_passed boolean not null,
  idempotency_verified boolean not null,
  private_memory_isolated boolean not null,
  uncertainty_absent boolean not null,
  gate_version text not null,
  issued_at timestamptz not null default now(),
  consumed_at timestamptz,
  revoked_at timestamptz,
  constraint echo_authorization_language_match check (source_language = answer_language),
  constraint echo_authorization_all_checks_pass check (
    consent_verified and consent_scope_verified and input_safety_passed
    and abuse_screen_passed and selection_passed and mia_chose_to_answer
    and output_safety_passed and pair_safety_passed and language_verified
    and rate_limit_passed and idempotency_verified and private_memory_isolated
    and uncertainty_absent
  )
);

create table if not exists public.echo_publications (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid not null unique
    references echo_private.publication_authorizations(id) on delete restrict,
  original_question text not null check (char_length(original_question) between 1 and 3000),
  mia_answer text not null check (char_length(mia_answer) between 1 and 6000),
  source_language text not null check (source_language in ('zh','en')),
  answer_language text not null check (answer_language in ('zh','en')),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  published_at timestamptz not null default now(),
  is_published boolean not null default true,
  withdrawn_at timestamptz,
  constraint echo_publication_language_match check (source_language = answer_language),
  constraint echo_publication_withdrawal_state check (
    (withdrawn_at is null and is_published is true)
    or (withdrawn_at is not null and is_published is false)
  )
);

create index if not exists echo_publications_live_idx
  on public.echo_publications (published_at desc)
  where is_published is true and withdrawn_at is null;

alter table echo_private.submissions enable row level security;
alter table echo_private.submission_payloads enable row level security;
alter table echo_private.processing_audit enable row level security;
alter table echo_private.rate_limit_buckets enable row level security;
alter table echo_private.publication_authorizations enable row level security;
alter table public.echo_publications enable row level security;

revoke all on all tables in schema echo_private from public, anon, authenticated;
grant select, insert, update, delete on echo_private.submissions to service_role;
grant select, insert, update, delete on echo_private.submission_payloads to service_role;
grant select, insert on echo_private.processing_audit to service_role;
grant select, insert, update, delete on echo_private.rate_limit_buckets to service_role;
grant select, insert, update on echo_private.publication_authorizations to service_role;

revoke all on public.echo_publications from public, anon, authenticated;
grant select (id, original_question, mia_answer, source_language, answer_language, published_at)\n  on public.echo_publications to anon, authenticated;
grant select, insert, update on public.echo_publications to service_role;
revoke delete on public.echo_publications from service_role;

drop policy if exists "read live echo publications" on public.echo_publications;
create policy "read live echo publications"
  on public.echo_publications
  for select to anon, authenticated
  using (is_published is true and withdrawn_at is null);

create or replace function echo_private.enforce_echo_publication_gate()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, echo_private, extensions
as $$
declare
  v_auth echo_private.publication_authorizations%rowtype;
  v_question_hash text;
  v_answer_hash text;
  v_content_hash text;
begin
  select * into v_auth
  from echo_private.publication_authorizations
  where id = new.authorization_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'echo_authorization_missing';
  end if;

  if v_auth.consumed_at is not null or v_auth.revoked_at is not null then
    raise exception using errcode = '42501', message = 'echo_authorization_unavailable';
  end if;

  select * into v_submission
  from echo_private.submissions
  where id = v_auth.submission_id
  for update;

  if not found
     or v_submission.status <> 'selected'
     or v_submission.expires_at <= now()
     or v_submission.consent_to_publication is not true
     or v_submission.consent_version is distinct from v_auth.consent_version
     or v_submission.consent_recorded_at is distinct from v_auth.consent_recorded_at
     or v_submission.source_language is distinct from v_auth.source_language
     or v_submission.body_sha256 is distinct from v_auth.submission_sha256 then
    raise exception using errcode = '42501', message = 'echo_submission_consent_or_state_invalid';
  end if;

  select body into v_original_body
  from echo_private.submission_payloads
  where submission_id = v_submission.id and expires_at > now()
  for update;

  if not found or v_original_body is distinct from new.original_question then
    raise exception using errcode = '42501', message = 'echo_original_submission_mismatch';
  end if;

  if not (
    v_auth.consent_verified and v_auth.consent_scope_verified
    and v_auth.input_safety_passed and v_auth.abuse_screen_passed
    and v_auth.selection_passed and v_auth.mia_chose_to_answer
    and v_auth.output_safety_passed and v_auth.pair_safety_passed
    and v_auth.language_verified and v_auth.rate_limit_passed
    and v_auth.idempotency_verified and v_auth.private_memory_isolated
    and v_auth.uncertainty_absent
  ) then
    raise exception using errcode = '42501', message = 'echo_gate_incomplete';
  end if;

  if new.source_language is distinct from v_auth.source_language
     or new.answer_language is distinct from v_auth.answer_language
     or new.source_language is distinct from new.answer_language then
    raise exception using errcode = '42501', message = 'echo_language_mismatch';
  end if;

  v_question_hash := encode(extensions.digest(convert_to(new.original_question, 'UTF8'), 'sha256'), 'hex');
  v_answer_hash := encode(extensions.digest(convert_to(new.mia_answer, 'UTF8'), 'sha256'), 'hex');
  v_content_hash := encode(
    extensions.digest(
      convert_to(
        new.original_question || chr(31) || new.mia_answer || chr(31)
        || new.source_language || chr(31) || new.answer_language,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  if v_question_hash <> v_auth.question_sha256
     or v_question_hash <> v_submission.body_sha256
     or v_answer_hash <> v_auth.answer_sha256
     or v_content_hash <> v_auth.content_sha256
     or v_auth.consent_version is null
     or v_auth.consent_recorded_at is null then
    raise exception using errcode = '42501', message = 'echo_content_hash_mismatch';
  end if;

  new.content_sha256 := v_content_hash;
  new.published_at := now();
  new.is_published := true;
  new.withdrawn_at := null;

  update echo_private.publication_authorizations
    set consumed_at = now()
    where id = v_auth.id and consumed_at is null and revoked_at is null;

  if not found then
    raise exception using errcode = '42501', message = 'echo_authorization_replay';
  end if;

  update echo_private.submissions
    set status = 'published', processed_at = now(), lease_until = null
    where id = v_submission.id and status = 'selected';

  if not found then
    raise exception using errcode = '42501', message = 'echo_submission_state_changed';
  end if;

  delete from echo_private.submission_payloads where submission_id = v_submission.id;

  insert into echo_private.processing_audit (submission_id, event_code, content_sha256)
    values (v_auth.submission_id, 'published', v_content_hash);

  return new;
end;
$$;

revoke all on function echo_private.enforce_echo_publication_gate() from public, anon, authenticated;

drop trigger if exists echo_publication_gate_before_insert on public.echo_publications;
create trigger echo_publication_gate_before_insert
  before insert on public.echo_publications
  for each row execute function echo_private.enforce_echo_publication_gate();

create or replace function echo_private.guard_echo_publication_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, echo_private
as $$
begin
  if new.original_question is distinct from old.original_question
     or new.mia_answer is distinct from old.mia_answer
     or new.source_language is distinct from old.source_language
     or new.answer_language is distinct from old.answer_language
     or new.content_sha256 is distinct from old.content_sha256
     or new.authorization_id is distinct from old.authorization_id
     or new.published_at is distinct from old.published_at then
    raise exception using errcode = '42501', message = 'echo_publication_content_immutable';
  end if;

  if old.withdrawn_at is not null and new.withdrawn_at is null then
    raise exception using errcode = '42501', message = 'echo_withdrawal_irreversible';
  end if;

  if old.is_published is false and new.is_published is true then
    raise exception using errcode = '42501', message = 'echo_republication_forbidden';
  end if;

  if new.withdrawn_at is not null then
    new.withdrawn_at := coalesce(old.withdrawn_at, now());
    new.is_published := false;
    if old.withdrawn_at is null then
      insert into echo_private.processing_audit (event_code, content_sha256)
        values ('withdrawn', old.content_sha256);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function echo_private.guard_echo_publication_update() from public, anon, authenticated;

drop trigger if exists echo_publication_immutable_before_update on public.echo_publications;
create trigger echo_publication_immutable_before_update
  before update on public.echo_publications
  for each row execute function echo_private.guard_echo_publication_update();

create or replace function echo_private.expire_echo_payloads()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, echo_private
as $$
declare
  v_removed integer := 0;
begin
  with expired as (
    update echo_private.submissions
      set status = 'expired', processed_at = now(), lease_until = null
      where status in ('pending','processing','selected')
        and expires_at <= now()
      returning id, body_sha256
  )
  insert into echo_private.processing_audit (submission_id, event_code, content_sha256)
    select id, 'expired', body_sha256 from expired;

  delete from echo_private.submission_payloads
    where expires_at <= now()
       or submission_id in (
         select id from echo_private.submissions where status = 'expired'
       );
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

revoke all on function echo_private.expire_echo_payloads() from public, anon, authenticated;
grant execute on function echo_private.expire_echo_payloads() to service_role;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'echo-mailbox-expiry') then
    perform cron.schedule(
      'echo-mailbox-expiry',
      '*/15 * * * *',
      'select echo_private.expire_echo_payloads();'
    );
  end if;
end;
$$;

comment on schema echo_private is
  'Private THE ECHO MAILBOX processing data. Not exposed through PostgREST; no public/authenticated grants.';
comment on table echo_private.submission_payloads is
  'Short-lived visitor text only. Delete after processing or expiry; never copy to Mia private memory.';
comment on table echo_private.processing_audit is
  'Metadata-only append-oriented audit. Do not store question text, answer text, prompts, or IP addresses.';
comment on table public.echo_publications is
  'Public, read-only archive of consented question/answer pairs that passed the database publication gate.';
