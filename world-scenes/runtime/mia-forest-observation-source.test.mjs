import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../../supabase/functions/mia-forest-observation/index.ts", import.meta.url), "utf8");

test("observation function is scoped to prototype Mia and Forest Corner", () => {
  assert.match(source, /const MIA_ID = "cb6d01b4-0e3f-46ee-8946-360aa91db1ea"/);
  assert.match(source, /state\.scene_id !== "mia-forest-corner"/);
  assert.match(source, /\.eq\("identity_id", MIA_ID\)/);
});

test("observation endpoint authenticates the existing Mia chat session", () => {
  assert.match(source, /payload\?\.aud === "mia-chat"/);
  assert.match(source, /payload\?\.sub === "mia-admin"/);
  assert.match(source, /authorization\.startsWith\("Bearer "\)/);
});

test("database access is read-only and limited to the autonomy run projection", () => {
  assert.match(source, /\.from\("mia_forest_autonomy_runs"\)/);
  assert.match(source, /\.select\("id,identity_id,status,planned_action,planner_reason,after_state,details,created_at"\)/);
  assert.match(source, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(source, /\.limit\(1\)/);
  assert.doesNotMatch(source, /\.(?:insert|update|upsert|delete)\s*\(/i);
});

test("response explicitly denies camera perception and movement authority", () => {
  assert.match(source, /live_camera_perception: false/);
  assert.match(source, /physical_3d_movement: false/);
  assert.match(source, /may_drive_movement: false/);
  assert.match(source, /read_only: true/);
});
