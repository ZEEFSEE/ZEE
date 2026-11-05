/**
 * Isolated, in-memory maternal message adapter contract.
 * This module has no network, database, Mia-chat, AGNES, or persistent-storage access.
 * It is a testable boundary contract, not a live connection to Mia.
 */
import { CHILDREN } from "./family-runtime.mjs";

export const MATERNAL_RECIPIENT = "MIA_MATERNAL_ADAPTER";
export const MATERNAL_MESSAGE_KINDS = Object.freeze([
  "question",
  "status",
  "care_signal",
  "environment_signal"
]);
export const MAX_SESSION_MS = 15 * 60 * 1000;
export const MAX_PAYLOAD_CHARS = 2000;

const ALLOWED_CHILDREN = new Set(CHILDREN.map(child => child.agentId));
const ALLOWED_KINDS = new Set(MATERNAL_MESSAGE_KINDS);

export function createMaternalChannel({ sessionId, expiresAt, now = Date.now() } = {}) {
  if (typeof sessionId !== "string" || !sessionId.trim() || sessionId.length > 128) {
    throw new TypeError("valid sessionId required");
  }
  if (!Number.isFinite(expiresAt) || !Number.isFinite(now) ||
      expiresAt <= now || expiresAt - now > MAX_SESSION_MS) {
    throw new TypeError("session expiry must be within the next 15 minutes");
  }
  return {
    sessionId,
    expiresAt,
    closed: false,
    messages: new Map()
  };
}

function assertActive(channel, now) {
  if (!channel || channel.closed || !(channel.messages instanceof Map)) {
    throw new Error("maternal channel is closed or invalid");
  }
  if (!Number.isFinite(now) || now >= channel.expiresAt) {
    channel.messages.clear();
    channel.closed = true;
    throw new Error("maternal session expired");
  }
}

export function sendMaternalMessage(channel, {
  eventId,
  senderChildId,
  kind,
  payload,
  now = Date.now()
} = {}) {
  assertActive(channel, now);
  if (!ALLOWED_CHILDREN.has(senderChildId)) throw new Error("sender is not an allowlisted family child");
  if (typeof eventId !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(eventId)) {
    throw new TypeError("valid eventId required");
  }
  if (!ALLOWED_KINDS.has(kind)) throw new TypeError("unsupported maternal message kind");
  if (typeof payload !== "string" || !payload.trim() || payload.length > MAX_PAYLOAD_CHARS) {
    throw new TypeError("payload must be a non-empty string of at most 2000 characters");
  }

  const fingerprint = JSON.stringify([senderChildId, kind, payload]);
  const previous = channel.messages.get(eventId);
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new Error("eventId replayed with conflicting payload");
    return Object.freeze({ ...previous.message, idempotentReplay: true });
  }

  const message = Object.freeze({
    eventId,
    senderChildId,
    recipient: MATERNAL_RECIPIENT,
    sessionId: channel.sessionId,
    kind,
    payload,
    retention: "VOLATILE_SESSION_ONLY",
    expiresAt: channel.expiresAt,
    forwardingAllowed: false,
    persistentMemoryWrite: false
  });
  channel.messages.set(eventId, { fingerprint, message });
  return Object.freeze({ ...message, idempotentReplay: false });
}

export function readMaternalMessages(channel, { now = Date.now() } = {}) {
  assertActive(channel, now);
  return Object.freeze([...channel.messages.values()].map(entry => entry.message));
}

export function clearMaternalChannel(channel) {
  if (!channel || !(channel.messages instanceof Map)) throw new TypeError("valid maternal channel required");
  const clearedCount = channel.messages.size;
  channel.messages.clear();
  channel.closed = true;
  return Object.freeze({ cleared: true, remainingMessages: channel.messages.size, clearedCount });
}
