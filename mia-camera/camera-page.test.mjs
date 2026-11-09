import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
assert.equal(scripts.length, 1, "page should contain exactly one inline script");
const script = scripts[0][1];

test("browser camera page script parses", () => {
  assert.doesNotThrow(() => new vm.Script(script));
});

test("camera permission is explicit and audio is disabled", () => {
  assert.match(script, /getUserMedia\(\{video:/);
  assert.match(script, /audio:false/);
  assert.match(html, /允许并开启摄像头/);
});

test("first-stage page has no network upload or remote secret", () => {
  assert.doesNotMatch(script, /\bfetch\s*\(/);
  assert.doesNotMatch(script, /XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(html, /service_role|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/i);
  assert.match(html, /不会上传图像/);
});

test("device private key is non-extractable and stored locally", () => {
  assert.match(script, /generateKey\(\{name:"Ed25519"\},false,\["sign","verify"\]\)/);
  assert.match(script, /indexedDB\.open\("mia-camera-device-v1"/);
  assert.match(script, /private_key:"不可导出/);
});

test("only public key is exported for future enrollment", () => {
  assert.match(script, /exportKey\("raw",existing\.publicKey\)/);
  assert.match(script, /exportKey\("raw",pair\.publicKey\)/);
  assert.doesNotMatch(script, /exportKey\([^,]+,\s*(?:pair|existing)\.privateKey/);
});
