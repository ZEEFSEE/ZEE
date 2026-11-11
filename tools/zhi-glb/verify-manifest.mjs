#!/usr/bin/env node
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";

function usage() {
  console.error("Usage: node tools/zhi-glb/verify-manifest.mjs <model.glb> <manifest.json> <manifest.sig> <issuer-public.pem>");
  process.exit(2);
}

const [glbPath, manifestPath, signaturePath, publicKeyPath] = process.argv.slice(2);
if (!glbPath || !manifestPath || !signaturePath || !publicKeyPath) usage();

try {
  const [glb, manifestBytes, signatureText, publicPem] = await Promise.all([
    readFile(glbPath),
    readFile(manifestPath),
    readFile(signaturePath, "utf8"),
    readFile(publicKeyPath, "utf8")
  ]);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const signature = Buffer.from(signatureText.trim(), "base64");
  const publicKey = createPublicKey(publicPem);

  if (publicKey.asymmetricKeyType !== "ed25519") throw new Error("Issuer public key must be Ed25519.");
  const signatureValid = verify(null, manifestBytes, publicKey, signature);
  const actualHash = createHash("sha256").update(glb).digest("hex");
  const hashValid = typeof manifest.file_hash === "string" && actualHash === manifest.file_hash.toLowerCase();
  const shapeValid = manifest.format === "glb" &&
    typeof manifest.asset_id === "string" && manifest.asset_id.length > 0 &&
    typeof manifest.version === "string" && manifest.version.length > 0 &&
    manifest.hash_algorithm === "SHA-256" &&
    manifest.signature_algorithm === "Ed25519";

  const result = {
    status: signatureValid && hashValid && shapeValid ? "verified" : "rejected",
    signature_valid: signatureValid,
    file_hash_valid: hashValid,
    manifest_shape_valid: shapeValid,
    asset_id: manifest.asset_id ?? null,
    version: manifest.version ?? null,
    actual_sha256: actualHash
  };
  console.log(JSON.stringify(result, null, 2));
  if (!signatureValid || !hashValid || !shapeValid) process.exitCode = 1;
} catch (error) {
  console.error(`REJECTED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
