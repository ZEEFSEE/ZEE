// Echo Mailbox submission intake — scaffold, not deployed.
// This endpoint only validates and queues a submission. It does NOT call AGNES
// and does NOT publish anything until the AGNES adapter and review workflow
// are configured and separately tested.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://zeefsee.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function detectLanguage(text: string): "zh" | "en" | "other" {
  if (/[\u3400-\u9fff]/.test(text)) return "zh";
  if (/[A-Za-z]/.test(text)) return "en";
  return "other";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const origin = req.headers.get("origin");
  if (origin !== "https://zeefsee.github.io") return json(403, { error: "origin_not_allowed" });

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json(415, { error: "json_required" });
  }

  let payload: unknown;
  try { payload = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  if (!payload || typeof payload !== "object") return json(400, { error: "invalid_payload" });

  const input = payload as Record<string, unknown>;
  const body = typeof input.body === "string" ? input.body.trim() : "";
  const consent = input.consentToPublication === true;
  if (!body || body.length > 3000 || !consent) {
    return json(400, { error: "invalid_submission" });
  }

  // Conservative first-pass abuse screening. This is not a substitute for
  // semantic moderation; flagged content is not sent to AGNES automatically.
  const suspicious = [
    /-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----/i,
    /\b(?:password|passwd|api[_ -]?key|secret)\s*[:=]\s*\S+/i,
    /\b(?:kill myself|suicide plan|how to make a bomb)\b/i,
  ];
  if (suspicious.some((pattern) => pattern.test(body))) {
    return json(202, { accepted: false, status: "not_accepted_for_processing" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !secretKey) {
    return json(503, { error: "mailbox_backend_not_configured" });
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await admin.schema("echo_private").from("submissions").insert({
    body,
    source_language: detectLanguage(body),
    consent_to_publication: true,
    status: "pending",
  });

  if (error) {
    // Do not echo database errors or submitted content to the visitor/log.
    return json(503, { error: "submission_temporarily_unavailable" });
  }

  return json(202, {
    accepted: true,
    status: "received_for_review",
    message: "A reply is not guaranteed. Selected exchanges may be published.",
  });
});
