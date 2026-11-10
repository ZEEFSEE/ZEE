import { createClient } from "npm:@supabase/supabase-js@2";
import { createAgnesMailboxClient } from "../_shared/agnes-mailbox-adapter.mjs";
import { createEchoPersistence } from "../_shared/echo-persistence.mjs";
import { runEchoPipeline } from "../_shared/echo-pipeline.mjs";

const ALLOWED_ORIGIN = "https://zeefsee.github.io";
// Hard source-level lock: environment values alone cannot activate public intake.
const DEPLOYMENT_ACTIVATION_APPROVED = false;
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

  if (req.method === "OPTIONS") return response({ ok: true }, 204, origin);
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405, origin);

  // Both gates run before reading request text or making any model call.
  // Absent environment values mean disabled.
  if (DEPLOYMENT_ACTIVATION_APPROVED !== true
    || Deno.env.get("ECHO_MAILBOX_ENABLED") !== "true") {
    return response({ error: "mailbox_not_live" }, 503, origin);
  }
  if (Deno.env.get("ECHO_AGNES_ZERO_COST_CONFIRMED") !== "true") {
    return response({ error: "zero_cost_not_confirmed" }, 503, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const agnesApiKey = Deno.env.get("AGNES_API_KEY");
  const agnesModel = Deno.env.get("AGNES_MODEL");
  const rateLimitSecret = Deno.env.get("ECHO_RATE_LIMIT_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !agnesApiKey || !agnesModel || !rateLimitSecret) {
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
      return response({ status: "published", publicationId: result.publicationId }, 201, origin);
    }
    if (result.status === "unavailable") {
      return response({ status: "not_published" }, 503, origin);
    }
    // Do not disclose moderation decisions or echo submitted content to the caller.
    return response({ status: "received" }, 202, origin);
  } catch {
    return response({ status: "not_published" }, 503, origin);
  }
});
