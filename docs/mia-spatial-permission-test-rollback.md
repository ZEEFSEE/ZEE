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
drop function if exists mia_test.guard_perception_ingress_acceptance();
commit;
```

The ingress tables are independent of the spatial/permission runtime. Dropping them does not remove spatial fixtures or action-loop evidence. No external source was registered or enabled by the initial migration.


## Roll back the cryptographic perception and action-authorization extension

The following additions are confined to `zee-prediction`. The original perception tables predated this extension; do **not** drop those tables as part of a routine rollback.

1. Stop CI and all callers from sending requests to both:
   - `mia-perception-ingress-test`
   - `mia-spatial-permission-test`
2. Disable `mia-perception-ingress-test`. If reverting only the new action-gate behavior while retaining the spatial test layer, redeploy the previously reviewed spatial executor version V6 before removing any newer function dependencies. V8 adds the `prepare_perception_action`, `perception_interact`, and `revoke_perception_action` intents.
3. Confirm all CI source registrations and keys are disabled/revoked, and all test grants/authorizations are revoked:

```sql
select count(*) as active_ci_sources
from mia_test.perception_source_registry
where source_key like 'ci-perception-%' and enabled;

select count(*) as active_ci_keys
from mia_test.perception_source_keys
where key_id like 'ci-%' and enabled;

select count(*) as active_ci_authorizations
from mia_test.perception_action_authorizations
where revoked_at is null
  and observation_id in (
    select po.observation_id
    from mia_test.perception_observations po
    join mia_test.perception_ingress_events pi on pi.ingress_id=po.ingress_id
    join mia_test.perception_source_registry s on s.source_id=pi.source_id
    where s.source_key like 'ci-perception-%'
  );
```

4. If removing only the CI fixtures and preserving the audit evidence, leave the revoked source/key rows, ingress events, observations, action requests, receipts, and world-action events in place. They are inert test evidence.
5. If a destructive reset of this test extension is explicitly intended, first export the relevant `mia_test` evidence tables. Then, in dependency order, remove only rows created by the `ci-perception-%` fixtures from `perception_action_authorizations`, `perception_observations`, `coordinate_frame_mappings`, `perception_ingress_events`, and `perception_source_registry`; remove the CI test-run grants from `action_permission_grants`; then drop the newly added `perception_source_keys` table and the ingress additions `perception_ingress_events.key_id`, `perception_ingress_events.raw_payload_bytes`, and the `(source_id, source_event_id)` unique index. Remove the synthetic `ci-fixture-calibrated-frame` row only after its CI mappings are removed. Do not drop the pre-existing `perception_source_registry`, `perception_ingress_events`, `perception_observations`, `subject_inferences`, `perception_action_authorizations`, or `coordinate_frame_mappings` tables.
6. The earlier spatial rollback section may then be used to remove only the newly introduced `action_permission_grants`, `scene_anchors`, and `scene_frames` tables, after verifying no retained test evidence has foreign-key dependencies on them.

No rollback step targets `public`, the production `zee-extension` project, AGNES, Mia chat, personality, memories, relationships, or AURORA.
