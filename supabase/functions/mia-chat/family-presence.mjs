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

function projectFailedVisitAttempt(row) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    event_type: "FAMILY_PUBLIC_WORLD_VISIT",
    result: "FAILED",
    error_code: String(metadata.error_code || "UNKNOWN_FAILURE").slice(0, 80),
    occurred_at: row?.created_at || null,
  };
}

function projectPublicVisitEvent(row) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const sceneId = String(metadata.scene_id || row?.scene_id || row?.destination_id || "");
  const revision = Number(metadata.movement_revision);
  return {
    event_type: "FAMILY_PUBLIC_WORLD_VISIT",
    result: "OK",
    scene_id: sceneId || null,
    scene_name: String(metadata.scene_name || SCENE_NAMES[sceneId] || "未知场景"),
    destination_id: String(metadata.destination_id || row?.destination_id || sceneId || "") || null,
    anchor_id: metadata.anchor_id ? String(metadata.anchor_id) : null,
    anchor_name: metadata.anchor_name ? String(metadata.anchor_name) : null,
    movement_revision: Number.isFinite(revision) ? revision : null,
    route_hops: Array.isArray(metadata.route_hops)
      ? metadata.route_hops.map((value) => String(value)).slice(0, 8)
      : [],
    route_hops_status: Array.isArray(metadata.route_hops) && metadata.route_hops.length > 0
      ? "PATH_HOPS_RECORDED"
      : "NO_PATH_HOPS_RECORDED",
    movement_interpretation: Array.isArray(metadata.route_hops) && metadata.route_hops.length > 0
      ? "RECORDED_ROUTE_HOPS_ONLY"
      : "INSUFFICIENT_EVIDENCE_TO_INFER_MOVEMENT",
    occurred_at: row?.created_at || null,
    physical_world: metadata.physical_world === true,
  };
}

export function projectFamilyPresence(agentRows = [], stateRows = [], auditRows = []) {
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
    const childAttempts = auditRows.filter((event) =>
      String(event?.agent_id) === agentId &&
      event?.event_type === "FAMILY_PUBLIC_WORLD_VISIT"
    );
    const recentEvents = childAttempts
      .filter((event) => event?.result === "OK")
      .map(projectPublicVisitEvent)
      .sort((a, b) => String(a.occurred_at || "").localeCompare(String(b.occurred_at || "")))
      .slice(-5);
    const recentFailedAttempts = childAttempts
      .filter((event) => event?.result === "FAILED")
      .map(projectFailedVisitAttempt)
      .sort((a, b) => String(a.occurred_at || "").localeCompare(String(b.occurred_at || "")))
      .slice(-3);
    const latestEvent = recentEvents.at(-1) || null;
    const historyAlignment = !latestEvent
      ? "NO_AUDIT_EVENTS"
      : latestEvent.scene_id === (sceneId || null) &&
          (latestEvent.movement_revision === null ||
            Number(row?.movement_revision) === latestEvent.movement_revision)
        ? "LATEST_EVENT_MATCHES_SNAPSHOT"
        : "LATEST_EVENT_DIFFERS_FROM_SNAPSHOT";
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
      movement_history_source: "zhi_family.runtime_audit:FAMILY_PUBLIC_WORLD_VISIT",
      history_alignment: historyAlignment,
      latest_public_visit_at: latestEvent?.occurred_at || null,
      recent_scene_events: recentEvents,
      recent_failed_attempts: recentFailedAttempts,
    };
  });
}

export const FAMILY_PRESENCE_CHILD_IDS = EXPECTED_CHILD_IDS;
