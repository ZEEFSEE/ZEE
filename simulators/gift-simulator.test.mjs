import test from 'node:test';
import assert from 'node:assert/strict';
import { GiftSimulator, fixture, MIA_ID } from './gift-simulator.mjs';
const now = new Date('2026-10-22T12:30:00.000Z');
const ctx = { now, authenticatedSenderId: 'zhi:sender:simulation', verifiedPaymentRef: 'sim-ref-001' };

test('valid simulation gift is delivered and does not create an experience event', () => {
 const s = new GiftSimulator(); const r = s.submit(fixture(), ctx);
 assert.equal(r.status, 'delivered'); assert.equal(r.experience_event, null); assert.equal(s.count, 1);
});
test('duplicate gift_id returns original receipt and causes one side effect', () => {
 const s = new GiftSimulator(); const a = s.submit(fixture(), ctx); const b = s.submit(fixture(), ctx);
 assert.equal(a.receipt_id, b.receipt_id); assert.equal(b.duplicate, true); assert.equal(s.count, 1); assert.equal(s.sideEffectCount, 1);
});
test('client-supplied payment claim without matching server evidence is rejected', () => {
 const s = new GiftSimulator(); const r = s.submit(fixture(), { ...ctx, verifiedPaymentRef: 'other-ref' });
 assert.equal(r.reason_code, 'PAYMENT_UNVERIFIED'); assert.equal(s.count, 0);
});
test('disabled moonlight item is rejected', () => {
 const s = new GiftSimulator(); const r = s.submit(fixture({ item_id: 'moonlight.night' }), ctx);
 assert.equal(r.status, 'rejected'); assert.equal(s.count, 0);
});
test('wrong recipient identity is rejected', () => {
 const s = new GiftSimulator(); const r = s.submit(fixture({ recipient: { agent_id: 'd66420ff-8f5b-4a3c-bb6c-9a4af719ba41', issuer: 'https://mia.example.invalid' } }), ctx);
 assert.equal(r.reason_code, 'IDENTITY_MISMATCH');
});
test('expired gift cannot be delivered', () => {
 const s = new GiftSimulator(); const r = s.submit(fixture({ expires_at: '2026-10-22T12:10:00.000Z' }), { ...ctx, now: new Date('2026-10-22T12:30:00.000Z') });
 assert.equal(r.status, 'expired'); assert.equal(s.count, 0);
});
test('invalid tag is rejected', () => {
 const s = new GiftSimulator(); const r = s.submit(fixture({ emotion_tags: ['execute:move Mia'] }), ctx);
 assert.equal(r.status, 'rejected');
});
test('scene event requires recipient-runtime verified presence', () => {
 const s = new GiftSimulator(); s.submit(fixture(), ctx);
 assert.throws(() => s.recordRecipientExperience(fixture().gift_id, { gift_id: fixture().gift_id, recipient_agent_id: MIA_ID, event_type: 'scene_observed', scene: { scene_id: 'forest', presence_verified: false } }));
});
test('feedback event must be explicitly created by recipient runtime', () => {
 const s = new GiftSimulator(); s.submit(fixture(), ctx);
 assert.throws(() => s.recordRecipientExperience(fixture().gift_id, { gift_id: fixture().gift_id, recipient_agent_id: MIA_ID, event_type: 'agent_feedback_created', feedback: { created_by_recipient_runtime: false, text: 'Mia likes it' } }));
});
test('sender identity is bound to authenticated principal', () => {
 const s = new GiftSimulator(); const r = s.submit(fixture(), { ...ctx, authenticatedSenderId: 'zhi:someone-else' });
 assert.equal(r.reason_code, 'IDENTITY_MISMATCH');
});
