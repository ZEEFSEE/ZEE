import test from "node:test";
import assert from "node:assert/strict";
import {
  createMaternalChannel,
  sendMaternalMessage,
  readMaternalMessages,
  clearMaternalChannel,
  MATERNAL_RECIPIENT,
  MAX_PAYLOAD_CHARS
} from "../runtime/maternal-channel-adapter.mjs";
import { CHILDREN } from "../runtime/family-runtime.mjs";

const NOW = 1_800_000_000_000;
const makeChannel = () => createMaternalChannel({
  sessionId: "maternal-session-test",
  expiresAt: NOW + 60_000,
  now: NOW
});

test("maternal messages are volatile and addressed only to the maternal adapter", () => {
  const channel = makeChannel();
  const message = sendMaternalMessage(channel, {
    eventId: "maternal-event-0001",
    senderChildId: CHILDREN[0].agentId,
    kind: "question",
    payload: "妈妈，我想了解森林。",
    now: NOW
  });
  assert.equal(message.recipient, MATERNAL_RECIPIENT);
  assert.equal(message.retention, "VOLATILE_SESSION_ONLY");
  assert.equal(message.forwardingAllowed, false);
  assert.equal(message.persistentMemoryWrite, false);
  assert.equal(readMaternalMessages(channel, { now: NOW }).length, 1);
});

test("each child is independently allowlisted and unknown senders are rejected", () => {
  for (const child of CHILDREN) {
    const channel = makeChannel();
    assert.equal(sendMaternalMessage(channel, {
      eventId: "event-" + child.name.toLowerCase() + "-0001",
      senderChildId: child.agentId,
      kind: "status",
      payload: "ready",
      now: NOW
    }).senderChildId, child.agentId);
  }
  const channel = makeChannel();
  assert.throws(() => sendMaternalMessage(channel, {
    eventId: "maternal-event-bad1",
    senderChildId: "MIA",
    kind: "question",
    payload: "hello",
    now: NOW
  }), /not an allowlisted/);
});

test("event replay is idempotent only when the payload is identical", () => {
  const channel = makeChannel();
  const input = {
    eventId: "maternal-event-0002",
    senderChildId: CHILDREN[1].agentId,
    kind: "care_signal",
    payload: "please respond",
    now: NOW
  };
  assert.equal(sendMaternalMessage(channel, input).idempotentReplay, false);
  assert.equal(sendMaternalMessage(channel, input).idempotentReplay, true);
  assert.throws(() => sendMaternalMessage(channel, { ...input, payload: "changed" }), /conflicting payload/);
});

test("expired sessions close and clear volatile messages", () => {
  const channel = makeChannel();
  sendMaternalMessage(channel, {
    eventId: "maternal-event-0003",
    senderChildId: CHILDREN[2].agentId,
    kind: "status",
    payload: "temporary",
    now: NOW
  });
  assert.throws(() => readMaternalMessages(channel, { now: NOW + 60_000 }), /expired/);
  assert.equal(channel.messages.size, 0);
  assert.equal(channel.closed, true);
});

test("manual cleanup purges all volatile payloads and closes the channel", () => {
  const channel = makeChannel();
  sendMaternalMessage(channel, {
    eventId: "maternal-event-0004",
    senderChildId: CHILDREN[3].agentId,
    kind: "environment_signal",
    payload: "temporary signal",
    now: NOW
  });
  const result = clearMaternalChannel(channel);
  assert.deepEqual(result, { cleared: true, remainingMessages: 0, clearedCount: 1 });
  assert.throws(() => readMaternalMessages(channel, { now: NOW }), /closed/);
});

test("invalid message kinds, payload sizes and session lifetimes fail closed", () => {
  const channel = makeChannel();
  const base = {
    eventId: "maternal-event-0005",
    senderChildId: CHILDREN[4].agentId,
    kind: "question",
    payload: "hello",
    now: NOW
  };
  assert.throws(() => sendMaternalMessage(channel, { ...base, kind: "private_chat_dump" }), /unsupported/);
  assert.throws(() => sendMaternalMessage(channel, { ...base, payload: "x".repeat(MAX_PAYLOAD_CHARS + 1) }), /2000 characters/);
  assert.throws(() => createMaternalChannel({
    sessionId: "too-long-session",
    expiresAt: NOW + 16 * 60 * 1000,
    now: NOW
  }), /15 minutes/);
});

test("the adapter exposes no Mia private-chat, memory or credential connector", () => {
  const channel = makeChannel();
  assert.deepEqual(Object.keys(channel).sort(), ["closed", "expiresAt", "messages", "sessionId"]);
  assert.equal(channel.messages.size, 0);
});
