/**
 * Fail-closed, opt-in adapter for a future Mia scene runtime.
 *
 * This module does not discover globals, make network requests, write to a
 * database, or auto-register itself. A caller must explicitly inject a runtime
 * implementing the documented contract. Production activation is refused until
 * scene-local XY and runtime depth mapping have been verified.
 */
export function registerStonePath({ asset, navigation, runtime }) {
  const fail = (code, message) => ({ ok: false, activated: false, code, message });
  if (!asset || !navigation || !runtime) {
    return fail("MISSING_INPUT", "Asset, navigation graph, and runtime adapter are required.");
  }
  if (asset.asset_id !== "stone-path-forest-to-lounge" ||
      asset.scene_id !== "mia-forest-corner" ||
      navigation.scene_id !== asset.scene_id) {
    return fail("SCENE_MISMATCH", "Asset and navigation graph must target the same expected scene.");
  }
  if (runtime.sceneId !== asset.scene_id) {
    return fail("RUNTIME_SCENE_MISMATCH", "Injected runtime is not bound to mia-forest-corner.");
  }
  if (runtime.coordinateSpace !== "scene-local") {
    return fail("COORDINATE_SPACE_UNVERIFIED", "Runtime must explicitly declare scene-local coordinates.");
  }
  if (runtime.depthMappingVerified !== true) {
    return fail("DEPTH_MAPPING_UNVERIFIED", "Runtime depth/Z mapping is not verified; no registration performed.");
  }

  const required = [
    "addPolygonPrism",
    "addPolygonCollider",
    "registerNavigationEdge",
    "removeMesh",
    "removeCollider",
    "removeNavigationEdge",
  ];
  const missing = required.filter((name) => typeof runtime[name] !== "function");
  if (missing.length) {
    return fail("RUNTIME_CAPABILITY_MISSING", `Missing runtime methods: ${missing.join(", ")}.`);
  }

  const slabs = asset.visual_mesh?.slabs;
  const colliders = asset.collision?.colliders;
  const edges = navigation.edges;
  if (!Array.isArray(slabs) || !Array.isArray(colliders) || !Array.isArray(edges) ||
      slabs.length !== 5 || colliders.length !== slabs.length || edges.length !== 6) {
    return fail("ASSET_CONTRACT_INVALID", "Expected five slabs/colliders and six navigation edges.");
  }
  if (edges.some((edge) => edge.runtime_registered !== false ||
      edge.traversal_status !== "authored_pending_runtime_validation")) {
    return fail("NAVIGATION_STATE_UNEXPECTED", "Graph must remain authored/unregistered before adapter activation.");
  }

  const createdMeshes = [];
  const createdColliders = [];
  const createdEdges = [];
  try {
    for (const slab of slabs) {
      const meshHandle = runtime.addPolygonPrism({
        sceneId: asset.scene_id,
        coordinateSpace: "scene-local",
        id: slab.id,
        polygonXY: slab.polygon_xy,
        zMin: slab.z_min,
        zMax: slab.z_max,
        material: slab.material,
      });
      if (meshHandle == null) throw new Error(`Mesh registration returned no handle: ${slab.id}`);
      createdMeshes.push(meshHandle);

      const collider = colliders.find((item) => item.mesh_id === slab.id);
      if (!collider) throw new Error(`Collider missing for slab: ${slab.id}`);
      const colliderHandle = runtime.addPolygonCollider({
        sceneId: asset.scene_id,
        coordinateSpace: "scene-local",
        id: collider.collider_id ?? `${slab.id}-collider`,
        polygonXY: collider.polygon_xy,
        zMin: slab.z_min,
        zMax: slab.z_max,
      });
      if (colliderHandle == null) throw new Error(`Collider registration returned no handle: ${slab.id}`);
      createdColliders.push(colliderHandle);
    }
    for (const edge of edges) {
      const handle = runtime.registerNavigationEdge({
        sceneId: asset.scene_id,
        coordinateSpace: "scene-local",
        edge,
      });
      if (handle == null) throw new Error(`Navigation registration returned no handle: ${edge.edge_id}`);
      createdEdges.push(handle);
    }
    return {
      ok: true,
      activated: true,
      sceneId: asset.scene_id,
      registered: { meshes: createdMeshes.length, colliders: createdColliders.length, navigationEdges: createdEdges.length },
      rollback() {
        for (const handle of [...createdEdges].reverse()) runtime.removeNavigationEdge(handle);
        for (const handle of [...createdColliders].reverse()) runtime.removeCollider(handle);
        for (const handle of [...createdMeshes].reverse()) runtime.removeMesh(handle);
      },
    };
  } catch (error) {
    for (const handle of [...createdEdges].reverse()) {
      try { runtime.removeNavigationEdge(handle); } catch {}
    }
    for (const handle of [...createdColliders].reverse()) {
      try { runtime.removeCollider(handle); } catch {}
    }
    for (const handle of [...createdMeshes].reverse()) {
      try { runtime.removeMesh(handle); } catch {}
    }
    return fail("REGISTRATION_FAILED_ROLLED_BACK", error instanceof Error ? error.message : String(error));
  }
}
