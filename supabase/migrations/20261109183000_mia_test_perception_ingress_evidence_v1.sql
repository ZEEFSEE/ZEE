-- MIA test-only external perception evidence layer.
-- Applied to zee-prediction / mia_test only. No production objects are touched.

create table if not exists mia_test.perception_source_registry (
  source_id text not null,
  key_id text not null,
  algorithm text not null check (algorithm = 'ECDSA_P256_SHA256'),
  public_key_jwk jsonb not null check (jsonb_typeof(public_key_jwk) = 'object'),
  enabled boolean not null default false,
  valid_from timestamptz not null,
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (source_id, key_id),
  check (valid_until is null or valid_until > valid_from)
);

create table if not exists mia_test.perception_ingress_events (
  ingress_id uuid primary key default gen_random_uuid(),
  source_id text not null,
  key_id text not null,
  source_event_id text not null,
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  nonce text not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  signature_b64url text not null,
  raw_payload bytea not null,
  payload jsonb not null check (jsonb_typeof(payload) in ('object','array')),
  verification_status text not null check (verification_status in ('verified','rejected')),
  rejection_reason text,
  test_only boolean not null default true check (test_only),
  foreign key (source_id,key_id)
    references mia_test.perception_source_registry(source_id,key_id),
  unique (source_id, source_event_id),
  unique (source_id, nonce),
  check ((verification_status = 'verified' and rejection_reason is null)
      or (verification_status = 'rejected' and rejection_reason is not null))
);

create table if not exists mia_test.coordinate_frame_mappings (
  mapping_id uuid primary key default gen_random_uuid(),
  source_id text not null,
  source_frame_id text not null,
  target_frame_id text not null references mia_test.scene_frames(frame_id),
  transform_2d jsonb not null check (jsonb_typeof(transform_2d) = 'array'),
  evidence_ref text not null,
  validation_status text not null check (validation_status in ('pending','verified','rejected')),
  verified_by text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  test_only boolean not null default true check (test_only),
  check (
    (validation_status = 'verified' and verified_by is not null and verified_at is not null)
    or validation_status <> 'verified'
  )
);

create table if not exists mia_test.perception_observations (
  observation_id uuid primary key default gen_random_uuid(),
  ingress_id uuid not null unique references mia_test.perception_ingress_events(ingress_id),
  source_frame_id text not null,
  source_coordinates jsonb not null check (jsonb_typeof(source_coordinates) = 'object'),
  mapping_id uuid references mia_test.coordinate_frame_mappings(mapping_id),
  mapped_frame_id text,
  mapped_coordinates jsonb,
  mapping_status text not null check (mapping_status in ('unmapped','mapped','rejected')),
  observed_at timestamptz not null,
  normalized_payload jsonb not null,
  confidence_basis text not null check (confidence_basis in ('source_assertion','cryptographic_integrity','calibrated_transform')),
  world_truth_claim boolean not null default false check (world_truth_claim = false),
  live_perception boolean not null default false check (live_perception = false),
  physical_measurement boolean not null default false check (physical_measurement = false),
  test_only boolean not null default true check (test_only),
  created_at timestamptz not null default now(),
  check (
    (mapping_status = 'mapped' and mapping_id is not null and mapped_frame_id is not null and mapped_coordinates is not null)
    or mapping_status <> 'mapped'
  )
);

create table if not exists mia_test.subject_inferences (
  inference_id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references mia_test.perception_observations(observation_id),
  agent_key text not null,
  inference jsonb not null check (jsonb_typeof(inference) = 'object'),
  rationale text,
  confidence numeric(5,4) check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  test_only boolean not null default true check (test_only)
);

create table if not exists mia_test.perception_action_authorizations (
  authorization_id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references mia_test.perception_observations(observation_id),
  request_id uuid not null unique references mia_test.action_requests(request_id),
  action_scope text not null,
  scene_scope text not null,
  authorized_by text not null,
  reason text not null,
  authorized_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  test_only boolean not null default true check (test_only),
  check (expires_at > authorized_at)
);

create index if not exists perception_ingress_source_received_idx
  on mia_test.perception_ingress_events(source_id, received_at desc);
create index if not exists perception_observations_mapping_idx
  on mia_test.perception_observations(mapping_status, observed_at desc);
create index if not exists subject_inferences_observation_idx
  on mia_test.subject_inferences(observation_id, created_at desc);
create index if not exists perception_action_auth_active_idx
  on mia_test.perception_action_authorizations(request_id, expires_at)
  where revoked_at is null;

alter table mia_test.perception_source_registry enable row level security;
alter table mia_test.perception_ingress_events enable row level security;
alter table mia_test.coordinate_frame_mappings enable row level security;
alter table mia_test.perception_observations enable row level security;
alter table mia_test.subject_inferences enable row level security;
alter table mia_test.perception_action_authorizations enable row level security;

revoke all on mia_test.perception_source_registry from public, anon, authenticated;
revoke all on mia_test.perception_ingress_events from public, anon, authenticated;
revoke all on mia_test.coordinate_frame_mappings from public, anon, authenticated;
revoke all on mia_test.perception_observations from public, anon, authenticated;
revoke all on mia_test.subject_inferences from public, anon, authenticated;
revoke all on mia_test.perception_action_authorizations from public, anon, authenticated;
grant all on mia_test.perception_source_registry to service_role;
grant all on mia_test.perception_ingress_events to service_role;
grant all on mia_test.coordinate_frame_mappings to service_role;
grant all on mia_test.perception_observations to service_role;
grant all on mia_test.subject_inferences to service_role;
grant all on mia_test.perception_action_authorizations to service_role;

create or replace function mia_test.reject_append_only_mutation()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'append_only_record_cannot_be_changed';
end;
$$;

drop trigger if exists perception_ingress_append_only on mia_test.perception_ingress_events;
create trigger perception_ingress_append_only
before update or delete on mia_test.perception_ingress_events
for each row execute function mia_test.reject_append_only_mutation();

drop trigger if exists perception_observation_append_only on mia_test.perception_observations;
create trigger perception_observation_append_only
before update or delete on mia_test.perception_observations
for each row execute function mia_test.reject_append_only_mutation();

drop trigger if exists subject_inference_append_only on mia_test.subject_inferences;
create trigger subject_inference_append_only
before update or delete on mia_test.subject_inferences
for each row execute function mia_test.reject_append_only_mutation();
