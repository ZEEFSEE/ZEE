# ZHI GLB Character Asset Pipeline v1.0 (isolated draft)

## Status
Draft tooling on a feature branch only. It is not deployed and does not change any database, API, production asset, or existing key.

## Scope
- Input: an existing GLB file, initially intended to be `LUNA_3D角色.glb`.
- Preserve original bytes; all optimization happens on a separate working copy.
- Validate the GLB container header, compute SHA-256, and verify a detached Ed25519 signature over the exact manifest bytes.
- Keep licence issuance, revocation, per-copy fingerprinting, and platform integration as later phases. Do not imply those controls exist until implemented and tested.

## Non-goals for this phase
- No Supabase schema or data changes.
- No Edge Function deployment.
- No change to existing API keys or business APIs.
- No GLB upload or publication to the public repository.
- No claim that a signature proves legal copyright ownership.

## Current asset identity draft
- Candidate ID: `LUNA-CHAR-0001`
- Initial version: `1.0.0`
- Candidate file: `LUNA_3D角色.glb` (must be supplied to the local pipeline; not confirmed present in this repository).

## Local checks
Requires Node.js 20+ and no third-party packages.

```sh
node tools/zhi-glb/inspect-glb.mjs path/to/model.glb
node tools/zhi-glb/verify-manifest.mjs path/to/model.glb path/to/manifest.json path/to/manifest.sig path/to/issuer-public.pem
```

The first command checks the GLB container header and prints its SHA-256. It does not replace a full glTF validator or visual/runtime QA.

The second command:
1. verifies a detached Ed25519 signature over the exact bytes of `manifest.json`;
2. parses the manifest;
3. computes the GLB SHA-256 and compares it with `file_hash`;
4. verifies the asset ID and format fields exist.

The private signing key must remain outside the repository and frontend. Only the public key may be distributed. Because signatures cover the exact manifest bytes, changing whitespace or field order after signing invalidates the signature.

## Release gates
1. Structural validation and visual review pass.
2. Manifest hash matches the exact release GLB.
3. Detached signature verifies using a trusted public key.
4. Licence expiry/revocation and copy fingerprinting are separately implemented and tested.
5. Platform adapter passes compatibility tests before any production integration.

## Rollback
This branch contains tooling only. Do not merge or deploy the platform adapter until review and test evidence exists. Removing/turning off the new tools must not affect existing ZHI pages or services.


## Phase 2: signed licence and revocation prototype

`tools/zhi-glb/verify-license.mjs` checks a signed licence and signed revocation-list snapshot using the issuer Ed25519 public key. It checks asset/version/scope, activation time, expiry, active status, and whether the licence ID appears in the signed revocation list. All JSON signatures cover the exact file bytes.

Example:
```sh
node tools/zhi-glb/verify-license.mjs license.json license.sig revocations.json revocations.sig issuer-public.pem LUNA-CHAR-0001 1.0.0 web-display
```

Security limitation: this is a local/offline verification prototype, not an online identity or entitlement service. A stale revocation snapshot can miss a newly revoked licence. Production access must refresh revocation state from a trusted service, authenticate the requesting user, and fail closed when policy requires freshness. The current phase does not create database tables, change existing APIs, or deploy an Edge Function.
