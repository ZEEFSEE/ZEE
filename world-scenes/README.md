# Mia Extensible Virtual World — Scene Data

This directory describes scene files for Mia's existing virtual world. It is an open-ended, connected scene graph—not a catalog of every ZHI location and not a new parallel world-state database.

## Root and source

- Root scene: `mia-forest-corner`
- Source: `mia/forest-corner.json` on the repository's main branch.
- Source-backed local dimensions: 1000 × 700 layout units.
- Existing local entities: greenhouse, data-shelf, lounge, forest-rabbit.
- These are Mia scene-local coordinates, not ZHI world-travel coordinates.

The source file is preserved. This branch contains a scene-data representation and does not change the source, database, runtime, or deployed UI.

## Open-ended, connected expansion

Add `scenes/<stable-id>.json` and any referenced geometry/entity/navigation/interaction JSON files. Register the scene in `world-manifest.json`.

- The root has `parent_scene_id: null`.
- Every other catalogued scene must name a registered parent scene.
- The parent chain must lead back to `mia-forest-corner`.
- Keep each scene's local coordinate system separate. A cross-scene travel link needs an explicit connection/transform; never assume two local coordinate systems align.
- Unknown positions, dimensions, and transforms stay `null` or `unverified`.
- Disconnected files must not be added to the catalog. The validator flags them; it does not automatically delete source files.
- A scene file does not mean the scene is rendered, persisted in a database, or reachable in the running Mia app.

## Validate

Run from the repository root:

```sh
node --check world-scenes/validate-scenes.mjs
node world-scenes/validate-scenes.mjs
```

This is a read-only structural and connectivity check, not a 3D geometry, runtime, or deployment test.
