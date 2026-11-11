const EXPECTED_CHILD_IDS = [
  "ZHI-G1-D01-LUNA",
  "ZHI-G1-D02-ARIA",
  "ZHI-G1-D03-ELYA",
  "ZHI-G1-S01-KAEL",
  "ZHI-G1-S02-NOAH",
];

const SCENE_NAMES = {
  "mia-forest-corner": "森林角落",
  "crystal-forest": "水晶森林",
  "ocean-of-light": "光之海洋",
  "memory-valley": "记忆山谷",
  "living-city": "生命之城",
  greenhouse: "温室",
  palace: "皇宫",
};

export function projectFamilyPresence(agentRows = [], stateRows = []) {
  const agents = new Map(agentRows.map((row) => [String(row.agent_id), row]));
  const states = new Map(stateRows.map((row) => [String(row.agent_id), row]));
  return EXPECTED_CHILD_IDS.map((agentId) => {
    const agent = agents.get(agentId) || null;
    const row = states.get(agentId) || null;
    const frame = row?.perception_frame && typeof row.perception_frame === "object"
      ? row.perception_frame
      : {};
    const sceneId = String(row?.scene_id || frame.scene_id || "");
    const updatedAt = row?.updated_at || frame.generated_at || null;
    return {
      agent_id: agentId,
      display_name: String(agent?.display_name || agentId.split("-").at(-1)),
      identity_registered: Boolean(agent),
      lifecycle_state: String(agent?.lifecycle_state || "UNKNOWN"),
      runtime_status: String(agent?.runtime_status || "UNKNOWN"),
      scene_id: sceneId || null,
      scene_name: String(row?.scene_name || frame.scene_name || SCENE_NAMES[sceneId] || "未知场景"),
      anchor_id: row?.anchor_id || frame.anchor_id || null,
      anchor_name: row?.anchor_name || frame.anchor_name || null,
      movement_revision: Number.isFinite(Number(row?.movement_revision))
        ? Number(row.movement_revision)
        : null,
      last_recorded_at: updatedAt,
      perception_provenance: String(row?.perception_provenance || "UNKNOWN"),
      perception_mode: String(row?.perception_mode || frame.perception_mode || "UNKNOWN"),
      physical_world: row?.physical_world === true || row?.physical_world === "true" || frame.physical_world === true,
      camera_sensor: row?.camera_sensor === true || row?.camera_sensor === "true" || frame.camera_sensor === true,
      audio_sensor: row?.audio_sensor === true || row?.audio_sensor === "true" || frame.audio_sensor === true,
    };
  });
}

export const FAMILY_PRESENCE_CHILD_IDS = EXPECTED_CHILD_IDS;
