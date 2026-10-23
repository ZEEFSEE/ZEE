export const ALLOWED_KINDS = Object.freeze(['world', 'moon', 'ring', 'life']);
export const MAX_OBJECTS = 100;
export const MIN_SPACING = 2.5;
const MAX_COORD = 250;

export function validateProposal(proposal, { objects = [], proposals = [], maxObjects = MAX_OBJECTS } = {}) {
  const reasons = [];
  if (!proposal || typeof proposal !== 'object') return { ok: false, reasons: ['方案格式无效。'] };
  if (typeof proposal.agent !== 'string' || proposal.agent.trim().length < 1 || proposal.agent.trim().length > 48) {
    reasons.push('申请智能人名称必须为 1–48 个字符。');
  }
  if (!ALLOWED_KINDS.includes(proposal.kind)) reasons.push('建造类型不在允许列表中。');
  if (typeof proposal.description !== 'string' || proposal.description.trim().length < 3 || proposal.description.length > 180) {
    reasons.push('方案说明必须为 3–180 个字符。');
  }
  if (!Array.isArray(proposal.position) || proposal.position.length !== 3 ||
      !proposal.position.every(n => Number.isFinite(n) && Math.abs(n) <= MAX_COORD)) {
    reasons.push('目标位置无效或超出宇宙边界。');
  }
  if (objects.filter(o => o && o.kind !== 'origin').length >= maxObjects) {
    reasons.push(`宇宙实体已达到安全上限（${maxObjects}）。`);
  }
  const duplicate = proposals.some(p => p && p.id !== proposal.id &&
    ['pending', 'approved'].includes(p.status) &&
    p.agent === proposal.agent && p.kind === proposal.kind &&
    (p.description || '').trim().toLocaleLowerCase() === (proposal.description || '').trim().toLocaleLowerCase());
  if (duplicate) reasons.push('发现同一智能人的重复方案，请修改后重新提交。');

  if (Array.isArray(proposal.position) && proposal.position.length === 3 &&
      proposal.position.every(Number.isFinite)) {
    const [x, y, z] = proposal.position;
    const conflict = objects.some(o => o && o.kind !== 'origin' && o.group && o.group.position &&
      (o.group.position.x - x) ** 2 + (o.group.position.y - y) ** 2 + (o.group.position.z - z) ** 2 < MIN_SPACING ** 2);
    if (conflict) reasons.push('目标位置与现有实体过近，请重新选择位置。');
  }
  return { ok: reasons.length === 0, reasons };
}

export function reviewProposal(proposal, context = {}) {
  const result = validateProposal(proposal, context);
  return {
    decision: result.ok ? 'eligible_for_approval' : 'revision_required',
    reasons: result.ok ? ['结构、重复项、空间边界、实体数量与位置冲突检查通过。'] : result.reasons,
    reviewedAt: new Date().toISOString(),
    reviewer: 'Mia prototype policy engine',
    engine: 'deterministic-rules-v1'
  };
}
