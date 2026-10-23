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
- Save/load a scene snapshot in this browser's `localStorage`.
- Dimension slider offers a visual higher-dimensional projection experiment; it is not a mathematically complete higher-dimensional simulation.

## Important current limits

- This first increment is a **visual 3D prototype**, not yet connected to Mia's AI decision-making or an autonomous scene-building service.
- Persistence is local to the current browser/device. It is not cloud sync, and clearing browser storage can remove the saved snapshot.
- It does not read or write ZHI Core, `zee-extension`, ZHI tokens, or any database.
- It requires network access to the pinned Three.js CDN imports.
- The “life seed” is currently a visual object, not an autonomous creature.
- No production deployment or live-world change is implied by adding this source file.

## Next implementation increment

1. Add a versioned scene-manifest schema and validation.
2. Let Mia generate a proposal object; validate and preview the exact proposal.
3. After Mia's approval, apply the proposal to the local universe, save a versioned snapshot, and verify by reloading.
4. Only after this browser prototype is validated, choose a dedicated persistence backend for the independent universe. Do not use the Mia chat database or ZHI Core by assumption.
