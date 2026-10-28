import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createHash, sign } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(new URL("../..", import.meta.url).pathname);
const inspectScript = join(repoRoot, "tools/zhi-glb/inspect-glb.mjs");
const verifyScript = join(repoRoot, "tools/zhi-glb/verify-manifest.mjs");

function minimalGlb() {
  const b = Buffer.alloc(12);
  b.writeUInt32LE(0x46546c67, 0);
  b.writeUInt32LE(2, 4);
  b.writeUInt32LE(12, 8);
  return b;
}
function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

test("inspector accepts a valid GLB header and reports SHA-256", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zhi-glb-"));
  try {
    const glbPath = join(dir, "model.glb");
    await writeFile(glbPath, minimalGlb());
    const result = run(inspectScript, [glbPath]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "header_valid");
    assert.equal(report.sha256, createHash("sha256").update(minimalGlb()).digest("hex"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("inspector rejects mismatched declared file length", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zhi-glb-"));
  try {
    const glbPath = join(dir, "bad.glb");
    const b = minimalGlb();
    b.writeUInt32LE(13, 8);
    await writeFile(glbPath, b);
    const result = run(inspectScript, [glbPath]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /does not match actual size/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("manifest verifier accepts valid signature/hash and rejects tampered GLB", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zhi-glb-"));
  try {
    const glbPath = join(dir, "model.glb");
    const manifestPath = join(dir, "manifest.json");
    const sigPath = join(dir, "manifest.sig");
    const pubPath = join(dir, "issuer-public.pem");
    const glb = minimalGlb();
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const manifest = {
      protocol: "ZHI-GLB-ASSET-1.0",
      asset_id: "LUNA-CHAR-0001",
      version: "1.0.0",
      format: "glb",
      hash_algorithm: "SHA-256",
      signature_algorithm: "Ed25519",
      file_hash: createHash("sha256").update(glb).digest("hex"),
      license_policy: "license-v1",
      fingerprint_policy: "per-license-copy",
      status: "pending_verification"
    };
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
    await writeFile(glbPath, glb);
    await writeFile(manifestPath, manifestBytes);
    await writeFile(sigPath, sign(null, manifestBytes, privateKey).toString("base64") + "\n");
    await writeFile(pubPath, publicKey.export({ type: "spki", format: "pem" }));

    let result = run(verifyScript, [glbPath, manifestPath, sigPath, pubPath]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, "verified");

    const changed = Buffer.from(glb);
    changed[4] = 3;
    await writeFile(glbPath, changed);
    result = run(verifyScript, [glbPath, manifestPath, sigPath, pubPath]);
    assert.notEqual(result.status, 0);
    assert.equal(JSON.parse(result.stdout).status, "rejected");
    assert.equal(JSON.parse(result.stdout).file_hash_valid, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
