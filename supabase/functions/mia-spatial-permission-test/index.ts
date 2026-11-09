import postgres from "npm:postgres@3.4.5";

const headers = {
  "Access-Control-Allow-Origin": "https://supabase.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });

async function validProjectSecret(candidate: string | null): Promise<boolean> {
  if (!candidate) return false;
  const configured = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!configured) return false;
  try {
    const values = Object.values(JSON.parse(configured) as Record<string, unknown>)
      .filter((v): v is string => typeof v === "string");
    const digest = async (v: string) =>
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));
    const a = await digest(candidate);
    for (const value of values) {
      const b = await digest(value);
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
      if (diff === 0) return true;
    }
  } catch { return false; }
  return false;
}
const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { ok: false, error: "method_not_allowed" });
  if (!await validProjectSecret(req.headers.get("apikey"))) {
    return reply(401, { ok: false, error: "valid_project_secret_key_required" });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return reply(400, { ok: false, error: "invalid_json" });
  }
  if (body.test_only !== true) return reply(400, { ok: false, error: "test_only_true_required" });
  if (!isUuid(body.request_id) || !isUuid(body.test_run_id)) {
    return reply(400, { ok: false, error: "valid_request_id_and_test_run_id_required" });
  }
  const intent = typeof body.intent === "string" ? body.intent : "observe_spatial";
  const supported = new Set(["observe_spatial", "grant_interact", "interact", "revoke_interact", "travel", "prepare_perception_action", "perception_interact", "revoke_perception_action"]);
  if (!supported.has(intent)) return reply(400, { ok: false, error: "unsupported_test_intent" });
  const destinationId = typeof body.destination_id === "string" ? body.destination_id : "crystal-forest-unknown";
  const observationId = typeof body.observation_id === "string" ? body.observation_id : "";
  if (["prepare_perception_action", "perception_interact", "revoke_perception_action"].includes(intent) && !isUuid(observationId)) {
    return reply(400, { ok: false, error: "valid_observation_id_required" });
  }

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) return reply(503, { ok: false, error: "test_database_connection_unavailable" });
  const sql: any = postgres(dbUrl, { max: 1, idle_timeout: 5, connect_timeout: 8, prepare: false });

  try {
    const result = await sql.begin(async (tx) => {
      const payload = { test_only: "true", intent, source: "mia-spatial-permission-test", destination_id: destinationId };

      if (intent === "prepare_perception_action") {
        const stateRows = await tx`select scene_id from mia_test.world_states where test_run_id=${body.test_run_id}::uuid`;
        if (!stateRows.length) return { ok: false, prepared: false, reason: "world_state_missing" };
        const sceneId = String(stateRows[0].scene_id);
        const observationRows = await tx`
          select po.observation_id
          from mia_test.perception_observations po
          join mia_test.perception_ingress_events pi on pi.ingress_id=po.ingress_id
          join mia_test.perception_source_registry s on s.source_id=pi.source_id
          join mia_test.perception_source_keys k on k.source_id=pi.source_id and k.key_id=pi.key_id
          join mia_test.coordinate_frame_mappings m on m.mapping_id=po.mapping_id
          join mia_test.scene_frames f on f.frame_id=po.mapped_frame_id
          where po.observation_id=${observationId}::uuid
            and po.mapping_status='mapped' and po.world_truth_claim is false
            and po.live_perception is false and po.physical_measurement is false
            and pi.disposition='accepted' and pi.signature_status='verified'
            and pi.freshness_status='fresh' and pi.calibration_evidence_ref is not null
            and pi.replay_of_ingress_id is null and pi.world_truth_claim is false
            and pi.auto_action_authorized is false
            and s.enabled is true and s.revoked_at is null
            and k.enabled is true and k.revoked_at is null
            and k.valid_from <= now() and (k.valid_until is null or k.valid_until > now())
            and m.validation_status='verified' and m.test_only is true
            and f.calibration_status='calibrated' and f.test_only is true
          for share of po,pi,s,k,m,f
        `;
        if (!observationRows.length) return { ok: false, prepared: false, reason: "observation_not_actionable" };
        const grants = await tx`
          select grant_id from mia_test.action_permission_grants
          where test_run_id=${body.test_run_id}::uuid
            and action_scope in ('interact','*') and scene_scope in (${sceneId},'*')
            and revoked_at is null and expires_at > now()
          order by granted_at desc limit 1
        `;
        if (!grants.length) return { ok: false, prepared: false, reason: "executor_permission_missing" };
        const authorizedBy = typeof body.authorized_by === "string" ? body.authorized_by.slice(0,120) : "test_operator";
        const reason = typeof body.reason === "string" ? body.reason.slice(0,500) : "Explicit independent test authorization for this signed observation";
        const prepared = await tx`
          insert into mia_test.action_requests(request_id,test_run_id,payload)
          values (${body.request_id}::uuid,${body.test_run_id}::uuid,${tx.json({ ...payload, intent: "perception_interact", prepared_perception_action: true, observation_id: observationId })})
          on conflict on constraint action_requests_pkey do nothing returning request_id
        `;
        if (!prepared.length) return { ok: true, prepared: false, duplicate: true, reason: "request_id_already_exists" };
        const authorizations = await tx`
          insert into mia_test.perception_action_authorizations
            (observation_id,request_id,action_scope,scene_scope,authorized_by,reason,expires_at,test_only)
          values
            (${observationId}::uuid,${body.request_id}::uuid,'interact',${sceneId},${authorizedBy},${reason},
             now() + interval '5 minutes',true)
          returning authorization_id,observation_id,request_id,action_scope,scene_scope,authorized_by,expires_at
        `;
        return { ok: true, prepared: true, permission: authorizations[0], executor_permission_grant_id: grants[0].grant_id };
      }

      if (intent === "revoke_perception_action") {
        const revoked = await tx`
          update mia_test.perception_action_authorizations
          set revoked_at=now()
          where request_id=${body.request_id}::uuid and observation_id=${observationId}::uuid
            and revoked_at is null
          returning authorization_id,revoked_at
        `;
        return { ok: true, revoked: revoked.length > 0, permission: revoked[0] ?? null };
      }

      let claim: any[];
      if (intent === "perception_interact") {
        const existing = await tx`
          select status,payload from mia_test.action_requests
          where request_id=${body.request_id}::uuid for update
        `;
        if (existing.length) {
          if (existing[0].status !== "claimed" || existing[0].payload?.prepared_perception_action !== true ||
              existing[0].payload?.observation_id !== observationId) {
            return { ok: true, duplicate: true, claimed: false, request_id: body.request_id, existing_status: existing[0].status };
          }
          await tx`
            update mia_test.action_requests
            set payload=payload || ${tx.json({ prepared_perception_action: false, execution_started_at: new Date().toISOString() })}
            where request_id=${body.request_id}::uuid
          `;
          claim = [{ request_id: body.request_id }];
        } else {
          claim = await tx`
            insert into mia_test.action_requests(request_id,test_run_id,payload)
            values (${body.request_id}::uuid,${body.test_run_id}::uuid,${tx.json({ ...payload, observation_id: observationId })})
            on conflict on constraint action_requests_pkey do nothing returning request_id
          `;
        }
      } else {
        claim = await tx`
          insert into mia_test.action_requests(request_id,test_run_id,payload)
          values (${body.request_id}::uuid,${body.test_run_id}::uuid,${tx.json(payload)})
          on conflict on constraint action_requests_pkey do nothing returning request_id
        `;
      }
      if (!claim.length) {
        const old = await tx`select status from mia_test.action_requests where request_id=${body.request_id}::uuid`;
        return { ok: true, duplicate: true, claimed: false, request_id: body.request_id, existing_status: old[0]?.status ?? "unknown" };
      }

      await tx`insert into mia_test.world_states(test_run_id) values (${body.test_run_id}::uuid) on conflict do nothing`;
      const locked = await tx`
        select scene_id, position, environment_state, state_version
        from mia_test.world_states where test_run_id=${body.test_run_id}::uuid for update
      `;
      if (locked.length !== 1) throw new Error("world_state_missing");
      const current = locked[0];
      const sceneId = String(current.scene_id);
      const frameId = String((current.position as Record<string, unknown>).frame ?? "");
      const beforeVersion = Number(current.state_version);
      const beforeState = { scene_id: sceneId, position: current.position, environment_state: current.environment_state };
      let nextEnvironment = current.environment_state as Record<string, unknown>;
      let afterVersion = beforeVersion;
      let outcome: "completed" | "failed" | "blocked" = "completed";
      let action = intent;
      let execution: Record<string, unknown> = {};
      let permission: Record<string, unknown> | null = null;
      let perceptionAuthorization: Record<string, unknown> | null = null;
      let perceptionEvidenceValid = false;
      let spatial: Record<string, unknown> | null = null;

      const frameRows = await tx`
        select frame_id, scene_id, frame_kind, unit_name, calibration_status,
               parent_frame_id, transform_to_parent, transform_evidence
        from mia_test.scene_frames where frame_id=${frameId}
      `;
      const anchorRows = await tx`
        select anchor_id, scene_id, frame_id, anchor_kind, coordinates, verification_status, provenance
        from mia_test.scene_anchors where scene_id = ${sceneId} or anchor_id = ${destinationId}
        order by anchor_id
      `;
      const frame = frameRows[0] ?? null;

      if (intent === "observe_spatial") {
        action = "observe";
        spatial = {
          current_frame: frame,
          anchors: anchorRows,
          position: current.position,
          epistemics: {
            source: "mia_test.scene_frames_and_scene_anchors",
            coordinate_semantics: "test_fixture_only",
            confidence_basis: "database_record_integrity",
            confidence_scope: "database_record_retrieval_only",
            world_truth_claim: false,
            external_sensor_connection: "not_configured",
            frame_calibrated: frame?.calibration_status === "calibrated",
            live_perception: false,
            physical_measurement: false,
            physical_movement: false,
            cross_scene_travel: false,
          },
        };
        execution = { executed: true, read_only: true, execution_layer: "spatial_semantic_test_adapter" };
      } else if (intent === "grant_interact") {
        action = "grant_permission";
        const grants = await tx`
          insert into mia_test.action_permission_grants
            (test_run_id, action_scope, scene_scope, granted_by, reason, expires_at)
          values
            (${body.test_run_id}::uuid, 'interact', ${sceneId}, 'test_runner',
             'Explicit short-lived permission for isolated semantic interaction test',
             now() + interval '15 minutes')
          returning grant_id, action_scope, scene_scope, granted_at, expires_at
        `;
        permission = grants[0];
        execution = { executed: true, permission_granted: true, permission };
      } else if (intent === "interact" || intent === "perception_interact") {
        action = "interact";
        let perceptionGatePassed = intent !== "perception_interact";
        if (intent === "perception_interact") {
          const authorizationRows = await tx`
            select authorization_id,action_scope,scene_scope,expires_at
            from mia_test.perception_action_authorizations
            where request_id=${body.request_id}::uuid and observation_id=${observationId}::uuid
              and action_scope in ('interact','*') and scene_scope in (${sceneId},'*')
              and revoked_at is null and expires_at > now() and test_only is true
            order by authorized_at desc limit 1 for share
          `;
          const evidenceRows = await tx`
            select po.observation_id,po.mapping_status,po.world_truth_claim,po.live_perception,po.physical_measurement,
                   pi.disposition,pi.signature_status,pi.freshness_status,pi.calibration_evidence_ref,
                   pi.replay_of_ingress_id,pi.auto_action_authorized,
                   s.enabled as source_enabled,s.revoked_at as source_revoked,
                   k.enabled as key_enabled,k.revoked_at as key_revoked,k.valid_from,k.valid_until,
                   m.validation_status,f.calibration_status
            from mia_test.perception_observations po
            join mia_test.perception_ingress_events pi on pi.ingress_id=po.ingress_id
            join mia_test.perception_source_registry s on s.source_id=pi.source_id
            join mia_test.perception_source_keys k on k.source_id=pi.source_id and k.key_id=pi.key_id
            join mia_test.coordinate_frame_mappings m on m.mapping_id=po.mapping_id
            join mia_test.scene_frames f on f.frame_id=po.mapped_frame_id
            where po.observation_id=${observationId}::uuid
            for share of po,pi,s,k,m,f
          `;
          const evidence = evidenceRows[0];
          perceptionEvidenceValid = !!evidence && evidence.mapping_status === "mapped" &&
            evidence.world_truth_claim === false && evidence.live_perception === false &&
            evidence.physical_measurement === false && evidence.disposition === "accepted" &&
            evidence.signature_status === "verified" && evidence.freshness_status === "fresh" &&
            !!evidence.calibration_evidence_ref && evidence.replay_of_ingress_id === null &&
            evidence.auto_action_authorized === false && evidence.source_enabled === true &&
            evidence.source_revoked === null && evidence.key_enabled === true && evidence.key_revoked === null &&
            new Date(evidence.valid_from).getTime() <= Date.now() &&
            (!evidence.valid_until || new Date(evidence.valid_until).getTime() > Date.now()) &&
            evidence.validation_status === "verified" && evidence.calibration_status === "calibrated";
          if (authorizationRows.length && perceptionEvidenceValid) {
            perceptionAuthorization = authorizationRows[0];
            perceptionGatePassed = true;
          }
        }
        const grants = await tx`
          select grant_id, action_scope, scene_scope, granted_at, expires_at
          from mia_test.action_permission_grants
          where test_run_id=${body.test_run_id}::uuid
            and action_scope in ('interact','*')
            and scene_scope in (${sceneId}, '*')
            and revoked_at is null and expires_at > now()
          order by granted_at desc limit 1
        `;
        if (!perceptionGatePassed) {
          outcome = "blocked";
          execution = { executed: false, blocked: true, reason: "perception_authorization_or_evidence_denied", perception_evidence_valid: perceptionEvidenceValid };
        } else if (!grants.length) {
          outcome = "blocked";
          execution = { executed: false, blocked: true, reason: "permission_denied_default_deny" };
        } else {
          permission = grants[0];
          const prior = Number(nextEnvironment.interaction_count ?? 0);
          nextEnvironment = {
            ...nextEnvironment,
            interaction_count: prior + 1,
            last_interaction: { request_id: body.request_id, permission_grant_id: grants[0].grant_id,
              perception_authorization_id: perceptionAuthorization && "authorization_id" in perceptionAuthorization ? perceptionAuthorization.authorization_id : null,
              observation_id: intent === "perception_interact" ? observationId : null,
              source: intent === "perception_interact" ? "independently_authorized_perception_test" : "authorized_test_executor" },
          };
          afterVersion += 1;
          await tx`
            update mia_test.world_states
            set environment_state=${tx.json(nextEnvironment)}, state_version=${afterVersion}, updated_at=now()
            where test_run_id=${body.test_run_id}::uuid
          `;
          execution = { executed: true, state_changed: true, permission_grant_id: grants[0].grant_id };
        }
      } else if (intent === "revoke_interact") {
        action = "revoke_permission";
        const revoked = await tx`
          update mia_test.action_permission_grants
          set revoked_at = now()
          where test_run_id = ${body.test_run_id}::uuid
            and action_scope in ('interact','*')
            and scene_scope in (${sceneId}, '*')
            and revoked_at is null and expires_at > now()
          returning grant_id, action_scope, scene_scope, revoked_at
        `;
        if (!revoked.length) {
          outcome = "blocked";
          execution = { executed: false, blocked: true, reason: "no_active_permission_to_revoke" };
        } else {
          permission = revoked[0];
          execution = { executed: true, permission_revoked: true, permission };
        }
      } else if (intent === "travel") {
        action = "travel";
        const target = anchorRows.find((a: Record<string, unknown>) => a.anchor_id === destinationId);
        const unknownAnchor = !target || target.verification_status === "unknown" || target.coordinates === null;
        const uncalibrated = frame?.calibration_status !== "calibrated";
        outcome = "blocked";
        execution = {
          executed: false,
          blocked: true,
          reason: unknownAnchor ? "destination_anchor_unresolved" : uncalibrated ? "coordinate_frame_uncalibrated" : "physical_runtime_not_integrated",
          destination_id: destinationId,
          destination_coordinates: target?.coordinates ?? null,
          frame_calibration_status: frame?.calibration_status ?? "missing",
          physical_movement: false,
          cross_scene_travel: false,
        };
      }

      const afterState = { scene_id: sceneId, position: current.position, environment_state: nextEnvironment };
      const eventRows = await tx`
        insert into mia_test.world_action_events
          (test_run_id,request_id,action,outcome,before_version,after_version,before_state,after_state,evidence,test_only)
        values
          (${body.test_run_id}::uuid,${body.request_id}::uuid,${action},${outcome},
           ${beforeVersion},${afterVersion},${tx.json(beforeState)},${tx.json(afterState)},
           ${tx.json({
             intent, state_changed: afterVersion !== beforeVersion,
             permission_required: intent === "interact",
             permission_grant_id: permission && "grant_id" in permission ? permission.grant_id : null,
             perception_authorization_id: perceptionAuthorization && "authorization_id" in perceptionAuthorization ? perceptionAuthorization.authorization_id : null,
             perception_observation_id: intent === "perception_interact" ? observationId : null,
             perception_evidence_valid: perceptionEvidenceValid,
             live_perception: false, physical_movement: false, cross_scene_travel: false,
             spatial_fixture_only: true,
           })},true)
        returning event_id
      `;
      const receipt = {
        test_only: "true", intent, action, outcome, execution, permission,
        perception_authorization: perceptionAuthorization,
        perception_observation_id: intent === "perception_interact" ? observationId : null,
        perception_evidence_valid: perceptionEvidenceValid,
        spatial, live_perception: false, physical_movement: false, cross_scene_travel: false,
      };
      await tx`
        update mia_test.action_requests set status=${outcome}, completed_at=now()
        where request_id=${body.request_id}::uuid and status='claimed'
      `;
      const receipts = await tx`
        insert into mia_test.execution_receipts(request_id,sequence_no,outcome,receipt)
        values (${body.request_id}::uuid,1,${outcome},${tx.json(receipt)})
        returning id,sequence_no
      `;
      const observationProvenance = {
        source_kind: "headless_semantic_state",
        origin_table: "mia_test.world_states",
        origin_frame_table: "mia_test.scene_frames",
        origin_anchor_table: "mia_test.scene_anchors",
        acquisition: "server_side_database_read",
        confidence_basis: "database_record_integrity",
        world_truth_claim: false,
        live_perception: false,
        physical_measurement: false,
        physical_movement: false,
        cross_scene_travel: false,
        external_sensor_connection: "not_configured",
        test_only: true,
      };
      const observed = {
        scene_id: sceneId, position: current.position, environment_state: nextEnvironment,
        state_version: afterVersion, action, outcome, spatial,
        epistemics: {
          source_kind: "headless_semantic_state",
          confidence_basis: "database_record_integrity",
          confidence_scope: "database_record_retrieval_only",
          world_truth_claim: false,
          external_sensor_connection: "not_configured",
          live_perception: false,
          physical_measurement: false,
          physical_movement: false,
          cross_scene_travel: false,
        },
      };
      const snapshotRows = await tx`
        insert into mia_test.observation_snapshots
          (test_run_id,source_kind,source_ref,observed_state,confidence,confidence_basis,provenance,
           live_perception,physical_movement,cross_scene_travel,read_only,test_only)
        values
          (${body.test_run_id}::uuid,'headless_semantic_state',
           ${"test://" + body.test_run_id + "/" + body.request_id},
           ${tx.json(observed)},1.0,'database_record_integrity',${tx.json(observationProvenance)},
           false,false,false,true,true)
        returning id
      `;
      const observationSnapshotId = snapshotRows[0].id;
      return {
        ok: true, claimed: true, duplicate: false, request_id: body.request_id,
        intent, outcome, execution, permission, spatial,
        world_state: { before_version: beforeVersion, after_version: afterVersion, state_changed: afterVersion !== beforeVersion, event_id: eventRows[0].event_id, state: afterState },
        receipt: { finalized: true, status: outcome, receipt_id: receipts[0].id, sequence_no: receipts[0].sequence_no },
        observation_snapshot_id: observationSnapshotId,
        epistemics: {
          source: "mia_test",
          confidence_basis: "database_record_integrity",
          confidence_scope: "database_record_retrieval_only",
          world_truth_claim: false,
          external_sensor_connection: "not_configured",
          live_perception: false, physical_measurement: false, physical_movement: false, cross_scene_travel: false
        },
      };
    });
    return reply(200, result);
  } catch (error) {
    console.error("mia_spatial_permission_test_failed", error);
    return reply(500, { ok: false, error: "test_pipeline_failed" });
  } finally {
    await sql.end({ timeout: 2 });
  }
});
