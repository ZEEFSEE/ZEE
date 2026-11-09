import { createServer } from "node:http";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DEVICE_FILE = join(ROOT, "device.local.json");
const PORT = Number(process.env.MIA_CAMERA_PORT || 8787);
const HOST = "127.0.0.1";
const ENDPOINT = process.env.MIA_TEST_INGRESS_URL ||
  "https://boaiqnkhrytxwdpgkxti.supabase.co/functions/v1/mia-perception-ingress-test";
const API_KEY = process.env.MIA_TEST_SUPABASE_API_KEY || "";
const KEY_ID = "windows-webcam-ed25519-v1";
const FRAME_ID = "windows-camera-image-plane-v1";
const MAX_JPEG_BYTES = 40 * 1024;
const MAX_PAYLOAD_BYTES = 64 * 1024;

function loadOrCreateDevice() {
  if (existsSync(DEVICE_FILE)) return JSON.parse(readFileSync(DEVICE_FILE, "utf8"));
  mkdirSync(ROOT, { recursive: true });
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  const device = {
    source_id: randomUUID(),
    key_id: KEY_ID,
    public_key_b64url: Buffer.from(publicDer).subarray(-32).toString("base64url"),
    private_key_pem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    created_at: new Date().toISOString(),
  };
  writeFileSync(DEVICE_FILE, JSON.stringify(device, null, 2), { mode: 0o600, flag: "wx" });
  return device;
}
const device = loadOrCreateDevice();
const privateKey = createPrivateKey(device.private_key_pem);
const publicKey = createPublicKey(privateKey);
const derivedPublic = Buffer.from(publicKey.export({ type: "spki", format: "der" })).subarray(-32).toString("base64url");
if (derivedPublic !== device.public_key_b64url) throw new Error("local_device_keypair_mismatch");

function json(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}
function isLoopbackRequest(req) {
  const host = req.headers.host || "";
  return host === `127.0.0.1:${PORT}` || host === `localhost:${PORT}`;
}
async function readBody(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function makeEnvelope(payloadBytes, observedAt, eventId, nonce) {
  const payloadHash = createHash("sha256").update(payloadBytes).digest("hex");
  return [
    "ZHI-MIA-PERCEPTION-V1",
    device.source_id,
    device.key_id,
    eventId,
    observedAt,
    nonce,
    payloadHash,
  ].join("\n");
}
async function capture(req, res) {
  if (!isLoopbackRequest(req)) return json(res, 403, { ok: false, error: "loopback_only" });
  if (!API_KEY) return json(res, 503, { ok: false, error: "MIA_TEST_SUPABASE_API_KEY_not_configured" });
  if (req.headers["content-type"] !== "image/jpeg") {
    return json(res, 415, { ok: false, error: "jpeg_only" });
  }
  let jpeg;
  try { jpeg = await readBody(req, MAX_JPEG_BYTES); }
  catch { return json(res, 413, { ok: false, error: "jpeg_too_large" }); }
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 ||
      jpeg[jpeg.length - 2] !== 0xff || jpeg[jpeg.length - 1] !== 0xd9) {
    return json(res, 400, { ok: false, error: "invalid_jpeg" });
  }

  // This is a user-triggered still image, not a continuous stream or calibrated measurement.
  const imageHash = createHash("sha256").update(jpeg).digest("hex");
  const payload = {
    capture_mode: "user_initiated_single_frame",
    media_type: "image/jpeg",
    image_b64url: jpeg.toString("base64url"),
    image_sha256: imageHash,
    width: 320,
    height: 240,
    frame_id: FRAME_ID,
    coordinates: { x: 160, y: 120 },
    coordinate_semantics: "image_pixel_center_not_world_coordinates",
    camera_source: "windows_builtin_webcam_via_local_gateway",
  };
  const payloadBytes = Buffer.from(JSON.stringify(payload), "utf8");
  if (payloadBytes.length > MAX_PAYLOAD_BYTES) {
    return json(res, 413, { ok: false, error: "signed_payload_too_large", max_bytes: MAX_PAYLOAD_BYTES });
  }

  const observedAt = new Date().toISOString();
  const eventId = `webcam-${Date.now()}-${randomBytes(8).toString("hex")}`;
  const nonce = randomBytes(24).toString("base64url");
  const envelope = makeEnvelope(payloadBytes, observedAt, eventId, nonce);
  const signature = sign(null, Buffer.from(envelope, "utf8"), privateKey).toString("base64url");
  const requestBody = {
    test_only: true,
    source_id: device.source_id,
    key_id: device.key_id,
    event_id: eventId,
    observed_at: observedAt,
    nonce,
    payload_b64url: payloadBytes.toString("base64url"),
    signature_b64url: signature,
  };

  let upstream;
  try {
    upstream = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: API_KEY },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return json(res, 502, { ok: false, error: "mia_ingress_unreachable", image_sha256: imageHash });
  }
  const text = await upstream.text();
  let result;
  try { result = JSON.parse(text); } catch { result = { error: "invalid_ingress_response" }; }
  return json(res, upstream.status, {
    ...result,
    camera_capture: {
      mode: "user_initiated_single_frame",
      image_sha256: imageHash,
      bytes: jpeg.length,
      source_id: device.source_id,
      key_id: device.key_id,
    },
  });
}

const server = createServer(async (req, res) => {
  if (!isLoopbackRequest(req)) return json(res, 403, { ok: false, error: "loopback_only" });
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  if (req.method === "GET" && url.pathname === "/api/status") {
    return json(res, 200, {
      ok: true,
      local_only: true,
      enrolled: Boolean(process.env.MIA_CAMERA_ENROLLED === "true"),
      source_id: device.source_id,
      key_id: device.key_id,
      public_key_b64url: device.public_key_b64url,
      ingress_configured: Boolean(API_KEY),
      endpoint: ENDPOINT,
      capture_mode: "user_initiated_single_frame",
    });
  }
  if (req.method === "POST" && url.pathname === "/api/capture") return capture(req, res);
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    return res.end(readFileSync(join(ROOT, "public", "index.html")));
  }
  return json(res, 404, { ok: false, error: "not_found" });
});

server.listen(PORT, HOST, () => {
  console.log(`MIA local camera gateway: http://127.0.0.1:${PORT}`);
  console.log(`Source ID: ${device.source_id}`);
  console.log(`Key ID: ${device.key_id}`);
  console.log(`Public key (base64url): ${device.public_key_b64url}`);
  console.log("Private key remains in device.local.json; do not share or commit that file.");
  if (!API_KEY) console.log("Set MIA_TEST_SUPABASE_API_KEY in this PowerShell session before capture.");
});
