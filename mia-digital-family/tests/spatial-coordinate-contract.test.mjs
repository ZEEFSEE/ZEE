import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createSpatialCoordinateContract,
  layoutPointToSceneLocal,
  sceneLocalToAuthoredWorld,
  mapPortalPoint
} from "../runtime/spatial-coordinate-contract.mjs";

const manifest = JSON.parse(await readFile(new URL("../../world-scenes/public-destinations/world-spatial-manifest.v1.json", import.meta.url), "utf8"));
const contract = createSpatialCoordinateContract(manifest);

test("coordinate contract has six explicit scene-local metre frames", () => {
  assert.equal(contract.scenes.length, 6);
  assert.ok(contract.scenes.every(frame => frame.unit === "m" && frame.worldFrame === "zhi-mia-virtual-world-v1"));
  assert.equal(contract.layoutToLocalScale, 0.02);
});

test("layout pixels convert to scene-local metres without guessing", () => {
  assert.deepEqual(layoutPointToSceneLocal({ x: 500, y: 350 }), { x: 10, z: 7, unit: "m" });
  assert.throws(() => layoutPointToSceneLocal({ x: NaN, y: 0 }), /finite layout point/);
});

test("scene-local positions map to the authored virtual world frame", () => {
  const frame = contract.scenes.find(item => item.sceneId === "crystal-forest");
  assert.deepEqual(sceneLocalToAuthoredWorld(frame, { x: 1.2, z: 7 }), {
    x: 31.2, y: 0, z: 7, unit: "m", space: "zhi-mia-virtual-world-v1"
  });
});

test("all authored portal transforms map source portal exactly to target portal", () => {
  assert.equal(contract.transitions.length, 6);
  for (const edge of contract.transitions) {
    assert.deepEqual(mapPortalPoint(edge, edge.sourceLocal), { ...edge.targetLocal, unit: "m" });
    assert.equal(edge.continuousWalkPath, false);
    assert.equal(edge.runtimeStatus, "contract_only_runtime_validation_pending");
  }
});

test("coordinate validation rejects inconsistent authored world anchors", () => {
  const bad = structuredClone(manifest);
  bad.scene_transitions[0].target.world_authored.x += 0.5;
  assert.throws(() => createSpatialCoordinateContract(bad), /does not match scene frame/);
});

test("coordinate validation rejects unknown scene references", () => {
  const bad = structuredClone(manifest);
  bad.scene_transitions[0].to_scene_id = "unknown-destination";
  assert.throws(() => createSpatialCoordinateContract(bad), /unknown scene/);
});
