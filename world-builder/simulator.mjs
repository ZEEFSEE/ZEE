import profile from './aesthetic-profile.v1.json' with { type: 'json' };
import policy from './creator-policy.v1.json' with { type: 'json' };

export function validatePalette(palette = profile.palette) {
  const keys = ['gold_consensus', 'yellow_vitality', 'green_spontaneity'];
  if (!palette || keys.some(key => !Number.isFinite(palette[key]) || palette[key] < 0 || palette[key] > 1)) {
    return { ok: false, reason: 'palette_values_must_be_between_0_and_1' };
  }
  const total = keys.reduce((sum, key) => sum + palette[key], 0);
  if (Math.abs(total - 1) > 1e-9) return { ok: false, reason: 'palette_weights_must_sum_to_1' };
  return { ok: true, total };
}

export function scoreProposal(proposal, palette = profile.palette) {
  const weights = validatePalette(palette);
  if (!weights.ok) return { ok: false, reason: weights.reason };
  const metrics = proposal?.texture_metrics;
  const keys = ['gold_consensus', 'yellow_vitality', 'green_spontaneity'];
  if (!metrics || keys.some(key => !Number.isFinite(metrics[key]) || metrics[key] < 0 || metrics[key] > 1)) {
    return { ok: false, reason: 'texture_metrics_must_be_between_0_and_1' };
  }
  const score = keys.reduce((sum, key) => sum + metrics[key] * palette[key], 0);
  return { ok: true, score: Number(score.toFixed(6)), weights: { ...palette } };
}

export function evaluateRegion(region, policyConfig = policy) {
  const sampleSize = Number(region?.checks_total);
  const errors = Number(region?.logic_errors);
  if (!Number.isInteger(sampleSize) || sampleSize < 0 || !Number.isInteger(errors) || errors < 0 || errors > sampleSize) {
    return { valid: false, frozen: true, reason: 'invalid_or_incomplete_oracle_sample' };
  }
  const rate = sampleSize === 0 ? null : errors / sampleSize;
  const enoughData = sampleSize >= policyConfig.oracle.minimum_sample_size;
  const frozen = enoughData && rate > policyConfig.oracle.max_logic_error_rate;
  return {
    valid: true,
    sample_size: sampleSize,
    logic_error_rate: rate,
    enough_data: enoughData,
    frozen,
    reason: frozen ? 'logic_error_rate_exceeds_threshold' : enoughData ? 'within_threshold' : 'insufficient_sample_size'
  };
}

export function createSandboxProposal(input, { regionId, computeUnits = 1, stakeUnits = 1 } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'proposal_input_must_be_an_object' };
  }
  if (!regionId || typeof regionId !== 'string') return { ok: false, reason: 'region_id_required' };
  if (!Number.isFinite(computeUnits) || computeUnits < 0 || !Number.isFinite(stakeUnits) || stakeUnits < 0) {
    return { ok: false, reason: 'simulated_resource_units_must_be_nonnegative' };
  }
  const score = scoreProposal(input);
  if (!score.ok) return score;
  return {
    ok: true,
    mode: 'sandbox',
    region_id: regionId,
    proposal: structuredClone(input),
    texture_score: score.score,
    resource_ledger: {
      compute_units_simulated: computeUnits,
      stake_units_simulated: stakeUnits,
      actual_zhi_debit: 0,
      actual_reward: 0,
      actual_burn: 0
    },
    production_write: false,
    status: 'proposal_only'
  };
}

export function getPolicy() {
  return structuredClone(policy);
}
