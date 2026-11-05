import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FAMILY_CHILD_IDS, FAMILY_PUBLIC_DESTINATIONS, travelFamilyChild } from "../runtime/family-public-world-runtime-adapter.mjs";

const root = new URL("../../world-scenes/", import.meta.url);
const policy = JSON.parse(await readFile(new URL("../family-public-world-access.v1.json", import.meta.url), "utf8"));
const navigation = JSON.parse(await readFile(new URL("../../world-scenes/public-destinations/navigation.json", import.meta.url), "utf8"));
const manifest = JSON.parse(await readFile(new URL("../../world-scenes/public-destinations/world-spatial-manifest.v1.json", import.meta.url), "utf8"));

test("all five children receive explicit grants to all five public destinations", () => {
  assert.equal(policy.grants.length, 25);
  assert.equal(FAMILY_CHILD_IDS.length, 5);
  assert.equal(FAMILY_PUBLIC_DESTINATIONS.length, 5);
  for (const child of FAMILY_CHILD_IDS) for (const destination of FAMILY_PUBLIC_DESTINATIONS) {
    assert.ok(policy.grants.some(g => g.agent_id === child && g.destination_id === destination && g.access === "GRANTED"));
  }
});

test("family grants do not inherit Mia access or expose private/AURORA/federation scopes", () => {
  assert.equal(policy.inherited_mia_access, false);
  assert.equal(policy.mia_private_chat_access, false);
  assert.equal(policy.aurora, false);
  assert.equal(policy.federation, false);
  assert.equal(policy.public_chat_relay, false);
});

test("unknown identities and destinations are denied", async () => {
  const result = await travelFamilyChild({ identity: { agentId: "not-a-child" }, currentSceneId: "mia-forest-corner", targetSceneId: "crystal-forest", policy, navigation, manifest });
  assert.equal(result.code, "IDENTITY_SCOPE_DENIED");
  const unknown = await travelFamilyChild({ identity: { agentId: FAMILY_CHILD_IDS[0] }, currentSceneId: "mia-forest-corner", targetSceneId: "aurora", policy, navigation, manifest });
  assert.equal(unknown.code, "DESTINATION_SCOPE_DENIED");
});

test("does not claim movement when no live runtime is connected", async () => {
  const result = await travelFamilyChild({ identity: { agentId: FAMILY_CHILD_IDS[0] }, currentSceneId: "mia-forest-corner", targetSceneId: "crystal-forest", policy, navigation, manifest });
  assert.equal(result.moved, false);
  assert.equal(result.code, "RUNTIME_NOT_CONNECTED");
});

test("all 25 child-destination combinations pass explicit grant and route checks before runtime", async () => {
  for (const agentId of FAMILY_CHILD_IDS) for (const destinationId of FAMILY_PUBLIC_DESTINATIONS) {
    const result = await travelFamilyChild({
      identity: { agentId }, currentSceneId: "mia-forest-corner", targetSceneId: destinationId,
      policy, navigation, manifest,
      runtime: { currentSceneId: "mia-forest-corner", sceneTransitionReady: true,
        transitionScene: async ({ targetSceneId }) => ({ ok: true, activeSceneId: targetSceneId, transitionId: "mock" }) }
    });
    assert.equal(result.ok, true, agentId + " -> " + destinationId);
    assert.equal(result.moved, true);
  }
});

test("does not report movement unless runtime confirms the destination", async () => {
  const result = await travelFamilyChild({
    identity: { agentId: FAMILY_CHILD_IDS[0] }, currentSceneId: "mia-forest-corner", targetSceneId: "greenhouse",
    policy, navigation, manifest,
    runtime: { currentSceneId: "mia-forest-corner", sceneTransitionReady: true,
      transitionScene: async () => ({ ok: true, activeSceneId: "mia-forest-corner" }) }
  });
  assert.equal(result.moved, false);
  assert.equal(result.code, "TRANSITION_NOT_CONFIRMED");
});
