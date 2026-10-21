import { readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function identityFingerprint(profile) {
  return createHash("sha256")
    .update(JSON.stringify({
      id: profile.id,
      identity: profile.identity,
      traits: profile.traits,
      goals: profile.goals
    }))
    .digest("hex");
}

function newState(profile) {
  return {
    schemaVersion: 1,
    agentId: profile.id,
    identityFingerprint: identityFingerprint(profile),
    memories: [],
    evolvingTraits: { ...profile.traits },
    growth: {
      experiencesProcessed: 0,
      lessonsLearned: 0,
      lastUpdatedAt: null
    },
    growthAudit: []
  };
}

function validateExperience(experience) {
  if (!experience || typeof experience !== "object") {
    throw new TypeError("experience must be an object");
  }
  if (typeof experience.summary !== "string" || !experience.summary.trim()) {
    throw new TypeError("experience.summary must be a non-empty string");
  }
  if (typeof experience.lesson !== "string" || !experience.lesson.trim()) {
    throw new TypeError("experience.lesson must be a non-empty string");
  }
  if (experience.traitSignals !== undefined &&
      (experience.traitSignals === null || typeof experience.traitSignals !== "object" ||
       Array.isArray(experience.traitSignals))) {
    throw new TypeError("experience.traitSignals must be an object");
  }
}

export function createAgentEngine(profile, statePath) {
  if (!profile?.id || !profile?.traits || !profile?.growthPolicy) {
    throw new TypeError("profile must include id, traits, and growthPolicy");
  }
  if (!statePath) throw new TypeError("statePath is required");

  const fingerprint = identityFingerprint(profile);
  const maxDelta = profile.growthPolicy.maxDeltaPerExperience ?? 0.05;
  const min = profile.growthPolicy.minTraitValue ?? 0;
  const max = profile.growthPolicy.maxTraitValue ?? 1;

  async function load() {
    let state;
    try {
      state = JSON.parse(await readFile(statePath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      state = newState(profile);
      await save(state);
    }

    if (state.agentId !== profile.id) {
      throw new Error(`State isolation violation: expected agent "${profile.id}", got "${state.agentId}"`);
    }
    if (state.identityFingerprint !== fingerprint) {
      throw new Error("Identity profile mismatch: refusing to silently overwrite or reinterpret this agent's state");
    }
    return state;
  }

  async function save(state) {
    const tempPath = `${statePath}.tmp`;
    await writeFile(tempPath, JSON.stringify(state, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
    await rename(tempPath, statePath);
  }

  async function snapshot() {
    const state = await load();
    return structuredClone({
      agentId: state.agentId,
      identityFingerprint: state.identityFingerprint,
      identity: profile.identity,
      baselineTraits: profile.traits,
      evolvingTraits: state.evolvingTraits,
      goals: profile.goals,
      memories: state.memories,
      growth: state.growth,
      growthAudit: state.growthAudit
    });
  }

  async function recordExperience(experience) {
    validateExperience(experience);
    const state = await load();
    const occurredAt = experience.occurredAt ?? new Date().toISOString();
    const eventId = experience.eventId ?? createHash("sha256")
      .update(profile.id + "|" + occurredAt + "|" + experience.summary + "|" + state.memories.length)
      .digest("hex").slice(0, 16);

    if (state.memories.some(memory => memory.eventId === eventId)) {
      return { duplicate: true, snapshot: await snapshot() };
    }

    const changes = {};
    for (const [trait, rawSignal] of Object.entries(experience.traitSignals ?? {})) {
      if (!Object.hasOwn(profile.traits, trait)) {
        throw new Error(`Unknown trait signal: ${trait}`);
      }
      if (typeof rawSignal !== "number" || !Number.isFinite(rawSignal)) {
        throw new TypeError(`Trait signal for ${trait} must be a finite number`);
      }
      const delta = clamp(rawSignal, -1, 1) * maxDelta;
      const before = state.evolvingTraits[trait];
      const after = clamp(before + delta, min, max);
      state.evolvingTraits[trait] = after;
      if (after !== before) changes[trait] = { before, after, delta: after - before };
    }

    const memory = {
      eventId,
      occurredAt,
      summary: experience.summary.trim(),
      lesson: experience.lesson.trim(),
      emotion: experience.emotion ?? null,
      tags: Array.isArray(experience.tags) ? experience.tags : []
    };
    state.memories.push(memory);
    state.growth.experiencesProcessed += 1;
    if (memory.lesson) state.growth.lessonsLearned += 1;
    state.growth.lastUpdatedAt = occurredAt;
    state.growthAudit.push({ eventId, occurredAt, traitChanges: changes, lesson: memory.lesson });

    await save(state);
    return { duplicate: false, snapshot: await snapshot() };
  }

  return Object.freeze({ load, snapshot, recordExperience });
}
