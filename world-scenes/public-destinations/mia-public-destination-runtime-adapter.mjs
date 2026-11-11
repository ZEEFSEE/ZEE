/**
 * Explicit scene-transition adapter for all agents in the Mia world.
 * No registration, invitation, approval, token, whitelist, or manual confirmation.
 * This adapter never writes storage/database state; a real runtime must be injected
 * and must confirm the completed transition before movement is reported.
 */
export async function travelMiaWorldAgent({ identity = null, currentSceneId, targetSceneId, navigation, manifest, runtime }) {
  const fail = (code, message) => ({ ok: false, moved: false, code, message });
  if (!currentSceneId || !targetSceneId || currentSceneId === targetSceneId) {
    return fail("INVALID_SCENE_REQUEST", "A distinct current and target scene are required.");
  }
  if (!navigation || !manifest || !Array.isArray(navigation.nodes) ||
      !Array.isArray(navigation.edges) || !Array.isArray(manifest.scenes)) {
    return fail("SCENE_CATALOG_INVALID", "Navigation graph and scene manifest are required.");
  }
  const policy = navigation.access_policy;
  if (policy?.principal !== "mia_world_agents" ||
      policy?.registration_required !== false ||
      policy?.approval_required !== false ||
      policy?.invitation_required !== false ||
      policy?.token_required !== false ||
      policy?.whitelist_required !== false ||
      policy?.manual_confirmation_required !== false ||
      policy?.visit_limit !== null ||
      policy?.stay_duration_limit !== null ||
      policy?.can_enter_leave_return_freely !== true) {
    return fail("ACCESS_POLICY_MISMATCH", "The graph does not declare free passage for all Mia-world agents.");
  }
  const sceneIds = new Set(manifest.scenes.map((scene) => scene.scene_id));
  if (!sceneIds.has(currentSceneId) || !sceneIds.has(targetSceneId)) {
    return fail("SCENE_NOT_FOUND", "The requested scene is not present in the Mia-world scene catalog.");
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
        principal: "mia_world_agents",
        agentId: identity?.id ?? null,
        registrationRequired: false,
        approvalRequired: false,
        invitationRequired: false,
        tokenRequired: false,
        whitelistRequired: false,
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
