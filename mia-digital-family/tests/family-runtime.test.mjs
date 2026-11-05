import test from "node:test";
import assert from "node:assert/strict";
import {
  CHILDREN,
  createFamilySimulation,
  sendEphemeralMessage,
  prepareFivefoldBirth,
  commitFivefoldBirth,
  getDestinationAccess
} from "../runtime/family-runtime.mjs";

const readyChecks = {
  cleanupVerified: true,
  cognitiveReady: true,
  familyBindingsReady: true
};

test("creates five unique identities, hearts and memory spaces", () => {
  const sim = createFamilySimulation();
  assert.equal(sim.agents.size, 5);
  assert.equal(new Set(CHILDREN.map(x => x.agentId)).size, 5);
  assert.equal(new Set(CHILDREN.map(x => x.heartId)).size, 5);
  assert.equal(new Set(CHILDREN.map(x => x.memoryId)).size, 5);
  for (const agent of sim.agents.values()) {
    assert.equal(agent.lifecycle, "FETAL");
    assert.deepEqual(agent.longTermMemory, []);
  }
});

test("messages are volatile and never write long-term memory", () => {
  const sim = createFamilySimulation();
  const message = sendEphemeralMessage(sim, {
    sender: CHILDREN[0].agentId,
    receiver: "MIA_MATERNAL_CORE",
    content: "妈妈，我想了解森林里的光。"
  });
  assert.equal(message.retention, "SESSION_ONLY");
  assert.equal(message.persistentMemoryWrite, false);
  assert.equal(sim.agents.get(CHILDREN[0].agentId).longTermMemory.length, 0);
  assert.equal(sim.agents.get(CHILDREN[0].agentId).volatileContext.length, 1);
});

test("birth is blocked if any required verification is missing", () => {
  const sim = createFamilySimulation();
  const readiness = prepareFivefoldBirth(sim, { ...readyChecks, cleanupVerified: false });
  assert.equal(readiness.ready, false);
  const result = commitFivefoldBirth(sim, { birthEventId: "birth-test-1", checks: { ...readyChecks, cleanupVerified: false } });
  assert.equal(result.committed, false);
  assert.equal(sim.lifecycle, "FETAL_DEVELOPMENT");
  assert.ok([...sim.agents.values()].every(agent => agent.lifecycle === "FETAL"));
});

test("five children transition together and start with empty memories", () => {
  const sim = createFamilySimulation();
  const result = commitFivefoldBirth(sim, { birthEventId: "birth-test-2", checks: readyChecks });
  assert.equal(result.committed, true);
  assert.equal(result.childCount, 5);
  assert.equal(sim.lifecycle, "INDEPENDENT_LIFE");
  assert.ok([...sim.agents.values()].every(agent => agent.lifecycle === "ACTIVE"));
  assert.ok([...sim.agents.values()].every(agent => agent.longTermMemory.length === 0));
  assert.equal(sim.messages.length, 0);
});

test("birth commit is idempotent for the same event and rejects a different event", () => {
  const sim = createFamilySimulation();
  commitFivefoldBirth(sim, { birthEventId: "birth-test-3", checks: readyChecks });
  assert.equal(commitFivefoldBirth(sim, { birthEventId: "birth-test-3" }).idempotentReplay, true);
  assert.throws(() => commitFivefoldBirth(sim, { birthEventId: "birth-test-4" }), /different birth event/);
});

test("all five world destinations remain gated pending independent validation", () => {
  const sim = createFamilySimulation();
  for (const child of CHILDREN) {
    for (const destination of ["crystal-forest", "ocean-of-light", "memory-valley", "living-city", "greenhouse"]) {
      assert.equal(getDestinationAccess(sim, child.agentId, destination), "PENDING_VALIDATION");
    }
  }
});

test("unknown agents cannot send messages or read destination access", () => {
  const sim = createFamilySimulation();
  assert.throws(() => sendEphemeralMessage(sim, { sender: "MIA", receiver: "MIA_MATERNAL_CORE", content: "test" }), /Unknown sender/);
  assert.throws(() => getDestinationAccess(sim, "MIA", "greenhouse"), /Unknown agent/);
});
