#!/usr/bin/env node
import {readFile} from "node:fs/promises";import path from "node:path";import{fileURLToPath}from"node:url";
const root=path.dirname(fileURLToPath(import.meta.url));const read=async p=>JSON.parse(await readFile(path.join(root,p),"utf8"));
const manifest=await read("world-manifest.json"),nav=await read("public-destinations/navigation.json");
const expected=["crystal-forest","ocean-of-light","memory-valley","living-city","greenhouse"],errors=[];
const scenes=new Map(manifest.scenes.map(x=>[x.scene_id,x]));
for(const id of expected){const entry=scenes.get(id);if(!entry)errors.push("missing manifest destination: "+id);else if(entry.parent_scene_id!=="mia-forest-corner")errors.push("destination parent mismatch: "+id);
const s=await read("scenes/"+id+".json").catch(()=>null);if(!s)errors.push("missing scene metadata: "+id);else{if(s.access?.scope!=="mia_world_public"||s.access?.public_chat!==false)errors.push("public scope mismatch: "+id);if(s.destination?.kind!=="public_destination")errors.push("not public destination: "+id);if(s.coordinate_reference?.cross_scene_transform!==null)errors.push("unexpected transform: "+id);}}
const ids=new Set(nav.nodes.map(n=>n.node_id));if(!ids.has(nav.root_node_id))errors.push("missing root node");const adj=new Map([...ids].map(id=>[id,[]]));
for(const e of nav.edges){if(!ids.has(e.from)||!ids.has(e.to)){errors.push("missing endpoint: "+e.edge_id);continue;}adj.get(e.from).push(e.to);if(e.direction==="bidirectional")adj.get(e.to).push(e.from);}
const reached=new Set([nav.root_node_id]),q=[nav.root_node_id];while(q.length){for(const n of adj.get(q.shift())??[])if(!reached.has(n)){reached.add(n);q.push(n);}}
for(const id of expected)if(!reached.has("portal-"+id))errors.push("unreachable: "+id);
if(nav.edges.length!==expected.length)errors.push("route count mismatch");if(nav.route_policy?.runtime_movement!=="not_integrated")errors.push("runtime flag must fail closed");
console.log("Destinations:",expected.length,"Routes:",nav.edges.length,"Reachable:",expected.filter(id=>reached.has("portal-"+id)).length+"/5");console.log("Runtime movement: NOT TESTED");for(const e of errors)console.error("ERROR:",e);console.log(errors.length?"FAIL":"PASS (static graph only)");if(errors.length)process.exitCode=1;