/** Pure validator for prototype-Mia browser-local scene plans. */
const PUBLIC_DESTINATIONS = new Set([
  "crystal-forest",
  "ocean-of-light",
  "memory-valley",
  "living-city",
  "greenhouse",
]);

export function validateMiaScenePlan(plan, frame) {
  const action = String(plan?.action || "");
  const sceneId = String(plan?.scene_id || "");
  const anchorId = String(plan?.anchor_id || "");
  const currentSceneId = String(frame?.scene?.id || "");
  const anchors = Array.isArray(frame?.scene?.available_anchors)
    ? frame.scene.available_anchors
    : [];

  if (action === "visit_scene") {
    if (!PUBLIC_DESTINATIONS.has(sceneId)) {
      return { valid: false, error: "目标场景 ID 不属于已登记的五处公共目的地。" };
    }
    if (sceneId === currentSceneId) {
      return { valid: false, error: "规划器选择了当前所在场景；请改选已登记锚点、其他目的地或 wait。" };
    }
    return { valid: true, error: null };
  }
  if (action === "visit_anchor") {
    if (sceneId !== currentSceneId) {
      return { valid: false, error: "锚点目标场景与当前场景不一致。" };
    }
    if (!anchors.some((anchor) => anchor?.id === anchorId)) {
      return { valid: false, error: "目标锚点未在当前场景帧登记。" };
    }
    return { valid: true, error: null };
  }
  if (action === "return_forest") {
    return sceneId === "mia-forest-corner"
      ? { valid: true, error: null }
      : { valid: false, error: "返回森林角落的目标 ID 不正确。" };
  }
  if (action === "wait" || action === "report_unknown") {
    return { valid: true, error: null };
  }
  return { valid: false, error: "探索动作不在允许列表中。" };
}
