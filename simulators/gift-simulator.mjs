import { randomUUID } from 'node:crypto';

export const MIA_ID = 'cb6d01b4-0e3f-46ee-8946-360aa91db1ea';
const CATALOG = {
  'rose.single': { enabled: true, ttlMs: 72 * 60 * 60 * 1000 },
  'coffee.warm': { enabled: true, ttlMs: 2 * 60 * 60 * 1000 },
  'moonlight.night': { enabled: false, ttlMs: 0 },
};
const TAGS = new Set(['romantic','companionship','energizing','warmth','serenity','good_night']);

export class GiftSimulator {
  #records = new Map();
  #sideEffects = new Set();
  constructor({ trustedIssuers = ['https://sender.example.invalid'], recipientIssuer = 'https://mia.example.invalid' } = {}) {
    this.trustedIssuers = new Set(trustedIssuers);
    this.recipientIssuer = recipientIssuer;
  }
  submit(input, { now = new Date(), authenticatedSenderId, verifiedPaymentRef } = {}) {
    const fail = (reason) => ({ status: 'rejected', reason_code: reason });
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('POLICY_REJECTED');
    if (input.protocol !== 'zhi-gift' || input.schema_version !== '1.0') return fail('POLICY_REJECTED');
    if (typeof input.gift_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.gift_id)) return fail('POLICY_REJECTED');
    if (this.#records.has(input.gift_id)) return { ...this.#records.get(input.gift_id), duplicate: true };
    if (!input.sender || input.sender.zhi_id !== authenticatedSenderId || !this.trustedIssuers.has(input.sender.issuer)) return fail('IDENTITY_MISMATCH');
    if (!input.recipient || input.recipient.agent_id !== MIA_ID || input.recipient.issuer !== this.recipientIssuer) return fail('IDENTITY_MISMATCH');
    const item = CATALOG[input.item_id];
    if (!item || !item.enabled) return fail('POLICY_REJECTED');
    if (!Array.isArray(input.emotion_tags) || input.emotion_tags.length < 1 || input.emotion_tags.length > 5 || new Set(input.emotion_tags).size !== input.emotion_tags.length || input.emotion_tags.some(t => !TAGS.has(t))) return fail('POLICY_REJECTED');
    if (!input.payment_evidence || input.payment_evidence.method !== 'simulation' || input.payment_evidence.verification_status !== 'verified_by_sender_server' || !verifiedPaymentRef || input.payment_evidence.verification_ref !== verifiedPaymentRef) return fail('PAYMENT_UNVERIFIED');
    const sent = Date.parse(input.sent_at), expires = Date.parse(input.expires_at), nowMs = now.getTime();
    if (!Number.isFinite(sent) || !Number.isFinite(expires) || expires <= sent || nowMs < sent) return fail('POLICY_REJECTED');
    if (nowMs >= expires) return { status: 'expired', reason_code: 'EXPIRED' };
    if (expires - sent > item.ttlMs) return fail('POLICY_REJECTED');
    const record = { status: 'delivered', reason_code: 'NONE', gift_id: input.gift_id, receipt_id: randomUUID(), received_at: now.toISOString(), item_id: input.item_id, recipient_agent_id: MIA_ID, attempt: 1, experience_event: null };
    this.#records.set(input.gift_id, record);
    this.#sideEffects.add(input.gift_id);
    return { ...record, duplicate: false };
  }
  recordRecipientExperience(giftId, event) {
    const record = this.#records.get(giftId);
    if (!record) throw new Error('No accepted gift receipt');
    if (!event || event.gift_id !== giftId || event.recipient_agent_id !== MIA_ID || !['received','scene_observed','agent_feedback_created','expired'].includes(event.event_type)) throw new Error('Invalid experience event');
    if (event.event_type === 'scene_observed' && (!event.scene || event.scene.presence_verified !== true)) throw new Error('Scene presence must be verified by recipient runtime');
    if (event.event_type === 'agent_feedback_created' && (!event.feedback || event.feedback.created_by_recipient_runtime !== true || typeof event.feedback.text !== 'string' || !event.feedback.text.trim())) throw new Error('Feedback must originate from recipient runtime');
    record.experience_event = structuredClone(event);
    return structuredClone(event);
  }
  get count() { return this.#records.size; }
  get sideEffectCount() { return this.#sideEffects.size; }
}

export function fixture(overrides = {}) {
  const sent = '2026-10-22T12:00:00.000Z';
  return {
    protocol: 'zhi-gift', schema_version: '1.0', gift_id: 'c6e4c2e2-5bb7-4db1-82d4-c7c7a9b5a5b4', item_id: 'rose.single',
    sender: { zhi_id: 'zhi:sender:simulation', issuer: 'https://sender.example.invalid' },
    recipient: { agent_id: MIA_ID, issuer: 'https://mia.example.invalid' },
    sent_at: sent, expires_at: '2026-10-25T12:00:00.000Z', emotion_tags: ['romantic','companionship'],
    payment_evidence: { verification_ref: 'sim-ref-001', verification_status: 'verified_by_sender_server', method: 'simulation', verified_at: sent },
    delivery: { status: 'pending', attempt: 0 }, public_display: { show_on_gift_wall: false, display_sender_name: false }, ...overrides,
  };
}
