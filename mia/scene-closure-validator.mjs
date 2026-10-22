/**
 * Mia scene/exploration closure validator.
 * Dependency-free; safe to run locally with Node.js:
 *   node --test mia/scene-closure-validator.test.mjs
 *
 * This validates data supplied by a caller. It does not perform writes,
 * move an agent, or assert that a simulated exploration is physical travel.
 */

export function validateScene(scene) {
  const errors = [];
  const warnings = [];

  if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
    return { ok: false, errors: ["SCENE_NOT_OBJECT"], warnings };
  }
  if (typeof scene.slug !== "string" || !scene.slug.trim()) errors.push("SCENE_SLUG_REQUIRED");
  if (typeof scene.name !== "string" || !scene.name.trim()) errors.push("SCENE_NAME_REQUIRED");
  if (!["active", "inactive", "draft"].includes(scene.status)) errors.push("SCENE_STATUS_INVALID");

  const local = scene.local_coordinate_system;
  if (local !== undefined) {
    if (!Number.isFinite(Number(local?.width)) || Number(local.width) <= 0 ||
        !Number.isFinite(Number(local?.height)) || Number(local.height) <= 0) {
      errors.push("LOCAL_COORDINATE_BOUNDS_INVALID");
    }
    if (local?.units && /world/i.test(String(local.units)) &&
        /not zhi world|not .*world coordinates/i.test(String(local.units))) {
      warnings.push("COORDINATE_DESCRIPTION_CONTRADICTS_ITSELF");
    }
  }

  const entities = Array.isArray(scene.entities) ? scene.entities : [];
  if (!Array.isArray(scene.entities)) warnings.push("SCENE_ENTITIES_MISSING");
  if (Array.isArray(scene.entities) && entities.length === 0) warnings.push("SCENE_ENTITIES_EMPTY");

  const seen = new Set();
  for (const entity of entities) {
    if (!entity || typeof entity !== "object" || Array.isArray(entity)) {
      errors.push("ENTITY_NOT_OBJECT");
      continue;
    }
    if (typeof entity.id !== "string" || !entity.id.trim()) errors.push("ENTITY_ID_REQUIRED");
    else if (seen.has(entity.id)) errors.push("ENTITY_ID_DUPLICATE:" + entity.id);
    else seen.add(entity.id);
    if (typeof entity.name !== "string" || !entity.name.trim()) errors.push("ENTITY_NAME_REQUIRED");

    const hasX = entity.x !== undefined && entity.x !== null;
    const hasY = entity.y !== undefined && entity.y !== null;
    if (hasX !== hasY) errors.push("ENTITY_COORDINATE_PAIR_INCOMPLETE:" + (entity.id || "unknown"));
    if (hasX && hasY) {
      if (!Number.isFinite(Number(entity.x)) || !Number.isFinite(Number(entity.y))) {
        errors.push("ENTITY_COORDINATES_NOT_NUMERIC:" + (entity.id || "unknown"));
      } else if (local && Number.isFinite(Number(local.width)) && Number.isFinite(Number(local.height)) &&
        (Number(entity.x) < 0 || Number(entity.y) < 0 ||
         Number(entity.x) > Number(local.width) || Number(entity.y) > Number(local.height))) {
        errors.push("ENTITY_OUTSIDE_LOCAL_BOUNDS:" + (entity.id || "unknown"));
      }
    } else {
      warnings.push("ENTITY_COORDINATES_UNKNOWN:" + (entity.id || "unknown"));
    }
  }

  if (scene.world_anchor) {
    const anchor = scene.world_anchor;
    if (anchor.status !== "verified" && anchor.confirmed !== true) {
      warnings.push("WORLD_ANCHOR_NOT_VERIFIED");
    }
    if (anchor.x != null && !Number.isFinite(Number(anchor.x))) errors.push("WORLD_ANCHOR_X_INVALID");
    if (anchor.y != null && !Number.isFinite(Number(anchor.y))) errors.push("WORLD_ANCHOR_Y_INVALID");
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Closure evidence must come from persisted records / verified API response.
 * A model-generated sentence alone is not persistence evidence.
 */
export function validateExplorationClosure(evidence) {
  const errors = [];
  const warnings = [];
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { ok: false, errors: ["EXPLORATION_EVIDENCE_REQUIRED"], warnings };
  }

  if (!evidence.exploration_id) errors.push("EXPLORATION_ID_REQUIRED");
  if (evidence.status !== "completed") errors.push("EXPLORATION_NOT_COMPLETED");
  if (typeof evidence.observations !== "string" || !evidence.observations.trim()) errors.push("OBSERVATIONS_MISSING");
  if (!Array.isArray(evidence.discoveries)) errors.push("DISCOVERIES_NOT_ARRAY");
  if (!Array.isArray(evidence.open_questions)) errors.push("OPEN_QUESTIONS_NOT_ARRAY");
  if (!Array.isArray(evidence.next_steps)) errors.push("NEXT_STEPS_NOT_ARRAY");
  if (evidence.memory_saved !== true) errors.push("MEMORY_PERSISTENCE_NOT_CONFIRMED");
  if (evidence.life_event_saved !== true) errors.push("LIFE_EVENT_PERSISTENCE_NOT_CONFIRMED");
  if (evidence.assistant_message_saved !== true) errors.push("ASSISTANT_MESSAGE_PERSISTENCE_NOT_CONFIRMED");
  if (evidence.actual_world_entry !== false) {
    warnings.push("WORLD_ENTRY_NOT_EXPLICITLY_MARKED_FALSE");
  }
  if (evidence.observation_mode !== "snapshot_based_simulation") {
    warnings.push("OBSERVATION_MODE_NOT_EXPLICITLY_SNAPSHOT_SIMULATION");
  }

  return { ok: errors.length === 0, errors, warnings };
}
