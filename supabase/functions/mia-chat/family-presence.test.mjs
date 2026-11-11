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

test("missing records stay explicitly unknown and are never inferred from another child", () => {
  const result = projectFamilyPresence(
    [{ agent_id: "ZHI-G1-D01-LUNA", display_name: "LUNA", runtime_status: "READY" }],
    [{ agent_id: "ZHI-G1-D01-LUNA", scene_id: "memory-valley", perception_frame: { scene_name: "记忆山谷" } }],
  );
  assert.equal(result[0].scene_id, "memory-valley");
  assert.equal(result[1].identity_registered, false);
  assert.equal(result[1].scene_id, null);
  assert.equal(result[1].scene_name, "未知场景");
});
