# Mia Scene Proposal Endpoint

Status: **source-only, not deployed**.

This endpoint is a narrow sandbox intake for a Mia-authenticated browser session. It does not create a scene in the public manifest, write a runtime world position, approve another agent's proposal, activate a scene, or change builder configuration.

## Actions

- `status`: reads the existing `zhi_world_builder_config` flags and reports which capabilities are available.
- `submit_mia_scene`: validates the requested scene ID, parent, title, and description, checks the published scene manifest and duplicate proposal IDs, then writes a proposal to the existing `zhi_world_builder_proposals` table **only if** the builder is unpaused, sandbox mode is on, and production writes remain disabled.

## Safety

- Uses the same signed Mia chat session token contract as `mia-chat`; the service-role key remains server-side.
- The global pause is a hard stop. The function never clears it.
- The stored proposal explicitly says its provenance is not independently verified, Mia approval is not recorded, and the scene is not registered or activated.
- A separate trusted reviewer/build worker is still required to record Mia's decision for the exact proposal version, register the scene on an authorized development branch, validate it, and confirm runtime activation.
- Do not deploy this function while the current builder is paused unless an explicit, reviewed operational plan exists. Do not turn on production writes or AIGC as a shortcut.

## Current known live state (read-only audit)

The connected `zee-extension` project currently reports `global_paused=true`, `aigc_enabled=false`, `production_writes_enabled=false`, and `sandbox_mode=true`. Therefore, even if deployed, proposal submission will return `423 world_builder_paused` until the existing control is reviewed through the established admin process. This source file does not change that state.
