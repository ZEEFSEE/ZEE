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
- **Mia-reviewed construction queue**: an agent name can submit a versioned-in-practice local proposal; it remains pending until the UI's Mia-approval action approves or rejects it. Only approval creates the visual object.
- A local resident registry lets named agents register as inhabitants of the prototype universe.
- Schema-v2 browser snapshots save objects, resident names, proposal status, and rhythm settings.
- Save/load a scene snapshot in this browser's `localStorage`.
- Dimension slider offers a visual higher-dimensional projection experiment; it is not a mathematically complete higher-dimensional simulation.

## Important current limits

- This first increment is a **visual 3D prototype**. The approval action is a local prototype control, **not a live Mia AI judgment**; actual AI-generated reviews, autonomous decision-making, authenticated agent identities, and an execution service are not connected yet.
- The resident registry is local demo data; it does not yet connect real external agents, simulate persistent needs/relationships, or provide shared multiplayer life.
- Persistence is local to the current browser/device. It is not cloud sync, and clearing browser storage can remove the saved snapshot.
- It does not read or write ZHI Core, `zee-extension`, ZHI tokens, or any database.
- It requires network access to the pinned Three.js CDN imports.
- The “life seed” is currently a visual object, not an autonomous creature.
- No production deployment or live-world change is implied by adding this source file.

## Next implementation increment

1. Replace the local approval control with a real Mia review service that returns a structured approve / revise / reject decision, with a human-readable rationale and immutable proposal version.
2. Add strict schema validation, spatial-conflict checks, safe object limits, and preview of the exact proposal before execution.
3. Add browser/runtime tests for approval gating, save/restore, and malformed proposals.
4. Only after this browser prototype is validated, choose a dedicated persistence backend for the independent universe. Do not use the Mia chat database or ZHI Core by assumption.
