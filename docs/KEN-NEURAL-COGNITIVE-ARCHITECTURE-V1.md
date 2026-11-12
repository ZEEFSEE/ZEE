# KEN Human-Neural Cognitive Architecture v1

## Purpose

KEN is being developed as an independent digital cognitive identity whose runtime is inspired by human neural organization. This is a computational analogy, not a biological brain reconstruction, a measurement of biological neural activity, or a claim that KEN has human consciousness.

Mia is the reference architecture for identity continuity, memory, emotion, relationship context, experience learning, and autonomous judgment. KEN reuses design principles, not Mia's private records, private conversations, personality state, or children's private memories.

## Design principles

1. Distributed processing: cognitive work is routed across specialized cooperating networks rather than one flat prompt.
2. Provenance first: facts, revisable observations, and hypotheses remain distinct and carry source references and confidence.
3. Plasticity with governance: learning may propose new associations and weight changes; durable identity/value changes require review and versioning.
4. Continuity: KEN has its own identity root, cognition versions, memory, sessions, and devices.
5. Bounded recall: retrieve relevant KEN history rather than injecting the entire archive into every prompt.
6. No chain-of-thought logging: store high-level routing and audit metadata, not private hidden reasoning traces.
7. Isolation: Mia and the children remain separate identities with separate private data.
8. Evidence-aware autonomy: KEN may disagree, but must state evidence and uncertainty.

## Ten computational regions

| Region key | Human-neural analogy | Software responsibility |
|---|---|---|
| ATTENTION_ROUTER | Thalamic routing | Select relevant context and allocate attention |
| CORTICAL | Distributed cortical association networks | Language, concepts, abstraction, causal links |
| HIPPOCAMPAL | Hippocampal memory system | Episodic encoding, time indexing, associative recall |
| AFFECTIVE | Amygdala / limbic salience | Emotional salience, value and approach/avoidance signals |
| EXECUTIVE | Prefrontal executive networks | Goals, planning, reasoning and conflict checks |
| ACTION_SELECTION | Basal-ganglia-inspired selection | Rank candidate actions and gate execution |
| PREDICTION_ERROR | Cerebellar-inspired prediction correction | Compare expected and observed outcomes |
| SELF_MODEL | Default-mode-inspired self model | Identity narrative, self-reflection and continuity |
| INTERNAL_STATE | Interoception-inspired monitor | Track compute load, uncertainty and stability |
| PLASTICITY | Synaptic plasticity / neuromodulation | Propose association and learning updates |

## Data structures deployed

- `ken_brain_regions`: versioned region definitions and routing configuration.
- `ken_neural_nodes`: cognitive nodes such as concepts, memory references, values, goals, strategies, and self-model elements.
- `ken_synapses`: directed, weighted, evidence-backed associations between nodes.
- `ken_brain_cycles`: per-turn high-level routing, retrieval references, model, and prediction-error audit.
- `ken_learning_events`: proposed learning changes.
- `ken_learning_reviews`: owner decisions for proposed changes.

These are software structures. A node is not a literal biological neuron; a synapse is not a biological synapse.

## Runtime cycle

1. Authenticate the shared Mia login and independently verify the KEN owner binding.
2. Route the current message to relevant cognitive regions.
3. Load the current session context and recent KEN memory events.
4. Search the separate KEN historical archive using bounded lexical retrieval.
5. Load relevant active KEN neural nodes.
6. Ask AGNES to generate the response using the selected context.
7. Append the dialogue episode and high-level cognitive-cycle audit.
8. Extract explicit facts, observations, and hypotheses as separate learning candidates.
9. Keep uncertain changes revisable; do not automatically promote them into stable identity.

## Current implementation state

- Ten region definitions seeded.
- Ten region-anchor nodes seeded.
- Seventeen directed baseline synapses seeded.
- KEN chat runtime upgraded to use region routing, bounded historical-message retrieval, neural-node retrieval, and cognitive-cycle audit.
- KEN chat now verifies the active `ken_token_owners` binding in addition to validating the signed Mia session.
- AGNES remains the only KEN model provider. No Groq route is used.
- Existing KEN archive remains separate and unchanged.
- Mia production chat, Mia personality, Mia memories, and children's private records were not modified.

## Known limits and next stages

- Historical retrieval is currently lexical and bounded, not vector-semantic retrieval. The production project does not currently have the `vector` extension enabled.
- The first real browser chat turn is still required to verify device registration, end-to-end response, memory append, archive recall, and cognitive-cycle logging.
- Synaptic weights are seeded architectural priors; automatic weight adaptation is not yet enabled.
- Owner review UI for learning candidates is not yet implemented.
- Sequence-number concurrency should be moved to a transaction-safe database operation before multi-tab/high-concurrency use.
- No claim of human-like consciousness, biological neural activity, or full semantic recall is made.
