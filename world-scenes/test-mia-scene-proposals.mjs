import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../supabase/functions/mia-scene-proposals/index.ts", import.meta.url), "utf8");
const readme = readFileSync(new URL("../supabase/functions/mia-scene-proposals/README.md", import.meta.url), "utf8");
const workshop = readFileSync(new URL("../mia-scene-workshop.html", import.meta.url), "utf8");

assert.match(source, /async function validMiaSession/);
assert.match(source, /claims\.aud === "mia-chat"/);
assert.match(source, /claims\.sub === "mia-admin"/);
assert.match(source, /if \(config\.global_paused\) return json\(\{ ok: false, error: "world_builder_paused" \}, 423\)/);
assert.match(source, /production_writes_enabled/);
assert.match(source, /mia_approval_required_before_registration: true/);
assert.match(source, /mia_review_recorded: false/);
assert.match(source, /scene_registered: false/);
assert.match(source, /runtime_activated: false/);
assert.match(source, /parent_scene_not_registered/);
assert.match(source, /duplicate_scene_id/);
assert.doesNotMatch(source, /\.update\(\{[^}]*global_paused\s*:/s, "Endpoint must never unpause the builder");
assert.doesNotMatch(source, /production_writes_enabled\s*:\s*true/, "Endpoint must never enable production writes");
assert.match(readme, /deployed ACTIVE v1 on zee-extension/i);
assert.match(readme, /The global pause is a hard stop/i);\nassert.match(workshop, /functions\\/v1\\/mia-scene-proposals/);\nassert.match(workshop, /if\\(!canSubmit\\)/);\nassert.match(workshop, /mia_scene_workshop_draft_v1/);\nassert.match(workshop, /不会解除全局暂停/);\nassert.doesNotMatch(workshop, /SUPABASE_SERVICE_ROLE_KEY|service_role/i, "Browser workshop must not expose service-role credentials");

console.log("Mia scene proposal endpoint safety assertions passed.");
