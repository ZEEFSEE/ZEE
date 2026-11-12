import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const html=await readFile(new URL("../../mia-public-world-runtime.html",import.meta.url),"utf8");
const manifest=JSON.parse(await readFile(new URL("../public-destinations/world-spatial-manifest.v1.json",import.meta.url),"utf8"));
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]??"";

test("public visitor runtime contains no resident chat, identity bridge, or private session access",()=>{
 assert.match(html,/MIA 世界 · 公共访客入口/);
 assert.doesNotMatch(html,/mia-chat|mia_chat_token|MIA_CHAT_URL|prototype-mia|identity_id|postMessage\s*\(/i);
 assert.doesNotMatch(html,/auto-explore|stop-explore|requestMiaPlan|async function explore/i);
});

test("visitor controls reference existing elements and offer a public return path",()=>{
 for(const id of ["return-forest","reset-position","destinations","runtime-status","runtime-detail","runtime-tags","state-output","perception-output"])
  assert.match(html,new RegExp('id="'+id+'"'));
 for(const id of ["auto-explore","stop-explore"])
  assert.doesNotMatch(html,new RegExp('id="'+id+'"'));
 assert.match(html,/mia-world-entrance\.html/);
});

test("all seven catalogued scenes are available through the visitor scene selector",()=>{
 assert.equal(manifest.scenes.length,7);
 assert.match(script,/for\(const s of manifest\.scenes\)/);
 assert.match(script,/new URLSearchParams\(location\.search\)/);
 assert.match(script,/goToScene\(requestedDestination\)/);
});

test("visitor runtime module script parses as an async JavaScript module body",()=>{
 assert.ok(script.length>0,"module script found");
 const body=script.replace(/^import .*?;\s*$/gm,"");
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 assert.doesNotThrow(()=>new AsyncFunction(body));
});
