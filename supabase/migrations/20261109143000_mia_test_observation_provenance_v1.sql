alter table mia_test.observation_snapshots
  add column confidence_basis text,
  add column provenance jsonb;

update mia_test.observation_snapshots
set confidence_basis = 'database_record_integrity',
    provenance = jsonb_build_object(
      'source_kind', source_kind,
      'origin_table', 'mia_test.world_states',
      'world_truth_claim', false,
      'live_perception', false,
      'physical_measurement', false,
      'physical_movement', false,
      'cross_scene_travel', false,
      'historical_backfill', true
    )
where confidence_basis is null or provenance is null;

alter table mia_test.observation_snapshots
  alter column confidence_basis set default 'database_record_integrity',
  alter column confidence_basis set not null,
  alter column provenance set default '{}'::jsonb,
  alter column provenance set not null;

alter table mia_test.observation_snapshots
  add constraint observation_snapshots_confidence_basis_check
  check (confidence_basis in ('database_record_integrity','test_fixture_assertion')),
  add constraint observation_snapshots_provenance_epistemics_check
  check (
    jsonb_typeof(provenance) = 'object'
    and provenance ? 'world_truth_claim'
    and provenance->>'world_truth_claim' = 'false'
    and provenance->>'live_perception' = 'false'
    and provenance->>'physical_measurement' = 'false'
  );

comment on column mia_test.observation_snapshots.confidence is
  'Numeric confidence must be interpreted using confidence_basis; it is not a confidence score about physical-world truth.';
comment on column mia_test.observation_snapshots.confidence_basis is
  'Separates database record integrity from test-fixture assertion; neither implies live physical perception.';
comment on column mia_test.observation_snapshots.provenance is
  'Machine-readable source provenance and epistemic limits. Test-only; physical-world truth is never asserted.';
