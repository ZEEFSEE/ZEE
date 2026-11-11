#!/usr/bin/env node
import { createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";

function usage() {
  console.error("Usage: node tools/zhi-glb/verify-license.mjs <license.json> <license.sig> <revocations.json> <revocations.sig> <issuer-public.pem> <asset-id> <version> <scope>");
  process.exit(2);
}

const [licensePath, licenseSigPath, revocationsPath, revocationsSigPath, publicKeyPath, assetId, version, scope] = process.argv.slice(2);
if (![licensePath, licenseSigPath, revocationsPath, revocationsSigPath, publicKeyPath, assetId, version, scope].every(Boolean)) usage();

function isValidSignature(bytes, signatureText, key) {
  const signature = Buffer.from(signatureText.trim(), "base64");
  return verify(null, bytes, key, signature);
}
function parseDate(value, field) {
  const date = Date.parse(value);
  if (!Number.isFinite(date)) throw new Error(`Invalid or missing ${field} timestamp.`);
  return date;
}

try {
  const [licenseBytes, licenseSig, revocationsBytes, revocationsSig, publicPem] = await Promise.all([
    readFile(licensePath), readFile(licenseSigPath, "utf8"),
    readFile(revocationsPath), readFile(revocationsSigPath, "utf8"),
    readFile(publicKeyPath, "utf8")
  ]);
  const key = createPublicKey(publicPem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("Issuer public key must be Ed25519.");

  const licenseSignatureValid = isValidSignature(licenseBytes, licenseSig, key);
  const revocationSignatureValid = isValidSignature(revocationsBytes, revocationsSig, key);
  if (!licenseSignatureValid || !revocationSignatureValid) {
    throw new Error("License or revocation-list signature is invalid.");
  }

  const license = JSON.parse(licenseBytes.toString("utf8"));
  const revocations = JSON.parse(revocationsBytes.toString("utf8"));
  if (license.protocol !== "ZHI-LICENSE-1.0" || revocations.protocol !== "ZHI-REVOCATIONS-1.0") {
    throw new Error("Unsupported licence or revocation-list protocol.");
  }
  if (!Array.isArray(license.scope) || !Array.isArray(revocations.revoked_license_ids)) {
    throw new Error("Malformed scope or revocation list.");
  }

  const now = Date.now();
  const notBefore = parseDate(license.not_before, "not_before");
  const expiresAt = parseDate(license.expires_at, "expires_at");
  const issuedAt = parseDate(license.issued_at, "issued_at");
  if (expiresAt <= notBefore || issuedAt > expiresAt || issuedAt > now + 5 * 60 * 1000) {
    throw new Error("Invalid license time interval or issued_at is in the future.");
  }

  const revocationIssuedAt = parseDate(revocations.issued_at, "revocations.issued_at");
  const maxRevocationAgeHours = Number(process.env.ZHI_MAX_REVOCATION_AGE_HOURS ?? "24");
  if (!Number.isFinite(maxRevocationAgeHours) || maxRevocationAgeHours <= 0) {
    throw new Error("ZHI_MAX_REVOCATION_AGE_HOURS must be a positive number.");
  }
  const revocationAgeMs = now - revocationIssuedAt;
  const revocationListFresh = revocationAgeMs >= -5 * 60 * 1000 &&
    revocationAgeMs <= maxRevocationAgeHours * 60 * 60 * 1000;

  const checks = {
    license_signature_valid: licenseSignatureValid,
    revocation_signature_valid: revocationSignatureValid,
    revocation_list_fresh: revocationListFresh,
    asset_match: license.asset_id === assetId,
    version_match: license.version === version,
    scope_allowed: license.scope.includes(scope),
    license_active: license.status === "active",
    not_yet_expired: now < expiresAt,
    effective: now >= notBefore,
    not_revoked: !revocations.revoked_license_ids.includes(license.license_id)
  };
  const allowed = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({
    status: allowed ? "allowed" : "denied",
    license_id: license.license_id ?? null,
    asset_id: assetId,
    version,
    requested_scope: scope,
    expires_at: license.expires_at,
    revocation_list_issued_at: revocations.issued_at ?? null,
    revocation_list_age_ms: revocationAgeMs,
    max_revocation_age_hours: maxRevocationAgeHours,
    checks
  }, null, 2));
  if (!allowed) process.exitCode = 1;
} catch (error) {
  console.error(`DENIED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
