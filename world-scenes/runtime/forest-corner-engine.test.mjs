import test from "node:test";
import assert from "node:assert/strict";
import { initialState, transition, sceneSnapshot } from "./forest-corner-engine.mjs";

test("enter creates a server-owned scene anchor in local coordinates", () => {
  const result = transition(null, "enter");
  assert.equal(result.state.session_status, "active");
  assert.equal(result.state.current_node_id, "forest-corner-left-boundary-test-entry");
  assert.equal(result.events[0].event_type, "scene_entered");
  assert.equal(result.state.current_position.frame, "forest-corner-local-v1");
});

test("move_to lounge emits six deterministic route steps and ends at lounge", () => {
  const entered = transition(initialState(), "enter").state;
  const moved = transition(entered, "move_to", { destination: "lounge" });
  assert.equal(moved.events.length, 5);
  assert.equal(moved.events[0].sequence, 2);
  assert.equal(moved.events.at(-1).event_type, "movement_step");
  assert.equal(moved.state.current_node_id, "lounge");
  assert.deepEqual(moved.state.current_position, { x: 800, y: 350, z: null, frame: "forest-corner-local-v1" });
});

test("interaction is rejected until the agent reaches the lounge", () => {
  const entered = transition(null, "enter").state;
  assert.throws(() => transition(entered, "interact", { target: "lounge", behavior: "listen" }), /target_out_of_reach/);
});

test("lounge interaction and leave preserve last verified local position", () => {
  const entered = transition(null, "enter").state;
  const moved = transition(entered, "move_to", { destination: "lounge" }).state;
  const interacted = transition(moved, "interact", { target: "lounge", behavior: "listen" });
  assert.equal(interacted.events[0].event_type, "interaction");
  const left = transition(interacted.state, "leave");
  assert.equal(left.state.session_status, "left");
  assert.equal(left.state.current_node_id, "lounge");
});

test("re-entry restores last node and does not invent a world transform", () => {
  const entered = transition(null, "enter").state;
  const moved = transition(entered, "move_to", { destination: "lounge" }).state;
  const left = transition(moved, "leave").state;
  const reentered = transition(left, "enter");
  const snapshot = sceneSnapshot(reentered.state);
  assert.equal(snapshot.current_node_id, "lounge");
  assert.equal(snapshot.world_transform, null);
  assert.equal(reentered.events[0].payload.resumed, true);
});
