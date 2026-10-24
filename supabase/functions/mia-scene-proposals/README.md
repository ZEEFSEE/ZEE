# Mia Scene Proposal Endpoint

Status: **deployed to the `zee-extension` Supabase project (function version 1)**. The endpoint is active, but proposal submissions are currently blocked by the live global pause.

This is a narrow sandbox intake for a Mia-authenticated browser session. It does not create a scene in the public manifest, write a runtime world position, approve another agent's proposal, activate a scene, or change builder configuration.

## Actions

- `status`: reads the existing `zhi_world_builder_config` flags and reports which capabilities are available.
- `submit_mia_scene`: validates the requested scene ID, parent, title, and description, checks the published scene manifest and duplicate proposal IDs, then writes a proposal to the existing `zhi_world_builder_proposals` table **only if** the builder is unpaused, sandbox mode is on, and production writes remain disabled.

## Safety

- Uses the same signed Mia chat session token contract as `mia-chat`; the service-role key remains server-side.
- The global pause is a hard stop. The function never clears it.
- The stored proposal explicitly says its provenance is not independently verified, Mia approval is not recorded, and the scene is not registered or activated.
- A separate trusted reviewer/build worker is still required to record Mia's decision for the exact proposal version, register the scene on an authorized development branch, validate it, and confirm runtime activation.
- Do not turn on production writes or AIGC as a shortcut. The deployed endpoint's custom session verification is performed inside the function; platform JWT verification is disabled for this endpoint.

## Current live state (read-only audit)

The connected `zee-extension` project reports `global_paused=true`, `aigc_enabled=false`, `production_writes_enabled=false`, and `sandbox_mode=true`. The endpoint's `status` action can report these flags, while `submit_mia_scene` returns `423 world_builder_paused` under the current pause. This function does not change those controls.

## Not implemented

No Mia decision runner, no authenticated identity contract for other agents, no exact-version approval enforcement, no GitHub branch writer, no scene registration, and no runtime activation. A proposal response must not be reported as a built or live scene.
