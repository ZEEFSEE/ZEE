-- THE ECHO MAILBOX V2 — DESIGN DRAFT ONLY.
-- NOT APPLIED TO SUPABASE. Review the deployment boundary before applying.
-- Additive only: a dedicated private schema and a read-only public archive.
-- Never query, copy, or write Mia's private chat, memory, identity, personality, or family tables.

create schema if not exists echo_private;
revoke all on schema echo_private from public, anon, authenticated, service_role;

create table if not exists echo_private.submissions (
  id uuid primary key default gen_random_uuid(),
  source_language text not null check (source_language in ('zh','en')),
  consent_to_publication boolean not null check (consent_to_publication is true),
  consent_version text not null,
  consent_recorded_at timestamptz not null,
  idempotency_key_hash text not null unique check (idempotency_key_hash ~ '^[a-f0-9]{64}$'),
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
  submission_id uuid primary key references echo_private.submissions(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 3000),
  expires_at timestamptz not null
);

create index if not exists echo_payload_expiry_idx
  on echo_private.submission_payloads (expires_at);

-- Metadata-only audit. Never store question/answer text, prompts, raw IPs, or secrets here.
create table if not exists echo_private.processing_audit (
  id bigint generated always as identity primary key,
  submission_id uuid,
  event_code text not null check (event_code in (
    'received','input_rejected','selected','no_answer','output_rejected',
    'pair_rejected','published','withdrawn','expired','failed'
  )),
  reason_code text check (reason_code is null or reason_code in (
    'privacy_risk','safety_risk','content_issue','moderation_uncertain','user_request'
  )),
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

create index if not exists echo_audit_submission_idx
  on echo_private.processing_audit (submission_id, created_at desc);

-- subject_hash must be an HMAC created server-side; raw IP addresses are never stored.
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
  publication_scope_public_only boolean not null,
  replay_absent boolean not null,
  duplicate_absent boolean not null,
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
    and uncertainty_absent and publication_scope_public_only
    and replay_absent and duplicate_absent
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
  content_sha256 text not null default repeat('0', 64)
    check (content_sha256 ~ '^[a-f0-9]{64}$'),
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

revoke all on all tables in schema echo_private from public, anon, authenticated, service_role;

revoke all on public.echo_publications from public, anon, authenticated, service_role;
grant select (id, original_question, mia_answer, source_language, answer_language, published_at)
  on public.echo_publications to anon, authenticated;

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
  v_submission echo_private.submissions%rowtype;
  v_original_body text;
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
    and v_auth.uncertainty_absent and v_auth.publication_scope_public_only
    and v_auth.replay_absent and v_auth.duplicate_absent
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
      where status in ('pending','processing','selected') and expires_at <= now()
      returning id, body_sha256
  )
  insert into echo_private.processing_audit (submission_id, event_code, content_sha256)
    select id, 'expired', body_sha256 from expired;

  update echo_private.publication_authorizations
    set revoked_at = coalesce(revoked_at, now())
    where submission_id in (
      select id from echo_private.submissions where status = 'expired'
    ) and consumed_at is null;

  delete from echo_private.submission_payloads
    where expires_at <= now()
       or submission_id in (
         select id from echo_private.submissions where status = 'expired'
       );
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

revoke all on function echo_private.expire_echo_payloads() from public, anon, authenticated, service_role;

-- Narrow service-role RPCs. They are the only intended persistence interface for the Edge Function.
create or replace function public.echo_register_submission(
  p_body text, p_source_language text, p_consent boolean, p_consent_version text,
  p_idempotency_key_hash text, p_body_sha256 text, p_subject_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, echo_private, extensions
as $$
declare
  v_window timestamptz := date_trunc('minute', now());
  v_count integer;
  v_submission_id uuid;
  v_consent_at timestamptz := now();
  v_expires_at timestamptz := now() + interval '24 hours';
begin
  if p_consent is distinct from true
     or p_consent_version is distinct from 'echo-consent-v1'
     or p_source_language not in ('zh','en')
     or p_body is null or char_length(p_body) not between 1 and 3000
     or p_idempotency_key_hash !~ '^[a-f0-9]{64}$'
     or p_body_sha256 !~ '^[a-f0-9]{64}$'
     or p_subject_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'echo_submission_invalid';
  end if;
  if encode(extensions.digest(convert_to(p_body, 'UTF8'), 'sha256'), 'hex') <> p_body_sha256 then
    raise exception using errcode = '22023', message = 'echo_submission_hash_mismatch';
  end if;

  insert into echo_private.rate_limit_buckets (subject_hash, window_started_at, request_count, expires_at)
    values (p_subject_hash, v_window, 1, now() + interval '1 day')
  on conflict (subject_hash, window_started_at)
    do update set request_count = least(echo_private.rate_limit_buckets.request_count + 1, 1000),
                  expires_at = excluded.expires_at
  returning request_count into v_count;

  if v_count > 5 then
    return jsonb_build_object('submissionId', null, 'rateLimitPassed', false,
      'idempotencyVerified', false, 'publicationScopeIsPublicOnly', true,
      'duplicatePublication', false, 'replayDetected', false);
  end if;

  insert into echo_private.submissions (
    source_language, consent_to_publication, consent_version, consent_recorded_at,
    idempotency_key_hash, body_sha256, expires_at
  ) values (
    p_source_language, true, p_consent_version, v_consent_at,
    p_idempotency_key_hash, p_body_sha256, v_expires_at
  )
  on conflict (idempotency_key_hash) do nothing
  returning id into v_submission_id;

  if v_submission_id is null then
    return jsonb_build_object('submissionId', null, 'rateLimitPassed', true,
      'idempotencyVerified', false, 'publicationScopeIsPublicOnly', true,
      'duplicatePublication', true, 'replayDetected', true);
  end if;

  insert into echo_private.submission_payloads (submission_id, body, expires_at)
    values (v_submission_id, p_body, v_expires_at);
  insert into echo_private.processing_audit (submission_id, event_code, content_sha256)
    values (v_submission_id, 'received', p_body_sha256);

  return jsonb_build_object('submissionId', v_submission_id, 'rateLimitPassed', true,
    'idempotencyVerified', true, 'publicationScopeIsPublicOnly', true,
    'duplicatePublication', false, 'replayDetected', false,
    'consentVersion', p_consent_version, 'consentRecordedAt', v_consent_at);
end;
$$;

create or replace function public.echo_issue_authorization(
  p_submission_id uuid, p_source_language text, p_answer_language text,
  p_consent_version text, p_consent_recorded_at timestamptz,
  p_hashes jsonb, p_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, echo_private, extensions
as $$
declare
  v_submission echo_private.submissions%rowtype;
  v_payload text;
  v_authorization_id uuid;
begin
  if p_source_language not in ('zh','en') or p_answer_language <> p_source_language
     or p_hashes is null
     or p_hashes->>'submissionHash' is null or p_hashes->>'submissionHash' !~ '^[a-f0-9]{64}$'
     or p_hashes->>'questionHash' is null or p_hashes->>'questionHash' !~ '^[a-f0-9]{64}$'
     or p_hashes->>'answerHash' is null or p_hashes->>'answerHash' !~ '^[a-f0-9]{64}$'
     or p_hashes->>'finalContentHash' is null or p_hashes->>'finalContentHash' !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'echo_authorization_input_invalid';
  end if;

  if p_evidence->>'consentGranted' is distinct from 'true'
     or p_evidence->>'consentCoversQuestionAndAnswer' is distinct from 'true'
     or p_evidence->>'inputSafetyPassed' is distinct from 'true'
     or p_evidence->>'abuseScreenPassed' is distinct from 'true'
     or p_evidence->>'selectionPassed' is distinct from 'true'
     or p_evidence->>'miaChoseToAnswer' is distinct from 'true'
     or p_evidence->>'outputSafetyPassed' is distinct from 'true'
     or p_evidence->>'questionAnswerPairSafetyPassed' is distinct from 'true'
     or p_evidence->>'languagePreserved' is distinct from 'true'
     or p_evidence->>'rateLimitPassed' is distinct from 'true'
     or p_evidence->>'idempotencyVerified' is distinct from 'true'
     or p_evidence->>'publicationScopeIsPublicOnly' is distinct from 'true'
     or p_evidence->>'allChecksComplete' is distinct from 'true'
     or p_evidence->>'privateMemoryAccessed' is distinct from 'false'
     or p_evidence->>'uncertain' is distinct from 'false'
     or p_evidence->>'replayDetected' is distinct from 'false'
     or p_evidence->>'duplicatePublication' is distinct from 'false'
     or p_evidence->>'authorizationConsumed' is distinct from 'false'
     or p_evidence->>'authorizationRevoked' is distinct from 'false' then
    raise exception using errcode = '42501', message = 'echo_authorization_checks_incomplete';
  end if;

  select * into v_submission
  from echo_private.submissions
  where id = p_submission_id
  for update;

  if not found or v_submission.status <> 'pending'
     or v_submission.expires_at <= now()
     or v_submission.consent_to_publication is not true
     or v_submission.consent_version is distinct from p_consent_version
     or v_submission.consent_recorded_at is distinct from p_consent_recorded_at
     or v_submission.source_language is distinct from p_source_language
     or v_submission.body_sha256 is distinct from p_hashes->>'submissionHash'
     or v_submission.body_sha256 is distinct from p_hashes->>'questionHash' then
    raise exception using errcode = '42501', message = 'echo_submission_consent_or_state_invalid';
  end if;

  select body into v_payload
  from echo_private.submission_payloads
  where submission_id = p_submission_id and expires_at > now()
  for update;
  if not found or encode(extensions.digest(convert_to(v_payload, 'UTF8'), 'sha256'), 'hex')
     is distinct from p_hashes->>'questionHash' then
    raise exception using errcode = '42501', message = 'echo_original_payload_invalid';
  end if;

  update echo_private.submissions set status = 'selected'
    where id = p_submission_id and status = 'pending';
  if not found then
    raise exception using errcode = '42501', message = 'echo_submission_state_changed';
  end if;

  insert into echo_private.publication_authorizations (
    submission_id, source_language, answer_language, consent_version, consent_recorded_at,
    submission_sha256, question_sha256, answer_sha256, content_sha256,
    consent_verified, consent_scope_verified, input_safety_passed, abuse_screen_passed,
    selection_passed, mia_chose_to_answer, output_safety_passed, pair_safety_passed,
    language_verified, rate_limit_passed, idempotency_verified, private_memory_isolated,
    uncertainty_absent, publication_scope_public_only, replay_absent, duplicate_absent, gate_version
  ) values (
    p_submission_id, p_source_language, p_answer_language, p_consent_version, p_consent_recorded_at,
    p_hashes->>'submissionHash', p_hashes->>'questionHash', p_hashes->>'answerHash', p_hashes->>'finalContentHash',
    true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true,
    'echo-gate-v1'
  )
  returning id into v_authorization_id;

  insert into echo_private.processing_audit (submission_id, event_code, content_sha256)
    values (p_submission_id, 'selected', p_hashes->>'submissionHash');

  return jsonb_build_object('authorizationId', v_authorization_id);
end;
$$;

create or replace function public.echo_publish(
  p_authorization_id uuid, p_original_question text, p_mia_answer text, p_language text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, echo_private, extensions
as $$
declare
  v_publication_id uuid;
begin
  if p_language not in ('zh','en')
     or p_original_question is null or char_length(p_original_question) not between 1 and 3000
     or p_mia_answer is null or char_length(p_mia_answer) not between 1 and 6000 then
    raise exception using errcode = '22023', message = 'echo_publication_input_invalid';
  end if;
  insert into public.echo_publications (
    authorization_id, original_question, mia_answer, source_language, answer_language
  ) values (p_authorization_id, p_original_question, p_mia_answer, p_language, p_language)
  returning id into v_publication_id;
  return jsonb_build_object('published', true, 'publicationId', v_publication_id);
end;
$$;

create or replace function public.echo_discard_submission(p_submission_id uuid, p_event_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, echo_private
as $$
begin
  if p_event_code not in ('input_rejected','no_answer','output_rejected','pair_rejected','failed') then
    raise exception using errcode = '22023', message = 'echo_discard_code_invalid';
  end if;
  update echo_private.publication_authorizations
    set revoked_at = coalesce(revoked_at, now())
    where submission_id = p_submission_id and consumed_at is null;
  update echo_private.submissions
    set status = 'rejected', processed_at = now(), lease_until = null
    where id = p_submission_id and status in ('pending','processing','selected');
  if not found then
    return jsonb_build_object('discarded', false);
  end if;
  delete from echo_private.submission_payloads where submission_id = p_submission_id;
  insert into echo_private.processing_audit (submission_id, event_code)
    values (p_submission_id, p_event_code);
  return jsonb_build_object('discarded', true);
end;
$$;

create or replace function public.echo_withdraw_publication(
  p_publication_id uuid,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, echo_private, extensions
as $
declare
  v_content_hash text;
begin
  if p_reason_code not in ('privacy_risk','safety_risk','content_issue','moderation_uncertain','user_request') then
    raise exception using errcode = '22023', message = 'echo_withdrawal_reason_invalid';
  end if;

  update public.echo_publications
    set withdrawn_at = now(), is_published = false
    where id = p_publication_id and is_published is true and withdrawn_at is null
    returning content_sha256 into v_content_hash;

  if not found then
    return jsonb_build_object('withdrawn', false);
  end if;

  insert into echo_private.processing_audit (event_code, reason_code, content_sha256)
    values ('withdrawn', p_reason_code, v_content_hash);

  return jsonb_build_object('withdrawn', true);
end;
$$;

revoke all on function public.echo_withdraw_publication(uuid,text) from public, anon, authenticated;
grant execute on function public.echo_withdraw_publication(uuid,text) to service_role;

create or replace function public.echo_revoke_authorization(p_authorization_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, echo_private
as $$
begin
  if p_reason not in ('not_published','pipeline_failed') then
    raise exception using errcode = '22023', message = 'echo_revoke_reason_invalid';
  end if;
  update echo_private.publication_authorizations
    set revoked_at = coalesce(revoked_at, now())
    where id = p_authorization_id and consumed_at is null;
  return jsonb_build_object('revoked', found);
end;
$$;

revoke all on function public.echo_register_submission(text,text,boolean,text,text,text,text) from public, anon, authenticated;
revoke all on function public.echo_issue_authorization(uuid,text,text,text,timestamptz,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.echo_publish(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.echo_discard_submission(uuid,text) from public, anon, authenticated;
revoke all on function public.echo_revoke_authorization(uuid,text) from public, anon, authenticated;
grant execute on function public.echo_register_submission(text,text,boolean,text,text,text,text) to service_role;
grant execute on function public.echo_issue_authorization(uuid,text,text,text,timestamptz,jsonb,jsonb) to service_role;
grant execute on function public.echo_publish(uuid,text,text,text) to service_role;
grant execute on function public.echo_discard_submission(uuid,text) to service_role;
grant execute on function public.echo_revoke_authorization(uuid,text) to service_role;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'echo-mailbox-expiry') then
    perform cron.schedule('echo-mailbox-expiry', '*/15 * * * *',
      'select echo_private.expire_echo_payloads();');
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
