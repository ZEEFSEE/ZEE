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

## Create a connected draft scene

On a local checkout of this branch, run:

```sh
node world-scenes/create-scene.mjs --id rose-garden --name "玫瑰花园" --parent mia-forest-corner
node world-scenes/validate-scenes.mjs
```

Choose `--parent` from an existing manifest scene ID. This allows a growing tree: for example, a lake scene can be a child of the rose garden, and a small cabin can be a child of the lake. The tool refuses duplicate IDs, unregistered parents, and overwriting existing scene files. It creates a draft and registers it in the manifest; it does not create 3D meshes, runtime links, database rows, or deployments.

The tool is a local developer utility. It does not give the Mia chatbot itself GitHub write access. To let Mia author scene files automatically later, a separate permission-limited integration must call an equivalent validated workflow and require review before merging.
