import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html=readFileSync(new URL("../simulator.html",import.meta.url),"utf8");

test("browser simulator is self-contained and imports only its local module",()=>{
  assert.match(html,/from "\.\/runtime\/five-child-spatial-simulator\.mjs"/);
  assert.doesNotMatch(html,/<(?:script|link|img)[^>]+(?:https?:)?\/\//i);
  assert.doesNotMatch(html,/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/);
});

test("browser simulator does not use persistent browser storage or sensor APIs",()=>{
  assert.doesNotMatch(html,/\b(?:localStorage|sessionStorage|indexedDB|navigator\.geolocation|mediaDevices|getUserMedia)\b/);
  assert.match(html,/ISOLATED_SIMULATION_ONLY/);
  assert.match(html,/AUTHORED_VIRTUAL_SCENE_FIXTURE_NOT_SENSOR_DATA/);
});

test("browser simulator provides accessible interaction status and reset control",()=>{
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/id="reset"/);
  assert.match(html,/id="children"/);
  assert.match(html,/id="map"/);
});
