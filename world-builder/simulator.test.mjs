import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePalette, scoreProposal, evaluateRegion, createSandboxProposal } from './simulator.mjs';

const profile = JSON.parse(await readFile(new URL('./aesthetic-profile.v1.json', import.meta.url), 'utf8'));
const candidate = { texture_metrics: { gold_consensus: 0.8, yellow_vitality: 0.6, green_spontaneity: 0.9 }, abstract_intent: 'candidate supplied by a generator adapter' };

test('default palette is 4:3:3 and sums to one', () => {
  assert.deepEqual(profile.palette, { gold_consensus: 0.4, yellow_vitality: 0.3, green_spontaneity: 0.3 });
  assert.equal(validatePalette().ok, true);
});

test('rejects invalid or unnormalized palette', () => {
  assert.equal(validatePalette({ gold_consensus: 0.5, yellow_vitality: 0.3, green_spontaneity: 0.3 }).ok, false);
  assert.equal(validatePalette({ gold_consensus: -0.1, yellow_vitality: 0.6, green_spontaneity: 0.5 }).ok, false);
});

test('scores a proposal using the palette weights', () => {
  const result = scoreProposal(candidate);
  assert.equal(result.ok, true);
  assert.equal(result.score, 0.77);
});

test('freezes a region only after minimum sample size and rate strictly exceeds 10%', () => {
  assert.equal(evaluateRegion({ checks_total: 19, logic_errors: 19 }).frozen, false);
  assert.equal(evaluateRegion({ checks_total: 20, logic_errors: 2 }).frozen, false);
  assert.equal(evaluateRegion({ checks_total: 20, logic_errors: 3 }).frozen, true);
});

test('invalid oracle sample fails closed', () => {
  assert.equal(evaluateRegion({ checks_total: 10, logic_errors: 11 }).frozen, true);
  assert.equal(evaluateRegion({ checks_total: -1, logic_errors: 0 }).valid, false);
});

test('sandbox proposal ledger never debits, rewards, or burns real ZHI', () => {
  const result = createSandboxProposal(candidate, { regionId: 'forest-candidate-region', computeUnits: 4, stakeUnits: 7 });
  assert.equal(result.ok, true);
  assert.equal(result.production_write, false);
  assert.deepEqual(result.resource_ledger, {
    compute_units_simulated: 4, stake_units_simulated: 7, actual_zhi_debit: 0, actual_reward: 0, actual_burn: 0
  });
});

test('rejects negative simulated resource budgets', () => {
  assert.equal(createSandboxProposal(candidate, { regionId: 'region-a', computeUnits: -1 }).ok, false);
});
