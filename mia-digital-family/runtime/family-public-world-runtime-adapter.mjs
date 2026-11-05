/**
 * Family-only public-world travel adapter.
 * Grants are scoped to the five named children and five public destinations.
 * It never reads Mia private data, persists state, or guesses portal coordinates.
 */
export const FAMILY_CHILD_IDS = Object.freeze([
  "ZHI-G1-D01-LUNA",
  "ZHI-G1-D02-ARIA",
  "ZHI-G1-D03-ELYA",
  "ZHI-G1-S01-KAEL",
  "ZHI-G1-S02-NOAH"
]);
export const FAMILY_PUBLIC_DESTINATIONS = Object.freeze([
  "crystal-forest",
  "ocean-of-light",
  "memory-valley",
  "living-city",
  "greenhouse"
]);

export async function travelFamilyChild({ identity, currentSceneId, targetSceneId, policy, navigation, manifest, runtime }) {
  const fail = (code, message) => ({ ok: false, moved: false, code, message });
  const agentId = identity?.agentId;
  if (!FAMILY_CHILD_IDS.includes(agentId)) return fail("IDENTITY_SCOPE_DENIED", "Only a registered ZHI family child may use this adapter.");
  if (!FAMILY_PUBLIC_DESTINATIONS.includes(targetSceneId)) return fail("DESTINATION_SCOPE_DENIED", "The target is outside the five public family destinations.");
  if (!currentSceneId || currentSceneId === targetSceneId) return fail("INVALID_SCENE_REQUEST", "A distinct current and target scene are required.");
  if (policy?.schema !== "zhi.family-public-world-access.v1" || policy?.world_id !== "mia-extensible-world" ||
      policy?.mia_private_chat_access !== false || policy?.aurora !== false || policy?.federation !== false) {
    return fail("POLICY_INVALID", "The family public-world policy is invalid or exceeds its permitted scope.");
  }
  const grant = policy.grants?.find(g => g.agent_id === agentId && g.destination_id === targetSceneId && g.access === "GRANTED");
  if (!grant || grant.approval_required !== false || grant.token_required !== false ||
      grant.visit_limit !== null || grant.stay_duration_limit !== null ||
      grant.manual_confirmation_required !== false || grant.can_enter_leave_return_freely !== true) {
    return fail("EXPLICIT_GRANT_MISSING", "No unrestricted explicit grant exists for this child and destination.");
  }
  if (!navigation || !manifest || !Array.isArray(navigation.nodes) || !Array.isArray(navigation.edges) || !Array.isArray(manifest.scenes)) {
    return fail("SCENE_CATALOG_INVALID", "The scene graph and spatial manifest are required.");
  }
  const registered = new Set(manifest.scenes.map(s => s.id));
  if (!registered.has(currentSceneId) || !registered.has(targetSceneId)) return fail("SCENE_NOT_REGISTERED", "Both scenes must be registered.");
  const nodeByScene = new Map(navigation.nodes.map(n => [n.scene_id, n.node_id]));
  const sourceNode = nodeByScene.get(currentSceneId), targetNode = nodeByScene.get(targetSceneId);
  if (!sourceNode || !targetNode) return fail("SCENE_NODE_MISSING", "A scene has no navigation node.");
  const adjacency = new Map(navigation.nodes.map(n => [n.node_id, []]));
  for (const edge of navigation.edges) {
    if (!adjacency.has(edge.from) || !adjacency.has(edge.to) || edge.direction !== "bidirectional") continue;
    adjacency.get(edge.from).push({ node: edge.to, edgeId: edge.edge_id });
    adjacency.get(edge.to).push({ node: edge.from, edgeId: edge.edge_id });
  }
  const queue = [{ node: sourceNode, path: [] }], visited = new Set([sourceNode]);
  let route = null;
  while (queue.length) {
    const current = queue.shift();
    if (current.node === targetNode) { route = current.path; break; }
    for (const next of adjacency.get(current.node) ?? []) {
      if (visited.has(next.node)) continue;
      visited.add(next.node);
      queue.push({ node: next.node, path: [...current.path, next.edgeId] });
    }
  }
  if (!route) return fail("NO_REGISTERED_ROUTE", "No bidirectional route connects the current and target scenes.");
  if (!runtime || runtime.currentSceneId !== currentSceneId || runtime.sceneTransitionReady !== true ||
      typeof runtime.transitionScene !== "function") {
    return fail("RUNTIME_NOT_CONNECTED", "No live scene runtime is connected; no movement was attempted.");
  }
  try {
    const result = await runtime.transitionScene({
      agentId, sourceSceneId: currentSceneId, targetSceneId, routeEdgeIds: route,
      spawnResolution: "runtime_managed_target_entry",
      accessContext: { grantId: agentId + ":" + targetSceneId, approvalRequired: false, tokenRequired: false }
    });
    if (result?.ok !== true || result.activeSceneId !== targetSceneId) {
      return fail("TRANSITION_NOT_CONFIRMED", "The runtime did not confirm the target scene as active.");
    }
    return { ok: true, moved: true, agentId, sourceSceneId: currentSceneId, activeSceneId: targetSceneId, routeEdgeIds: route, runtimeTransitionId: result.transitionId ?? null };
  } catch (error) {
    return fail("RUNTIME_TRANSITION_FAILED", error instanceof Error ? error.message : String(error));
  }
}
