// Server-only AGNES adapter for THE ECHO MAILBOX.
// No network request is permitted until the operator has
// explicitly confirmed that the existing AGNES allowance is zero-cost.

export const AGNES_MAILBOX_ENDPOINT = "https://apihub.agnes-ai.com/v1/chat/completions";

export class AgnesMailboxError extends Error {
  constructor(code) {
    super(code);
    this.name = "AgnesMailboxError";
    this.code = code;
  }
}

export function createAgnesMailboxClient({
  apiKey,
  model,
  zeroCostConfirmed = false,
  fetchImpl = globalThis.fetch,
}) {
  return {
    async complete(messages, { timeoutMs = 20000, maxTokens = 900 } = {}) {
      if (zeroCostConfirmed !== true) throw new AgnesMailboxError("agnes_zero_cost_not_confirmed");
      if (typeof apiKey !== "string" || apiKey.trim().length === 0) throw new AgnesMailboxError("agnes_api_key_missing");
      if (typeof model !== "string" || model.trim().length === 0) throw new AgnesMailboxError("agnes_model_missing");
      if (typeof fetchImpl !== "function") throw new AgnesMailboxError("fetch_unavailable");
      if (!Array.isArray(messages) || messages.length === 0 || messages.length > 12) throw new AgnesMailboxError("invalid_messages");
      for (const message of messages) {
        if (!message || !["system", "user", "assistant"].includes(message.role)
          || typeof message.content !== "string" || message.content.length > 12000) {
          throw new AgnesMailboxError("invalid_message_shape");
        }
      }

      const controller = new AbortController();
      const boundedTimeout = Math.min(Math.max(Number(timeoutMs) || 20000, 1000), 25000);
      const timer = setTimeout(() => controller.abort(), boundedTimeout);
      try {
        const response = await fetchImpl(AGNES_MAILBOX_ENDPOINT, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.2,
            max_tokens: Math.min(Math.max(Number(maxTokens) || 900, 64), 1200),
          }),
          signal: controller.signal,
        });
        if (!response || !response.ok) throw new AgnesMailboxError("agnes_upstream_unavailable");
        let payload;
        try { payload = await response.json(); }
        catch { throw new AgnesMailboxError("agnes_invalid_response"); }
        const content = payload?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || content.trim().length === 0) {
          throw new AgnesMailboxError("agnes_empty_response");
        }
        return content.trim();
      } catch (error) {
        if (error instanceof AgnesMailboxError) throw error;
        if (controller.signal.aborted) throw new AgnesMailboxError("agnes_timeout");
        throw new AgnesMailboxError("agnes_request_failed");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
