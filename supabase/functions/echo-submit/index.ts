// THE ECHO MAILBOX — fail-closed endpoint placeholder.
// This endpoint intentionally does not accept or persist visitor content.
// It must not be enabled until the isolated schema, AGNES selection flow,
// input/output moderation, publication gate, retention worker and tests exist.

const ALLOWED_ORIGIN = "https://zeefsee.github.io";
const headers = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Cache-Control": "no-store",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin");
    if (origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (req.headers.get("origin") !== ALLOWED_ORIGIN) {
    return json(403, { error: "origin_not_allowed" });
  }

  // Fail closed: no parsing, logging, forwarding, or persistence of the body.
  return json(503, {
    error: "mailbox_not_live",
    message: "The mailbox is not accepting submissions yet.",
  });
});
