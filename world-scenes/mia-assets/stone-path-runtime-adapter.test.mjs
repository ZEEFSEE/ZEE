import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerStonePath } from "./stone-path-runtime-adapter.mjs";

const asset = JSON.parse(await readFile(new URL("./stone-path-forest-to-lounge.json", import.meta.url), "utf8"));
const navigation = JSON.parse(await readFile(new URL("./navigation.json", import.meta.url), "utf8"));

function mockRuntime(overrides = {}) {
  const removed = [];
  let serial = 0;
  const runtime = {
    sceneId: "mia-forest-corner",
    coordinateSpace: "scene-local",
    depthMappingVerified: true,
    addPolygonPrism: () => ({ id: `mesh-${++serial}` }),
    addPolygonCollider: () => ({ id: `collider-${++serial}` }),
    registerNavigationEdge: () => ({ id: `edge-${++serial}` }),
    removeMesh: (h) => removed.push(["mesh", h]),
    removeCollider: (h) => removed.push(["collider", h]),
    removeNavigationEdge: (h) => removed.push(["edge", h]),
    ...overrides,
  };
  return { runtime, removed };
}

test("fails closed when depth mapping is not verified", () => {
  const { runtime } = mockRuntime({ depthMappingVerified: false });
  const result = registerStonePath({ asset, navigation, runtime });
  assert.equal(result.activated, false);
  assert.equal(result.code, "DEPTH_MAPPING_UNVERIFIED");
});

test("fails closed when runtime scene does not match asset scene", () => {
  const { runtime } = mockRuntime({ sceneId: "some-other-scene" });
  const result = registerStonePath({ asset, navigation, runtime });
  assert.equal(result.activated, false);
  assert.equal(result.code, "RUNTIME_SCENE_MISMATCH");
});

test("registers only through explicitly injected runtime and supports rollback", () => {
  const { runtime, removed } = mockRuntime();
  const result = registerStonePath({ asset, navigation, runtime });
  assert.equal(result.ok, true);
  assert.deepEqual(result.registered, { meshes: 5, colliders: 5, navigationEdges: 6 });
  result.rollback();
  assert.equal(removed.filter(([kind]) => kind === "mesh").length, 5);
  assert.equal(removed.filter(([kind]) => kind === "collider").length, 5);
  assert.equal(removed.filter(([kind]) => kind === "edge").length, 6);
});

test("rolls back partial registration after a runtime error", () => {
  let calls = 0;
  const { runtime, removed } = mockRuntime({
    registerNavigationEdge: () => {
      calls += 1;
      if (calls === 3) throw new Error("simulated runtime failure");
      return { id: `edge-${calls}` };
    },
  });
  const result = registerStonePath({ asset, navigation, runtime });
  assert.equal(result.activated, false);
  assert.equal(result.code, "REGISTRATION_FAILED_ROLLED_BACK");
  assert.equal(removed.filter(([kind]) => kind === "mesh").length, 5);
  assert.equal(removed.filter(([kind]) => kind === "collider").length, 5);
  assert.equal(removed.filter(([kind]) => kind === "edge").length, 2);
});
