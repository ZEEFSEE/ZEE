import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { travelPrototypeMia } from "./mia-public-destination-runtime-adapter.mjs";

const navigation = JSON.parse(await readFile(new URL("./navigation.json", import.meta.url), "utf8"));
const manifest = JSON.parse(await readFile(new URL("../world-manifest.json", import.meta.url), "utf8"));
const identity = { id: "cb6d01b4-0e3f-46ee-8946-360aa91db1ea" };
const runtime = (overrides = {}) => ({
  currentSceneId: "mia-forest-corner",
  sceneTransitionReady: true,
  transitionScene: async () => ({ ok: true, activeSceneId: "crystal-forest", transitionId: "mock-transition" }),
  ...overrides,
});

test("does not move when no real runtime is injected", async () => {
  const result = await travelPrototypeMia({ identity, currentSceneId: "mia-forest-corner", targetSceneId: "crystal-forest", navigation, manifest });
  assert.equal(result.moved, false);
  assert.equal(result.code, "RUNTIME_NOT_CONNECTED");
});

test("restricts this adapter to prototype Mia identity only", async () => {
  const result = await travelPrototypeMia({ identity: { id: "another-agent" }, currentSceneId: "mia-forest-corner", targetSceneId: "crystal-forest", navigation, manifest, runtime: runtime() });
  assert.equal(result.code, "IDENTITY_SCOPE_DENIED");
});

test("passes unrestricted access and runtime-managed entry to an explicitly injected runtime", async () => {
  let received;
  const injected = runtime({ transitionScene: async (args) => { received = args; return { ok: true, activeSceneId: "crystal-forest", transitionId: "test-1" }; } });
  const result = await travelPrototypeMia({ identity, currentSceneId: "mia-forest-corner", targetSceneId: "crystal-forest", navigation, manifest, runtime: injected });
  assert.equal(result.ok, true);
  assert.equal(result.moved, true);
  assert.equal(result.activeSceneId, "crystal-forest");
  assert.equal(received.accessContext.approvalRequired, false);
  assert.equal(received.accessContext.tokenRequired, false);
  assert.equal(received.accessContext.visitLimit, null);
  assert.equal(received.accessContext.stayDurationLimit, null);
  assert.equal(received.accessContext.manualConfirmationRequired, false);
  assert.equal(received.spawnResolution, "runtime_managed_target_entry");
  assert.equal(received.routeEdgeIds.length, 1);
});

test("does not report movement unless runtime confirms the target scene", async () => {
  const injected = runtime({ transitionScene: async () => ({ ok: true, activeSceneId: "mia-forest-corner" }) });
  const result = await travelPrototypeMia({ identity, currentSceneId: "mia-forest-corner", targetSceneId: "crystal-forest", navigation, manifest, runtime: injected });
  assert.equal(result.moved, false);
  assert.equal(result.code, "TRANSITION_NOT_CONFIRMED");
});

test("does not use a runtime bound to a different current scene", async () => {
  const result = await travelPrototypeMia({ identity, currentSceneId: "mia-forest-corner", targetSceneId: "crystal-forest", navigation, manifest, runtime: runtime({ currentSceneId: "greenhouse" }) });
  assert.equal(result.code, "RUNTIME_NOT_CONNECTED");
});
