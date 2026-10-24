#!/usr/bin/env python3
"""Isolated regression test for Mia scene materialization; never touches repository data."""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SOURCE = REPO / "scripts" / "materialize_mia_scenes.py"

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def scene(scene_id, parent="root-world"):
    return {
        "schema_version": "1.0.0",
        "scene_id": scene_id,
        "display_name": scene_id,
        "parent_scene_id": parent,
        "description": "Isolated regression fixture."
    }

def main():
    with tempfile.TemporaryDirectory(prefix="mia-scene-materializer-test-") as temp:
        root = Path(temp)
        base = root / "world-scenes"
        (root / "scripts").mkdir()
        shutil.copy2(SOURCE, root / "scripts" / SOURCE.name)
        (base / "inbox").mkdir(parents=True)
        (base / "scenes").mkdir()
        manifest = {
            "schema_version": "1.0.0",
            "root_scene_id": "root-world",
            "scenes": [{
                "scene_id": "root-world",
                "path": "scenes/root-world.json",
                "parent_scene_id": None,
                "verification_status": "fixture"
            }]
        }
        write_json(base / "world-manifest.json", manifest)
        write_json(base / "scenes" / "root-world.json", {
            "scene_id": "root-world", "parent_scene_id": None,
            "display_name": "Root", "status": "integrated"
        })

        # Existing scene and same-ID inbox item must remain untouched.
        existing = scene("duplicate-scene")
        write_json(base / "scenes" / "duplicate-scene.json", existing)
        duplicate_payload = scene("duplicate-scene")
        write_json(base / "inbox" / "duplicate-scene.json", duplicate_payload)
        write_json(base / "inbox" / "new-scene-one.json", scene("new-scene-one"))
        write_json(base / "inbox" / "new-scene-two.json", scene("new-scene-two"))

        run = subprocess.run(
            [sys.executable, str(root / "scripts" / SOURCE.name)],
            cwd=root, text=True, capture_output=True, check=False
        )
        assert run.returncode == 0, f"materializer failed unexpectedly:\n{run.stdout}\n{run.stderr}"
        assert "WARNING: duplicate-scene.json" in run.stdout, run.stdout
        assert "Materialized 2 scene(s)" in run.stdout, run.stdout
        assert (base / "scenes" / "new-scene-one.json").exists()
        assert (base / "scenes" / "new-scene-two.json").exists()
        assert (base / "inbox" / "duplicate-scene.json").exists(), "conflicting inbox file must be preserved"
        assert not (base / "inbox" / "new-scene-one.json").exists()
        assert not (base / "inbox" / "new-scene-two.json").exists()
        assert json.loads((base / "scenes" / "duplicate-scene.json").read_text(encoding="utf-8")) == existing
        result_manifest = json.loads((base / "world-manifest.json").read_text(encoding="utf-8"))
        ids = [entry["scene_id"] for entry in result_manifest["scenes"]]
        assert ids.count("duplicate-scene") == 0, "conflicting scene must not be registered again"
        assert ids.count("new-scene-one") == 1
        assert ids.count("new-scene-two") == 1
        print("PASS: two valid scenes materialized; duplicate preserved; existing scene not overwritten.")

if __name__ == "__main__":
    main()
