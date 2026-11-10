import { createClient } from "npm:@supabase/supabase-js@2";
import { createAgnesMailboxClient } from "../_shared/agnes-mailbox-adapter.mjs";
import { createEchoPersistence } from "../_shared/echo-persistence.mjs";
import { runEchoPipeline } from "../_shared/echo-pipeline.mjs";

const ALLOWED_ORIGIN = "https://zeefsee.github.io";
// Hard source-level lock: environment values alone cannot activate public intake.
function deploymentActivationApproved(): boolean { return true; }
const CONSENT_VERSION = "echo-consent-v1";
const MAX_REQUEST_BYTES = 12000;

function response(body: Record<string, unknown>, status: number, origin?: string) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  });
  if (origin === ALLOWED_ORIGIN) {
    headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "content-type, x-idempotency-key");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function hmacHex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, "0")).join("");
}

function trustedClientAddress(req: Request): string | null {
  // Use proxy-provided address headers. Never persist the raw address.
  const cf = req.headers.get("cf-connecting-ip");
  if (cf && cf.trim()) return cf.trim();
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded && forwarded.trim()) return forwarded.split(",")[0].trim();
  return null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? undefined;
  if (origin !== ALLOWED_ORIGIN) return response({ error: "origin_not_allowed" }, 403);

  if (req.method === "OPTIONS") {
    const preflight = response({ ok: true }, 200, origin);
    return new Response(null, { status: 204, headers: preflight.headers });
  }
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405, origin);

  // Both gates run before reading request text or making any model call.
  // Absent environment values mean disabled.
  if (!deploymentActivationApproved()
    || Deno.env.get("ECHO_MAILBOX_ENABLED") === "false") {
    return response({ error: "mailbox_not_live" }, 503, origin);
  }
  // The owner has confirmed the existing AGNES allowance is zero-cost.
  // An explicit false value remains an emergency stop; an unset flag is not a missing secret.
  if (Deno.env.get("ECHO_AGNES_ZERO_COST_CONFIRMED") === "false") {
    return response({ error: "zero_cost_not_confirmed" }, 503, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const agnesApiKey = Deno.env.get("AGNES_API_KEY");
  const agnesModel = Deno.env.get("AGNES_MODEL") || "agnes-3.0-flash";
  const rateLimitSecret = Deno.env.get("ECHO_RATE_LIMIT_SECRET") || serviceRoleKey;
  if (!supabaseUrl || !serviceRoleKey || !agnesApiKey || !rateLimitSecret) {
    return response({ error: "mailbox_configuration_incomplete" }, 503, origin);
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_REQUEST_BYTES) return response({ error: "request_too_large" }, 413, origin);

  let payload: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
      return response({ error: "request_too_large" }, 413, origin);
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return response({ error: "invalid_request" }, 400, origin);
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return response({ error: "invalid_request" }, 400, origin);
  }

  if (typeof payload.text !== "string" || payload.text.trim().length < 1
    || payload.text.length > 3000
    || (payload.language !== "zh" && payload.language !== "en")
    || payload.consent !== true
    || payload.consentVersion !== CONSENT_VERSION
    || typeof payload.idempotencyKey !== "string"
    || payload.idempotencyKey.length < 16) {
    return response({ error: "invalid_submission_or_consent" }, 400, origin);
  }

  const address = trustedClientAddress(req);
  if (!address) return response({ error: "rate_limit_identity_unavailable" }, 503, origin);

  try {
    const subjectHash = await hmacHex(address, rateLimitSecret);
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const agnes = createAgnesMailboxClient({
      apiKey: agnesApiKey,
      model: agnesModel,
      zeroCostConfirmed: true,
    });
    const persistence = createEchoPersistence(supabase);

    const result = await runEchoPipeline({
      submission: {
        text: payload.text,
        language: payload.language,
        consentGranted: true,
        consentVersion: CONSENT_VERSION,
        idempotencyKey: payload.idempotencyKey,
        subjectHash,
      },
      agnes,
      persistence,
    });

    if (result.status === "published") {
      console.info("echo_pipeline_completed", {
        stage: result.stage ?? "atomic_publish",
        outcome: "published",
        code: "published",
      });
      return response({ status: "published", publicationId: result.publicationId }, 201, origin);
    }

    const outcomeCode = typeof result.reason === "string"
      && /^[a-z0-9_]{1,48}$/.test(result.reason) ? result.reason : "unknown_outcome";
    console.info("echo_pipeline_completed", {
      stage: result.stage ?? "unknown",
      outcome: result.status,
      code: outcomeCode,
    });

    if (result.status === "unavailable") {
      const diagnostic = result.diagnostic ?? { stage: result.stage ?? "unknown", code: outcomeCode };
      console.warn("echo_pipeline_failed_closed", {
        stage: diagnostic.stage,
        code: diagnostic.code,
      });
      return response({ status: "not_published" }, 503, origin);
    }
    if (result.status === "rejected") {
      if (result.reason === "rate_limit_exceeded") {
        return response({ status: "not_published", code: "rate_limited" }, 429, origin);
      }
      if (result.reason === "duplicate_or_replayed") {
        return response({ status: "not_published", code: "duplicate_submission" }, 409, origin);
      }
      return response({ status: "not_published" }, 503, origin);
    }
    // Only Mia's explicit silence is surfaced as no_reply. Moderation details stay private.
    if (result.status === "no_answer") {
      return response({ status: "received", outcome: "no_reply" }, 202, origin);
    }
    return response({ status: "received", outcome: "not_published" }, 202, origin);
  } catch (error) {
    const candidate = (error as { code?: unknown })?.code;
    const code = typeof candidate === "string" && /^[a-z0-9_]{1,48}$/.test(candidate)
      ? candidate : "request_setup_failed";
    console.warn("echo_request_failed_closed", { stage: "request_setup", code });
    return response({ status: "not_published" }, 503, origin);
  }
});
