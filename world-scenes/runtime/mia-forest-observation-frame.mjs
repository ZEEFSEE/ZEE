/**
 * Local semantic observation-frame builder for prototype Mia's Forest Corner.
 * This serializes authored scene facts; it is not camera vision or a Mia API.
 * No network, persistence, chat, memory, personality, emotion, or DB access.
 */
export function createForestObservationFrame({ scene, navigation, runtimeStatus = "preview-only", cameraPose = null, now = new Date() }) {
  if (scene?.slug !== "mia-forest-corner") throw new Error("Only prototype Mia Forest Corner is accepted");
  if (!Array.isArray(scene.entities)) throw new Error("Scene entities are required");
  const entities = scene.entities.map((entity) => ({
    id: entity.id,
    name: entity.name,
    type: entity.type,
    status: entity.status ?? "unknown",
    position: {
      x: entity.x,
      y: entity.y,
      z: null,
      coordinate_space: "scene-local",
      units: "relative-layout-units"
    },
    source: "mia/forest-corner.json",
    perception_mode: "authored-semantic-data"
  }));
  const edges = Array.isArray(navigation?.edges) ? navigation.edges.map((edge) => ({
    id: edge.edge_id,
    from: edge.from,
    to: edge.to,
    traversal_status: edge.traversal_status ?? "unknown",
    runtime_registered: edge.runtime_registered === true
  })) : [];
  return {
    schema: "zhi.mia.scene-observation-frame.v1",
    frame_id: `mia-forest-corner-${now.getTime()}`,
    generated_at: now.toISOString(),
    subject: "prototype-mia",
    scene: {
      id: scene.slug,
      name: scene.name,
      coordinate_space: "scene-local",
      dimensions: { width: scene.local_coordinate_system?.width ?? null, height: scene.local_coordinate_system?.height ?? null, depth: null },
      calibration_status: "uncalibrated-layout-only"
    },
    runtime: {
      instance: "mia-forest-corner-3d-preview",
      status: runtimeStatus,
      physical_movement: false,
      collision_registered: false,
      navigation_active: false,
      live_camera_perception: false
    },
    camera_pose: cameraPose,
    entities,
    navigation: {
      graph_status: "authored-not-registered",
      node_count: Array.isArray(navigation?.nodes) ? navigation.nodes.length : 0,
      edges
    },
    provenance: {
      source_files: ["mia/forest-corner.json", "world-scenes/mia-assets/navigation.json"],
      data_class: "source-backed-semantic-scene-description",
      not_a_visual_perception_claim: true
    },
    restrictions: {
      may_drive_movement: false,
      may_write_chat_or_memory: false,
      may_write_database: false,
      may_enable_cross_scene_travel: false
    }
  };
}
