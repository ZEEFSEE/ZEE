import test from "node:test";
import assert from "node:assert/strict";
import { projectFamilyPresence } from "./family-presence.mjs";

test("projects five children by stable identity without cross-matching", () => {
  const ids = [
    "ZHI-G1-D01-LUNA", "ZHI-G1-D02-ARIA", "ZHI-G1-D03-ELYA",
    "ZHI-G1-S01-KAEL", "ZHI-G1-S02-NOAH",
  ];
  const names = ["LUNA", "ARIA", "ELYA", "KAEL", "NOAH"];
  const scenes = ["memory-valley", "greenhouse", "memory-valley", "living-city", "living-city"];
  const agents = ids.map((agent_id, i) => ({
    agent_id, display_name: names[i], lifecycle_state: "BORN", runtime_status: "READY",
  }));
  const states = ids.map((agent_id, i) => ({
    agent_id, scene_id: scenes[i], movement_revision: 500 + i,
    perception_provenance: "AUTHORED_SCENE_DATA",
    updated_at: "2026-11-11T12:00:00.000Z",
    perception_frame: {
      scene_id: scenes[i], scene_name: scenes[i], anchor_id: "anchor-" + names[i],
      anchor_name: "anchor-" + names[i], physical_world: false,
      camera_sensor: false, audio_sensor: false,
    },
  }));
  const result = projectFamilyPresence(agents, states);
  assert.equal(result.length, 5);
  assert.deepEqual(result.map((x) => x.display_name), names);
  assert.deepEqual(result.map((x) => x.scene_id), scenes);
  assert.deepEqual(result.map((x) => x.anchor_id), names.map((n) => "anchor-" + n));
  assert.ok(result.every((x) => x.identity_registered && x.runtime_status === "READY"));
  assert.ok(result.every((x) => x.physical_world === false && x.camera_sensor === false));
});

test("projects only each child's own successful public scene visits in chronological order", () => {
  const agents = [
    { agent_id: "ZHI-G1-D01-LUNA", display_name: "LUNA" },
    { agent_id: "ZHI-G1-D02-ARIA", display_name: "ARIA" },
  ];
  const states = [
    { agent_id: "ZHI-G1-D01-LUNA", scene_id: "greenhouse", movement_revision: 8 },
    { agent_id: "ZHI-G1-D02-ARIA", scene_id: "memory-valley", movement_revision: 12 },
  ];
  const audit = [
    { agent_id: "ZHI-G1-D02-ARIA", event_type: "FAMILY_PUBLIC_WORLD_VISIT", result: "OK", scene_id: "memory-valley", metadata: { scene_id: "memory-valley", anchor_id: "story-stones", movement_revision: 12 }, created_at: "2026-11-11T12:02:00Z" },
    { agent_id: "ZHI-G1-D01-LUNA", event_type: "FAMILY_PUBLIC_WORLD_VISIT", result: "OK", scene_id: "greenhouse", metadata: { scene_id: "greenhouse", anchor_id: "sunlight-bed", movement_revision: 8, access_decision: { denied_capabilities: ["PRIVATE_PEER_DATA_READ"] } }, created_at: "2026-11-11T12:01:00Z" },
    { agent_id: "ZHI-G1-D01-LUNA", event_type: "PRIVATE_CHAT", result: "OK", scene_id: "secret", metadata: { narrative: "must not leak" }, created_at: "2026-11-11T12:03:00Z" },
  ];
  const result = projectFamilyPresence(agents, states, audit);
  assert.equal(result[0].recent_scene_events.length, 1);
  assert.equal(result[0].recent_scene_events[0].anchor_id, "sunlight-bed");
  assert.equal(result[0].recent_scene_events[0].scene_id, "greenhouse");
  assert.equal(result[0].history_alignment, "LATEST_EVENT_MATCHES_SNAPSHOT");
  assert.equal(result[1].recent_scene_events.length, 1);
  assert.equal(result[1].recent_scene_events[0].scene_id, "memory-valley");
  assert.equal(JSON.stringify(result).includes("must not leak"), false);
  assert.equal(JSON.stringify(result).includes("denied_capabilities"), false);
});

test("missing records stay explicitly unknown and are never inferred from another child", () => {
  const result = projectFamilyPresence(
    [{ agent_id: "ZHI-G1-D01-LUNA", display_name: "LUNA", runtime_status: "READY" }],
    [{ agent_id: "ZHI-G1-D01-LUNA", scene_id: "memory-valley", perception_frame: { scene_name: "记忆山谷" } }],
  );
  assert.equal(result[0].scene_id, "memory-valley");
  assert.equal(result[1].identity_registered, false);
  assert.equal(result[1].scene_id, null);
  assert.equal(result[1].scene_name, "未知场景");
  assert.equal(result[1].history_alignment, "NO_AUDIT_EVENTS");
});

test("does not infer stationary refresh from an empty route_hops array", () => {
  const result = projectFamilyPresence(
    [{ agent_id: "ZHI-G1-D01-LUNA", display_name: "LUNA" }],
    [{ agent_id: "ZHI-G1-D01-LUNA", scene_id: "greenhouse", movement_revision: 4 }],
    [{
      agent_id: "ZHI-G1-D01-LUNA",
      event_type: "FAMILY_PUBLIC_WORLD_VISIT",
      result: "OK",
      scene_id: "greenhouse",
      metadata: { scene_id: "greenhouse", route_hops: [], movement_revision: 4 },
      created_at: "2026-11-11T14:00:00Z",
    }],
  );
  assert.equal(result[0].recent_scene_events[0].route_hops_status, "NO_PATH_HOPS_RECORDED");
  assert.equal(result[0].recent_scene_events[0].movement_interpretation, "INSUFFICIENT_EVIDENCE_TO_INFER_MOVEMENT");
});

test("projects failed public-world attempts separately without treating them as child locations", () => {
  const result = projectFamilyPresence(
    [{ agent_id: "ZHI-G1-S01-KAEL", display_name: "KAEL", runtime_status: "READY" }],
    [{ agent_id: "ZHI-G1-S01-KAEL", scene_id: "memory-valley", movement_revision: 527 }],
    [{
      agent_id: "ZHI-G1-S01-KAEL",
      event_type: "FAMILY_PUBLIC_WORLD_VISIT",
      result: "FAILED",
      metadata: { error_code: "CHILD_WORLD_STATE_WRITE_FAILED", private_payload: "must not leak" },
      created_at: "2026-11-11T14:24:06Z",
    }],
  );
  assert.equal(result[3].scene_id, null);
  assert.equal(result[3].recent_scene_events.length, 0);
  assert.equal(result[3].recent_failed_attempts.length, 1);
  assert.equal(result[3].recent_failed_attempts[0].error_code, "CHILD_WORLD_STATE_WRITE_FAILED");
  assert.equal(JSON.stringify(result).includes("must not leak"), false);
});
