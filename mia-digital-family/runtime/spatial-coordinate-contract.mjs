/**
 * Versioned coordinate and portal contract for the isolated ZHI family prototype.
 * Scene-local metres and authored virtual-world placement are distinct frames.
 * Portal handoffs are discontinuous scene changes, never inferred continuous travel.
 */
export const COORDINATE_CONTRACT_VERSION = "zhi.family.spatial-coordinate-contract.v1";
export const WORLD_SPACE = "zhi-mia-virtual-world-v1";

const REQUIRED_DESTINATIONS = Object.freeze([
  "crystal-forest",
  "ocean-of-light",
  "memory-valley",
  "living-city",
  "greenhouse"
]);

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.z);
}

export function createSpatialCoordinateContract(manifest) {
  if (manifest?.schema !== "zhi.mia.public-world.spatial-manifest.v1") {
    throw new TypeError("unsupported source spatial manifest");
  }
  const scale = manifest.coordinate_contract?.meters_per_layout_unit;
  if (manifest.coordinate_contract?.unit !== "meter" || scale !== 0.02) {
    throw new TypeError("unsupported coordinate unit or layout scale");
  }
  const scenes = new Map((manifest.scenes ?? []).map(scene => [scene.id, scene]));
  if (scenes.size !== 6 || !scenes.has("mia-forest-corner")) {
    throw new TypeError("expected Forest Corner and five destination scenes");
  }
  for (const id of REQUIRED_DESTINATIONS) {
    if (!scenes.has(id)) throw new TypeError("missing destination scene: " + id);
  }

  const sceneFrames = [...scenes.values()].map(scene => {
    if (!finitePoint(scene.origin) || !finitePoint(scene.spawn) || !finitePoint(scene.portal)) {
      throw new TypeError("scene requires finite origin, spawn and portal: " + scene.id);
    }
    return Object.freeze({
      sceneId: scene.id,
      unit: "m",
      localFrame: "scene-local",
      worldFrame: WORLD_SPACE,
      origin: Object.freeze({ x: scene.origin.x, y: scene.origin.y ?? 0, z: scene.origin.z }),
      layoutToLocalScale: scale,
      localToWorld: Object.freeze({
        x: "worldX = originX + localX",
        y: "worldY = originY + localY",
        z: "worldZ = originZ + localZ"
      }),
      spawn: Object.freeze({ x: scene.spawn.x, z: scene.spawn.z }),
      portal: Object.freeze({ x: scene.portal.x, z: scene.portal.z })
    });
  });

  const transitions = (manifest.scene_transitions ?? []).map(edge => {
    const sourceScene = scenes.get(edge.from_scene_id);
    const targetScene = scenes.get(edge.to_scene_id);
    if (!sourceScene || !targetScene) throw new TypeError("transition references unknown scene: " + edge.transition_id);
    if (!finitePoint(edge.source?.scene_local) || !finitePoint(edge.target?.scene_local) ||
        !finitePoint(edge.source?.world_authored) || !finitePoint(edge.target?.world_authored)) {
      throw new TypeError("transition requires finite local and authored-world anchors: " + edge.transition_id);
    }
    const expectedSource = {
      x: sourceScene.origin.x + edge.source.scene_local.x,
      z: sourceScene.origin.z + edge.source.scene_local.z
    };
    const expectedTarget = {
      x: targetScene.origin.x + edge.target.scene_local.x,
      z: targetScene.origin.z + edge.target.scene_local.z
    };
    if (Math.abs(expectedSource.x - edge.source.world_authored.x) > 1e-9 ||
        Math.abs(expectedSource.z - edge.source.world_authored.z) > 1e-9 ||
        Math.abs(expectedTarget.x - edge.target.world_authored.x) > 1e-9 ||
        Math.abs(expectedTarget.z - edge.target.world_authored.z) > 1e-9) {
      throw new TypeError("authored world anchor does not match scene frame: " + edge.transition_id);
    }
    const translation = Object.freeze({
      x: edge.target.scene_local.x - edge.source.scene_local.x,
      z: edge.target.scene_local.z - edge.source.scene_local.z
    });
    return Object.freeze({
      transitionId: edge.transition_id,
      fromSceneId: edge.from_scene_id,
      toSceneId: edge.to_scene_id,
      mode: "explicit-scene-portal-handoff",
      continuousWalkPath: false,
      unit: "m",
      sourceAnchorId: edge.source.anchor_id,
      targetAnchorId: edge.target.anchor_id,
      sourceLocal: Object.freeze({ x: edge.source.scene_local.x, z: edge.source.scene_local.z }),
      targetLocal: Object.freeze({ x: edge.target.scene_local.x, z: edge.target.scene_local.z }),
      sourceToTargetLocal: Object.freeze({ rotationYRadians: 0, translation }),
      runtimeStatus: "contract_only_runtime_validation_pending"
    });
  });

  return Object.freeze({
    schema: COORDINATE_CONTRACT_VERSION,
    sourceManifestSchema: manifest.schema,
    worldSpace: WORLD_SPACE,
    unit: "m",
    layoutToLocalScale: scale,
    calibration: "authored_virtual_coordinates_not_physical_survey",
    scenes: Object.freeze(sceneFrames),
    transitions: Object.freeze(transitions)
  });
}

export function layoutPointToSceneLocal(point, scale = 0.02) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      !Number.isFinite(scale) || scale <= 0) throw new TypeError("finite layout point and positive scale required");
  return Object.freeze({ x: point.x * scale, z: point.y * scale, unit: "m" });
}

export function sceneLocalToAuthoredWorld(frame, point) {
  if (!frame || !finitePoint(frame.origin) || !finitePoint(point)) {
    throw new TypeError("scene frame and finite local point required");
  }
  return Object.freeze({
    x: frame.origin.x + point.x,
    y: frame.origin.y ?? 0,
    z: frame.origin.z + point.z,
    unit: "m",
    space: WORLD_SPACE
  });
}

export function mapPortalPoint(transition, point) {
  if (!transition || !finitePoint(point)) throw new TypeError("portal transition and finite point required");
  return Object.freeze({
    x: point.x + transition.sourceToTargetLocal.translation.x,
    z: point.z + transition.sourceToTargetLocal.translation.z,
    unit: "m"
  });
}
