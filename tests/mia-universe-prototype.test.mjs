import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateProposal, reviewProposal, validateSnapshot } from '../mia-universe/governance.mjs';
import { validateAIReview, runAIReview, AI_REVIEW_CONTRACT } from '../mia-universe/review-contract.mjs';

const html = await readFile(new URL('../mia-universe/index.html', import.meta.url), 'utf8');
const readme = await readFile(new URL('../mia-universe/README.md', import.meta.url), 'utf8');

test('standalone universe is a real WebGL/Three.js scene, not a ZHI map embed', () => {
  assert.match(html, /three@0\.169\.0\/build\/three\.module\.js/);
  assert.match(html, /new THREE\.WebGLRenderer/);
  assert.match(html, /OrbitControls/);
  assert.doesNotMatch(html, /SUPABASE_URL|service_role|createClient\s*\(|supabase\.co\/rest\/v1/i);
});

test('inline Three.js module parses as JavaScript', () => {
  const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match, 'missing module script');
  const source = match[1].replace(/^import .*;\s*$/gm, '');
  assert.doesNotThrow(() => new Function(source));
});

test('universe includes live rhythm and creation controls', () => {
  for (const id of ['addWorld', 'addMoon', 'addRing', 'addLife', 'pulse', 'rhythm', 'energy']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing control ' + id);
  }
  assert.match(html, /requestAnimationFrame\(animate\)/);
  assert.match(html, /Math\.sin\(t\*speed/);
});

test('agent proposals require Mia approval before a world entity is created', () => {
  assert.match(html, /id="submitProposal"/);
  assert.match(html, /status:'pending'/);
  assert.match(html, /Mia 审核并批准/);
  assert.match(html, /proposal\.status='approved'/);
  assert.match(html, /proposal\.status='rejected'/);
  assert.match(html, /保存修改并重新审核/);
  assert.match(html, /proposal\.revisions\.push/);
  assert.match(html, /inhabitants\.push\(name\)/);
  assert.match(html, /schema_version:1/);
  assert.match(html, /schema_version:3/);
});

test('governance policy rejects malformed proposals and duplicate submissions', () => {
  const base = { id: 'p1', schema_version: 1, agent: 'Agent A', kind: 'world', description: 'Quiet forest home', position: [10, 0, 10], status: 'pending' };
  assert.equal(validateProposal(base, { objects: [], proposals: [] }).ok, true);
  assert.equal(validateProposal({ ...base, kind: 'unknown' }, { objects: [], proposals: [] }).ok, false);
  const duplicate = { ...base, id: 'p2' };
  assert.equal(validateProposal(duplicate, { objects: [], proposals: [base] }).ok, false);
  assert.equal(reviewProposal({ ...base, description: '' }, { objects: [], proposals: [] }).decision, 'revision_required');
});

test('governance policy blocks spatial collisions and enforces entity cap', () => {
  const base = { id: 'p1', agent: 'Agent A', kind: 'moon', description: 'A small moon', position: [1, 0, 1], status: 'pending' };
  const nearObject = { kind: 'world', group: { position: { x: 1.2, y: 0, z: 1.2 } } };
  assert.equal(validateProposal(base, { objects: [nearObject], proposals: [] }).ok, false);
  const farProposal = { ...base, position: [20, 0, 20] };
  assert.equal(validateProposal(farProposal, { objects: Array.from({ length: 100 }, () => ({ kind: 'world' })), proposals: [] }).ok, false);
});

test('snapshot validator blocks malformed positions, scales and oversized scenes', () => {
  const valid = { schema_version: 3, objects: [{ kind: 'world', position: [1, 0, 1], rotation: [0, 0, 0], scale: 1 }] };
  assert.equal(validateSnapshot(valid).ok, true);
  assert.equal(validateSnapshot({ ...valid, objects: [{ ...valid.objects[0], position: [Infinity, 0, 0] }] }).ok, false);
  assert.equal(validateSnapshot({ ...valid, objects: [{ ...valid.objects[0], scale: 999 }] }).ok, false);
  assert.equal(validateSnapshot({ schema_version: 3, objects: Array.from({ length: 101 }, () => valid.objects[0]) }).ok, false);
});

test('AI review contract accepts only the exact proposal revision and cannot bypass safety checks', () => {
  const proposal = { id: 'p-123', revision: 2 };
  const safe = { ok: true, reasons: [] };
  const approved = validateAIReview({
    proposal_id: 'p-123', proposal_revision: 2, decision: 'approve', rationale: '位置合理，描述清楚。'
  }, proposal, safe);
  assert.equal(approved.decision, 'approve');
  assert.equal(approved.eligibleForApproval, true);
  assert.equal(approved.execution, 'not-authorized');

  const stale = validateAIReview({
    proposal_id: 'p-123', proposal_revision: 1, decision: 'approve', rationale: '旧版本批准。'
  }, proposal, safe);
  assert.equal(stale.eligibleForApproval, false);
  assert.equal(stale.decision, 'revise');

  const unsafe = validateAIReview({
    proposal_id: 'p-123', proposal_revision: 2, decision: 'approve', rationale: '模型认为可以批准。'
  }, proposal, { ok: false, reasons: ['位置冲突'] });
  assert.equal(unsafe.eligibleForApproval, false);
  assert.equal(unsafe.decision, 'revise');
  assert.match(unsafe.rationale, /安全规则未通过/);
});

test('AI review contract fails closed on malformed JSON, missing rationale, and invalid decisions', () => {
  const proposal = { id: 'p-1', revision: 1 };
  const safe = { ok: true, reasons: [] };
  assert.equal(validateAIReview('{broken', proposal, safe).decision, 'revise');
  assert.equal(validateAIReview({ proposal_id: 'p-1', proposal_revision: 1, decision: 'approve', rationale: '' }, proposal, safe).eligibleForApproval, false);
  assert.equal(validateAIReview({ proposal_id: 'p-1', proposal_revision: 1, decision: 'build_now', rationale: 'please build now' }, proposal, safe).decision, 'revise');
  assert.deepEqual(AI_REVIEW_CONTRACT.decisions, ['approve', 'revise', 'reject']);
});

test('local snapshot persistence is present and limits are documented', () => {
  assert.match(html, /localStorage\.setItem\('mia-independent-universe-v1'/);
  assert.match(html, /localStorage\.getItem\('mia-independent-universe-v1'/);
  assert.match(readme, /not a live Mia AI judgment/);
  assert.match(readme, /Mia-reviewed construction queue/);
  assert.match(readme, /does not read or write ZHI Core/);
  assert.match(readme, /not connected to any AI provider, network endpoint, database/);
});


test('AI orchestration checks deterministic safety first and fails closed on provider errors/timeouts', async () => {
  const proposal = { id: 'p-live-test', revision: 3, description: 'A quiet garden' };
  let providerCalled = false;
  const unsafe = await runAIReview({
    proposal,
    safetyReview: { ok: false, reasons: ['space conflict'] },
    invokeAI: async () => { providerCalled = true; return { proposal_id: proposal.id, proposal_revision: 3, decision: 'approve', rationale: 'looks good' }; }
  });
  assert.equal(unsafe.eligibleForApproval, false);
  assert.equal(providerCalled, false, 'provider must not be called for unsafe proposal');

  const noProvider = await runAIReview({ proposal, safetyReview: { ok: true, reasons: [] } });
  assert.equal(noProvider.eligibleForApproval, false);

  const providerError = await runAIReview({
    proposal, safetyReview: { ok: true, reasons: [] },
    invokeAI: async () => { throw new Error('simulated provider outage'); }
  });
  assert.equal(providerError.eligibleForApproval, false);
  assert.match(providerError.rationale, /失败或超时/);

  const timeout = await runAIReview({
    proposal, safetyReview: { ok: true, reasons: [] }, timeoutMs: 5,
    invokeAI: async () => new Promise(resolve => setTimeout(() => resolve({
      proposal_id: proposal.id, proposal_revision: 3, decision: 'approve', rationale: '位置合理，描述清楚。'
    }), 30))
  });
  assert.equal(timeout.eligibleForApproval, false);

  const success = await runAIReview({
    proposal, safetyReview: { ok: true, reasons: [] },
    invokeAI: async ({ proposal: submitted, requiredResponse }) => {
      assert.equal(submitted.id, proposal.id);
      assert.deepEqual(requiredResponse.decisions, ['approve', 'revise', 'reject']);
      return { proposal_id: proposal.id, proposal_revision: 3, decision: 'approve', rationale: '位置合理，描述清楚。' };
    }
  });
  assert.equal(success.eligibleForApproval, true);
  assert.equal(success.execution, 'not-authorized');
});
