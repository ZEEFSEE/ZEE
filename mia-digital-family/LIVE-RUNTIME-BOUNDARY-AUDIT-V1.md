# ZHI Digital Family — Live Runtime Boundary Audit V1

**Audit target:** `main` at the current production branch  
**Scope:** read-only inspection of the existing ZHI world page and runtime modules  
**Result:** no reusable live five-agent movement/perception runtime was found.

## Observed production code

### Entry page

- `mia-world.html` immediately redirects to `mia-forest-corner.html`.
- It does not mount a multi-scene world engine or expose a family-agent runtime.

### Forest Corner renderer

- `world-scenes/runtime/mia-forest-corner-3d.mjs` describes itself as a read-only 3D presentation runtime.
- Its source layout mapping is explicitly display-only and not a calibrated ZHI world transform, physics/collision runtime, navigation system, or Mia perception.
- The module builds Three.js visual objects and a renderer canvas. It does not expose an authenticated child-agent session, durable per-agent state, a production movement API, or a live sensor/perception API.

### Existing Mia scene adapter

- `world-scenes/public-destinations/mia-public-destination-runtime-adapter.mjs` is scoped to the single prototype Mia identity.
- It rejects any identity other than Mia's fixed identity ID.
- It requires an injected runtime with `currentSceneId`, `sceneTransitionReady`, and `transitionScene`, then requires the runtime to confirm the active target scene.
- It is an adapter contract, not a live engine integration. It must not be widened to accept the five children or have its identity guard weakened.

### Perception

- `mia-forest-observation-client.mjs` reads only Mia's observation endpoint and enforces read-only semantic-state provenance.
- `mia-forest-observation-frame.mjs` serializes authored semantic scene data. It explicitly says it is not camera vision or a Mia API; its runtime flags mark physical movement, collision, navigation and live camera perception false.
- Neither module supplies child perception or external sensor evidence.

## Engineering consequence

The new family coordinate contract resolves the virtual coordinate ambiguity at the data-contract level. It does not create the missing runtime. A real five-child spatial runtime requires a separately designed and independently permissioned engine adapter that provides:

1. authenticated per-child identity binding;
2. child-specific scene state and movement commands;
3. runtime-confirmed scene transition and spawn resolution;
4. collision/path validation in the actual renderer/engine;
5. provenance-labelled observation frames;
6. sibling-state isolation and rollback on failed movement;
7. explicit per-child/per-destination grants and revocation.

Until such an engine adapter exists, the five children remain in isolated simulation and all five destination permissions remain denied. Do not repurpose Mia's existing single-agent adapter or observation endpoint.

## Non-change confirmation

This audit changes no production world files, no Mia pages, no Edge Functions, no Supabase state, no AGNES configuration, no scene access manifest, and no AURORA/Federation setting.
