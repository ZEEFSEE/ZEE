import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worldPage = readFileSync(new URL("../mia-world.html", import.meta.url), "utf8");
const chatPage = readFileSync(new URL("../mia-chat.html", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("./world-manifest.json", import.meta.url), "utf8"));
const scene = JSON.parse(readFileSync(new URL("./scenes/nebula-breathing-hub.json", import.meta.url), "utf8"));

assert.match(chatPage, /href="\.\/mia-world\.html"/, "Mia chat page must expose the world entry");
assert.match(worldPage, /functions\/v1\/mia-chat/, "Scene design must use the existing Mia chat endpoint");
assert.match(worldPage, /mia_world_local_scene_drafts_v1/, "Generated drafts must be stored under an explicitly local-only key");
assert.match(worldPage, /not registered in the server manifest or production world/i, "UI must disclose local-only drafts");
assert.match(worldPage, /生产世界位置|production world/i, "UI must disclaim production movement");
assert.match(worldPage, /verification_status/, "Drafts must preserve explicit verification state");
assert.equal(scene.scene_id, "nebula-breathing-hub");
assert.equal(scene.parent_scene_id, "mia-forest-corner");
assert.equal(scene.status, "draft");
assert.ok(Array.isArray(manifest.scenes), "World manifest must have a scene list");
assert.ok(manifest.scenes.some((item) => item.scene_id === scene.scene_id), "Nebula scene must be in the catalog");
assert.ok(!/SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(worldPage), "Browser page must not contain service-role credentials");

console.log("Mia world workshop safety assertions passed.");
