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

function decodeB64Url(input: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(input)) throw new Error("invalid_base64url");
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - input.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
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
  if (!sourceId || !keyId || !eventId || !observedAt || nonce.length < 16 ||
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
      select public_key_jwk, enabled, valid_from, valid_until, revoked_at
      from mia_test.perception_source_registry
      where source_id = ${sourceId} and key_id = ${keyId}
    `;
    if (!sourceRows.length) return reply(401, { ok: false, error: "unknown_source_key" });
    const source = sourceRows[0];
    const now = Date.now();
    if (!source.enabled || source.revoked_at ||
        new Date(source.valid_from).getTime() > now ||
        (source.valid_until && new Date(source.valid_until).getTime() <= now)) {
      return reply(401, { ok: false, error: "source_key_inactive" });
    }

    let rawPayload: Uint8Array;
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
      const key = await crypto.subtle.importKey(
        "jwk", source.public_key_jwk,
        { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"],
      );
      signatureValid = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" }, key, decodeB64Url(signatureB64), encoder.encode(envelope),
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
    } catch { /* raw bytes remain retained; malformed JSON is rejected */ }

    const stale = Math.abs(now - observedMs) > 120_000;
    const rejection = !signatureValid ? "signature_invalid"
      : !payloadValid ? "payload_not_json_object_or_array"
      : stale ? "observation_timestamp_outside_120s_window" : null;
    const inserted = await sql.begin(async (tx) => {
      const rows = await tx`
        insert into mia_test.perception_ingress_events
          (source_id,key_id,source_event_id,observed_at,nonce,payload_sha256,
           signature_b64url,raw_payload,payload,verification_status,rejection_reason,test_only)
        values
          (${sourceId},${keyId},${eventId},${new Date(observedMs)},
           ${nonce},${payloadHash},${signatureB64},${rawPayload},
           ${tx.json(payload)},${rejection ? "rejected" : "verified"},${rejection},true)
        returning ingress_id, verification_status, rejection_reason
      `;
      if (rejection) return { ingress: rows[0], observation: null, mapping: "not_attempted" };

      const p = payload as Record<string, unknown>;
      const frameId = typeof p.frame_id === "string" ? p.frame_id : "";
      const coords = p.coordinates as Record<string, unknown> | undefined;
      const x = coords?.x;
      const y = coords?.y;
      if (!frameId || typeof x !== "number" || !Number.isFinite(x) ||
          typeof y !== "number" || !Number.isFinite(y)) {
        return { ingress: rows[0], observation: null, mapping: "rejected_missing_frame_or_coordinates" };
      }

      const mappings = await tx`
        select m.mapping_id,m.target_frame_id,m.transform_2d,f.calibration_status
        from mia_test.coordinate_frame_mappings m
        join mia_test.scene_frames f on f.frame_id=m.target_frame_id
        where m.source_id=${sourceId} and m.source_frame_id=${frameId}
          and m.validation_status='verified'
          and f.calibration_status='calibrated'
        order by m.verified_at desc limit 1
      `;
      let mappingStatus = "unmapped";
      let mappingId: string | null = null;
      let mappedFrame: string | null = null;
      let mappedCoords: { x: number; y: number } | null = null;
      if (mappings.length) {
        const point = mapPoint(mappings[0].transform_2d, x, y);
        if (point) {
          mappingStatus = "mapped";
          mappingId = mappings[0].mapping_id;
          mappedFrame = mappings[0].target_frame_id;
          mappedCoords = point;
        } else {
          mappingStatus = "rejected";
        }
      }
      const observations = await tx`
        insert into mia_test.perception_observations
          (ingress_id,source_frame_id,source_coordinates,mapping_id,mapped_frame_id,
           mapped_coordinates,mapping_status,observed_at,normalized_payload,
           confidence_basis,world_truth_claim,live_perception,physical_measurement,test_only)
        values
          (${rows[0].ingress_id},${frameId},${tx.json({x,y})},
           ${mappingId},${mappedFrame},${mappedCoords ? tx.json(mappedCoords) : null},
           ${mappingStatus},${new Date(observedMs)},${tx.json(p)},
           'cryptographic_integrity',false,false,false,true)
        returning observation_id,mapping_status,mapped_frame_id,mapped_coordinates
      `;
      return { ingress: rows[0], observation: observations[0], mapping: mappingStatus };
    });
    return reply(rejection ? 422 : 200, {
      ok: !rejection,
      test_only: true,
      ingress: inserted.ingress,
      observation: inserted.observation,
      mapping: inserted.mapping,
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
      return reply(409, { ok: false, error: "replay_or_duplicate_event" });
    }
    console.error("mia_perception_ingress_test_failed", error);
    return reply(500, { ok: false, error: "perception_ingress_failed" });
  } finally {
    await sql.end({ timeout: 2 });
  }
});
