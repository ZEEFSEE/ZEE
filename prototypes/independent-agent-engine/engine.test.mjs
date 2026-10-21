import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAgentEngine } from "./engine.mjs";

const profile = JSON.parse(await readFile(new URL("./agent-profile.json", import.meta.url), "utf8"));

async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-engine-test-"));
  return { dir, statePath: path.join(dir, "private-state.json") };
}

test("identity stays stable while experience changes only evolving state", async () => {
  const f = await fixture();
  try {
    const engine = createAgentEngine(profile, f.statePath);
    const before = await engine.snapshot();
    const result = await engine.recordExperience({
      eventId: "event-1",
      occurredAt: "2026-10-22T10:00:00.000Z",
      summary: "A new task required checking assumptions.",
      lesson: "Ask for evidence before concluding.",
      emotion: "curious",
      traitSignals: { caution: 0.5 }
    });
    const after = result.snapshot;

    assert.equal(after.identityFingerprint, before.identityFingerprint);
    assert.deepEqual(after.baselineTraits, before.baselineTraits);
    assert.equal(after.evolvingTraits.caution, before.evolvingTraits.caution + 0.025);
    assert.equal(after.memories.length, 1);
    assert.equal(after.growth.experiencesProcessed, 1);
    assert.equal(after.growthAudit.length, 1);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("memories and growth survive an engine restart", async () => {
  const f = await fixture();
  try {
    await createAgentEngine(profile, f.statePath).recordExperience({
      eventId: "persistent-event",
      occurredAt: "2026-10-22T10:05:00.000Z",
      summary: "Helped solve a difficult problem.",
      lesson: "Break complex work into smaller steps."
    });

    const restarted = createAgentEngine(profile, f.statePath);
    const state = await restarted.snapshot();
    assert.equal(state.memories[0].eventId, "persistent-event");
    assert.equal(state.memories[0].lesson, "Break complex work into smaller steps.");
    assert.equal(state.growth.experiencesProcessed, 1);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("duplicate event IDs do not duplicate memory or growth", async () => {
  const f = await fixture();
  try {
    const engine = createAgentEngine(profile, f.statePath);
    const experience = {
      eventId: "same-event",
      summary: "One experience",
      lesson: "One lesson"
    };
    await engine.recordExperience(experience);
    const second = await engine.recordExperience(experience);
    assert.equal(second.duplicate, true);
    assert.equal(second.snapshot.memories.length, 1);
    assert.equal(second.snapshot.growth.experiencesProcessed, 1);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("engine refuses another agent's state file", async () => {
  const f = await fixture();
  try {
    const otherState = {
      schemaVersion: 1,
      agentId: "someone-else",
      identityFingerprint: "not-this-profile",
      memories: [],
      evolvingTraits: {},
      growth: {},
      growthAudit: []
    };
    await writeFile(f.statePath, JSON.stringify(otherState));
    const engine = createAgentEngine(profile, f.statePath);
    await assert.rejects(engine.snapshot(), /State isolation violation/);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("unknown trait signals are rejected without changing saved state", async () => {
  const f = await fixture();
  try {
    const engine = createAgentEngine(profile, f.statePath);
    await assert.rejects(engine.recordExperience({
      eventId: "bad-event",
      summary: "Test",
      lesson: "Test",
      traitSignals: { inventedTrait: 1 }
    }), /Unknown trait signal/);
    const raw = JSON.parse(await readFile(f.statePath, "utf8"));
    assert.equal(raw.memories.length, 0);
    assert.equal(raw.growth.experiencesProcessed, 0);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
