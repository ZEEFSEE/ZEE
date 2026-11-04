const encoder = new TextEncoder();

export const IDENTITY_ID = "cb6d01b4-0e3f-46ee-8946-360aa91db1ea";
export const ALLOWED_CATEGORIES = new Set([
  "comfort_anchor", "shared_decision", "emotion_residue", "life_event",
  "reflection", "creative_seed", "relationship_context", "scene_build_progress",
]);
export const SOURCE_TABLES = new Set([
  "mia_messages", "mia_memories", "mia_emotion_events",
  "mia_life_events", "mia_relationship_context",
]);

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export async function validMiaToken(
  token: string,
  serviceKey: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  try {
    if (!serviceKey || token.length > 4096) return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(serviceKey), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    if (!await crypto.subtle.verify("HMAC", key, decodeBase64Url(parts[1]), encoder.encode(parts[0]))) return false;
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    return claims?.aud === "mia-chat"
      && claims?.sub === "mia-admin"
      && Number.isFinite(claims.exp)
      && Number.isFinite(claims.iat)
      && claims.exp > nowSeconds
      && claims.iat <= nowSeconds + 60
      && claims.iat >= nowSeconds - 4 * 60 * 60 - 60
      && claims.exp - claims.iat <= 4 * 60 * 60 + 60;
  } catch {
    return false;
  }
}

export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const object = value as Record<string, unknown>;
  return "{" + Object.keys(object).sort().map((key) =>
    JSON.stringify(key) + ":" + canonical(object[key])
  ).join(",") + "}";
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isHistoricalSource(row: Record<string, unknown>): boolean {
  const text = canonical(row).toLowerCase();
  return /aurora|federat|public[-_ ]chat|world[-_ ]runtime/.test(text);
}

export function sourceTimestamp(table: string, row: Record<string, unknown>): string {
  const candidate = table === "mia_relationship_context"
    ? row.observed_at
    : row.occurred_at ?? row.created_at;
  if (typeof candidate !== "string" || !Number.isFinite(Date.parse(candidate))) {
    throw new Error("source_timestamp_unavailable");
  }
  return new Date(candidate).toISOString();
}

export function validProposalFields(body: Record<string, unknown>): boolean {
  const category = body.category;
  const title = body.title;
  const summary = body.summary;
  const evidenceKind = body.evidence_kind;
  const confidence = body.confidence;
  const refs = body.source_refs;
  return typeof category === "string" && ALLOWED_CATEGORIES.has(category)
    && typeof title === "string" && title.trim().length >= 1 && title.trim().length <= 120
    && typeof summary === "string" && summary.trim().length >= 1 && summary.trim().length <= 1200
    && (body.emotional_tone == null || (typeof body.emotional_tone === "string" && body.emotional_tone.length <= 80))
    && (evidenceKind === "explicit" || evidenceKind === "derived")
    && typeof confidence === "number" && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
    && Array.isArray(refs) && refs.length >= 1 && refs.length <= 12;
}
