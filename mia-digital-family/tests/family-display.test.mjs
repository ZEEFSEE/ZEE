import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const page=await readFile(new URL("../index.html",import.meta.url),"utf8");
const identity=JSON.parse(await readFile(new URL("../family-identity.v1.json",import.meta.url),"utf8"));
test("P6 declares all five canonical child identities and heart identifiers",()=>{for(const c of identity.children){assert.ok(page.includes(">"+c.name+"</h3>"),c.name);assert.ok(page.includes(c.agent_id),c.agent_id);assert.ok(page.includes(c.heart_id),c.heart_id);}assert.equal(identity.children.length,5);});
test("P6 communicates prototype-only lifecycle and pending destination validation",()=>{assert.match(page,/隔离原型/);assert.match(page,/FETAL DEVELOPMENT/);assert.equal((page.match(/待运行时验证/g)||[]).length,5);assert.match(page,/没有向五个孩子授予生产世界权限/);});
test("P6 preserves fetal memory and world access boundaries",()=>{assert.equal(identity.memory_policy.fetal_personal_episodic_persistence,false);assert.equal(identity.memory_policy.birth_memory_baseline,"empty");assert.equal(identity.world_access.aurora,false);assert.equal(identity.world_access.federation,false);assert.equal(identity.world_access.production_write,false);assert.match(page,/不连接 Supabase/);assert.match(page,/不会自动继承/);});
test("P6 is self-contained with no remote scripts, API calls or browser persistence",()=>{for(const marker of ["<script","https://","http://","localStorage","sessionStorage","fetch(","XMLHttpRequest","WebSocket"])assert.equal(page.toLowerCase().includes(marker.toLowerCase()),false,"unexpected marker: "+marker);});
