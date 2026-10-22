import test from "node:test";
import assert from "node:assert/strict";
import { validateScene, validateExplorationClosure } from "./scene-closure-validator.mjs";

// Pure in-memory harness: deliberately does not connect to Supabase or production APIs.
function createHarness({ scenes, failAt = null }) {
  const store = { runs: [], memories: [], lifeEvents: [], messages: [] };

  async function explore(slug) {
    const scene = scenes.find((item) => item.slug === slug && item.status === "active");
    if (!scene) return { ok: false, code: "SCENE_UNAVAILABLE" };

    const sceneCheck = validateScene(scene);
    if (!sceneCheck.ok) return { ok: false, code: "SCENE_INVALID", errors: sceneCheck.errors };

    const run = { exploration_id: "test-run-1", status: "started", scene_slug: slug };
    store.runs.push(run);

    try {
      if (failAt === "generate") throw new Error("MOCK_MODEL_FAILURE");
      const observations = `Snapshot simulation for ${scene.name}`;
      const payload = {
        exploration_id: run.exploration_id,
        status: "completed",
        observations,
        discoveries: [],
        open_questions: [],
        next_steps: [],
        memory_saved: false,
        life_event_saved: false,
        assistant_message_saved: false,
        actual_world_entry: false,
        observation_mode: "snapshot_based_simulation"
      };

      if (failAt === "life_event") throw new Error("MOCK_LIFE_EVENT_WRITE_FAILURE");
      store.lifeEvents.push({ run_id: run.exploration_id, observations });
      payload.life_event_saved = true;

      if (failAt === "memory") throw new Error("MOCK_MEMORY_WRITE_FAILURE");
      store.memories.push({ source_record_id: run.exploration_id, content: observations });
      payload.memory_saved = true;

      if (failAt === "message") throw new Error("MOCK_MESSAGE_WRITE_FAILURE");
      store.messages.push({ run_id: run.exploration_id, content: observations });
      payload.assistant_message_saved = true;

      const closure = validateExplorationClosure(payload);
      if (!closure.ok) throw new Error("MOCK_CLOSURE_REJECTED");
      run.status = "completed";
      return { ok: true, run_id: run.exploration_id, closure: payload };
    } catch (error) {
      run.status = "failed";
      run.error = error.message;
      return { ok: false, code: error.message, run_id: run.exploration_id };
    }
  }

  function recall(runId) {
    return store.memories.find((memory) => memory.source_record_id === runId) ?? null;
  }

  return { explore, recall, store };
}

const activeScene = {
  slug: "test-garden",
  name: "测试花园",
  status: "active",
  local_coordinate_system: { width: 100, height: 100, units: "local layout units" },
  entities: [{ id: "bench", name: "长椅", x: 10, y: 20 }]
};

test("missing or inactive scene is rejected without creating a run", async () => {
  for (const scene of [
    { ...activeScene, status: "inactive" },
  ]) {
    const h = createHarness({ scenes: [scene] });
    const result = await h.explore("test-garden");
    assert.equal(result.ok, false);
    assert.equal(result.code, "SCENE_UNAVAILABLE");
    assert.equal(h.store.runs.length, 0);
  }
  const h = createHarness({ scenes: [] });
  assert.equal((await h.explore("does-not-exist")).code, "SCENE_UNAVAILABLE");
  assert.equal(h.store.runs.length, 0);
});

test("successful mocked exploration persists all three records and supports later recall", async () => {
  const h = createHarness({ scenes: [activeScene] });
  const result = await h.explore("test-garden");
  assert.equal(result.ok, true);
  assert.equal(h.store.runs[0].status, "completed");
  assert.equal(h.store.lifeEvents.length, 1);
  assert.equal(h.store.memories.length, 1);
  assert.equal(h.store.messages.length, 1);
  assert.equal(h.recall(result.run_id).source_record_id, result.run_id);
  assert.equal(result.closure.actual_world_entry, false);
  assert.equal(result.closure.observation_mode, "snapshot_based_simulation");
});

test("upstream generation failure leaves run failed and writes no downstream records", async () => {
  const h = createHarness({ scenes: [activeScene], failAt: "generate" });
  const result = await h.explore("test-garden");
  assert.equal(result.ok, false);
  assert.equal(h.store.runs[0].status, "failed");
  assert.equal(h.store.lifeEvents.length, 0);
  assert.equal(h.store.memories.length, 0);
  assert.equal(h.store.messages.length, 0);
});

test("partial persistence failure never reports completion", async () => {
  for (const failAt of ["life_event", "memory", "message"]) {
    const h = createHarness({ scenes: [activeScene], failAt });
    const result = await h.explore("test-garden");
    assert.equal(result.ok, false, failAt);
    assert.equal(h.store.runs[0].status, "failed", failAt);
    assert.notEqual(h.store.runs[0].status, "completed", failAt);
  }
});

test("a failed retry does not fabricate memory recall", async () => {
  const h = createHarness({ scenes: [activeScene], failAt: "memory" });
  const result = await h.explore("test-garden");
  assert.equal(result.ok, false);
  assert.equal(h.recall(result.run_id), null);
});
