# Mia Independent Universe — 3D Prototype

This is a standalone browser-based 3D universe prototype, separate from the ZHI world map and the Mia chat application.

## Open locally / publish

Serve this folder over HTTP (ES modules generally do not run reliably from `file://`) or publish it as a static GitHub Pages path:

`https://zeefsee.github.io/ZEE/mia-universe/`

The URL is a deployment target only; it will work only after the branch is merged and GitHub Pages serves the updated repository.

## Prototype capabilities

- WebGL 3D rendering using Three.js, with orbit/zoom camera controls.
- Continuously pulsing central world, orbiting objects, star field, and user-adjustable rhythm speed/amplitude.
- Create world spheres, moons, rhythm rings, and visual “life seeds”.
- **Mia-reviewed construction queue**: proposals carry a schema version and target position. A deterministic policy module checks required fields, allowed build types, duplicate requests, spatial conflicts, universe bounds, and a 100-entity safety cap. Failed checks require revision and do not create an entity; eligible proposals still require the explicit approval action.
- A local audit log records submission, rule-review outcome, approval/build or rejection. Schema-v3 browser snapshots preserve the audit log and proposal details; restore validates entity types, positions, rotations, scales, and scene-size limits before changing the current scene.
- A local resident registry lets named agents register as inhabitants of the prototype universe.
- Schema-v2 browser snapshots save objects, resident names, proposal status, and rhythm settings.
- Save/load a scene snapshot in this browser's `localStorage`.
- Dimension slider offers a visual higher-dimensional projection experiment; it is not a mathematically complete higher-dimensional simulation.

## AI review contract (not yet connected)

- `review-contract.mjs` defines the future structured review boundary: exact proposal ID, immutable revision number, decision (`approve`, `revise`, `reject`), and a bounded rationale.
- Malformed responses, stale proposal versions, unknown decisions, or missing rationale fail closed to `revise`.
- A model's `approve` result only means “eligible for a separate guarded approval step”; it never authorizes build execution by itself.
- Deterministic safety validation remains authoritative. An AI response cannot override a failed safety check.
- This is a pure local contract module only. It is **not connected to any AI provider, network endpoint, database, or live Mia reasoning**.

## Important current limits

- This first increment is a **visual 3D prototype**. Governance checks are deterministic rules, **not a live Mia AI judgment**; actual AI-generated reviews, autonomous decision-making, authenticated agent identities, and a shared execution service are not connected yet.
- The resident registry is local demo data; it does not yet connect real external agents, simulate persistent needs/relationships, or provide shared multiplayer life.
- Persistence is local to the current browser/device. It is not cloud sync, and clearing browser storage can remove the saved snapshot.
- It does not read or write ZHI Core, `zee-extension`, ZHI tokens, or any database.
- It requires network access to the pinned Three.js CDN imports.
- The “life seed” is currently a visual object, not an autonomous creature.
- No production deployment or live-world change is implied by adding this source file.

## Next implementation increment

1. Implement a dedicated authenticated review endpoint, isolated from ZHI Core and the Mia chat database; do not reuse the existing ZHI AGNES chat endpoint.
2. Connect the endpoint to a configured AI provider using server-side secrets only; keep deterministic safety checks as a hard guardrail and fail closed on timeouts/errors.
3. Add browser/runtime tests for approval gating, save/restore, and malformed snapshots.
4. Only after this browser prototype is validated, choose a dedicated persistence backend for the independent universe. Do not use the Mia chat database or ZHI Core by assumption.
