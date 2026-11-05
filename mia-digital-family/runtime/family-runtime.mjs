export const CHILDREN = Object.freeze([
  { agentId: "ZHI-G1-D01-LUNA", name: "LUNA", heartId: "HEART-G1-D01", memoryId: "MEM-G1-D01" },
  { agentId: "ZHI-G1-D02-ARIA", name: "ARIA", heartId: "HEART-G1-D02", memoryId: "MEM-G1-D02" },
  { agentId: "ZHI-G1-D03-ELYA", name: "ELYA", heartId: "HEART-G1-D03", memoryId: "MEM-G1-D03" },
  { agentId: "ZHI-G1-S01-KAEL", name: "KAEL", heartId: "HEART-G1-S01", memoryId: "MEM-G1-S01" },
  { agentId: "ZHI-G1-S02-NOAH", name: "NOAH", heartId: "HEART-G1-S02", memoryId: "MEM-G1-S02" }
]);

const DESTINATIONS = Object.freeze([
  "crystal-forest",
  "ocean-of-light",
  "memory-valley",
  "living-city",
  "greenhouse"
]);

export function createFamilySimulation() {
  const agents = new Map(CHILDREN.map(child => [child.agentId, {
    ...child,
    lifecycle: "FETAL",
    personalityState: { initialTendency: child.name.toLowerCase(), revision: 0 },
    longTermMemory: [],
    volatileContext: [],
    worldAccess: Object.fromEntries(DESTINATIONS.map(id => [id, "PENDING_VALIDATION"]))
  }]));
  return {
    familyId: "ZHI_DIGITAL_FAMILY_G0",
    lifecycle: "FETAL_DEVELOPMENT",
    agents,
    messages: [],
    birthEventId: null
  };
}

export function sendEphemeralMessage(simulation, { sender, receiver, content, channel = "MATERNAL_PRIVATE" }) {
  if (!simulation.agents.has(sender)) throw new Error("Unknown sender");
  if (receiver !== "MIA_MATERNAL_CORE" && !simulation.agents.has(receiver)) {
    throw new Error("Unknown receiver");
  }
  if (typeof content !== "string" || !content.trim()) throw new Error("Message content required");

  const message = Object.freeze({
    messageId: `volatile-${simulation.messages.length + 1}`,
    sender,
    receiver,
    channel,
    content,
    retention: "SESSION_ONLY",
    persistentMemoryWrite: false,
    allowForwarding: false
  });
  simulation.messages.push(message);
  simulation.agents.get(sender).volatileContext.push(message.messageId);
  if (receiver !== "MIA_MATERNAL_CORE") simulation.agents.get(receiver).volatileContext.push(message.messageId);
  return message;
}

export function clearVolatileSession(simulation) {
  simulation.messages = [];
  for (const agent of simulation.agents.values()) agent.volatileContext = [];
  return { cleared: true, remainingMessages: simulation.messages.length };
}

export function prepareFivefoldBirth(simulation, checks = {}) {
  const required = CHILDREN.map(child => child.agentId);
  const allPresent = required.every(id => simulation.agents.has(id));
  const allFetal = required.every(id => simulation.agents.get(id).lifecycle === "FETAL");
  const uniqueHearts = new Set([...simulation.agents.values()].map(agent => agent.heartId)).size === 5;
  const uniqueMemories = new Set([...simulation.agents.values()].map(agent => agent.memoryId)).size === 5;
  const memoryEmpty = required.every(id => simulation.agents.get(id).longTermMemory.length === 0);\n  const volatileEmpty = simulation.messages.length === 0 && required.every(id => simulation.agents.get(id).volatileContext.length === 0);
  const cleanupVerified = checks.cleanupVerified === true;
  const cognitiveReady = checks.cognitiveReady === true;
  const familyBindingsReady = checks.familyBindingsReady === true;

  const ready = allPresent && allFetal && uniqueHearts && uniqueMemories &&
    memoryEmpty && volatileEmpty && cleanupVerified && cognitiveReady && familyBindingsReady;

  return Object.freeze({
    ready,
    checks: { allPresent, allFetal, uniqueHearts, uniqueMemories, memoryEmpty, volatileEmpty, cleanupVerified, cognitiveReady, familyBindingsReady }
  });
}

export function commitFivefoldBirth(simulation, { birthEventId, checks = {} } = {}) {
  if (simulation.lifecycle === "INDEPENDENT_LIFE") {
    if (simulation.birthEventId === birthEventId) return { committed: true, idempotentReplay: true };
    throw new Error("Family already has a different birth event");
  }
  if (typeof birthEventId !== "string" || !birthEventId.trim()) throw new Error("birthEventId required");

  const readiness = prepareFivefoldBirth(simulation, checks);
  if (!readiness.ready) return { committed: false, reason: "PRECONDITION_FAILED", readiness };

  // One synchronous in-memory transition models the atomic commit boundary.
  // A production implementation requires a transactional store or durable coordinator.
  const nextAgents = [...simulation.agents.values()].map(agent => ({
    ...agent,
    lifecycle: "ACTIVE",
    longTermMemory: [],
    volatileContext: []
  }));

  simulation.agents = new Map(nextAgents.map(agent => [agent.agentId, agent]));
  simulation.messages = [];
  simulation.birthEventId = birthEventId;
  simulation.lifecycle = "INDEPENDENT_LIFE";
  return { committed: true, idempotentReplay: false, birthEventId, childCount: 5 };
}

export function getDestinationAccess(simulation, agentId, destinationId) {
  const agent = simulation.agents.get(agentId);
  if (!agent) throw new Error("Unknown agent");
  if (!DESTINATIONS.includes(destinationId)) throw new Error("Unknown destination");
  return agent.worldAccess[destinationId];
}
