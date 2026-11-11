alter table mia_test.observation_snapshots
  drop constraint observation_snapshots_provenance_epistemics_check;

alter table mia_test.observation_snapshots
  add constraint observation_snapshots_provenance_epistemics_check
  check (
    jsonb_typeof(provenance) = 'object'
    and provenance ? 'world_truth_claim'
    and provenance->>'world_truth_claim' = 'false'
    and provenance->>'live_perception' = 'false'
    and provenance->>'physical_measurement' = 'false'
    and provenance->>'physical_movement' = 'false'
    and provenance->>'cross_scene_travel' = 'false'
  );

comment on constraint observation_snapshots_provenance_epistemics_check on mia_test.observation_snapshots is
  'Observation provenance must explicitly deny unsupported claims of world truth, live perception, physical measurement, physical movement, and cross-scene travel.';
