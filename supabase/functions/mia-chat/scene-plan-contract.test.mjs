import test from "node:test";
import assert from "node:assert/strict";
import { validateMiaScenePlan } from "./scene-plan-contract.mjs";

const frame = {
  scene: {
    id: "greenhouse",
    available_anchors: [{ id: "greenhouse-bench" }, { id: "greenhouse-exit" }],
  },
};

test("accepts a registered different public destination", () => {
  assert.equal(validateMiaScenePlan({ action: "visit_scene", scene_id: "ocean-of-light" }, frame).valid, true);
});
test("rejects the current scene as a visit_scene target", () => {
  const result = validateMiaScenePlan({ action: "visit_scene", scene_id: "greenhouse" }, frame);
  assert.equal(result.valid, false);
  assert.match(result.error, /当前所在场景/);
});
test("rejects unregistered scene IDs and the forest hub as visit_scene", () => {
  assert.equal(validateMiaScenePlan({ action: "visit_scene", scene_id: "mia-forest-corner" }, frame).valid, false);
  assert.equal(validateMiaScenePlan({ action: "visit_scene", scene_id: "invented-place" }, frame).valid, false);
});
test("accepts only an anchor registered in the current scene", () => {
  assert.equal(validateMiaScenePlan({ action: "visit_anchor", scene_id: "greenhouse", anchor_id: "greenhouse-exit" }, frame).valid, true);
  assert.equal(validateMiaScenePlan({ action: "visit_anchor", scene_id: "ocean-of-light", anchor_id: "greenhouse-exit" }, frame).valid, false);
  assert.equal(validateMiaScenePlan({ action: "visit_anchor", scene_id: "greenhouse", anchor_id: "invented-anchor" }, frame).valid, false);
});
test("return_forest is the only action that targets the forest hub", () => {
  assert.equal(validateMiaScenePlan({ action: "return_forest", scene_id: "mia-forest-corner" }, frame).valid, true);
  assert.equal(validateMiaScenePlan({ action: "return_forest", scene_id: "greenhouse" }, frame).valid, false);
});
test("wait and report_unknown remain non-moving valid decisions", () => {
  assert.equal(validateMiaScenePlan({ action: "wait" }, frame).valid, true);
  assert.equal(validateMiaScenePlan({ action: "report_unknown" }, frame).valid, true);
});
test("rejects unknown actions", () => {
  assert.equal(validateMiaScenePlan({ action: "teleport", scene_id: "ocean-of-light" }, frame).valid, false);
});
