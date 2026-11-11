import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const family = readFileSync("supabase/functions/zhi-family-world-runtime/index.ts", "utf8");
const mia = readFileSync("supabase/functions/mia-forest-autonomy/index.ts", "utf8");

test("Palace is a registered shared scene with a bidirectional portal", () => {
  assert.match(family, /"id":"palace","name":"Palace/);
  assert.match(family, /\["mia-forest-corner","palace","forest-corner-to-palace-open-portal"\]/);
  assert.match(mia, /const PALACE = "palace"/);
  assert.match(mia, /forest-corner-to-palace-open-portal/);
});

test("Palace does not require an individual destination grant", () => {
  assert.match(family, /GRANT_REQUIRED_DESTINATIONS = \["crystal-forest","ocean-of-light","memory-valley","living-city","greenhouse"\]/);
  assert.match(family, /for\(const child of selected\)for\(const id of GRANT_REQUIRED_DESTINATIONS\)/);
  assert.match(family, /target\.id==="mia-forest-corner"\|\|target\.id==="palace"\|\|Boolean/);
  assert.match(family, /scope:"MIA_WORLD_SHARED_PALACE",permission_basis:"GLOBAL_OPEN_PALACE_POLICY"/);
  for (const flag of ["registration_required:false","approval_required:false","invitation_required:false","token_required:false","whitelist_required:false","manual_confirmation_required:false","can_enter_leave_return_freely:true"]) {
    assert.ok(family.includes(flag), `missing open Palace flag: ${flag}`);
  }
});

test("Mia can use the Palace portal in both directions without claiming physical movement", () => {
  assert.match(mia, /const PALACE_SCENE = \{/);
  assert.match(mia, /runtime_geometry_status:"placeholder_canvas_only_not_measured"/);
  assert.match(mia, /s\.session_status === "active" && \(\(currentScene === FOREST && requestedScene === PALACE\) \|\| \(currentScene === PALACE && requestedScene === FOREST\)\)/);
  assert.match(mia, /movement_mode:"virtual_portal_state_handoff"/);
  assert.match(mia, /physical_world:false/);
  assert.match(mia, /else if \(action === "leave" && s\.session_status === "active"\)/);
});

test("existing destinations keep their grant checks and no other scene travel is enabled", () => {
  assert.match(family, /policy_precedence:"SUBJECT_SPECIFIC_ACTIVE_GRANT_REQUIRED"/);
  assert.match(mia, /Only the bidirectional Forest_Corner ↔ Palace virtual portal is enabled/);
  assert.match(mia, /其他目的地仍不可跨场景移动/);
});
