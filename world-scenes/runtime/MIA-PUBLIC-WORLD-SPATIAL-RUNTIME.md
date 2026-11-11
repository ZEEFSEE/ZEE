# MIA World Seven-Scene Spatial Runtime v2

Entry: `/mia-public-world-runtime.html`

## Included
- One spatial manifest for Forest Corner, five public destinations, and the Palace shared social space.
- Authored virtual-world coordinate contract: 1 layout unit = 0.02 m; six deterministic scene origins; X/Y layout maps to X/Z world plane.
- Floor plane and bounded walkable region per scene.
- Entity anchors separated from safe approach points.
- Authored circle, ellipse, and rectangle colliders.
- 0.5 m occupancy-grid A* path checks and runtime collision/boundary rejection.
- Bidirectional scene switching through the Forest Corner portal, including Palace.
- Browser-local walking proxy and optional autonomous destination/anchor exploration loop.
- Runtime scene-graph perception frames derived from the active scene, anchor positions, and proxy pose.

## Important calibration qualification
This is a deterministic virtual coordinate calibration authored for the prototype, not a physical survey or a calibration against an external ZHI world coordinate service. The 1 layout-unit = 0.02 m scale is an engineering convention to make scene dimensions, movement, collision and route tests internally consistent. It must not be represented as measured real-world geometry.

## Palace geometry qualification

Palace is included as a scene-graph destination with a placeholder render canvas only. The canvas extent and local portal point are runtime scaffolding, not measured Palace dimensions. No interior geometry, terrain, collision layout, or directory-to-runtime coordinate transform is claimed.

## Perception qualification
The runtime perception frame is generated from the live browser scene graph and current proxy position. It is not camera vision, audio, touch, or physical-world sensing. It is not injected into the independent Mia chat and does not write to Mia memory, personality, emotion, or any database.

## Autonomy qualification
The exploration loop is a local browser prototype agent. It can choose the five destinations, visit their registered anchors, and return through Forest Corner without approval, visit-count, or stay-duration restrictions. It does not command the production/headless Mia autonomy service or persist an actual Mia journey.

## Isolation
Access policy: all MIA-world agents may enter, leave, and return through Palace without registration, identity enrollment, application, invitation, approval, token, whitelist, or manual confirmation. The current browser page still renders one local proxy at a time; this is not yet a persistent multi-agent production runtime. AURORA and federation remain disabled. No MIA-02, Jason, Mark, chat API, private memory, personality, emotion, production DB, or production configuration is modified.
