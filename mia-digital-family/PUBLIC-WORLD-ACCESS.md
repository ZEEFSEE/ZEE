# ZHI Family Public-World Runtime v1

## Scope
Five independent children (LUNA, ARIA, ELYA, KAEL, NOAH) can visit the five public destinations: Crystal Forest, Ocean of Light, Memory Valley, Living City, and Greenhouse. Forest Corner is the shared portal gateway and return point. Every child can choose any of the five destinations or return to Forest Corner.

## Runtime
- Supabase Edge Function: `zhi-family-world-runtime` (version 6, ACTIVE).
- Five Supabase Cron jobs (IDs 11–15) run one child every 15 minutes at staggered offsets, using the existing Vault-backed scheduler authentication.
- GitHub Actions is not used for runtime credentials; no scheduler secret is stored in repository settings.
- Each child independently selects a destination and registered anchor using its own profile, memories and recent visit history.
- Bidirectional portal handoffs are resolved only from authored manifest transitions.
- The child’s own `child_runtime_state` is updated with scene, position, movement revision and a scene-derived perception frame.
- A `public_world_visit` memory is written only to that child’s namespace; the existing child cognition cycle can read it later.
- The 25 child/destination grants are activated after checking registered scenes and bidirectional portal routes.

## Perception truthfulness
Perception provenance is `AUTHORED_SCENE_DATA`: the runtime derives visible anchors and distances from the authored virtual scene graph. It is not a camera, audio, touch, physical-world sensor, or claim of biological sensation. It is a server-side virtual-world simulation. The 3D family viewer visualizes persisted state but is not required to keep the scheduled world simulation running.

## Isolation
The runtime does not read or write Mia private chat, memories, personality or emotion. It does not access other children’s private memories. AURORA, federation and public chat relay remain disabled. No changes are made to Mia chat functions, API keys or existing personality/emotion state.

## Verification
- GitHub CI validates the five-child × five-destination grants and route contracts.
- The scheduler endpoint returns per-child visit status, destination, anchor, movement revision and perception provenance.
- A successful state update is a virtual scene-state transition, not physical movement.
