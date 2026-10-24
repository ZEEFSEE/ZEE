# Mia scene inbox

Place one complete scene JSON file per scene at `world-scenes/inbox/<scene_id>.json`.

A push to the repository branch runs GitHub Actions, which validates and automatically creates:
- `world-scenes/scenes/<scene_id>.json`
- a static scene page at repository root: `<scene_id>.html`
- an entry in `world-scenes/world-manifest.json`
- refreshed `world-scenes/scene-index.html`

Rules: lowercase kebab-case unique ID matching filename; parent must already be in manifest; non-empty display name and description. Invalid batches fail without changing generated outputs. Unknown geometry and coordinates remain unverified.

This workflow writes repository files only. It never accesses Supabase, Mia chat, or production world state.

Important limitation: this is the repository-side automatic materializer. Mia's browser currently has no authorized GitHub write channel to submit files to this inbox by itself. Do not embed a GitHub token in client-side HTML. End-to-end unattended submission needs a separately configured, narrowly scoped authenticated intake service.
