import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * MIA World Multi-API Gateway v1.0
 * Isolated, backend-only adapter: does not read/write memories or alter agent identity.
 * Never call from browser code; the shared secret must remain server-side.
 * AGNES is the final fallback. Existing mia-chat remains untouched.
 */
type Role = "system" | "user" | "assistant";
type Task = "chat" | "reasoning" | "creative" | "summarization" | "verification" | "planning";
type Message = { role: Role; content: string };

type Provider = {
  id: string;
  endpoint: string;
  key: string;
  model: string;
  extraHeaders?: Record<string, string>;
};

const ROUTES: Record<Task, string[]> = {
  chat: ["groq", "gemini", "mistral", "openrouter", "cloudflare", "agnes"],
  reasoning: ["gemini", "mistral", "groq", "openrouter", "cloudflare", "agnes"],
  creative: ["gemini", "mistral", "groq", "openrouter", "cloudflare", "agnes"],
  summarization: ["groq", "gemini", "mistral", "openrouter", "cloudflare", "agnes"],
  verification: ["gemini", "mistral", "groq", "openrouter", "cloudflare", "agnes"],
  planning: ["gemini", "mistral", "groq", "openrouter", "cloudflare", "agnes"],
};

const json = (body: unknown, status = 200) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};

function constantTimeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getProvider(id: string): Provider | null {
  const env = (name: string) => Deno.env.get(name) ?? "";
  switch (id) {
    case "gemini": {
      const key = env("GEMINI_API_KEY");
      const model = env("GEMINI_MODEL");
      return key && model ? {
        id, key, model,
        endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      } : null;
    }
    case "groq": {
      const key = env("GROQ_API_KEY");
      const model = env("GROQ_MODEL") || "openai/gpt-oss-20b";
      return key ? { id, key, model, endpoint: "https://api.groq.com/openai/v1/chat/completions" } : null;
    }
    case "mistral": {
      const key = env("MISTRAL_API_KEY");
      const model = env("MISTRAL_MODEL");
      return key && model ? { id, key, model, endpoint: "https://api.mistral.ai/v1/chat/completions" } : null;
    }
    case "openrouter": {
      const key = env("OPENROUTER_API_KEY");
      const model = env("OPENROUTER_MODEL");
      return key && model ? {
        id, key, model, endpoint: "https://openrouter.ai/api/v1/chat/completions",
        extraHeaders: { "HTTP-Referer": "https://zeefsee.github.io", "X-Title": "MIA World Multi-API Gateway" },
      } : null;
    }
    case "cloudflare": {
      const key = env("CLOUDFLARE_AI_API_TOKEN");
      const account = env("CLOUDFLARE_ACCOUNT_ID");
      const model = env("CLOUDFLARE_AI_MODEL");
      return key && account && model ? {
        id, key, model,
        endpoint: `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/chat/completions`,
      } : null;
    }
    case "agnes": {
      const key = env("AGNES_API_KEY");
      const model = env("AGNES_MODEL") || "agnes-3.0-flash";
      return key ? { id, key, model, endpoint: "https://apihub.agnes-ai.com/v1/chat/completions" } : null;
    }
    default:
      return null;
  }
}

function cleanMessages(value: unknown): Message[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 24) return null;
  const messages: Message[] = [];
  let total = 0;
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const role = (item as Record<string, unknown>).role;
    const content = (item as Record<string, unknown>).content;
    if (!["system", "user", "assistant"].includes(String(role))) return null;
    if (typeof content !== "string" || !content.trim() || content.length > 12000) return null;
    total += content.length;
    if (total > 48000) return null;
    messages.push({ role: role as Role, content });
  }
  return messages;
}

function extractText(data: any): string {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content
    .filter((part: any) => part?.type === "text" && typeof part.text === "string")
    .map((part: any) => part.text).join("\n");
  return "";
}

async function callProvider(provider: Provider, messages: Message[], task: Task): Promise<string> {
  const response = await fetch(provider.endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${provider.key}`,
      "Content-Type": "application/json",
      ...(provider.extraHeaders ?? {}),
    },
    signal: AbortSignal.timeout(25000),
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: task === "verification" ? 0.1 : 0.7,
    }),
  });
  if (!response.ok) {
    // Do not return upstream response bodies; they can contain provider diagnostics.
    throw new Error(`${provider.id}:HTTP_${response.status}`);
  }
  const data = await response.json();
  const text = extractText(data);
  if (!text.trim()) throw new Error(`${provider.id}:EMPTY_RESPONSE`);
  return text;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (req.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405, origin);
  if (origin && origin !== ALLOWED_ORIGIN) return json({ ok: false, error: "ORIGIN_NOT_ALLOWED" }, 403);
  if (!GATEWAY_SECRET) return json({ ok: false, error: "GATEWAY_NOT_CONFIGURED" }, 503, origin);
  const supplied = req.headers.get("x-mia-gateway-secret") ?? "";
  if (!constantTimeEqual(supplied, GATEWAY_SECRET)) return json({ ok: false, error: "UNAUTHORIZED" }, 401, origin);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "INVALID_JSON" }, 400, origin); }

  const agentId = String(body?.agent_id ?? "");
  if (!/^(prototype-mia|[A-Z][A-Z0-9_-]{1,47})$/.test(agentId)) {
    return json({ ok: false, error: "INVALID_AGENT_ID" }, 400, origin);
  }
  const task = String(body?.task_type ?? "chat") as Task;
  if (!Object.prototype.hasOwnProperty.call(ROUTES, task)) return json({ ok: false, error: "INVALID_TASK_TYPE" }, 400, origin);
  const messages = cleanMessages(body?.messages);
  if (!messages) return json({ ok: false, error: "INVALID_MESSAGES" }, 400, origin);

  const attempts: Array<{ provider: string; status: string }> = [];
  for (const id of ROUTES[task]) {
    const provider = getProvider(id);
    if (!provider) {
      attempts.push({ provider: id, status: "not_configured" });
      continue;
    }
    try {
      const reply = await callProvider(provider, messages, task);
      return json({
        ok: true,
        agent_id: agentId,
        task_type: task,
        provider: provider.id,
        model: provider.model,
        fallback_used: attempts.length > 0,
        attempts,
        reply,
      }, 200, origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : "PROVIDER_ERROR";
      attempts.push({ provider: id, status: message.slice(id.length + 1, 80) });
    }
  }
  return json({
    ok: false,
    error: "ALL_PROVIDERS_UNAVAILABLE",
    attempts,
    retryable: true,
    message: "All configured model providers failed. No memory or conversation state was modified by this gateway.",
  }, 503, origin);
});
