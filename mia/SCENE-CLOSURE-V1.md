# Mia Scene & Exploration Closure v1

## Scope and safety

This is a non-production validation layer. It does not call Supabase, write data, activate scenes, deploy an Edge Function, or move Mia inside ZHI. The existing `mia-chat.html` and `mia-chat` Edge Function are intentionally unchanged in this change set.

## Required data path

1. **Catalog read** — fetch only `mia_virtual_spaces.is_active = true`; keep source system, source record ID, source update timestamp, scene data, and scene slug together.
2. **Scene validation** — require stable scene slug/name/status; entity IDs must be unique; local entity coordinates must be paired and within the declared local coordinate system. Empty entity inventories are warnings, not silently treated as complete scenes.
3. **Coordinate safety** — local coordinates are never world travel coordinates. A parent-facility anchor is not a confirmed scene anchor unless source evidence explicitly marks it verified. Unknown coordinates remain unknown.
4. **Exploration request** — choose the requested active scene deterministically; if no matching scene exists, return a clear unavailable-scene result rather than selecting an unrelated scene.
5. **Observation** — pass the selected scene's `scene_data` and provenance to the model; label the output `snapshot_based_simulation`; never claim real-world entry, live sensory perception, or completed movement.
6. **Persistence transaction boundary** — create an exploration run; generate structured observations; persist the life event, experience memory, and assistant message; then mark the run completed only when all required writes succeeded. If any required write fails, record failure where possible and return an error.
7. **Closure evidence** — independently confirm the exploration run status and linked memory, life event, and assistant message. Do not count model text alone as proof of persistence.
8. **Recall check** — query the newly saved memory by its exploration ID/source record ID in a later request and verify that the retrieved record matches the completed run. A saved memory does not by itself prove successful later recall.
9. **Report** — distinguish `scene_validated`, `exploration_generated`, `records_persisted`, `memory_recalled`, and `actual_world_entry`. The last remains `false` unless a separately authorized and verified world-action interface provides evidence.

## Validator

`scene-closure-validator.mjs` exposes:
- `validateScene(scene)` — structural and coordinate-boundary checks.
- `validateExplorationClosure(evidence)` — verifies explicit evidence flags for run completion, memory, life event, and assistant message.

Run the dependency-free tests with Node.js:

```sh
node --test mia/scene-closure-validator.test.mjs
```

## Known gaps found during audit

- The forest JSON lists `forest-rabbit`, while the active database scene's `scene_data.entities` contains only `greenhouse`, `data-shelf`, and `lounge`. The validator does not silently reconcile or write this mismatch.
- Six other active scenes have task descriptions but no structured `entities` inventory in `scene_data`.
- The active exploration function returns persistence flags and writes linked records, but the full end-to-end behavior (including later memory recall) has not been executed and verified as part of this branch.
- Education Center, Entertainment, and Arena should not be activated from legacy records until their source, status, and coordinate semantics are reviewed. Arena project coordinates remain unknown; do not substitute facility coordinates.

## Acceptance checklist before production integration

- [ ] Scene catalog has one reviewed source of truth or a deterministic, versioned merge rule.
- [ ] Every active scene has a validated entity inventory, or an explicit `entities_status: "not_modeled"` marker.
- [ ] All coordinates declare their coordinate system; unknown coordinates are `null`/omitted and are never guessed.
- [ ] Tests cover missing scene, inactive scene, duplicate IDs, out-of-bounds coordinates, upstream model failure, partial persistence failure, duplicate retry, and memory recall.
- [ ] A test exploration confirms run + life event + memory + assistant message and later recall by exploration ID.
- [ ] Production writes and deployment remain disabled until the owner explicitly approves the tested change.