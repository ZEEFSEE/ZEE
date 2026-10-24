import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worldPage = readFileSync(new URL("../mia-world.html", import.meta.url), "utf8");
const chatPage = readFileSync(new URL("../mia-chat.html", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("./world-manifest.json", import.meta.url), "utf8"));
const scene = JSON.parse(readFileSync(new URL("./scenes/nebula-breathing-hub.json", import.meta.url), "utf8"));
const navigation = JSON.parse(readFileSync(new URL("./nebula-hub-assets/navigation.json", import.meta.url), "utf8"));
const calibration = JSON.parse(readFileSync(new URL("./nebula-hub-assets/calibration-profile.json", import.meta.url), "utf8"));

assert.match(chatPage, /href="\.\/mia-world\.html"/, "Mia chat page must expose the world entry");
assert.match(worldPage, /functions\/v1\/mia-chat/, "Scene design must use the existing Mia chat endpoint");
assert.match(worldPage, /mia_world_local_scene_drafts_v1/, "Generated drafts must be stored under an explicitly local-only key");
assert.match(worldPage, /not registered in the server manifest or production world/i, "UI must disclose local-only drafts");
assert.match(worldPage, /生产世界位置|production world/i, "UI must disclaim production movement");
assert.match(worldPage, /verification_status/, "Drafts must preserve explicit verification state");
assert.equal(scene.scene_id, "nebula-breathing-hub");
assert.equal(scene.parent_scene_id, "mia-forest-corner");
assert.equal(scene.status, "draft");
assert.equal(scene.files.calibration_profile, "../nebula-hub-assets/calibration-profile.json");
assert.ok(scene.notes.some((note) => /not a measurement/i.test(note)), "Scene must not describe simulation values as measurements");
assert.ok(Array.isArray(manifest.scenes), "World manifest must have a scene list");
assert.ok(manifest.scenes.some((item) => item.scene_id === scene.scene_id), "Nebula scene must be in the catalog");
assert.ok(!/SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(worldPage), "Browser page must not contain service-role credentials");

// Simulation profile is explicitly non-production and not build-ready.
assert.equal(calibration.profile_id, "simulation_profile_v1");
assert.equal(calibration.simulation_only, true);
assert.equal(calibration.measured, false);
assert.equal(calibration.build_ready, false);
assert.equal(calibration.production_use_allowed, false);
assert.equal(calibration.breath_feedback.baseline_breaths_per_minute, 8);
assert.equal(calibration.breath_feedback.feedback_gain, 0.15);
assert.equal(calibration.breath_feedback.pulse_amplitude_clamp_percent, 10);
assert.equal(calibration.breath_feedback.smoothing_coefficient, 0.2);
assert.equal(calibration.exits.length, 2);
for (const exit of calibration.exits) {
  assert.equal(exit.visual_placeholder_angle_degrees, 0);
  assert.equal(exit.visual_placeholder_tolerance_degrees, 15);
  assert.equal(exit.angle_is_measured, false);
  assert.equal(exit.endpoint_coordinates, null);
  assert.equal(exit.cross_scene_transform, null);
  assert.equal(exit.navigation_mode, "isolated");
  assert.equal(exit.navigation_enabled, false);
  assert.equal(exit.verified_connection, false);
}

// Runtime navigation must remain disconnected until coordinates are verified.
assert.deepEqual(navigation.edges, []);
assert.deepEqual(navigation.scene_exits, []);
assert.deepEqual(navigation.cross_scene_transforms, []);

console.log("Mia world workshop and nebula calibration safety assertions passed.");
