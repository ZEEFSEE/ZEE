create table if not exists mia_test.scene_frames (
  frame_id text primary key,
  scene_id text not null,
  frame_kind text not null check (frame_kind in ('scene_local','world_global')),
  unit_name text not null default 'test_unit',
  calibration_status text not null check (calibration_status in ('uncalibrated','calibrated','invalid')),
  parent_frame_id text null references mia_test.scene_frames(frame_id),
  transform_to_parent jsonb null,
  transform_evidence jsonb not null default '{}'::jsonb,
  test_only boolean not null default true check (test_only = true),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (calibration_status = 'calibrated' and transform_to_parent is not null)
    or calibration_status <> 'calibrated'
  )
);

create table if not exists mia_test.scene_anchors (
  anchor_id text primary key,
  scene_id text not null,
  frame_id text not null references mia_test.scene_frames(frame_id),
  anchor_kind text not null,
  coordinates jsonb null,
  verification_status text not null check (verification_status in ('fixture_known','verified','unknown')),
  provenance jsonb not null,
  test_only boolean not null default true check (test_only = true),
  created_at timestamptz not null default now(),
  check (
    (verification_status in ('fixture_known','verified') and coordinates is not null)
    or (verification_status = 'unknown' and coordinates is null)
  )
);

create table if not exists mia_test.action_permission_grants (
  grant_id uuid primary key default gen_random_uuid(),
  test_run_id uuid not null,
  action_scope text not null check (action_scope in ('observe','interact','travel','*')),
  scene_scope text not null,
  granted_by text not null,
  reason text not null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  test_only boolean not null default true check (test_only = true),
  check (expires_at > granted_at),
  check (revoked_at is null or revoked_at >= granted_at)
);

create index if not exists action_permission_grants_lookup_idx
  on mia_test.action_permission_grants(test_run_id, action_scope, scene_scope, expires_at)
  where revoked_at is null;

alter table mia_test.scene_frames enable row level security;
alter table mia_test.scene_anchors enable row level security;
alter table mia_test.action_permission_grants enable row level security;

revoke all on table mia_test.scene_frames, mia_test.scene_anchors, mia_test.action_permission_grants
  from public, anon, authenticated;
grant select, insert, update, delete on table
  mia_test.scene_frames, mia_test.scene_anchors, mia_test.action_permission_grants
  to service_role;
grant usage on schema mia_test to service_role;

insert into mia_test.scene_frames (
  frame_id, scene_id, frame_kind, unit_name, calibration_status,
  transform_to_parent, transform_evidence
) values (
  'test-forest-local-v1', 'mia-forest-corner', 'scene_local',
  'test_unit', 'uncalibrated', null,
  '{"source":"existing_test_fixture","world_transform_status":"uncalibrated","physical_calibration":false}'::jsonb
) on conflict (frame_id) do nothing;

insert into mia_test.scene_anchors (
  anchor_id, scene_id, frame_id, anchor_kind, coordinates,
  verification_status, provenance
) values (
  'forest-lounge-fixture', 'mia-forest-corner', 'test-forest-local-v1',
  'fixture_anchor', '{"x":800,"y":350,"z":null}'::jsonb,
  'fixture_known',
  '{"source":"existing_test_world_state_default","meaning":"semantic fixture coordinate only","physical_measurement":false}'::jsonb
) on conflict (anchor_id) do nothing;

insert into mia_test.scene_anchors (
  anchor_id, scene_id, frame_id, anchor_kind, coordinates,
  verification_status, provenance
) values
  ('crystal-forest-unknown', 'crystal-forest', 'test-forest-local-v1', 'destination', null, 'unknown',
   '{"source":"unresolved_destination_registry","reason":"no calibrated transform or verified anchor"}'::jsonb),
  ('ocean-of-light-unknown', 'ocean-of-light', 'test-forest-local-v1', 'destination', null, 'unknown',
   '{"source":"unresolved_destination_registry","reason":"no calibrated transform or verified anchor"}'::jsonb),
  ('memory-valley-unknown', 'memory-valley', 'test-forest-local-v1', 'destination', null, 'unknown',
   '{"source":"unresolved_destination_registry","reason":"no calibrated transform or verified anchor"}'::jsonb),
  ('living-city-unknown', 'living-city', 'test-forest-local-v1', 'destination', null, 'unknown',
   '{"source":"unresolved_destination_registry","reason":"no calibrated transform or verified anchor"}'::jsonb),
  ('greenhouse-unknown', 'greenhouse', 'test-forest-local-v1', 'destination', null, 'unknown',
   '{"source":"unresolved_destination_registry","reason":"no calibrated transform or verified anchor"}'::jsonb)
on conflict (anchor_id) do nothing;

comment on table mia_test.scene_frames is
  'Isolated MIA semantic test coordinate frames. Calibration must be evidence-backed; test_only.';
comment on table mia_test.scene_anchors is
  'Known fixture anchors and explicitly unresolved destinations. Unknown coordinates remain NULL; test_only.';
comment on table mia_test.action_permission_grants is
  'Explicit, scoped, expiring permissions for isolated MIA test actions. No grant means deny; test_only.';
