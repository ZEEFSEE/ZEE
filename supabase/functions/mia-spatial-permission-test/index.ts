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
  const supported = new Set(["observe_spatial", "grant_interact", "interact", "revoke_interact", "travel"]);
  if (!supported.has(intent)) return reply(400, { ok: false, error: "unsupported_test_intent" });
  const destinationId = typeof body.destination_id === "string" ? body.destination_id : "crystal-forest-unknown";

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) return reply(503, { ok: false, error: "test_database_connection_unavailable" });
  const sql = postgres(dbUrl, { max: 1, idle_timeout: 5, connect_timeout: 8, prepare: false });

  try {
    const result = await sql.begin(async (tx) => {
      const payload = { test_only: "true", intent, source: "mia-spatial-permission-test", destination_id: destinationId };
      const claim = await tx`
        insert into mia_test.action_requests(request_id,test_run_id,payload)
        values (${body.request_id}::uuid,${body.test_run_id}::uuid,${tx.json(payload)})
        on conflict on constraint action_requests_pkey do nothing
        returning request_id
      `;
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
      } else if (intent === "interact") {
        action = "interact";
        const grants = await tx`
          select grant_id, action_scope, scene_scope, granted_at, expires_at
          from mia_test.action_permission_grants
          where test_run_id=${body.test_run_id}::uuid
            and action_scope in ('interact','*')
            and scene_scope in (${sceneId}, '*')
            and revoked_at is null and expires_at > now()
          order by granted_at desc limit 1
        `;
        if (!grants.length) {
          outcome = "blocked";
          execution = { executed: false, blocked: true, reason: "permission_denied_default_deny" };
        } else {
          permission = grants[0];
          const prior = Number(nextEnvironment.interaction_count ?? 0);
          nextEnvironment = {
            ...nextEnvironment,
            interaction_count: prior + 1,
            last_interaction: { request_id: body.request_id, permission_grant_id: grants[0].grant_id, source: "authorized_test_executor" },
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
             live_perception: false, physical_movement: false, cross_scene_travel: false,
             spatial_fixture_only: true,
           })},true)
        returning event_id
      `;
      const receipt = {
        test_only: "true", intent, action, outcome, execution, permission,
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
      const observed = {
        scene_id: sceneId, position: current.position, environment_state: nextEnvironment,
        state_version: afterVersion, action, outcome, spatial, provenance: "mia_test",
      };
      await tx`
        insert into mia_test.observation_snapshots
          (test_run_id,source_kind,source_ref,observed_state,confidence,live_perception,physical_movement,cross_scene_travel,read_only,test_only)
        values
          (${body.test_run_id}::uuid,'headless_semantic_state',
           ${"test://" + body.test_run_id + "/" + body.request_id},
           ${tx.json(observed)},0.99,false,false,false,true,true)
      `;
      return {
        ok: true, claimed: true, duplicate: false, request_id: body.request_id,
        intent, outcome, execution, permission, spatial,
        world_state: { before_version: beforeVersion, after_version: afterVersion, state_changed: afterVersion !== beforeVersion, event_id: eventRows[0].event_id, state: afterState },
        receipt: { finalized: true, status: outcome, receipt_id: receipts[0].id, sequence_no: receipts[0].sequence_no },
        epistemics: { source: "mia_test", live_perception: false, physical_measurement: false, physical_movement: false, cross_scene_travel: false },
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
