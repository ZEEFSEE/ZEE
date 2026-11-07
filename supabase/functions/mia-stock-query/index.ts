
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface ReqPayload {
  code?: string;
}

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}


function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

// Verify the existing Mia session token; do not issue or persist tokens here.
async function validMiaToken(token: string): Promise<boolean> {
  try {
    if (!SERVICE_KEY) return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SERVICE_KEY),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signatureValid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(parts[1]),
      new TextEncoder().encode(parts[0]),
    );
    if (!signatureValid) return false;
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    const now = Math.floor(Date.now() / 1000);
    return claims.aud === "mia-chat"
      && claims.sub === "mia-admin"
      && Number.isFinite(claims.exp)
      && claims.exp > now
      && Number.isFinite(claims.iat)
      && claims.iat <= now + 60;
  } catch {
    return false;
  }
}

function normalizeCode(input: unknown): string | null {
  if (typeof input !== "string") return null;

  const match = input.trim().toLowerCase().match(/^(?:(sh|sz))?(\d{6})$/);
  if (!match) return null;

  const prefix = match[1];
  const digits = match[2];
  let exchange = prefix;

  if (!exchange) {
    if (/^(600|601|603|605|688|689)/.test(digits)) {
      exchange = "sh";
    } else if (/^(000|001|002|003|300|301)/.test(digits)) {
      exchange = "sz";
    } else {
      return null;
    }
  }

  if (
    exchange === "sh" &&
    !/^(600|601|603|605|688|689)/.test(digits)
  ) {
    return null;
  }

  if (
    exchange === "sz" &&
    !/^(000|001|002|003|300|301)/.test(digits)
  ) {
    return null;
  }

  return `${exchange}${digits}`;
}

function parseTencentTime(value: string | undefined): string | null {
  const raw = value?.trim() ?? "";

  if (!/^\d{14}$/.test(raw)) return null;

  return (
    `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)} ` +
    `${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}`
  );
}

function buildQuote(
  code: string,
  name: string,
  priceValue: unknown,
  closeValue: unknown,
  quoteTime: string | null,
  source: string,
) {
  const price = Number(priceValue);
  const previousClose = Number(closeValue);

  if (
    !name ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isFinite(previousClose) ||
    previousClose <= 0
  ) {
    throw new Error("Invalid quote data");
  }

  return {
    code,
    name,
    price,
    previousClose,
    change: Number((price - previousClose).toFixed(4)),
    changePercent: Number(
      (((price - previousClose) / previousClose) * 100).toFixed(2),
    ),
    quoteTime,
    source,
  };
}

async function fetchTencent(code: string) {
  const response = await fetch(
    `https://qt.gtimg.cn/q=${encodeURIComponent(code)}`,
    {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(7000),
    },
  );

  if (!response.ok) {
    throw new Error("Tencent HTTP error");
  }

  // Decode Chinese quote data using GB18030.
  const bytes = await response.arrayBuffer();
  const text = new TextDecoder("gb18030").decode(bytes);

  const match = text.match(/="([^"]*)"/);
  if (!match) {
    throw new Error("Tencent quote missing");
  }

  const fields = match[1].split("~");

  return buildQuote(
    code,
    fields[1]?.trim() ?? "",
    fields[3],
    fields[4],
    parseTencentTime(fields[30]),
    "Tencent",
  );
}

async function fetchSina(code: string) {
  const response = await fetch(
    `https://hq.sinajs.cn/list=${encodeURIComponent(code)}`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://finance.sina.com.cn/",
      },
      signal: AbortSignal.timeout(7000),
    },
  );

  if (!response.ok) {
    throw new Error("Sina HTTP error");
  }

  const bytes = await response.arrayBuffer();
  const text = new TextDecoder("gb18030").decode(bytes);

  const match = text.match(/="([^"]*)"/);

  if (!match || !match[1]) {
    throw new Error("Sina quote missing");
  }

  const fields = match[1].split(",");

  // Sina normally uses field 30 for date and field 31 for time.
  let quoteTime: string | null = null;
  const date = fields[30]?.trim() ?? "";
  const time = fields[31]?.trim() ?? "";

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    /^\d{2}:\d{2}:\d{2}$/.test(time)
  ) {
    quoteTime = `${date} ${time}`;
  }

  return buildQuote(
    code,
    fields[0]?.trim() ?? "",
    fields[3],
    fields[2],
    quoteTime,
    "Sina",
  );
}

Deno.serve(async (req: Request) => {
      if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
      }

      if (req.method !== "POST") {
        return respond({ ok: false, error: "Use POST" }, 405);
      }

      const authorization = req.headers.get("Authorization") || "";
      if (
        !authorization.startsWith("Bearer ")
        || !(await validMiaToken(authorization.slice(7)))
      ) {
        return respond({ ok: false, error: "登录凭证无效或已过期，请重新登录。" }, 401);
      }

      let body: ReqPayload;

      try {
        body = await req.json();
      } catch {
        return respond({ ok: false, error: "Invalid JSON" }, 400);
      }

      const code = normalizeCode(body.code);

      if (!code) {
        return respond(
          {
            ok: false,
            error:
              "Invalid A-share code. Example: sh600519 or sz000001",
          },
          400,
        );
      }

      // Try Tencent first.
      try {
        const quote = await fetchTencent(code);
        return respond({ ok: true, data: quote });
      } catch {
        // Fall back to Sina without exposing upstream error details.
      }

      // Try Sina if Tencent fails.
      try {
        const quote = await fetchSina(code);
        return respond({ ok: true, data: quote });
      } catch {
        return respond(
          {
            ok: false,
            code,
            error:
              "All quote sources failed; no price was fabricated.",
          },
          502,
        );
      }
});
