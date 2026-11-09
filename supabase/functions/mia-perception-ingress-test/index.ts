import postgres from "npm:postgres@3.4.5";

const headers = {
  "Access-Control-Allow-Origin": "https://supabase.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });
const encoder = new TextEncoder();
const ed25519 = { name: "Ed25519" } as AlgorithmIdentifier;

function decodeB64Url(input: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(input)) throw new Error("invalid_base64url");
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - input.length % 4) % 4);
  const binary = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function isUuid(v: unknown): v is string {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
function mapPoint(matrix: unknown, x: number, y: number): { x: number; y: number } | null {
  if (!Array.isArray(matrix) || matrix.length !== 3 ||
      !matrix.every((row) => Array.isArray(row) && row.length === 3 &&
        row.every((v) => typeof v === "number" && Number.isFinite(v)))) return null;
  const m = matrix as number[][];
  if (Math.abs(m[2][0]) > 1e-9 || Math.abs(m[2][1]) > 1e-9 ||
      Math.abs(m[2][2] - 1) > 1e-9) return null;
  return {
    x: m[0][0] * x + m[0][1] * y + m[0][2],
    y: m[1][0] * x + m[1][1] * y + m[1][2],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { ok: false, error: "method_not_allowed" });

  const projectSecret = Deno.env.get("SUPABASE_SECRET_KEYS");
  const legacySecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apikey = req.headers.get("apikey");
  let authorized = false;
  if (apikey && projectSecret) {
    try {
      const keys = Object.values(JSON.parse(projectSecret) as Record<string, unknown>)
        .filter((v): v is string => typeof v === "string");
      authorized = keys.some((v) => v === apikey);
    } catch { authorized = false; }
  }
  if (!authorized && apikey && legacySecret) authorized = apikey === legacySecret;
  if (!authorized) return reply(401, { ok: false, error: "test_project_secret_required" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return reply(400, { ok: false, error: "invalid_json" });
  }
  if (body.test_only !== true) return reply(400, { ok: false, error: "test_only_true_required" });

  const sourceId = typeof body.source_id === "string" ? body.source_id : "";
  const keyId = typeof body.key_id === "string" ? body.key_id : "";
  const eventId = typeof body.event_id === "string" ? body.event_id : "";
  const observedAt = typeof body.observed_at === "string" ? body.observed_at : "";
  const nonce = typeof body.nonce === "string" ? body.nonce : "";
  const payloadB64 = typeof body.payload_b64url === "string" ? body.payload_b64url : "";
  const signatureB64 = typeof body.signature_b64url === "string" ? body.signature_b64url : "";
  if (!isUuid(sourceId) || !keyId || !eventId || !observedAt || nonce.length < 16 ||
      !payloadB64 || !signatureB64) {
    return reply(400, { ok: false, error: "signed_envelope_fields_required" });
  }
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs)) return reply(400, { ok: false, error: "invalid_observed_at" });

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) return reply(503, { ok: false, error: "test_database_unavailable" });
  const sql = postgres(dbUrl, { max: 1, idle_timeout: 5, connect_timeout: 8, prepare: false });

  try {
    const sourceRows = await sql`
      select source_id, enabled, revoked_at, max_age_seconds, max_clock_skew_seconds, allowed_frame_ids
      from mia_test.perception_source_registry
      where source_id = ${sourceId}::uuid and auth_scheme = 'ed25519' and test_only is true
    `;
    if (!sourceRows.length) return reply(401, { ok: false, error: "unknown_source" });
    const source = sourceRows[0];
    if (!source.enabled || source.revoked_at) return reply(401, { ok: false, error: "source_inactive" });
    const keyRows = await sql`
      select public_key_b64url, enabled, valid_from, valid_until, revoked_at
      from mia_test.perception_source_keys
      where source_id = ${sourceId}::uuid and key_id = ${keyId} and algorithm = 'ed25519'
    `;
    if (!keyRows.length) return reply(401, { ok: false, error: "unknown_source_key" });
    const sourceKey = keyRows[0];
    const now = Date.now();
    if (!sourceKey.enabled || sourceKey.revoked_at ||
        new Date(sourceKey.valid_from).getTime() > now ||
        (sourceKey.valid_until && new Date(sourceKey.valid_until).getTime() <= now)) {
      return reply(401, { ok: false, error: "source_key_inactive" });
    }

    let rawPayload: Uint8Array<ArrayBuffer>;
    try { rawPayload = decodeB64Url(payloadB64); } catch {
      return reply(400, { ok: false, error: "invalid_payload_encoding" });
    }
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", rawPayload));
    const payloadHash = toHex(digest);
    const envelope = [
      "ZHI-MIA-PERCEPTION-V1", sourceId, keyId, eventId, observedAt, nonce, payloadHash,
    ].join("\n");
    let signatureValid = false;
    try {
      const publicKey = await crypto.subtle.importKey(
        "raw", decodeB64Url(sourceKey.public_key_b64url),
        ed25519, false, ["verify"],
      );
      signatureValid = await crypto.subtle.verify(
        ed25519, publicKey, decodeB64Url(signatureB64), encoder.encode(envelope),
      );
    } catch { signatureValid = false; }

    let payload: Record<string, unknown> | unknown[] = { unparsed_payload: true };
    let payloadValid = false;
    try {
      const parsed = JSON.parse(new TextDecoder().decode(rawPayload));
      if (parsed && typeof parsed === "object") {
        payload = parsed as Record<string, unknown> | unknown[];
        payloadValid = true;
      }
    } catch { /* exact raw bytes remain retained */ }

    const skewMs = source.max_clock_skew_seconds * 1000;
    const ageMs = source.max_age_seconds * 1000;
    const freshness = observedMs > now + skewMs ? "clock_skew"
      : observedMs < now - ageMs ? "stale" : "fresh";
    const signatureStatus = signatureValid ? "verified" : "invalid";
    const p = payload as Record<string, unknown>;
    const frameId = typeof p.frame_id === "string" ? p.frame_id : "";
    const coords = p.coordinates as Record<string, unknown> | undefined;
    const x = coords?.x;
    const y = coords?.y;
    const frameAllowed = !!frameId && source.allowed_frame_ids.includes(frameId);
    const coordinatesValid = typeof x === "number" && Number.isFinite(x) &&
      typeof y === "number" && Number.isFinite(y);

    const result = await sql.begin(async (tx: any) => {
      await tx`select pg_advisory_xact_lock(hashtext(${sourceId + ":" + nonce}))`;
      const prior = await tx`
        select ingress_id from mia_test.perception_ingress_events
        where source_id=${sourceId}::uuid and nonce=${nonce}
        order by received_at asc limit 1
      `;
      const replayOf = prior[0]?.ingress_id ?? null;

      let mapping: any = null;
      let mapped: { x: number; y: number } | null = null;
      if (!replayOf && signatureValid && freshness === "fresh" && payloadValid &&
          frameAllowed && coordinatesValid) {
        const mappingRows = await tx`
          select m.mapping_id,m.target_frame_id,m.transform_2d,m.evidence_ref
          from mia_test.coordinate_frame_mappings m
          join mia_test.scene_frames f on f.frame_id=m.target_frame_id
          where m.source_id=${sourceId} and m.source_frame_id=${frameId}
            and m.validation_status='verified' and f.calibration_status='calibrated'
          order by m.verified_at desc limit 1
        `;
        if (mappingRows.length) {
          const point = mapPoint(mappingRows[0].transform_2d, x as number, y as number);
          if (point) { mapping = mappingRows[0]; mapped = point; }
        }
      }

      const replay = replayOf !== null;
      const reason = replay ? "nonce_replay"
        : !signatureValid ? "signature_invalid"
        : !payloadValid ? "payload_not_json_object_or_array"
        : freshness !== "fresh" ? freshness
        : !frameAllowed ? "source_frame_not_allowlisted"
        : !coordinatesValid ? "coordinates_invalid"
        : !mapping ? "verified_calibrated_frame_mapping_missing"
        : null;
      const disposition = replay ? "replay"
        : reason ? (freshness === "stale" ? "stale" : "rejected") : "accepted";
      const normalized = payloadValid ? {
        frame_id: frameId,
        source_coordinates: { x, y },
        mapped_frame_id: mapping?.target_frame_id ?? null,
        mapped_coordinates: mapped,
        payload: p,
      } : null;

      const ingressRows = await tx`
        insert into mia_test.perception_ingress_events
          (source_id,key_id,source_event_id,nonce,observed_at,payload_sha256,signature,
           signature_status,freshness_status,frame_id,calibration_evidence_ref,raw_payload,
           raw_payload_bytes,normalized_observation,disposition,decision_reason,
           replay_of_ingress_id,world_truth_claim,auto_action_authorized,test_only)
        values
          (${sourceId}::uuid,${keyId},${eventId},${nonce},${new Date(observedMs)},
           ${payloadHash},${signatureB64},${signatureStatus},${freshness},${frameId || "unknown"},
           ${mapping?.evidence_ref ?? null},${tx.json(payload as any)},${rawPayload},
           ${normalized ? tx.json(normalized as any) : null},${disposition},${reason},
           ${replayOf},false,false,true)
        returning ingress_id,signature_status,freshness_status,disposition,decision_reason
      `;

      let observation: any = null;
      if (!replay && signatureValid && freshness === "fresh" && payloadValid &&
          frameId && coordinatesValid) {
        const obsRows = await tx`
          insert into mia_test.perception_observations
            (ingress_id,source_frame_id,source_coordinates,mapping_id,mapped_frame_id,
             mapped_coordinates,mapping_status,observed_at,normalized_payload,
             confidence_basis,world_truth_claim,live_perception,physical_measurement,test_only)
          values
            (${ingressRows[0].ingress_id},${frameId},${tx.json({x,y} as any)},
             ${mapping?.mapping_id ?? null},${mapping?.target_frame_id ?? null},
             ${mapped ? tx.json(mapped as any) : null},${mapping ? "mapped" : "unmapped"},
             ${new Date(observedMs)},${tx.json(p as any)},'cryptographic_integrity',
             false,false,false,true)
          returning observation_id,mapping_status,mapped_frame_id,mapped_coordinates
        `;
        observation = obsRows[0];
      }
      return { ingress: ingressRows[0], observation, mapping_status: mapping ? "mapped" : "unmapped" };
    });

    return reply(result.ingress.disposition === "accepted" ? 200 : 422, {
      ok: result.ingress.disposition === "accepted",
      test_only: true,
      ingress: result.ingress,
      observation: result.observation,
      mapping_status: result.mapping_status,
      evidence_semantics: {
        signature_authenticates_source_and_envelope_only: true,
        payload_integrity_checked: true,
        world_truth_claim: false,
        physical_measurement: false,
        live_perception: false,
        action_authorized: false,
        action_executor_called: false,
      },
    });
  } catch (error) {
    const message = String(error);
    if (message.includes("unique") || message.includes("duplicate")) {
      return reply(409, { ok: false, error: "duplicate_source_event_id" });
    }
    console.error("mia_perception_ingress_test_failed", error);
    return reply(500, { ok: false, error: "perception_ingress_failed" });
  } finally {
    await sql.end({ timeout: 2 });
  }
});
