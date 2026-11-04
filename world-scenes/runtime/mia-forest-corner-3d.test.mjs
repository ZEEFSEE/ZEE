import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { mapLayoutPoint, validateForestSource } from "./mia-forest-corner-3d.mjs";
const root = new URL("../../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));

test("maps scene-local 2D points to display XZ without claiming world calibration", () => {
  assert.deepEqual(mapLayoutPoint({x:650,y:240}), {x:650,y:0,z:-240});
  assert.throws(() => mapLayoutPoint({x:1}), /finite scene-local/);
});

test("validates Forest Corner source and five authored stone slabs", async () => {
  const [scene,geometry,path] = await Promise.all([
    readJson("mia/forest-corner.json"),
    readJson("world-scenes/mia-assets/geometry.json"),
    readJson("world-scenes/mia-assets/stone-path-forest-to-lounge.json")
  ]);
  const result=validateForestSource(scene,geometry,path);
  assert.equal(result.valid,true,result.errors.join("; "));
  assert.equal(path.visual_mesh.slabs.length,5);
});

test("rejects out-of-bounds source entities", () => {
  const scene={slug:"mia-forest-corner",local_coordinate_system:{width:1000,height:700},entities:[{id:"bad",x:1200,y:20}]};
  const geometry={scene_id:"mia-forest-corner",coordinate_space:"scene-local"};
  const path={visual_mesh:{slabs:[1,2,3,4,5]}};
  const result=validateForestSource(scene,geometry,path);
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(e=>e.includes("outside local bounds")));
});

test("rejects incomplete geometry and path definitions", () => {
  const result=validateForestSource(
    {slug:"mia-forest-corner",local_coordinate_system:{width:1000,height:700},entities:[{x:1,y:1}]},
    {scene_id:"wrong",coordinate_space:"world"},
    {visual_mesh:{slabs:[]}}
  );
  assert.equal(result.valid,false);
  assert.ok(result.errors.length>=3);
});
