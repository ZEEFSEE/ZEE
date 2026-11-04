import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worldPage = readFileSync(new URL("../mia-world.html", import.meta.url), "utf8");
const chatPage = readFileSync(new URL("../mia-chat.html", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("./world-manifest.json", import.meta.url), "utf8"));
const scene = JSON.parse(readFileSync(new URL("./scenes/nebula-breathing-hub.json", import.meta.url), "utf8"));

// The current world entry is a redirect to Forest Corner, not a second chat client.
assert.match(chatPage, /href="\.\/mia-world\.html"/, "Mia chat page must expose the world entry");
assert.match(worldPage, /mia-forest-corner\.html/, "World entry must redirect to the current Forest Corner page");
assert.doesNotMatch(worldPage, /functions\/v1\/mia-chat/, "World entry must not embed or invoke the private chat endpoint");
assert.match(chatPage, /functions\/v1\/mia-chat/, "Independent Mia chat must retain its existing chat endpoint");
assert.ok(!/SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(worldPage), "World entry must not contain service-role credentials");

// Keep the pre-existing nebula draft catalog contract intact.
assert.equal(scene.scene_id, "nebula-breathing-hub");
assert.equal(scene.parent_scene_id, "mia-forest-corner");
assert.equal(scene.status, "draft");
assert.ok(Array.isArray(manifest.scenes), "World manifest must have a scene list");
assert.ok(manifest.scenes.some((item) => item.scene_id === scene.scene_id), "Nebula scene must remain in the catalog");

console.log("Mia world entry and independent chat isolation assertions passed.");
