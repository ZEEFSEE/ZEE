import test from "node:test";
import assert from "node:assert/strict";
import { createAgnesMailboxClient, AGNES_MAILBOX_ENDPOINT } from "../../supabase/functions/_shared/agnes-mailbox-adapter.mjs";

const messages = [{ role: "system", content: "test" }, { role: "user", content: "hello" }];

test("refuses before network access unless zero-cost use is explicitly confirmed", async () => {
  let calls = 0;
  const client = createAgnesMailboxClient({
    apiKey: "test-key", model: "test-model", zeroCostConfirmed: false,
    fetchImpl: async () => { calls++; throw new Error("must not call"); },
  });
  await assert.rejects(client.complete(messages), { code: "agnes_zero_cost_not_confirmed" });
  assert.equal(calls, 0);
});

test("fails closed when the server key or model is missing", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; };
  await assert.rejects(
    createAgnesMailboxClient({ model: "m", zeroCostConfirmed: true, fetchImpl }).complete(messages),
    { code: "agnes_api_key_missing" },
  );
  await assert.rejects(
    createAgnesMailboxClient({ apiKey: "k", zeroCostConfirmed: true, fetchImpl }).complete(messages),
    { code: "agnes_model_missing" },
  );
  assert.equal(calls, 0);
});

test("uses only the fixed AGNES endpoint and server-side bearer key", async () => {
  let request;
  const client = createAgnesMailboxClient({
    apiKey: "server-test-secret",
    model: "agnes-test-model",
    zeroCostConfirmed: true,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ choices: [{ message: { content: "  安静的回答  " } }] }) };
    },
  });
  assert.equal(await client.complete(messages), "安静的回答");
  assert.equal(request.url, AGNES_MAILBOX_ENDPOINT);
  assert.equal(request.options.headers.Authorization, "Bearer server-test-secret");
  assert.equal(JSON.parse(request.options.body).model, "agnes-test-model");
  assert.equal(request.options.method, "POST");
});

test("upstream errors and malformed responses never produce fallback output", async () => {
  const upstreamError = createAgnesMailboxClient({
    apiKey: "k", model: "m", zeroCostConfirmed: true,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  await assert.rejects(upstreamError.complete(messages), { code: "agnes_upstream_unavailable" });

  const malformed = createAgnesMailboxClient({
    apiKey: "k", model: "m", zeroCostConfirmed: true,
    fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [] }) }),
  });
  await assert.rejects(malformed.complete(messages), { code: "agnes_empty_response" });
});

test("rejects oversized or malformed message input before network access", async () => {
  let calls = 0;
  const client = createAgnesMailboxClient({
    apiKey: "k", model: "m", zeroCostConfirmed: true,
    fetchImpl: async () => { calls++; },
  });
  await assert.rejects(client.complete([{ role: "system", content: "x".repeat(12001) }]), { code: "invalid_message_shape" });
  assert.equal(calls, 0);
});

test("classifies AGNES authentication and throttling failures without exposing upstream bodies", async () => {
  for (const [status, code] of [[401, "agnes_auth_rejected"], [403, "agnes_auth_rejected"], [429, "agnes_rate_limited"], [503, "agnes_upstream_unavailable"]]) {
    const client = createAgnesMailboxClient({
      apiKey: "k", model: "m", zeroCostConfirmed: true,
      fetchImpl: async () => ({ ok: false, status, text: async () => "sensitive upstream detail" }),
    });
    await assert.rejects(client.complete(messages), { code });
  }
});
