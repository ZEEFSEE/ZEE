-- Disposable PostgreSQL smoke test for the Forest Corner V1.3 proposal.
-- Run ONLY in the ephemeral GitHub Actions postgres:16 service container.
-- This file is not a Supabase migration and contains synthetic records only.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'CREATE ROLE anon NOLOGIN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'CREATE ROLE authenticated NOLOGIN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'CREATE ROLE service_role NOLOGIN BYPASSRLS';
  END IF;
END;
$roles$;

-- Ensure the Supabase-like service role has BYPASSRLS in this disposable test only.
ALTER ROLE service_role BYPASSRLS;

-- Apply the proposal before this test with psql -v ON_ERROR_STOP=1.
DO $privileges$
BEGIN
  IF has_table_privilege('anon', 'public.mia_forest_corner_cards', 'SELECT')
     OR has_table_privilege('authenticated', 'public.mia_forest_corner_cards', 'SELECT')
     OR has_table_privilege('anon', 'public.mia_forest_corner_card_events', 'INSERT')
     OR has_function_privilege('anon', 'public.mia_forest_corner_insert_card_v13(jsonb,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.mia_forest_corner_insert_card_v13(jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Browser role unexpectedly has card vault privileges';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.mia_forest_corner_cards', 'SELECT')
     OR has_table_privilege('service_role', 'public.mia_forest_corner_cards', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.mia_forest_corner_card_events', 'INSERT')
     OR NOT has_function_privilege('service_role', 'public.mia_forest_corner_insert_card_v13(jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Service role privileges do not match the intended narrow contract';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.mia_forest_corner_cards'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.mia_forest_corner_card_events'::regclass) THEN
    RAISE EXCEPTION 'RLS is not enabled on both vault tables';
  END IF;
END;
$privileges$;

SET ROLE service_role;

-- Initial proposal through the narrow SECURITY DEFINER RPC.
SELECT public.mia_forest_corner_insert_card_v13(
  '{
    "category":"comfort_anchor",
    "title":"Synthetic quiet corner",
    "summary":"Synthetic test record only; no real chat or memory content.",
    "source_refs":[{
      "source_table":"mia_memories",
      "source_record_id":"synthetic-memory-0001",
      "source_timestamp":"2026-11-04T00:00:00Z",
      "digest_algorithm":"sha256-canonical-v1",
      "source_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }],
    "source_manifest_digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "evidence_kind":"explicit",
    "confidence":0.95,
    "idempotency_key":"synthetic-card-key-000001"
  }'::jsonb,
  'synthetic-proposal-event-0001'
) AS card_id \gset

SELECT set_config('forest_test.card_id', :'card_id', false);

-- Duplicate call must resolve to the same existing card, without a second proposal.
SELECT public.mia_forest_corner_insert_card_v13(
  '{
    "category":"comfort_anchor",
    "title":"Synthetic quiet corner",
    "summary":"Synthetic test record only; no real chat or memory content.",
    "source_refs":[{
      "source_table":"mia_memories",
      "source_record_id":"synthetic-memory-0001",
      "source_timestamp":"2026-11-04T00:00:00Z",
      "digest_algorithm":"sha256-canonical-v1",
      "source_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }],
    "source_manifest_digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "evidence_kind":"explicit",
    "confidence":0.95,
    "idempotency_key":"synthetic-card-key-000001"
  }'::jsonb,
  'synthetic-proposal-event-0001'
) AS duplicate_card_id \gset

SELECT CASE WHEN :'card_id'::uuid = :'duplicate_card_id'::uuid THEN 1 ELSE 1/0 END;

DO $idempotency$
BEGIN
  IF (SELECT count(*) FROM public.mia_forest_corner_card_events
      WHERE card_id = current_setting('forest_test.card_id')::uuid AND event_type = 'proposed') <> 1 THEN
    RAISE EXCEPTION 'Duplicate insert created more than one proposal event';
  END IF;
END;
$idempotency$;

-- One explicit review is allowed; a second terminal review must be rejected.
INSERT INTO public.mia_forest_corner_card_events(card_id,event_type,actor_scope,idempotency_key)
VALUES (current_setting('forest_test.card_id')::uuid,'accepted','private_pair_user','synthetic-review-event-0001');

DO $duplicate_review$
BEGIN
  BEGIN
    INSERT INTO public.mia_forest_corner_card_events(card_id,event_type,actor_scope,idempotency_key)
    VALUES (current_setting('forest_test.card_id')::uuid,'rejected','private_pair_user','synthetic-review-event-0002');
    RAISE EXCEPTION 'Duplicate terminal review was unexpectedly accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Duplicate terminal review was unexpectedly accepted' THEN RAISE; END IF;
  END;
END;
$duplicate_review$;

-- Direct card INSERT must be denied to service_role.
DO $direct_insert$
BEGIN
  BEGIN
    INSERT INTO public.mia_forest_corner_cards(category,title,summary,source_refs,source_manifest_digest,evidence_kind,confidence,idempotency_key)
    VALUES ('reflection','Forbidden direct insert','Synthetic denial test',
      '[{"source_table":"mia_memories","source_record_id":"x","source_timestamp":"2026-11-04T00:00:00Z","digest_algorithm":"sha256-canonical-v1","source_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'::jsonb,
      repeat('b',64),'explicit',0.9,'synthetic-direct-insert-key');
    RAISE EXCEPTION 'Direct card INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$direct_insert$;


-- A second proposal is allowed; a third same-day proposal must fail atomically.
SELECT public.mia_forest_corner_insert_card_v13(
  '{
    "category":"reflection",
    "title":"Synthetic second card",
    "summary":"Second synthetic test record for the daily cap.",
    "source_refs":[{
      "source_table":"mia_memories",
      "source_record_id":"synthetic-memory-0002",
      "source_timestamp":"2026-11-04T00:00:00Z",
      "digest_algorithm":"sha256-canonical-v1",
      "source_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    }],
    "source_manifest_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    "evidence_kind":"explicit",
    "confidence":0.8,
    "idempotency_key":"synthetic-card-key-000002"
  }'::jsonb,
  'synthetic-proposal-event-0002'
);

DO $daily_limit$
BEGIN
  BEGIN
    PERFORM public.mia_forest_corner_insert_card_v13(
      '{
        "category":"reflection",
        "title":"Synthetic third card",
        "summary":"This third same-day proposal must not persist.",
        "source_refs":[{
          "source_table":"mia_memories",
          "source_record_id":"synthetic-memory-0003",
          "source_timestamp":"2026-11-04T00:00:00Z",
          "digest_algorithm":"sha256-canonical-v1",
          "source_digest":"1111111111111111111111111111111111111111111111111111111111111111"
        }],
        "source_manifest_digest":"2222222222222222222222222222222222222222222222222222222222222222",
        "evidence_kind":"explicit",
        "confidence":0.7,
        "idempotency_key":"synthetic-card-key-000003"
      }'::jsonb,
      'synthetic-proposal-event-0003'
    );
    RAISE EXCEPTION 'Daily proposal cap was unexpectedly bypassed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Daily proposal cap was unexpectedly bypassed' THEN RAISE; END IF;
    IF SQLERRM <> 'Daily Forest Corner proposal limit reached' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.mia_forest_corner_cards
             WHERE idempotency_key = 'synthetic-card-key-000003') THEN
    RAISE EXCEPTION 'Daily cap failure did not roll back the third card';
  END IF;
END;
$daily_limit$;

-- An event-key collision inside the RPC must roll back the newly inserted card.
DO $rollback$
BEGIN
  BEGIN
    PERFORM public.mia_forest_corner_insert_card_v13(
      '{
        "category":"reflection",
        "title":"Rollback probe",
        "summary":"Must not persist after event insert failure.",
        "source_refs":[{
          "source_table":"mia_memories",
          "source_record_id":"synthetic-memory-rollback",
          "source_timestamp":"2026-11-04T00:00:00Z",
          "digest_algorithm":"sha256-canonical-v1",
          "source_digest":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
        }],
        "source_manifest_digest":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        "evidence_kind":"explicit",
        "confidence":0.8,
        "idempotency_key":"synthetic-rollback-card-0001"
      }'::jsonb,
      'synthetic-proposal-event-0001'
    );
    RAISE EXCEPTION 'Expected event-key collision did not occur';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.mia_forest_corner_cards
             WHERE idempotency_key = 'synthetic-rollback-card-0001') THEN
    RAISE EXCEPTION 'RPC failure did not roll back card insertion';
  END IF;
END;
$rollback$;

RESET ROLE;

DO $final_assertions$
BEGIN
  IF (SELECT count(*) FROM public.mia_forest_corner_cards) <> 2 THEN
    RAISE EXCEPTION 'Unexpected card count after smoke test';
  END IF;
  IF (SELECT count(*) FROM public.mia_forest_corner_card_events) <> 3 THEN
    RAISE EXCEPTION 'Unexpected event count after smoke test';
  END IF;
END;
$final_assertions$;

SELECT 'Forest Corner disposable PostgreSQL smoke test: PASS' AS result;
