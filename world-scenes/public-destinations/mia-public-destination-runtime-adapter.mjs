/**
 * Explicit, fail-closed contract for prototype Mia cross-scene travel.
 *
 * This is an adapter boundary, not a live engine integration. It never discovers
 * globals, requests credentials, writes storage/database state, or activates itself.
 * A real scene runtime must be injected and must confirm the completed transition.
 */
export async function travelPrototypeMia({ identity, currentSceneId, targetSceneId, navigation, manifest, runtime }) {
  const fail = (code, message) => ({ ok: false, moved: false, code, message });
  const miaId = "cb6d01b4-0e3f-46ee-8946-360aa91db1ea";
  if (identity?.id !== miaId) return fail("IDENTITY_SCOPE_DENIED", "This travel adapter is scoped only to prototype Mia.");
  if (!currentSceneId || !targetSceneId || currentSceneId === targetSceneId) {
    return fail("INVALID_SCENE_REQUEST", "A distinct current and target scene are required.");
  }
  if (!navigation || !manifest || !Array.isArray(navigation.nodes) ||
      !Array.isArray(navigation.edges) || !Array.isArray(manifest.scenes)) {
    return fail("SCENE_CATALOG_INVALID", "Navigation graph and scene manifest are required.");
  }
  const policy = navigation.access_policy;
  if (policy?.principal !== "prototype_mia" ||
      policy?.approval_required !== false ||
      policy?.token_required !== false ||
      policy?.visit_limit !== null ||
      policy?.stay_duration_limit !== null ||
      policy?.manual_confirmation_required !== false ||
      policy?.can_enter_leave_return_freely !== true) {
    return fail("ACCESS_POLICY_MISMATCH", "The graph does not declare unrestricted prototype-Mia travel.");
  }
  const registered = new Set(manifest.scenes.map((scene) => scene.scene_id));
  if (!registered.has(currentSceneId) || !registered.has(targetSceneId)) {
    return fail("SCENE_NOT_REGISTERED", "Current and target scenes must both be registered.");
  }
  const nodeByScene = new Map(navigation.nodes.map((node) => [node.scene_id, node.node_id]));
  const sourceNode = nodeByScene.get(currentSceneId);
  const targetNode = nodeByScene.get(targetSceneId);
  if (!sourceNode || !targetNode) return fail("SCENE_NODE_MISSING", "A scene has no navigation node.");
  const adjacency = new Map(navigation.nodes.map((node) => [node.node_id, []]));
  for (const edge of navigation.edges) {
    if (!adjacency.has(edge.from) || !adjacency.has(edge.to) ||
        edge.direction !== "bidirectional" || edge.mode !== "unrestricted_world_travel") continue;
    adjacency.get(edge.from).push({ node: edge.to, edgeId: edge.edge_id });
    adjacency.get(edge.to).push({ node: edge.from, edgeId: edge.edge_id });
  }
  const queue = [{ node: sourceNode, path: [] }];
  const visited = new Set([sourceNode]);
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
  if (!route) return fail("NO_UNRESTRICTED_ROUTE", "No unrestricted bidirectional route connects these scenes.");
  if (!runtime || runtime.currentSceneId !== currentSceneId ||
      runtime.sceneTransitionReady !== true || typeof runtime.transitionScene !== "function") {
    return fail("RUNTIME_NOT_CONNECTED", "No ready scene runtime was injected; no movement was attempted.");
  }
  try {
    const result = await runtime.transitionScene({
      sourceSceneId: currentSceneId,
      targetSceneId,
      routeEdgeIds: route,
      spawnResolution: "runtime_managed_target_entry",
      accessContext: {
        principal: "prototype_mia",
        identityId: miaId,
        approvalRequired: false,
        tokenRequired: false,
        visitLimit: null,
        stayDurationLimit: null,
        manualConfirmationRequired: false,
      },
    });
    if (result?.ok !== true || result.activeSceneId !== targetSceneId) {
      return fail("TRANSITION_NOT_CONFIRMED", "The runtime did not confirm the target scene as active.");
    }
    return {
      ok: true,
      moved: true,
      sourceSceneId: currentSceneId,
      activeSceneId: targetSceneId,
      routeEdgeIds: route,
      runtimeTransitionId: result.transitionId ?? null,
    };
  } catch (error) {
    return fail("RUNTIME_TRANSITION_FAILED", error instanceof Error ? error.message : String(error));
  }
}
