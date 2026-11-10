-- Applied hardening migration: echo_mailbox_v2_harden_rpc_boundary
-- Public RPCs are SECURITY INVOKER wrappers; privileged implementations live
-- only in unexposed echo_private and verify the service_role JWT.

grant usage on schema echo_private to service_role;
revoke all on all tables in schema echo_private from public, anon, authenticated, service_role;
revoke all on public.echo_publications from public, anon, authenticated, service_role;
grant select (id, original_question, mia_answer, source_language, answer_language, published_at)
  on public.echo_publications to anon, authenticated;

create or replace function echo_private.echo_register_submission_impl(
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
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'echo_service_role_required';
  end if;
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

revoke all on function echo_private.echo_register_submission_impl(text,text,boolean,text,text,text,text) from public, anon, authenticated, service_role;
grant execute on function echo_private.echo_register_submission_impl(text,text,boolean,text,text,text,text) to service_role;

create or replace function public.echo_register_submission(p_body text, p_source_language text, p_consent boolean, p_consent_version text, p_idempotency_key_hash text, p_body_sha256 text, p_subject_hash text)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, echo_private
as $$
  select echo_private.echo_register_submission_impl($1, $2, $3, $4, $5, $6, $7);
$$;

revoke all on function public.echo_register_submission(text,text,boolean,text,text,text,text) from public, anon, authenticated;
grant execute on function public.echo_register_submission(text,text,boolean,text,text,text,text) to service_role;

create or replace function echo_private.echo_issue_authorization_impl(
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
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'echo_service_role_required';
  end if;
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

revoke all on function echo_private.echo_issue_authorization_impl(uuid,text,text,text,timestamptz,jsonb,jsonb) from public, anon, authenticated, service_role;
grant execute on function echo_private.echo_issue_authorization_impl(uuid,text,text,text,timestamptz,jsonb,jsonb) to service_role;

create or replace function public.echo_issue_authorization(p_submission_id uuid, p_source_language text, p_answer_language text, p_consent_version text, p_consent_recorded_at timestamptz, p_hashes jsonb, p_evidence jsonb)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, echo_private
as $$
  select echo_private.echo_issue_authorization_impl($1, $2, $3, $4, $5, $6, $7);
$$;

revoke all on function public.echo_issue_authorization(uuid,text,text,text,timestamptz,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.echo_issue_authorization(uuid,text,text,text,timestamptz,jsonb,jsonb) to service_role;

create or replace function echo_private.echo_publish_impl(
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
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'echo_service_role_required';
  end if;
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

revoke all on function echo_private.echo_publish_impl(uuid,text,text,text) from public, anon, authenticated, service_role;
grant execute on function echo_private.echo_publish_impl(uuid,text,text,text) to service_role;

create or replace function public.echo_publish(p_authorization_id uuid, p_original_question text, p_mia_answer text, p_language text)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, echo_private
as $$
  select echo_private.echo_publish_impl($1, $2, $3, $4);
$$;

revoke all on function public.echo_publish(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.echo_publish(uuid,text,text,text) to service_role;

create or replace function echo_private.echo_discard_submission_impl(p_submission_id uuid, p_event_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, echo_private
as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'echo_service_role_required';
  end if;
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

revoke all on function echo_private.echo_discard_submission_impl(uuid,text) from public, anon, authenticated, service_role;
grant execute on function echo_private.echo_discard_submission_impl(uuid,text) to service_role;

create or replace function public.echo_discard_submission(p_submission_id uuid, p_event_code text)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, echo_private
as $$
  select echo_private.echo_discard_submission_impl($1, $2);
$$;

revoke all on function public.echo_discard_submission(uuid,text) from public, anon, authenticated;
grant execute on function public.echo_discard_submission(uuid,text) to service_role;

create or replace function echo_private.echo_withdraw_publication_impl(
  p_publication_id uuid,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, echo_private, extensions
as $$
declare
  v_content_hash text;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'echo_service_role_required';
  end if;
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

revoke all on function echo_private.echo_withdraw_publication_impl(uuid,text) from public, anon, authenticated, service_role;
grant execute on function echo_private.echo_withdraw_publication_impl(uuid,text) to service_role;

create or replace function public.echo_withdraw_publication(p_publication_id uuid, p_reason_code text)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, echo_private
as $$
  select echo_private.echo_withdraw_publication_impl($1, $2);
$$;

revoke all on function public.echo_withdraw_publication(uuid,text) from public, anon, authenticated;
grant execute on function public.echo_withdraw_publication(uuid,text) to service_role;

create or replace function echo_private.echo_revoke_authorization_impl(p_authorization_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, echo_private
as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'echo_service_role_required';
  end if;
  if p_reason not in ('not_published','pipeline_failed') then
    raise exception using errcode = '22023', message = 'echo_revoke_reason_invalid';
  end if;
  update echo_private.publication_authorizations
    set revoked_at = coalesce(revoked_at, now())
    where id = p_authorization_id and consumed_at is null;
  return jsonb_build_object('revoked', found);
end;
$$;

revoke all on function echo_private.echo_revoke_authorization_impl(uuid,text) from public, anon, authenticated, service_role;
grant execute on function echo_private.echo_revoke_authorization_impl(uuid,text) to service_role;

create or replace function public.echo_revoke_authorization(p_authorization_id uuid, p_reason text)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, echo_private
as $$
  select echo_private.echo_revoke_authorization_impl($1, $2);
$$;

revoke all on function public.echo_revoke_authorization(uuid,text) from public, anon, authenticated;
grant execute on function public.echo_revoke_authorization(uuid,text) to service_role;

revoke all on function echo_private.enforce_echo_publication_gate() from public, anon, authenticated, service_role;
revoke all on function echo_private.guard_echo_publication_update() from public, anon, authenticated, service_role;
revoke all on function echo_private.expire_echo_payloads() from public, anon, authenticated, service_role;

comment on schema echo_private is
  'Private THE ECHO MAILBOX processing data. Only server-only functions have controlled access.';
