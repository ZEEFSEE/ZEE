# Prototype Mia Forest Corner — V1.1 Baseline Snapshot

- Snapshot ID: `prototype-mia-forest-corner-v1.1`
- Source repository: `ZEEFSEE/ZEE`
- Source commit: `c0da50c634e90ae627e9ee849036fd279a6f4177`
- Scope: prototype Mia only.

## Frozen scene anchors

- Scene: `mia-forest-corner`
- Local layout: 1000 × 700 (scene-local units, not ZHI global coordinates)
- Lounge: (800, 350), `idle/listening`
- Greenhouse: (180, 120)
- Data shelf: (500, 140)
- Rabbit: (300, 280)
- Tiny Planet Friends GLB anchor: (650, 240); actual 3D runtime rendering remains unverified.
- Roses: 3 red + 3 yellow + 3 white = 9.

## Contents

The `repo/` directory contains exact copies of the scene source, scene page, default entry page, Mia chat page, scene catalog, validator, scene metadata and referenced local assets. `snapshot-manifest.json` records the source Git blob SHA-1 and SHA-256 for each file.

## Verification

Run `node verify-snapshot.mjs` from this directory. A matching hash proves byte-for-byte preservation of the archived file; it does not prove runtime 3D behavior or successful Pages deployment.

## Restore

This is an immutable baseline archive, not an automatic production rollback switch. To restore, copy the corresponding archived `repo/` files back to their original `source_path` values in a reviewed Git commit. Do not restore unrelated files or alter production database state. Verify the resulting commit and Pages deployment separately.

## Safety boundaries

No Supabase writes, chat-history mutations, personality/emotion-engine changes, API changes, AURORA reconnection, or other-agent changes are part of this snapshot.
