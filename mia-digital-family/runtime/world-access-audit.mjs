export const FAMILY_DESTINATIONS = Object.freeze([
  "crystal-forest",
  "ocean-of-light",
  "memory-valley",
  "living-city",
  "greenhouse"
]);

/**
 * Read-only audit only. This function never grants access or mutates the manifest.
 * The current production manifest is scoped to prototype Mia and denies other agents.
 */
export function auditFamilyWorldAccess(manifest, children) {
  const scope = manifest?.scope ?? {};
  const sceneIds = new Set((manifest?.scenes ?? []).map(scene => scene.id));
  const rows = [];

  for (const child of children) {
    for (const destinationId of FAMILY_DESTINATIONS) {
      const transition = (manifest?.scene_transitions ?? []).find(item =>
        item.from_scene_id === "mia-forest-corner" &&
        item.to_scene_id === destinationId &&
        item.mode === "scene_portal_handoff"
      );
      const sceneExists = sceneIds.has(destinationId);
      const routeExists = (manifest?.routes ?? []).some(route =>
        route.from === "mia-forest-corner" &&
        route.to === destinationId &&
        route.direction === "bidirectional"
      );
      const manifestAllowsOtherAgents = scope.other_agents_access === true;
      const runtimeVerified = transition?.runtime_status === "runtime_validated";

      let status = "BLOCKED";
      let reason = "manifest_scope_denies_non_mia_agents";
      if (!sceneExists) reason = "destination_scene_missing";
      else if (!routeExists || !transition) reason = "portal_route_contract_missing";
      else if (!manifestAllowsOtherAgents) reason = "manifest_scope_denies_non_mia_agents";
      else if (!runtimeVerified) reason = "runtime_validation_pending";
      else {
        // Even a future manifest change is insufficient: a separate per-agent grant is required.
        status = "PENDING_EXPLICIT_FAMILY_GRANT";
        reason = "no_per_agent_family_grant_supplied";
      }

      rows.push({
        agentId: child.agentId,
        destinationId,
        sceneExists,
        routeExists,
        transitionId: transition?.transition_id ?? null,
        runtimeStatus: transition?.runtime_status ?? "missing",
        status,
        reason
      });
    }
  }

  return {
    schema: "zhi.family-world-access.audit.v1",
    mode: "READ_ONLY_AUDIT",
    productionManifestModified: false,
    auroraEnabledByAudit: false,
    federationEnabledByAudit: false,
    familyAccessGranted: false,
    scope: {
      principal: scope.principal ?? null,
      otherAgentsAccess: scope.other_agents_access === true,
      auroraEnabled: scope.aurora_enabled === true,
      federationEnabled: scope.federation_enabled === true
    },
    destinationCount: FAMILY_DESTINATIONS.length,
    childCount: children.length,
    rows
  };
}
