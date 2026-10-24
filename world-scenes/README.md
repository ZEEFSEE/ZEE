# ZHI 3D Scene Data Foundation

This directory defines data contracts for adding 3D scenes to the existing ZHI world. It is a data-only foundation: it does not render scenes, change world state, write to a database, or deploy anything.

## Source-of-truth rules

- Existing ZHI world state, identities, movement and interaction rules remain authoritative.
- A scene file describes spatial presentation and must not become a parallel world-state database.
- Unknown coordinates remain `null` with a `verification_status` of `unverified`; never infer production coordinates from illustrations or local scene coordinates.
- Local scene coordinates and ZHI world coordinates are distinct unless an explicit, verified mapping says otherwise.
- Do not claim an agent has arrived based only on an accepted movement request; arrival must be confirmed by the authoritative world state.
- Stable IDs must be preserved across revisions. Do not silently rename existing places or agents.
- No database migration, database write, deployment, or renderer is included in this foundation.

## Layout

- `world-manifest.json`: catalog, version, and coordinate conventions.
- `scenes/*.json`: per-place scene metadata and verification state.
- `schemas/*.schema.json`: JSON Schema contracts for geometry, entities, navigation, interactions, and coordinate mappings.

The initial scene files are deliberately skeletal. They are not a claim that their coordinates or geometry have been verified. Populate them only after read-only verification against the authoritative ZHI world data.
