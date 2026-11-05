import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CHILDREN } from "../runtime/family-runtime.mjs";
import { auditFamilyWorldAccess, FAMILY_DESTINATIONS } from "../runtime/world-access-audit.mjs";

const manifestUrl = new URL("../../world-scenes/public-destinations/world-spatial-manifest.v1.json", import.meta.url);

test("read-only family audit sees the five authored destination scenes and routes", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const audit = auditFamilyWorldAccess(manifest, CHILDREN);
  assert.equal(audit.mode, "READ_ONLY_AUDIT");
  assert.equal(audit.productionManifestModified, false);
  assert.equal(audit.childCount, 5);
  assert.equal(audit.destinationCount, 5);
  assert.equal(audit.rows.length, 25);
  assert.ok(audit.rows.every(row => row.sceneExists && row.routeExists));
  assert.ok(audit.rows.every(row => row.transitionId));
});

test("family children remain denied by the current Mia-only world scope", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  assert.equal(manifest.scope.principal, "prototype-mia");
  assert.equal(manifest.scope.other_agents_access, false);
  assert.equal(manifest.scope.aurora_enabled, false);
  assert.equal(manifest.scope.federation_enabled, false);

  const audit = auditFamilyWorldAccess(manifest, CHILDREN);
  assert.equal(audit.familyAccessGranted, false);
  assert.ok(audit.rows.every(row => row.status === "BLOCKED"));
  assert.ok(audit.rows.every(row => row.reason === "manifest_scope_denies_non_mia_agents"));
});

test("five destination contracts are authored but not runtime-validated", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const audit = auditFamilyWorldAccess(manifest, CHILDREN);
  assert.deepEqual(
    [...new Set(audit.rows.map(row => row.destinationId))].sort(),
    [...FAMILY_DESTINATIONS].sort()
  );
  assert.ok(audit.rows.every(row => row.runtimeStatus === "contract_defined_runtime_validation_pending"));
  assert.ok(audit.rows.every(row => row.status !== "ACTIVE"));
});
