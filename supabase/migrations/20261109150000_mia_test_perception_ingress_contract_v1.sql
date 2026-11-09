create table if not exists mia_test.perception_source_registry (
  source_id uuid primary key default gen_random_uuid(),
  source_key text not null unique check (length(source_key) between 3 and 120),
  source_kind text not null check (source_kind in ('camera','depth_sensor','positioning','simulator','manual_fixture','imported')),
  auth_scheme text not null check (auth_scheme in ('ed25519','hmac_sha256','test_fixture')),
  verification_key_ref text,
  enabled boolean not null default false,
  registered_at timestamptz not null default now(),
  revoked_at timestamptz,
  max_age_seconds integer not null default 30 check (max_age_seconds between 1 and 3600),
  max_clock_skew_seconds integer not null default 60 check (max_clock_skew_seconds between 0 and 600),
  allowed_frame_ids text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  test_only boolean not null default true check (test_only is true),
  constraint perception_source_revoked_disabled check (revoked_at is null or enabled is false)
);

create table if not exists mia_test.perception_ingress_events (
  id bigint generated always as identity primary key,
  ingress_id uuid not null unique default gen_random_uuid(),
  source_id uuid not null references mia_test.perception_source_registry(source_id),
  source_event_id text not null,
  nonce text not null,
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  signature text,
  signature_status text not null default 'pending'
    check (signature_status in ('pending','verified','invalid','missing')),
  freshness_status text not null default 'pending'
    check (freshness_status in ('pending','fresh','stale','clock_skew')),
  frame_id text not null,
  calibration_evidence_ref text,
  raw_payload jsonb not null,
  normalized_observation jsonb,
  disposition text not null default 'pending'
    check (disposition in ('pending','accepted','rejected','stale','replay')),
  decision_reason text,
  replay_of_ingress_id uuid references mia_test.perception_ingress_events(ingress_id),
  world_truth_claim boolean not null default false check (world_truth_claim is false),
  auto_action_authorized boolean not null default false check (auto_action_authorized is false),
  test_only boolean not null default true check (test_only is true),
  constraint accepted_ingress_has_evidence check (
    disposition <> 'accepted' or (
      signature_status = 'verified'
      and freshness_status = 'fresh'
      and calibration_evidence_ref is not null
      and normalized_observation is not null
      and replay_of_ingress_id is null
    )
  ),
  constraint replay_has_reference check (
    disposition <> 'replay' or replay_of_ingress_id is not null
  )
);

create unique index if not exists perception_ingress_source_event_once
  on mia_test.perception_ingress_events(source_id, source_event_id)
  where disposition <> 'replay';
create unique index if not exists perception_ingress_source_nonce_once
  on mia_test.perception_ingress_events(source_id, nonce)
  where disposition <> 'replay';
create index if not exists perception_ingress_received_at_idx
  on mia_test.perception_ingress_events(received_at desc);
create index if not exists perception_ingress_source_disposition_idx
  on mia_test.perception_ingress_events(source_id, disposition, received_at desc);

alter table mia_test.perception_source_registry enable row level security;
alter table mia_test.perception_ingress_events enable row level security;
revoke all on mia_test.perception_source_registry from public, anon, authenticated;
revoke all on mia_test.perception_ingress_events from public, anon, authenticated;
grant all on mia_test.perception_source_registry to service_role;
grant all on mia_test.perception_ingress_events to service_role;
grant usage, select on sequence mia_test.perception_ingress_events_id_seq to service_role;

comment on table mia_test.perception_source_registry is
  'Test-only registry for external perception source identity and verification policy. No source is connected or enabled by default.';
comment on table mia_test.perception_ingress_events is
  'Append-oriented test-only ingress evidence. Acceptance records source-signature/freshness/frame checks, not objective world truth and never grants action permission.';
