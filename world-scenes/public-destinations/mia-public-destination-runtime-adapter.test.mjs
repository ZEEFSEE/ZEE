import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { travelMiaWorldAgent } from "./mia-public-destination-runtime-adapter.mjs";

const navigation = JSON.parse(await readFile(new URL("./navigation.json", import.meta.url), "utf8"));
const manifest = JSON.parse(await readFile(new URL("../world-manifest.json", import.meta.url), "utf8"));
const runtime = (targetSceneId = "palace", overrides = {}) => ({
  currentSceneId: "mia-forest-corner",
  sceneTransitionReady: true,
  transitionScene: async () => ({ ok: true, activeSceneId: targetSceneId, transitionId: "mock-transition" }),
  ...overrides,
});

test("does not report movement when no runtime is injected", async () => {
  const result = await travelMiaWorldAgent({ currentSceneId: "mia-forest-corner", targetSceneId: "palace", navigation, manifest });
  assert.equal(result.moved, false);
  assert.equal(result.code, "RUNTIME_NOT_CONNECTED");
});

test("any Mia-world agent may use Palace without registration or identity enrollment", async () => {
  const result = await travelMiaWorldAgent({ identity: { id: "unregistered-agent-example" }, currentSceneId: "mia-forest-corner", targetSceneId: "palace", navigation, manifest, runtime: runtime() });
  assert.equal(result.ok, true);
  assert.equal(result.moved, true);
  assert.equal(result.activeSceneId, "palace");
});

test("an absent identity does not create an access gate", async () => {
  const result = await travelMiaWorldAgent({ currentSceneId: "mia-forest-corner", targetSceneId: "palace", navigation, manifest, runtime: runtime() });
  assert.equal(result.ok, true);
  assert.equal(result.moved, true);
});

test("passes no-registration free-passage context to the runtime", async () => {
  let received;
  const injected = runtime("palace", { transitionScene: async (args) => { received = args; return { ok: true, activeSceneId: "palace", transitionId: "test-1" }; } });
  const result = await travelMiaWorldAgent({ currentSceneId: "mia-forest-corner", targetSceneId: "palace", navigation, manifest, runtime: injected });
  assert.equal(result.ok, true);
  for (const key of ["registrationRequired","approvalRequired","invitationRequired","tokenRequired","whitelistRequired","manualConfirmationRequired"]) assert.equal(received.accessContext[key], false);
  assert.equal(received.accessContext.visitLimit, null);
});

test("does not report movement unless runtime confirms the target scene", async () => {
  const injected = runtime("mia-forest-corner");
  const result = await travelMiaWorldAgent({ currentSceneId: "mia-forest-corner", targetSceneId: "palace", navigation, manifest, runtime: injected });
  assert.equal(result.moved, false);
  assert.equal(result.code, "TRANSITION_NOT_CONFIRMED");
});

test("does not use a runtime bound to a different current scene", async () => {
  const result = await travelMiaWorldAgent({ currentSceneId: "mia-forest-corner", targetSceneId: "palace", navigation, manifest, runtime: runtime("palace", { currentSceneId: "greenhouse" }) });
  assert.equal(result.code, "RUNTIME_NOT_CONNECTED");
});
