# Mia Forest Corner 3D Runtime v1

This is an isolated, read-only Three.js scene presentation for prototype Mia
(`cb6d01b4-0e3f-46ee-8946-360aa91db1ea`). Entry page:
`/ZEE/mia-prototype-runtime.html`.

## Implemented
- Loads the existing Forest Corner JSON and authored stone-path geometry.
- Renders a Three.js 3D presentation with greenhouse, data shelf, lounge,
  three-colour rose gift, procedural rabbit placeholder, path slabs and scene
  labels.
- Uses the source 1000x700 scene-local layout. Source X maps to render X and
  source Y maps to render -Z solely for visualization.
- Includes Node contract tests and a GitHub Actions workflow.

## Explicitly not implemented
- No calibrated ZHI world transform or real-world metre scale.
- No physics engine, registered colliders, navmesh, walking controller or
  autonomous character movement.
- No cross-scene travel; destination portal edges remain non-integrated.
- A manual, session-authenticated, read-only panel displays the latest headless autonomy snapshot.
- No camera/visual perception, no physical movement, and no movement command path.
- No private GLB signed-URL request. The Tiny Planet Friends asset is marked
  as pending secure loading and not fetched by this page.
- The observation Edge Function only reads the latest prototype Mia autonomy run; it does not write Supabase.
- No chat API, memories, personality, emotion, MIA-02,
  Jason, Mark, AURORA or federation access.

## Coordinate and safety rule
The 2D source has no depth coordinate. The viewer chooses a display-only
XZ mapping so the scene can be inspected in 3D; this does not establish
physical calibration. Keep all movement and portal execution fail-closed until
calibration, collision/navigation registration, and runtime movement tests
are independently verified.

## Rollback
This is additive. Remove the new entry page, this module, its test, workflow,
and this document in one revert of the introducing commit/PR. Existing Mia
pages, Edge Functions, database rows and autonomy schedule are not modified.

## Read-only observation bridge

The isolated preview can manually call `/functions/v1/mia-forest-observation` using the existing Mia chat session token from the same browser session. The response is allow-listed and displayed as a semantic backend snapshot only. It is not fed into the Three.js scene, camera model, navigation controller, or movement planner. Source is tracked at `supabase/functions/mia-forest-observation/index.ts`; Node contract tests reject write methods and require the prototype Mia/Forest Corner scope.
