# MIA spatial and permission test rollback

Scope: the isolated `zee-prediction` project only. This rollback does not touch production `zee-extension`, public chat tables, AGNES, Mia chat, personality, memories, or relationship data.

## Stop the test endpoint first

Stop sending requests to:

`mia-spatial-permission-test`

Then remove/disable the Edge Function `mia-spatial-permission-test` from the `zee-prediction` project in Supabase Dashboard. Do not remove `mia-semantic-evidence-test`; it belongs to the earlier independent test harness.

## Remove only the spatial/permission additions

Run in the `zee-prediction` SQL editor:

```sql
begin;

drop table if exists mia_test.action_permission_grants;
drop table if exists mia_test.scene_anchors;
drop table if exists mia_test.scene_frames;

commit;
```

This leaves the original `mia_test.action_requests`, `execution_receipts`, `observation_snapshots`, `world_states`, and `world_action_events` tables intact.

## Verify rollback

```sql
select table_name
from information_schema.tables
where table_schema = 'mia_test'
order by table_name;
```

Expected remaining tables are the five pre-existing action-loop tables listed above. No statements in this rollback target the `public` schema or the production project.

## Roll back only the observation provenance enhancement

If keeping the spatial/permission tables but reverting the observation provenance change:

1. First redeploy the prior reviewed `mia-spatial-permission-test` function version that does not write `confidence_basis` and `provenance` (V3 or earlier).
2. Then run in `zee-prediction` SQL editor:

```sql
begin;
alter table mia_test.observation_snapshots
  drop constraint if exists observation_snapshots_provenance_epistemics_check,
  drop constraint if exists observation_snapshots_confidence_basis_check;
alter table mia_test.observation_snapshots
  drop column if exists provenance,
  drop column if exists confidence_basis;
commit;
```

Do not drop these columns while function V4+ is serving requests. The full spatial-layer rollback below removes the spatial tables and is separate from this narrower rollback.

## Re-enable

Re-deploy the exact reviewed migration and Edge Function version from this branch/PR, then rerun the isolated HTTP workflow. Do not infer successful restoration from the SQL rollback alone.

## Roll back the external perception ingress contract

This section is optional and applies only if the perception ingress migration has been applied in `zee-prediction`.

```sql
begin;
drop table if exists mia_test.perception_ingress_events;
drop table if exists mia_test.perception_source_registry;
commit;
```

The ingress tables are independent of the spatial/permission runtime. Dropping them does not remove spatial fixtures or action-loop evidence. No external source was registered or enabled by the initial migration.
