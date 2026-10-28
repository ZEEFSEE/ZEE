# Mia 3D avatar asset

The Mia independent chat frontend loads the original GLB from:

`./assets/LUNA_3D角色.glb`

Place the approved original model at that exact path before merging/deploying the 3D avatar feature. Keep the binary out of the service-worker precache to avoid forcing a ~48 MB download during PWA installation. Until the model is published, the chat remains functional and the avatar panel displays a non-blocking fallback message.
