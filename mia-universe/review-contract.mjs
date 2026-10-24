/**
 * Pure contract boundary for a future dedicated Mia universe review service.
 * This module does not call an AI provider, network, database, or world engine.
 * AI approval is only eligibility; it never executes a build by itself.
 */
const DECISIONS = new Set(['approve', 'revise', 'reject']);
const MAX_REASON_LENGTH = 800;

function failClosed(reason, proposal) {
  return {
    decision: 'revise',
    eligibleForApproval: false,
    proposalId: typeof proposal?.id === 'string' ? proposal.id : null,
    revision: Number.isSafeInteger(proposal?.revision) ? proposal.revision : null,
    rationale: reason,
    source: 'contract-fail-closed',
  };
}

/**
 * Validate a structured AI response against the exact immutable proposal revision
 * and the deterministic safety result. Accepts a plain object or JSON string.
 */
export function validateAIReview(rawReview, proposal, safetyReview) {
  let review = rawReview;
  if (typeof rawReview === 'string') {
    try { review = JSON.parse(rawReview); }
    catch { return failClosed('AI 审核结果不是有效 JSON；必须修改后重新审核。', proposal); }
  }

  if (!proposal || typeof proposal.id !== 'string' || proposal.id.length < 1 ||
      !Number.isSafeInteger(proposal.revision) || proposal.revision < 1) {
    return failClosed('提案编号或版本号无效；拒绝继续审核。', proposal);
  }
  if (!review || typeof review !== 'object' || Array.isArray(review)) {
    return failClosed('AI 审核结果格式无效；必须修改后重新审核。', proposal);
  }
  if (review.proposal_id !== proposal.id || review.proposal_revision !== proposal.revision) {
    return failClosed('AI 审核结果与当前提案版本不匹配；旧版本结果不能用于当前版本。', proposal);
  }
  if (!DECISIONS.has(review.decision)) {
    return failClosed('AI 审核决定必须是 approve、revise 或 reject。', proposal);
  }
  if (typeof review.rationale !== 'string' || review.rationale.trim().length < 3 ||
      review.rationale.trim().length > MAX_REASON_LENGTH) {
    return failClosed('AI 必须提供 3–800 字符的审核理由。', proposal);
  }

  // The deterministic safety layer is authoritative over model output.
  if (!safetyReview || safetyReview.ok !== true) {
    return {
      decision: 'revise',
      eligibleForApproval: false,
      proposalId: proposal.id,
      revision: proposal.revision,
      rationale: '安全规则未通过，AI 的批准不能覆盖安全检查。' +
        (Array.isArray(safetyReview?.reasons) ? ' ' + safetyReview.reasons.join('；') : ''),
      source: 'deterministic-safety-override',
    };
  }

  if (review.decision === 'approve') {
    return {
      decision: 'approve',
      eligibleForApproval: true,
      proposalId: proposal.id,
      revision: proposal.revision,
      rationale: review.rationale.trim(),
      source: 'validated-ai-review',
      execution: 'not-authorized',
    };
  }

  return {
    decision: review.decision,
    eligibleForApproval: false,
    proposalId: proposal.id,
    revision: proposal.revision,
    rationale: review.rationale.trim(),
    source: 'validated-ai-review',
  };
}

export const AI_REVIEW_CONTRACT = Object.freeze({
  version: 1,
  requiredFields: Object.freeze(['proposal_id', 'proposal_revision', 'decision', 'rationale']),
  decisions: Object.freeze(['approve', 'revise', 'reject']),
  maxRationaleLength: MAX_REASON_LENGTH,
  approvalMeans: 'eligible for a separate guarded approval step; not permission to execute a build',
});
