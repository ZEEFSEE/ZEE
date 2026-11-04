import { applyAction, safeFallback } from "./index.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}
const state = {
  scene_id: "mia-forest-corner", sequence: 10, session_status: "left",
  current_position: { x: 800, y: 350, z: null, frame: "forest-corner-local-v1" },
  world_transform: null, world_transform_status: "uncalibrated",
  runtime_instance_id: "forest-corner-headless-v1",
  environment_state: { entities: ["greenhouse", "data-shelf", "lounge", "forest-rabbit", "tiny-planet-friends-glb"] },
};

Deno.test("safe fallback enters the registered local scene", () => {
  assert(safeFallback(state).action === "enter", "left state should enter");
  const result = applyAction(state, { action: "enter" }, "2026-11-04T14:00:00.000Z");
  assert(result.state.session_status === "active", "session should become active");
  assert(result.state.current_position.x === 800, "position must remain anchored");
  assert(result.state.world_transform === null, "world transform must remain uncalibrated");
});

Deno.test("local interaction updates only semantic scene state", () => {
  const active = { ...state, session_status: "active" };
  const result = applyAction(active, { action: "interact", behavior: "observe_rabbit", target: "forest-rabbit" }, "2026-11-04T14:00:00.000Z");
  assert(result.state.environment_state.last_interaction.target === "forest-rabbit", "interaction target missing");
  assert(result.state.current_position.x === 800, "interaction must not invent movement");
});

Deno.test("leave preserves the last verified local position", () => {
  const active = { ...state, session_status: "active" };
  const result = applyAction(active, { action: "leave" }, "2026-11-04T14:00:00.000Z");
  assert(result.state.session_status === "left", "session should close");
  assert(result.state.current_position.x === 800, "position must be preserved");
});

Deno.test("cross-scene travel fails closed", () => {
  const active = { ...state, session_status: "active" };
  const result = applyAction(active, { action: "travel", target: "crystal-forest" }, "2026-11-04T14:00:00.000Z");
  assert(result.action === "wait" && result.blocked, "unverified travel must be blocked");
  assert(result.state.scene_id === "mia-forest-corner", "scene must not change");
});
