#!/usr/bin/env python3
"""Read-only structural acceptance gate for Mia's static scene catalog.

This validates repository artifacts only. It does not call Supabase, mutate agent
state, infer coordinates, or claim production runtime connectivity.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "world-scenes"
MANIFEST = BASE / "world-manifest.json"
INDEX = BASE / "scene-index.html"
ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
errors = []
warnings = []
checks = []

def check(ok, message):
    checks.append(("PASS" if ok else "FAIL", message))
    if not ok:
        errors.append(message)

def load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        errors.append(f"{path.relative_to(ROOT)}: invalid/unreadable JSON: {exc}")
        checks.append(("FAIL", f"Parse {path.relative_to(ROOT)}"))
        return None

def main():
    manifest = load_json(MANIFEST)
    if not isinstance(manifest, dict):
        print("\n".join(errors))
        return 1
    scenes = manifest.get("scenes")
    check(isinstance(scenes, list) and bool(scenes), "manifest contains a non-empty scenes list")
    if not isinstance(scenes, list):
        scenes = []
    by_id = {}
    for entry in scenes:
        if not isinstance(entry, dict):
            errors.append("manifest contains a non-object scene entry")
            continue
        sid = entry.get("scene_id")
        if not isinstance(sid, str) or not ID.fullmatch(sid):
            errors.append(f"invalid scene_id in manifest: {sid!r}")
            continue
        if sid in by_id:
            errors.append(f"duplicate scene_id in manifest: {sid}")
        by_id[sid] = entry
    check(len(by_id) == len(scenes), "scene IDs are valid and unique")

    for sid, entry in by_id.items():
        rel = entry.get("path")
        if not isinstance(rel, str) or not rel.startswith("scenes/") or ".." in Path(rel).parts:
            errors.append(f"{sid}: unsafe or missing manifest path")
            continue
        path = BASE / rel
        check(path.is_file(), f"{sid}: manifest JSON exists")
        if not path.is_file():
            continue
        scene = load_json(path)
        if not isinstance(scene, dict):
            continue
        check(scene.get("scene_id") == sid, f"{sid}: JSON scene_id matches manifest")
        parent = scene.get("parent_scene_id")
        if parent is None:
            check(sid == manifest.get("root_scene_id"), f"{sid}: only the declared root has no parent")
        else:
            check(parent in by_id, f"{sid}: parent {parent} is registered")
        declared_parent = entry.get("parent_scene_id")
        check(parent == declared_parent, f"{sid}: parent agrees between JSON and manifest")
        files = scene.get("files") or {}
        interaction = files.get("interactions") if isinstance(files, dict) else None
        if isinstance(interaction, str) and interaction.endswith(".html"):
            target = (ROOT / interaction).resolve()
            check(target.is_relative_to(ROOT.resolve()) and target.is_file(), f"{sid}: interaction page exists")
        # Unknown coordinates are permitted; the gate must never invent them.
        bounds = scene.get("bounds")
        if isinstance(bounds, dict):
            for edge in ("min", "max"):
                coords = bounds.get(edge)
                if isinstance(coords, dict):
                    for axis in ("x", "y", "z"):
                        value = coords.get(axis)
                        if value is not None and not isinstance(value, (int, float)):
                            errors.append(f"{sid}: bounds.{edge}.{axis} must be numeric or null")

    check(INDEX.is_file(), "generated scene index exists")
    if INDEX.is_file():
        index_text = INDEX.read_text(encoding="utf-8")
        for sid in by_id:
            check(sid in index_text, f"{sid}: appears in generated scene index")

    # Parent links must eventually reach the declared root, without cycles.
    root = manifest.get("root_scene_id")
    check(root in by_id, "declared root scene is registered")
    for sid in by_id:
        seen = set()
        current = sid
        while current in by_id and current != root:
            if current in seen:
                errors.append(f"{sid}: parent cycle detected at {current}")
                break
            seen.add(current)
            scene_path = BASE / str(by_id[current].get("path", ""))
            scene = load_json(scene_path) if scene_path.is_file() else None
            if not isinstance(scene, dict):
                break
            current = scene.get("parent_scene_id")
        if current != root:
            errors.append(f"{sid}: scene is not connected to declared root {root}")
    check(not errors, "no structural errors in the connected scene catalog")

    print("Mia scene catalog acceptance report")
    print(f"Scenes checked: {len(by_id)}")
    for status, message in checks:
        print(f"{status}: {message}")
    if errors:
        print(f"\nRESULT: FAIL ({len(errors)} error(s))")
        if "GITHUB_STEP_SUMMARY" in __import__("os").environ:
            with open(__import__("os").environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as out:
                out.write("## Mia scene catalog acceptance: FAIL\n\n")
                out.write(f"Scenes checked: {len(by_id)}\n\n")
                out.write("\n".join(f"- ❌ {e}" for e in errors) + "\n")
        return 1
    print("\nRESULT: PASS — static catalog consistency only; production runtime remains unverified.")
    if "GITHUB_STEP_SUMMARY" in __import__("os").environ:
        with open(__import__("os").environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as out:
            out.write("## Mia scene catalog acceptance: PASS\n\n")
            out.write(f"Scenes checked: {len(by_id)}\n\n")
            out.write("All manifest/JSON/parent/index/page checks passed. This does not assert production runtime connectivity.\n")
    return 0

if __name__ == "__main__":
    sys.exit(main())
