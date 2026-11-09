import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";

test("Ed25519 envelope signature verifies and detects payload tampering", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const payload = Buffer.from(JSON.stringify({ test_only: true, frame_id: "windows-camera-image-plane-v1" }));
  const hash = createHash("sha256").update(payload).digest("hex");
  const envelope = ["ZHI-MIA-PERCEPTION-V1","00000000-0000-4000-8000-000000000000",
    "windows-webcam-ed25519-v1","webcam-test-1","2026-11-09T00:00:00.000Z","nonce-test-1234567890",hash].join("\n");
  const signature = sign(null, Buffer.from(envelope), privateKey);
  assert.equal(verify(null, Buffer.from(envelope), publicKey, signature), true);
  const changed = envelope.replace(hash, "0".repeat(64));
  assert.equal(verify(null, Buffer.from(changed), publicKey, signature), false);
});

test("camera payload fits the ingress 64 KiB raw payload ceiling at the 40 KiB JPEG cap", () => {
  const jpeg = Buffer.alloc(40 * 1024, 7);
  const payload = Buffer.from(JSON.stringify({
    capture_mode:"user_initiated_single_frame",media_type:"image/jpeg",
    image_b64url:jpeg.toString("base64url"),image_sha256:createHash("sha256").update(jpeg).digest("hex"),
    width:320,height:240,frame_id:"windows-camera-image-plane-v1",
    coordinates:{x:160,y:120},coordinate_semantics:"image_pixel_center_not_world_coordinates",
    camera_source:"windows_builtin_webcam_via_local_gateway"
  }));
  assert.ok(payload.length < 64 * 1024, `payload was ${payload.length} bytes`);
  assert.ok(payload.toString("base64url").length < 90000);
});
