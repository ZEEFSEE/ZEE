import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createHash, sign } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
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


test("signed licence verifier allows valid licence and denies revoked licence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zhi-license-"));
  try {
    const licensePath = join(dir, "license.json");
    const licenseSigPath = join(dir, "license.sig");
    const revocationsPath = join(dir, "revocations.json");
    const revocationsSigPath = join(dir, "revocations.sig");
    const pubPath = join(dir, "issuer-public.pem");
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const now = Date.now();
    const iso = (ms) => new Date(ms).toISOString();
    const license = {
      protocol: "ZHI-LICENSE-1.0",
      license_id: "LIC-TEST-00000001",
      asset_id: "LUNA-CHAR-0001",
      version: "1.0.0",
      licensee_id: "TEST-USER",
      issued_at: iso(now - 60000),
      not_before: iso(now - 30000),
      expires_at: iso(now + 3600000),
      scope: ["web-display"],
      status: "active"
    };
    const revocations = {
      protocol: "ZHI-REVOCATIONS-1.0",
      issued_at: iso(now),
      revoked_license_ids: []
    };
    const licenseBytes = Buffer.from(JSON.stringify(license, null, 2) + "\n");
    const revocationsBytes = Buffer.from(JSON.stringify(revocations, null, 2) + "\n");
    await writeFile(licensePath, licenseBytes);
    await writeFile(licenseSigPath, sign(null, licenseBytes, privateKey).toString("base64") + "\n");
    await writeFile(revocationsPath, revocationsBytes);
    await writeFile(revocationsSigPath, sign(null, revocationsBytes, privateKey).toString("base64") + "\n");
    await writeFile(pubPath, publicKey.export({ type: "spki", format: "pem" }));

    const args = [licensePath, licenseSigPath, revocationsPath, revocationsSigPath, pubPath, "LUNA-CHAR-0001", "1.0.0", "web-display"];
    let result = run(join(repoRoot, "tools/zhi-glb/verify-license.mjs"), args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, "allowed");

    revocations.revoked_license_ids = [license.license_id];
    const changedRevocations = Buffer.from(JSON.stringify(revocations, null, 2) + "\n");
    await writeFile(revocationsPath, changedRevocations);
    await writeFile(revocationsSigPath, sign(null, changedRevocations, privateKey).toString("base64") + "\n");
    result = run(join(repoRoot, "tools/zhi-glb/verify-license.mjs"), args);
    assert.notEqual(result.status, 0);
    assert.equal(JSON.parse(result.stdout).status, "denied");
    assert.equal(JSON.parse(result.stdout).checks.not_revoked, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
