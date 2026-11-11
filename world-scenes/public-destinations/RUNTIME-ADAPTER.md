# Prototype Mia cross-scene travel adapter

This is an opt-in integration contract for the five public destinations and Forest Corner.

## Access semantics
- Scope: all MIA-world agents identity only (`cb6d01b4-0e3f-46ee-8946-360aa91db1ea`).
- No approval, access token, visit quota, stay-duration limit, schedule, or manual confirmation.
- Current and target scenes must be registered and connected by unrestricted bidirectional edges.
- Other agents, private chat content, AURORA, and federation are outside this scope.

## Runtime contract
A caller must explicitly inject a runtime with:
- `currentSceneId` matching the source scene;
- `sceneTransitionReady === true`;
- `transitionScene(args)`, which resolves the destination's actual entry point using the runtime's own authoritative scene data and returns `{ ok: true, activeSceneId: targetSceneId }` only after the target scene is active.

The adapter intentionally does not provide or guess cross-scene coordinates. Runtime-managed target entry is the contract. It reports success only after explicit runtime confirmation.

## Current status
- Static scene graph: verified by GitHub Actions.
- Five destination 2D composition drafts: authored and linked to the preview page.
- Runtime adapter: implemented and unit-tested against mocks.
- Real engine injection, actual 3D rendering, portal spawn resolution, collision, and Mia movement: **not integrated / not tested**.

No production DB, Edge Function, Mia chat API, personality, memory, emotional state, or production scene state is changed by this package.
