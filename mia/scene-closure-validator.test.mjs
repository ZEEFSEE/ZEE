import test from "node:test";
import assert from "node:assert/strict";
import { validateScene, validateExplorationClosure } from "./scene-closure-validator.mjs";

test("validates forest scene local entities without treating parent anchor as verified", () => {
  const result = validateScene({
    slug: "mia-forest-corner",
    name: "Forest Corner",
    status: "active",
    world_anchor: { x: 1650, y: 650, note: "Parent facility only; not a confirmed scene coordinate" },
    local_coordinate_system: { width: 1000, height: 700, units: "relative layout units; not ZHI world coordinates" },
    entities: [
      { id: "greenhouse", name: "智能温室", x: 180, y: 120 },
      { id: "forest-rabbit", name: "森林小白兔", x: 300, y: 280 }
    ]
  });
  assert.equal(result.ok, true);
  assert.ok(result.warnings.includes("WORLD_ANCHOR_NOT_VERIFIED"));
});

test("rejects duplicate entity IDs and out-of-bounds local coordinates", () => {
  const result = validateScene({
    slug: "test-scene",
    name: "Test",
    status: "active",
    local_coordinate_system: { width: 100, height: 100 },
    entities: [
      { id: "same", name: "A", x: 20, y: 20 },
      { id: "same", name: "B", x: 101, y: 20 }
    ]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("ENTITY_ID_DUPLICATE:same"));
  assert.ok(result.errors.includes("ENTITY_OUTSIDE_LOCAL_BOUNDS:same"));
});

test("allows a scene with incomplete entity inventory but reports a warning", () => {
  const result = validateScene({ slug: "reading-room", name: "阅览室", status: "active", entities: [] });
  assert.equal(result.ok, true);
  assert.ok(result.warnings.includes("SCENE_ENTITIES_EMPTY"));
});

test("accepts only a fully evidenced persisted exploration closure", () => {
  const result = validateExplorationClosure({
    exploration_id: "run-1",
    status: "completed",
    observations: "根据场景快照形成的模拟观察",
    discoveries: ["发现一个阅读角"],
    open_questions: [],
    next_steps: ["下次检查书架内容"],
    memory_saved: true,
    life_event_saved: true,
    assistant_message_saved: true,
    actual_world_entry: false,
    observation_mode: "snapshot_based_simulation"
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("rejects a generated answer without confirmed persistence", () => {
  const result = validateExplorationClosure({
    exploration_id: "run-2",
    status: "completed",
    observations: "我看见了一个场景",
    discoveries: [],
    open_questions: [],
    next_steps: [],
    memory_saved: false,
    life_event_saved: false,
    assistant_message_saved: false
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("MEMORY_PERSISTENCE_NOT_CONFIRMED"));
  assert.ok(result.errors.includes("LIFE_EVENT_PERSISTENCE_NOT_CONFIRMED"));
  assert.ok(result.errors.includes("ASSISTANT_MESSAGE_PERSISTENCE_NOT_CONFIRMED"));
  assert.ok(result.warnings.includes("WORLD_ENTRY_NOT_EXPLICITLY_MARKED_FALSE"));
});
